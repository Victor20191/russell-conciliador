"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { type ActionState } from "@/lib/definitions";
import { parseId } from "@/lib/ids";

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

  const roleCode = ((formData.get("roleCode") as string) ?? "").trim() || null;
  const reason = ((formData.get("reason") as string) ?? "").trim() || null;
  const validUntil = parseVigencia(formData.get("validUntil"));
  if (validUntil === undefined) return { ok: false, message: "Fecha de vigencia inválida." };

  const role = roleCode
    ? await prisma.role.findUnique({ where: { code: roleCode }, select: { id: true } })
    : null;

  // Upsert por [equipo, usuario]: re-asignar al MISMO equipo actualiza la
  // vigencia (no rompe el UNIQUE). Para asignar a OTRO equipo de forma
  // temporal, basta crear una fila en ese otro equipo con validUntil.
  await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId, userId } },
    update: { roleId: role?.id ?? null, validUntil, reason, active: true, assignedById: authz.userId },
    create: { teamId, userId, roleId: role?.id ?? null, validUntil, reason, assignedById: authz.userId },
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
}

export async function quitarIntegrante(formData: FormData): Promise<void> {
  await requirePermiso("equipos:asignar");
  const id = parseId(formData.get("id"));
  if (!id) return;
  await prisma.teamMember.delete({ where: { id } });
  const actor = await getCurrentUser();
  await logAudit({
    user: actor?.name ?? "Sistema",
    action: "QUITÓ INTEGRANTE",
    entity: `Integrante #${id}`,
    detail: "Removido del equipo",
  });
  revalidatePath(PATH);
}
