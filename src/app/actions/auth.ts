"use server";

import * as z from "zod";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import {
  LoginSchema,
  ChangePasswordSchema,
  type LoginState,
  type ActionState,
} from "@/lib/definitions";
import { createSession, deleteSession } from "@/lib/session";
import { verifySession } from "@/lib/dal";
import { getClientIp } from "@/lib/request";
import {
  LOGIN_WINDOW_MS,
  isLockedOut,
} from "@/lib/login-throttle";
import prisma from "@/lib/prisma";

// Hash fijo válido: iguala el tiempo de bcrypt.compare cuando el correo no existe
// (evita enumeración de usuarios por timing). Generado con bcryptjs (cost 10).
const DUMMY_HASH = "$2b$10$M.iN3ccOR0v.2FBHBi6RUu9xY/HaqN/j2ntBTfLEB7GfoiDvBxecO";

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const validated = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return { errors: z.flattenError(validated.error).fieldErrors };
  }

  const { email, password } = validated.data;
  const ip = await getClientIp();
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);

  const recentFailures = await prisma.loginAttempt.count({
    where: { success: false, createdAt: { gt: since }, OR: [{ email }, { ip }] },
  });
  if (isLockedOut(recentFailures)) {
    return { message: "Demasiados intentos. Intenta de nuevo en unos minutos." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Comparar siempre (contra hash dummy si no hay usuario) para tiempo constante.
  const ok = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);

  if (!user || !user.active || !ok) {
    await prisma.loginAttempt.create({ data: { email, ip, success: false } });
    return { message: "Credenciales inválidas." };
  }

  await prisma.loginAttempt.create({ data: { email, ip, success: true } });
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await createSession(user.id, user.role, user.sessionVersion);

  if (user.mustChangePassword) redirect("/cambiar-contrasena");
  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}

export async function changePassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await verifySession();
  const parsed = ChangePasswordSchema.safeParse({
    current: formData.get("current"),
    next: formData.get("next"),
  });
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) redirect("/login");

  const ok = await bcrypt.compare(parsed.data.current, user.password);
  if (!ok) return { ok: false, message: "La contraseña actual es incorrecta." };

  const newVersion = user.sessionVersion + 1;
  const newHash = await bcrypt.hash(parsed.data.next, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: newHash, mustChangePassword: false, sessionVersion: newVersion },
  });
  // Reeditar la cookie actual con la nueva versión para no expulsar al propio usuario.
  await createSession(user.id, user.role, newVersion);
  redirect("/dashboard");
}
