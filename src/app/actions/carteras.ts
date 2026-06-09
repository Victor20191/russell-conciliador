"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { type ActionState } from "@/lib/definitions";
import { parseId } from "@/lib/ids";
import { mensajeErrorBD, registrarError } from "@/lib/errores";

// ============================================================
// Cartera de clientes = los clientes asignados a un EQUIPO.
// Edita `asignaciones_cliente` (cliente ↔ equipo + alcance + vigencia),
// la misma tabla que el RBAC lee para el alcance por cliente. Sin tabla
// nueva: una cartera es la composición de clientes de un equipo.
//
// Las asignaciones de cartera por equipo se guardan con userId = null
// (alcance para TODO el equipo). La segregación real la imponen los
// permisos de rol: aunque la cartera tenga writeScope, solo el Staff
// (único con permisos de escritura) puede operar; Senior/Gerente/Socio
// consultan.
// ============================================================

const PATH = "/config/carteras";

// "YYYY-MM-DD" → Date al final de ese día; "" → null (permanente);
// inválida → undefined (señal de error).
function parseVigencia(raw: FormDataEntryValue | null): Date | null | undefined {
  const s = ((raw as string) ?? "").trim();
  if (!s) return null;
  const d = new Date(`${s}T23:59:59`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Crea una cartera (equipo). El líder es el Senior responsable (opcional). */
export async function crearCartera(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("equipos:crear");
  if (!authz.ok) return { ok: false, message: authz.message };

  const name = ((formData.get("name") as string) ?? "").trim();
  const description = ((formData.get("description") as string) ?? "").trim();
  const leadUserId = parseId(formData.get("leadUserId"));
  if (!name) return { ok: false, message: "El nombre de la cartera es obligatorio." };

  try {
    await prisma.team.create({
      data: { name, description: description || null, leadUserId: leadUserId ?? null },
    });

    const actor = await getCurrentUser();
    await logAudit({
      user: actor?.name ?? "Sistema",
      action: "CREÓ CARTERA",
      entity: name,
      detail: leadUserId ? `Líder: usuario #${leadUserId}` : "Sin líder asignado",
    });
    revalidatePath(PATH);
    revalidatePath("/config/equipos"); // misma entidad (equipo)
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("crearCartera", e) };
  }
}

/** Asigna VARIOS clientes a la cartera (equipo) en una sola operación. */
export async function asignarClientes(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("equipos:asignar");
  if (!authz.ok) return { ok: false, message: authz.message };

  const teamId = parseId(formData.get("teamId"));
  if (!teamId) return { ok: false, message: "Cartera (equipo) obligatoria." };

  const clientIds = [
    ...new Set(
      formData
        .getAll("clientIds")
        .map((v) => parseId(v))
        .filter((x): x is number => x != null),
    ),
  ];
  if (clientIds.length === 0) return { ok: false, message: "Selecciona al menos un cliente." };

  const readScope = formData.get("readScope") != null;
  const writeScope = formData.get("writeScope") != null;
  const reason = ((formData.get("reason") as string) ?? "").trim() || null;
  const validUntil = parseVigencia(formData.get("validUntil"));
  if (validUntil === undefined) return { ok: false, message: "Fecha de vigencia inválida." };

  try {
    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { name: true } });
    if (!team) return { ok: false, message: "El equipo no existe." };

    // Asignaciones de cartera ya existentes (userId null) para no duplicar:
    // el UNIQUE [cliente, equipo, usuario] no protege con usuario NULL.
    const existentes = await prisma.clientAssignment.findMany({
      where: { teamId, userId: null, clientId: { in: clientIds } },
      select: { id: true, clientId: true },
    });
    const idPorCliente = new Map(existentes.map((x) => [x.clientId, x.id]));

    let creados = 0;
    let actualizados = 0;
    for (const clientId of clientIds) {
      const existeId = idPorCliente.get(clientId);
      if (existeId) {
        await prisma.clientAssignment.update({
          where: { id: existeId },
          data: { readScope, writeScope, validUntil, reason, active: true, assignedById: authz.userId },
        });
        actualizados++;
      } else {
        await prisma.clientAssignment.create({
          data: { clientId, teamId, userId: null, readScope, writeScope, validUntil, reason, assignedById: authz.userId },
        });
        creados++;
      }
    }

    const actor = await getCurrentUser();
    await logAudit({
      user: actor?.name ?? "Sistema",
      action: "ASIGNÓ CARTERA",
      entity: team.name,
      detail:
        `${clientIds.length} cliente(s) · ${creados} nuevo(s), ${actualizados} actualizado(s) · ` +
        `${readScope ? "lee" : "sin lectura"}${writeScope ? "+opera" : ""}` +
        (validUntil ? ` · vigente hasta ${iso(validUntil)}` : " · permanente"),
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("asignarClientes", e) };
  }
}

/** Edita el alcance y la vigencia de una asignación de cartera. */
export async function editarAsignacionCartera(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("equipos:asignar");
  if (!authz.ok) return { ok: false, message: authz.message };

  const id = parseId(formData.get("id"));
  if (!id) return { ok: false, message: "Asignación inexistente." };

  const readScope = formData.get("readScope") != null;
  const writeScope = formData.get("writeScope") != null;
  const reason = ((formData.get("reason") as string) ?? "").trim() || null;
  const validUntil = parseVigencia(formData.get("validUntil"));
  if (validUntil === undefined) return { ok: false, message: "Fecha de vigencia inválida." };

  try {
    await prisma.clientAssignment.update({
      where: { id },
      data: { readScope, writeScope, validUntil, reason },
    });

    const actor = await getCurrentUser();
    await logAudit({
      user: actor?.name ?? "Sistema",
      action: "EDITÓ CARTERA",
      entity: `Asignación #${id}`,
      detail:
        `${readScope ? "lee" : "sin lectura"}${writeScope ? "+opera" : ""}` +
        (validUntil ? ` · vigente hasta ${iso(validUntil)}` : " · permanente"),
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("editarAsignacionCartera", e) };
  }
}

/** Quita un cliente de la cartera (elimina la asignación). */
export async function quitarAsignacionCartera(formData: FormData): Promise<void> {
  await requirePermiso("equipos:asignar");
  const id = parseId(formData.get("id"));
  if (!id) return;
  try {
    await prisma.clientAssignment.delete({ where: { id } });
    const actor = await getCurrentUser();
    await logAudit({
      user: actor?.name ?? "Sistema",
      action: "QUITÓ DE CARTERA",
      entity: `Asignación #${id}`,
      detail: "Cliente removido de la cartera",
    });
    revalidatePath(PATH);
  } catch (e) {
    registrarError("quitarAsignacionCartera", e);
    throw e;
  }
}
