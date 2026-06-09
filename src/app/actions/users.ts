"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import { ROLES_LEGADO } from "@/lib/rbac/catalogo";
import { ROL_SUPERADMINISTRADOR } from "@/lib/rbac/modulos-plataforma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import {
  UserCreateSchema,
  UserUpdateSchema,
  UserResetSchema,
  UserUnlockSchema,
  UserDeleteSchema,
  type ActionState,
} from "@/lib/definitions";
import { mensajeErrorBD } from "@/lib/errores";

const PATH = "/config/usuarios";
const ROLES_LEGADO_NO_ASIGNABLES = new Set<string>(ROLES_LEGADO);

export async function createUser(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("usuarios:crear");
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
  if (ROLES_LEGADO_NO_ASIGNABLES.has(parsed.data.role)) {
    return { ok: false, message: "Los roles legado ya no se pueden asignar." };
  }

  try {
    const rol = await prisma.role.findFirst({
      where: { code: parsed.data.role, active: true },
      select: { code: true },
    });
    if (!rol) return { ok: false, message: "El rol seleccionado no existe." };
    if (parsed.data.role === ROL_SUPERADMINISTRADOR && authz.role !== ROL_SUPERADMINISTRADOR) {
      return { ok: false, message: "Solo un Superadministrador puede asignar ese rol." };
    }

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
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("createUser", e) };
  }
}

export async function updateUser(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("usuarios:editar");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = UserUpdateSchema.safeParse({
    id: formData.get("id"),
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role"),
    active:
      formData.get("active") === "on" || formData.get("active") === "true",
  });
  if (!parsed.success)
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  if (ROLES_LEGADO_NO_ASIGNABLES.has(parsed.data.role)) {
    return { ok: false, message: "Los roles legado ya no se pueden asignar." };
  }

  try {
    const rol = await prisma.role.findFirst({
      where: { code: parsed.data.role, active: true },
      select: { code: true },
    });
    if (!rol) return { ok: false, message: "El rol seleccionado no existe." };
    if (parsed.data.role === ROL_SUPERADMINISTRADOR && authz.role !== ROL_SUPERADMINISTRADOR) {
      return { ok: false, message: "Solo un Superadministrador puede asignar ese rol." };
    }

    if (
      parsed.data.id === authz.userId &&
      (!parsed.data.active || parsed.data.role !== authz.role)
    ) {
      return { ok: false, message: "No puedes desactivar ni cambiar el rol de tu propia cuenta." };
    }

    const before = await prisma.user.findUnique({
      where: { id: parsed.data.id },
      select: { active: true, role: true },
    });
    if (before?.role === ROL_SUPERADMINISTRADOR && authz.role !== ROL_SUPERADMINISTRADOR) {
      return { ok: false, message: "Solo un Superadministrador puede editar esa cuenta." };
    }

    const emailDup = await prisma.user.findFirst({
      where: {
        email: parsed.data.email,
        NOT: { id: parsed.data.id },
      },
      select: { id: true },
    });
    if (emailDup) return { ok: false, message: "Ya existe un usuario con ese correo." };

    const bump =
      before?.active && !parsed.data.active
        ? { sessionVersion: { increment: 1 } }
        : {};
    await prisma.user.update({
      where: { id: parsed.data.id },
      data: {
        email: parsed.data.email,
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
      entity: String(parsed.data.id),
      detail: `${parsed.data.email} · ${parsed.data.role} · ${
        parsed.data.active ? "activo" : "inactivo"
      }`,
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("updateUser", e) };
  }
}

export async function resetUserPassword(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("usuarios:editar");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = UserResetSchema.safeParse({
    id: formData.get("id"),
    password: formData.get("password"),
  });
  if (!parsed.success)
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  try {
    const target = await prisma.user.findUnique({
      where: { id: parsed.data.id },
      select: { role: true },
    });
    if (target?.role === ROL_SUPERADMINISTRADOR && authz.role !== ROL_SUPERADMINISTRADOR) {
      return { ok: false, message: "Solo un Superadministrador puede resetear esa cuenta." };
    }

    const password = await bcrypt.hash(parsed.data.password, 10);
    await prisma.user.update({
      where: { id: parsed.data.id },
      data: {
        password,
        mustChangePassword: true,
        sessionVersion: { increment: 1 },
        failedLoginAttempts: 0,
        lastFailedLoginAt: null,
        blockedUntil: null,
      },
    });

    const actor = await getCurrentUser();
    await logAudit({
      user: actor?.name ?? "Sistema",
      action: "RESETEÓ CONTRASEÑA",
      entity: String(parsed.data.id),
      detail: "Forzar cambio en próximo ingreso",
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("resetUserPassword", e) };
  }
}

export async function unlockUser(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("usuarios:editar");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = UserUnlockSchema.safeParse({
    id: formData.get("id"),
  });
  if (!parsed.success)
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  try {
    const target = await prisma.user.findUnique({
      where: { id: parsed.data.id },
      select: { role: true, email: true, blockedUntil: true, failedLoginAttempts: true },
    });
    if (!target) return { ok: false, message: "El usuario no existe." };
    if (target.role === ROL_SUPERADMINISTRADOR && authz.role !== ROL_SUPERADMINISTRADOR) {
      return { ok: false, message: "Solo un Superadministrador puede desbloquear esa cuenta." };
    }
    if (!target.blockedUntil && target.failedLoginAttempts === 0) {
      return { ok: false, message: "El usuario no tiene bloqueo para limpiar." };
    }

    await prisma.user.update({
      where: { id: parsed.data.id },
      data: {
        failedLoginAttempts: 0,
        lastFailedLoginAt: null,
        blockedUntil: null,
      },
    });

    const actor = await getCurrentUser();
    await logAudit({
      user: actor?.name ?? "Sistema",
      action: "DESBLOQUEÓ USUARIO",
      entity: target.email,
      detail: "Limpió bloqueo de inicio de sesión",
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("unlockUser", e) };
  }
}

export async function deleteUser(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("usuarios:eliminar");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = UserDeleteSchema.safeParse({
    id: formData.get("id"),
  });
  if (!parsed.success)
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  try {
    if (parsed.data.id === authz.userId) {
      return { ok: false, message: "No puedes eliminar tu propia cuenta." };
    }

    const target = await prisma.user.findUnique({
      where: { id: parsed.data.id },
      select: { role: true, email: true },
    });
    if (!target) return { ok: false, message: "El usuario no existe." };
    if (target.role === ROL_SUPERADMINISTRADOR && authz.role !== ROL_SUPERADMINISTRADOR) {
      return { ok: false, message: "Solo un Superadministrador puede eliminar esa cuenta." };
    }

    // Las FK hacia User son LÓGICAS (sin restricción física), así que el
    // borrado no cae en cascada: limpiamos manualmente equipos y cartera
    // para no dejar registros huérfanos. Los comentarios y menciones sí
    // caen por cascada (onDelete: Cascade en el schema).
    await prisma.$transaction([
      prisma.teamMember.deleteMany({ where: { userId: parsed.data.id } }),
      prisma.clientAssignment.deleteMany({ where: { userId: parsed.data.id } }),
      prisma.team.updateMany({
        where: { leadUserId: parsed.data.id },
        data: { leadUserId: null },
      }),
      prisma.teamMember.updateMany({
        where: { assignedById: parsed.data.id },
        data: { assignedById: null },
      }),
      prisma.clientAssignment.updateMany({
        where: { assignedById: parsed.data.id },
        data: { assignedById: null },
      }),
      prisma.user.delete({ where: { id: parsed.data.id } }),
    ]);

    const actor = await getCurrentUser();
    await logAudit({
      user: actor?.name ?? "Sistema",
      action: "ELIMINÓ USUARIO",
      entity: target.email,
      detail: target.role,
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("deleteUser", e) };
  }
}
