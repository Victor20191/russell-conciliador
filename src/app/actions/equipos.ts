"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { ROLES_LIDER_EQUIPO, ROLES_INTEGRANTE_EQUIPO } from "@/lib/rbac/catalogo";
import { type ActionState } from "@/lib/definitions";
import { parseId } from "@/lib/ids";
import { mensajeErrorBD, registrarError } from "@/lib/errores";

const PATH = "/config/equipos";

// "YYYY-MM-DD" (input date) → Date al final de ese día; "" → null (permanente);
// inválida → undefined (señal de error para el caller).
function parseVigencia(raw: FormDataEntryValue | null): Date | null | undefined {
  const s = ((raw as string) ?? "").trim();
  if (!s) return null;
  const d = new Date(`${s}T23:59:59`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function crearEquipo(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("equipos:crear");
  if (!authz.ok) return { ok: false, message: authz.message };

  const name = ((formData.get("name") as string) ?? "").trim();
  const description = ((formData.get("description") as string) ?? "").trim();
  const leadUserId = parseId(formData.get("leadUserId"));
  if (!name) return { ok: false, message: "El nombre del equipo es obligatorio." };

  // El líder debe ser un Senior responsable activo (no es bypasseable desde la
  // UI): si se envía un leadUserId, se exige que exista, esté activo y tenga un
  // rol habilitado para liderar (ver ROLES_LIDER_EQUIPO).
  if (leadUserId != null) {
    const lead = await prisma.user.findUnique({
      where: { id: leadUserId },
      select: { active: true, role: true },
    });
    if (!lead || !lead.active || !ROLES_LIDER_EQUIPO.includes(lead.role as (typeof ROLES_LIDER_EQUIPO)[number])) {
      return { ok: false, message: "El líder debe ser un usuario Senior activo." };
    }
  }

  try {
    await prisma.team.create({
      data: { name, description: description || null, leadUserId: leadUserId ?? null },
    });

    const actor = await getCurrentUser();
    await logAudit({
      user: actor?.name ?? "Sistema",
      action: "CREÓ EQUIPO",
      entity: name,
      detail: leadUserId ? `Líder: usuario #${leadUserId}` : "Sin líder asignado",
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    // Cualquier fallo de base de datos se traduce a un mensaje claro para el usuario.
    return { ok: false, message: mensajeErrorBD("crearEquipo", e) };
  }
}

export async function agregarIntegrante(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("equipos:asignar");
  if (!authz.ok) return { ok: false, message: authz.message };

  const teamId = parseId(formData.get("teamId"));
  const userId = parseId(formData.get("userId"));
  if (!teamId || !userId) return { ok: false, message: "Equipo y usuario son obligatorios." };

  const reason = ((formData.get("reason") as string) ?? "").trim() || null;
  const validUntil = parseVigencia(formData.get("validUntil"));
  if (validUntil === undefined) return { ok: false, message: "Fecha de vigencia inválida." };

  // El integrante debe ser un Staff activo (rol operativo). No es bypasseable
  // desde la UI: se valida contra ROLES_INTEGRANTE_EQUIPO.
  const integrante = await prisma.user.findUnique({
    where: { id: userId },
    select: { active: true, role: true },
  });
  if (
    !integrante ||
    !integrante.active ||
    !ROLES_INTEGRANTE_EQUIPO.includes(integrante.role as (typeof ROLES_INTEGRANTE_EQUIPO)[number])
  ) {
    return { ok: false, message: "El integrante debe ser un usuario Staff activo." };
  }

  try {
    // El integrante NO lleva un "rol funcional" propio: su rol siempre es el del
    // sistema (User.role), que se muestra derivándolo en vivo al leer. Por eso
    // roleId queda en null (y se limpia si existía uno previo arbitrario).
    //
    // Upsert por [equipo, usuario]: re-asignar al MISMO equipo actualiza la
    // vigencia (no rompe el UNIQUE). Para asignar a OTRO equipo de forma
    // temporal, basta crear una fila en ese otro equipo con validUntil.
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId, userId } },
      update: { roleId: null, validUntil, reason, active: true, assignedById: authz.userId },
      create: { teamId, userId, roleId: null, validUntil, reason, assignedById: authz.userId },
    });

    const actor = await getCurrentUser();
    await logAudit({
      user: actor?.name ?? "Sistema",
      action: "ASIGNÓ INTEGRANTE",
      entity: `Equipo #${teamId}`,
      detail: validUntil
        ? `Usuario #${userId} · vigente hasta ${iso(validUntil)}`
        : `Usuario #${userId} · permanente`,
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    // Cualquier fallo de base de datos se traduce a un mensaje claro para el usuario.
    return { ok: false, message: mensajeErrorBD("agregarIntegrante", e) };
  }
}

export async function editarVigencia(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("equipos:asignar");
  if (!authz.ok) return { ok: false, message: authz.message };

  const id = parseId(formData.get("id"));
  if (!id) return { ok: false, message: "Integrante inexistente." };
  const reason = ((formData.get("reason") as string) ?? "").trim() || null;
  const validUntil = parseVigencia(formData.get("validUntil"));
  if (validUntil === undefined) return { ok: false, message: "Fecha de vigencia inválida." };

  try {
    await prisma.teamMember.update({ where: { id }, data: { validUntil, reason } });

    const actor = await getCurrentUser();
    await logAudit({
      user: actor?.name ?? "Sistema",
      action: "EDITÓ VIGENCIA",
      entity: `Integrante #${id}`,
      detail: validUntil ? `Vigente hasta ${iso(validUntil)}` : "Permanente",
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    // Cualquier fallo de base de datos se traduce a un mensaje claro para el usuario.
    return { ok: false, message: mensajeErrorBD("editarVigencia", e) };
  }
}

export async function quitarIntegrante(formData: FormData): Promise<void> {
  await requirePermiso("equipos:asignar");
  const id = parseId(formData.get("id"));
  if (!id) return;
  try {
    await prisma.teamMember.delete({ where: { id } });
    const actor = await getCurrentUser();
    await logAudit({
      user: actor?.name ?? "Sistema",
      action: "QUITÓ INTEGRANTE",
      entity: `Integrante #${id}`,
      detail: "Removido del equipo",
    });
    revalidatePath(PATH);
  } catch (e) {
    // Acción void: registramos el error en el servidor y lo relanzamos al error boundary.
    registrarError("quitarIntegrante", e);
    throw e;
  }
}
