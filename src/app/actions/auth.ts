"use server";

import * as z from "zod";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { LoginSchema, type LoginState } from "@/lib/definitions";
import { createSession, deleteSession } from "@/lib/session";
import prisma from "@/lib/prisma";

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

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    return { message: "Credenciales inválidas." };
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    return { message: "Credenciales inválidas." };
  }

  await createSession(user.id, user.role);
  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
