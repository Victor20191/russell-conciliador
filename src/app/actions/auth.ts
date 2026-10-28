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
import { createSession, deleteSession, limpiarPreferenciaNavegacion } from "@/lib/session";
import { verifySession, getCurrentUser } from "@/lib/dal";
import { getClientIp, getUserAgent } from "@/lib/request";
import { registrarAcceso } from "@/lib/access-log";
import { isAccountBlocked } from "@/lib/login-throttle";
import { finalizarLogin, registrarFalloLogin } from "@/lib/login-intentos";
import { consumirCuotaSolicitud, CUOTA_LOGIN } from "@/lib/seguridad/limite-solicitudes";
import prisma from "@/lib/prisma";
import { mensajeErrorBD, registrarError } from "@/lib/errores";

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

  // El redirect() se ejecuta DESPUÉS del try (funciona lanzando una excepción
  // especial que no debe capturarse). Dentro del try van las operaciones de BD.
  let destino: string | null = null;
  try {
    const cuota = await consumirCuotaSolicitud(CUOTA_LOGIN, ip);
    if (!cuota.permitida) {
      return { message: "Demasiados intentos. Intenta de nuevo en unos minutos." };
    }
    const user = await prisma.user.findUnique({ where: { email } });
    const now = new Date();
    if (isAccountBlocked(user?.blockedUntil, now)) {
      return { message: "Demasiados intentos. Intenta de nuevo en unos minutos." };
    }

    // Comparar siempre (contra hash dummy si no hay usuario) para tiempo constante.
    const ok = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);

    if (!user || !user.active || !ok) {
      await prisma.loginAttempt.create({ data: { email, ip, success: false } });
      if (user?.active) {
        if (await registrarFalloLogin(user.id, now)) {
          return { message: "Demasiados intentos. Intenta de nuevo en unos minutos." };
        }
      }
      return { message: "Credenciales inválidas." };
    }

    const resultado = await finalizarLogin({
      userId: user.id, passwordHash: user.password, sessionVersion: user.sessionVersion,
    });
    if (!resultado.ok) {
      await prisma.loginAttempt.create({ data: { email, ip, success: false } });
      return { message: resultado.bloqueada
        ? "Demasiados intentos. Intenta de nuevo en unos minutos."
        : "Credenciales inválidas." };
    }
    const vigente = resultado.user;
    await prisma.loginAttempt.create({ data: { email, ip, success: true } });
    await createSession(vigente.id, vigente.role, vigente.sessionVersion);
    await limpiarPreferenciaNavegacion();

    // Registro de acceso (ingreso). Best-effort: registrarAcceso nunca lanza.
    await registrarAcceso({
      userId: vigente.id,
      userName: vigente.name,
      role: vigente.role,
      path: "/login",
      kind: "ingreso",
      ip,
      userAgent: await getUserAgent(),
    });

    destino = vigente.mustChangePassword ? "/cambiar-contrasena" : "/dashboard";
  } catch (e) {
    registrarError("login", e);
    return {
      message: "No se pudo iniciar sesión por un error del sistema. Intenta de nuevo.",
    };
  }

  if (destino) redirect(destino);
}

export async function logout() {
  // Limpiar la sesión y su preferencia incluso si falla el registro de salida.
  // Si deleteSession falla, se registra y se continúa al login igualmente.
  try {
    // Capturar quién cierra ANTES de borrar la cookie (después no hay sesión).
    const user = await getCurrentUser();
    if (user) {
      await registrarAcceso({
        userId: user.id,
        userName: user.name,
        role: user.role,
        path: "/login",
        kind: "salida",
        ip: await getClientIp(),
        userAgent: await getUserAgent(),
      });
    }
  } catch (e) {
    registrarError("logout", e);
  }
  try {
    await deleteSession();
  } catch (e) {
    registrarError("logout", e);
  }
  redirect("/login");
}

export async function changePassword(
  _prev: ActionState | undefined,
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

  // El redirect() se ejecuta DESPUÉS del try (funciona lanzando una excepción
  // especial que no debe capturarse). Dentro del try van las operaciones de BD.
  let destino: string | null = null;
  try {
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || !user.active) {
      // Sesión válida pero usuario inexistente: cerrar sesión.
      destino = "/login";
    } else {
      const ok = await bcrypt.compare(parsed.data.current, user.password);
      if (!ok) return { ok: false, message: "La contraseña actual es incorrecta." };

      const newVersion = user.sessionVersion + 1;
      const newHash = await bcrypt.hash(parsed.data.next, 10);
      const actualizado = await prisma.user.updateMany({
        // Evita que dos cambios simultáneos reutilicen la misma versión de
        // sesión o que un cambio pendiente revierta un restablecimiento/admin.
        where: { id: user.id, active: true, password: user.password, sessionVersion: user.sessionVersion },
        data: { password: newHash, mustChangePassword: false, sessionVersion: { increment: 1 } },
      });
      if (actualizado.count !== 1) {
        return { ok: false, message: "La cuenta cambió mientras actualizabas la contraseña. Inicia sesión de nuevo." };
      }
      // Reeditar la cookie actual con la nueva versión para no expulsar al propio usuario.
      await createSession(user.id, user.role, newVersion);
      // `pwd=1` hace que el dashboard confirme el cambio con un toast (FlashToast).
      destino = "/dashboard?pwd=1";
    }
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("changePassword", e) };
  }

  if (destino) redirect(destino);
  // Inalcanzable: todos los caminos de éxito definen `destino`.
  return { ok: false, message: "No se pudo completar el cambio de contraseña." };
}
