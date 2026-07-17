"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import { ROLES_LEGADO } from "@/lib/rbac/catalogo";
import { ROL_SUPERIOR, esAristaValida } from "@/lib/rbac/jerarquia";
import { ROL_SUPERADMINISTRADOR } from "@/lib/rbac/modulos-plataforma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import {
  UserCreateSchema,
  UserUpdateSchema,
  UserUnlockSchema,
  UserDeleteSchema,
  SuperioresSchema,
  type ActionState,
} from "@/lib/definitions";
import { mensajeErrorBD } from "@/lib/errores";
import {
  almacenamientoDisponible,
  subirObjeto,
  eliminarObjeto,
} from "@/lib/storage/objetos";
import {
  validarImagen,
  keyAvatar,
  AVATAR_MAX_BYTES,
  type TipoImagen,
} from "@/lib/avatares";

const PATH = "/config/usuarios";
const ROLES_LEGADO_NO_ASIGNABLES = new Set<string>(ROLES_LEGADO);

type FotoUsuarioPreparada = {
  bytes: Uint8Array;
  tipo: TipoImagen;
  contentType: string;
};

async function prepararFotoUsuario(
  formData: FormData,
): Promise<
  | { ok: true; foto: FotoUsuarioPreparada | null }
  | { ok: false; message: string }
> {
  const entrada = formData.get("foto");
  if (entrada === null) return { ok: true, foto: null };
  if (!(entrada instanceof File)) {
    return { ok: false, message: "La foto adjunta no es un archivo válido." };
  }
  if (entrada.size === 0) return { ok: true, foto: null };
  if (!almacenamientoDisponible()) {
    return {
      ok: false,
      message: "El almacenamiento de fotos no está configurado. Define las variables S3_*.",
    };
  }
  if (entrada.size > AVATAR_MAX_BYTES) {
    return {
      ok: false,
      message: `La foto supera ${Math.round(AVATAR_MAX_BYTES / 1024 / 1024)} MB.`,
    };
  }

  const bytes = new Uint8Array(await entrada.arrayBuffer());
  const validacion = validarImagen(bytes);
  if (!validacion.ok) return { ok: false, message: validacion.error };

  return {
    ok: true,
    foto: {
      bytes,
      tipo: validacion.tipo,
      contentType: validacion.contentType,
    },
  };
}

/** IDs de superiores directos enviados por el formulario (checkboxes). */
function parseSuperiores(
  formData: FormData,
): { ok: true; superiorIds: number[] } | { ok: false } {
  const parsed = SuperioresSchema.safeParse(formData.getAll("superiorIds"));
  if (!parsed.success) return { ok: false };
  return { ok: true, superiorIds: [...new Set(parsed.data)] };
}

/**
 * Valida los superiores directos contra la jerarquía organizacional:
 * el rol del usuario determina el rol exacto que deben tener sus superiores
 * (Staff→Senior, Senior→Gerente, Gerente→Socio). Los roles sin superior
 * (Socio, Administrador, Superadministrador) no admiten lista.
 */
async function validarSuperiores(
  role: string,
  superiorIds: number[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const rolEsperado = ROL_SUPERIOR[role];
  if (!rolEsperado) {
    return superiorIds.length === 0
      ? { ok: true }
      : { ok: false, message: "Este rol no reporta a superiores en la jerarquía." };
  }
  if (superiorIds.length === 0) return { ok: true };
  const superiores = await prisma.user.findMany({
    where: { id: { in: superiorIds }, active: true, role: rolEsperado },
    select: { id: true },
  });
  if (superiores.length !== superiorIds.length) {
    return {
      ok: false,
      message: `Los superiores seleccionados deben ser usuarios ${rolEsperado} activos.`,
    };
  }
  return { ok: true };
}

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

    const superiores = parseSuperiores(formData);
    if (!superiores.ok) return { ok: false, message: "Selecciona superiores válidos." };
    const superioresValidos = await validarSuperiores(parsed.data.role, superiores.superiorIds);
    if (!superioresValidos.ok) return { ok: false, message: superioresValidos.message };

    const fotoPreparada = await prepararFotoUsuario(formData);
    if (!fotoPreparada.ok) return { ok: false, message: fotoPreparada.message };

    const password = await bcrypt.hash(parsed.data.password, 10);
    let keyFotoSubida: string | null = null;
    try {
      await prisma.$transaction(async (tx) => {
        const nuevo = await tx.user.create({
          data: {
            email: parsed.data.email,
            name: parsed.data.name,
            role: parsed.data.role,
            initials: parsed.data.initials.toUpperCase(),
            password,
            mustChangePassword: true,
          },
        });
        if (superiores.superiorIds.length > 0) {
          await tx.userHierarchy.createMany({
            data: superiores.superiorIds.map((superiorId) => ({
              superiorId,
              subordinateId: nuevo.id,
            })),
          });
        }

        if (fotoPreparada.foto) {
          const key = keyAvatar(nuevo.id, fotoPreparada.foto.tipo);
          keyFotoSubida = key;
          await subirObjeto({
            key,
            cuerpo: fotoPreparada.foto.bytes,
            contentType: fotoPreparada.foto.contentType,
          });
          await tx.user.update({
            where: { id: nuevo.id },
            data: { avatarKey: key },
          });
        }
      }, { timeout: 30_000 });
    } catch (e) {
      // La transacción revierte usuario y jerarquía; compensamos el objeto R2
      // si la subida alcanzó a completarse antes del error.
      if (keyFotoSubida) await eliminarObjeto(keyFotoSubida).catch(() => {});
      throw e;
    }

    const actor = await getCurrentUser();
    await logAudit({
      user: actor?.name ?? "Sistema",
      action: "CREÓ USUARIO",
      entity: parsed.data.email,
      detail: `${parsed.data.role} · superiores: ${superiores.superiorIds.length} · foto: ${fotoPreparada.foto ? "sí" : "no"}`,
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

    if (
      parsed.data.id === authz.userId &&
      (!parsed.data.active || parsed.data.role !== authz.role)
    ) {
      return { ok: false, message: "No puedes desactivar ni cambiar el rol de tu propia cuenta." };
    }

    const before = await prisma.user.findUnique({
      where: { id: parsed.data.id },
      select: { active: true, role: true, avatarKey: true },
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

    const cambiaRol = before != null && before.role !== parsed.data.role;
    if (cambiaRol) {
      // Las asignaciones por cliente llevan la FUNCIÓN del rol actual
      // (staff/senior/gerente): con otro rol quedarían inconsistentes.
      const responsabilidades = await prisma.clientAssignment.count({
        where: { userId: parsed.data.id, active: true },
      });
      if (responsabilidades > 0) {
        return {
          ok: false,
          message: `Este usuario es responsable de ${responsabilidades} cliente(s). Reasigna esos clientes antes de cambiar su rol.`,
        };
      }
    }

    const superiores = parseSuperiores(formData);
    if (!superiores.ok) return { ok: false, message: "Selecciona superiores válidos." };
    const superioresValidos = await validarSuperiores(parsed.data.role, superiores.superiorIds);
    if (!superioresValidos.ok) return { ok: false, message: superioresValidos.message };

    const fotoPreparada = await prepararFotoUsuario(formData);
    if (!fotoPreparada.ok) return { ok: false, message: fotoPreparada.message };

    // Contraseña opcional: si viene, se restablece junto con los demás datos
    // (forzando cambio en el próximo ingreso y limpiando bloqueos).
    const resetPassword = parsed.data.password
      ? {
          password: await bcrypt.hash(parsed.data.password, 10),
          mustChangePassword: true,
          failedLoginAttempts: 0,
          lastFailedLoginAt: null,
          blockedUntil: null,
        }
      : {};
    const bump =
      (before?.active && !parsed.data.active) || parsed.data.password
        ? { sessionVersion: { increment: 1 } }
        : {};
    const keyFotoAnterior = before?.avatarKey ?? null;
    const keyFotoNueva = fotoPreparada.foto
      ? keyAvatar(parsed.data.id, fotoPreparada.foto.tipo)
      : null;

    if (fotoPreparada.foto && keyFotoNueva) {
      await subirObjeto({
        key: keyFotoNueva,
        cuerpo: fotoPreparada.foto.bytes,
        contentType: fotoPreparada.foto.contentType,
      });
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: parsed.data.id },
          data: {
            email: parsed.data.email,
            name: parsed.data.name,
            role: parsed.data.role,
            active: parsed.data.active,
            ...(keyFotoNueva ? { avatarKey: keyFotoNueva } : {}),
            ...resetPassword,
            ...bump,
          },
        });

        // Superiores directos: se reemplazan por los del formulario.
        await tx.userHierarchy.deleteMany({ where: { subordinateId: parsed.data.id } });
        if (superiores.superiorIds.length > 0) {
          await tx.userHierarchy.createMany({
            data: superiores.superiorIds.map((superiorId) => ({
              superiorId,
              subordinateId: parsed.data.id,
            })),
          });
        }

        // Si cambió el rol, podar las aristas donde este usuario es SUPERIOR
        // y que dejaron de conectar roles adyacentes.
        if (cambiaRol) {
          const comoSuperior = await tx.userHierarchy.findMany({
            where: { superiorId: parsed.data.id },
            select: { id: true, subordinateId: true },
          });
          if (comoSuperior.length > 0) {
            const subordinados = await tx.user.findMany({
              where: { id: { in: comoSuperior.map((a) => a.subordinateId) } },
              select: { id: true, role: true },
            });
            const rolPorId = new Map(subordinados.map((u) => [u.id, u.role]));
            const invalidas = comoSuperior
              .filter((a) => !esAristaValida(parsed.data.role, rolPorId.get(a.subordinateId) ?? ""))
              .map((a) => a.id);
            if (invalidas.length > 0) {
              await tx.userHierarchy.deleteMany({ where: { id: { in: invalidas } } });
            }
          }
        }
      });
    } catch (error) {
      // Si la key cambió, la foto anterior sigue intacta y podemos compensar
      // eliminando el objeto nuevo que la BD no alcanzó a referenciar.
      if (keyFotoNueva && keyFotoNueva !== keyFotoAnterior) {
        await eliminarObjeto(keyFotoNueva).catch(() => {});
      }
      throw error;
    }

    // Tras confirmar la nueva referencia en BD, retiramos el formato anterior
    // para no dejar objetos huérfanos cuando JPG/PNG/WEBP cambia.
    if (keyFotoNueva && keyFotoAnterior && keyFotoAnterior !== keyFotoNueva) {
      await eliminarObjeto(keyFotoAnterior).catch(() => {});
    }

    const actor = await getCurrentUser();
    await logAudit({
      user: actor?.name ?? "Sistema",
      action: "EDITÓ USUARIO",
      entity: String(parsed.data.id),
      detail: `${parsed.data.email} · ${parsed.data.role} · ${
        parsed.data.active ? "activo" : "inactivo"
      } · superiores: ${superiores.superiorIds.length}${parsed.data.password ? " · contraseña restablecida" : ""}${fotoPreparada.foto ? " · foto reemplazada" : ""}`,
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("updateUser", e) };
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

    // Si es responsable vigente de clientes, el borrado dejaría clientes
    // sin staff/senior/gerente en silencio: se exige reasignar primero.
    const responsabilidades = await prisma.clientAssignment.count({
      where: { userId: parsed.data.id, active: true },
    });
    if (responsabilidades > 0) {
      return {
        ok: false,
        message: `Este usuario es responsable de ${responsabilidades} cliente(s). Reasigna esos clientes antes de eliminarlo.`,
      };
    }

    // Las FK hacia User son LÓGICAS (sin restricción física), así que el
    // borrado no cae en cascada: limpiamos manualmente la jerarquía y las
    // asignaciones residuales (inactivas/expiradas) para no dejar registros
    // huérfanos. Los comentarios y menciones sí caen por cascada
    // (onDelete: Cascade en el schema).
    await prisma.$transaction([
      prisma.userHierarchy.deleteMany({
        where: { OR: [{ superiorId: parsed.data.id }, { subordinateId: parsed.data.id }] },
      }),
      prisma.clientAssignment.deleteMany({ where: { userId: parsed.data.id } }),
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
