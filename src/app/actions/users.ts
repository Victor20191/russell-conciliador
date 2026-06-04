"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { authorizeAction } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import {
  UserCreateSchema,
  UserUpdateSchema,
  UserResetSchema,
  type ActionState,
} from "@/lib/definitions";

const PATH = "/config/usuarios";

export async function createUser(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizeAction("Administrador");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = UserCreateSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role"),
    initials: formData.get("initials"),
    password: formData.get("password"),
  });
  if (!parsed.success)
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  const dup = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (dup) return { ok: false, message: "Ya existe un usuario con ese correo." };

  const password = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role,
      initials: parsed.data.initials.toUpperCase(),
      password,
      mustChangePassword: true,
    },
  });

  const actor = await getCurrentUser();
  await logAudit({
    user: actor?.name ?? "Sistema",
    action: "CREÓ USUARIO",
    entity: parsed.data.email,
    detail: parsed.data.role,
  });
  revalidatePath(PATH);
  return { ok: true };
}

export async function updateUser(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizeAction("Administrador");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = UserUpdateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    role: formData.get("role"),
    active:
      formData.get("active") === "on" || formData.get("active") === "true",
  });
  if (!parsed.success)
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  if (parsed.data.id === authz.userId && (!parsed.data.active || parsed.data.role !== "Administrador")) {
    return { ok: false, message: "No puedes desactivar ni cambiar el rol de tu propia cuenta de administrador." };
  }

  const before = await prisma.user.findUnique({
    where: { id: parsed.data.id },
    select: { active: true },
  });
  const bump =
    before?.active && !parsed.data.active
      ? { sessionVersion: { increment: 1 } }
      : {};
  await prisma.user.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name,
      role: parsed.data.role,
      active: parsed.data.active,
      ...bump,
    },
  });

  const actor = await getCurrentUser();
  await logAudit({
    user: actor?.name ?? "Sistema",
    action: "EDITÓ USUARIO",
    entity: parsed.data.id,
    detail: `${parsed.data.role} · ${parsed.data.active ? "activo" : "inactivo"}`,
  });
  revalidatePath(PATH);
  return { ok: true };
}

export async function resetUserPassword(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizeAction("Administrador");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = UserResetSchema.safeParse({
    id: formData.get("id"),
    password: formData.get("password"),
  });
  if (!parsed.success)
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  const password = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({
    where: { id: parsed.data.id },
    data: {
      password,
      mustChangePassword: true,
      sessionVersion: { increment: 1 },
    },
  });

  const actor = await getCurrentUser();
  await logAudit({
    user: actor?.name ?? "Sistema",
    action: "RESETEÓ CONTRASEÑA",
    entity: parsed.data.id,
    detail: "Forzar cambio en próximo ingreso",
  });
  revalidatePath(PATH);
  return { ok: true };
}
