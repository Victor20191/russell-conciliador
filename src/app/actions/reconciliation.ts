"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { clienteDeConciliacion, clienteDeFilaConciliacion } from "@/lib/rbac/contexto";
import { parseId } from "@/lib/ids";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { mensajeErrorBD } from "@/lib/errores";
import type { ActionState } from "@/lib/definitions";

// Patrón de autorización en dos pasos: el primer gate exige sesión +
// permiso de rol ANTES de tocar la BD; el segundo añade el ALCANCE de
// escritura sobre el cliente de la conciliación (cartera, fail-closed).

export async function addReconciliationComment(formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso("conciliaciones:editar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const reconciliationId = parseId(formData.get("reconciliationId"));
  const cuenta = formData.get("cuenta") as string;
  const text = ((formData.get("text") as string) ?? "").trim();
  if (!reconciliationId || !cuenta || !text) {
    return { ok: false, message: "Escribe una observación antes de comentar." };
  }
  const alcance = await authorizePermiso("conciliaciones:editar", { clientId: await clienteDeConciliacion(reconciliationId) });
  if (!alcance.ok) return { ok: false, message: alcance.message };

  try {
    const user = await getCurrentUser();
    await prisma.reconciliationComment.create({
      data: {
        reconciliationId, cuenta,
        who: user?.name ?? "Usuario",
        initials: user?.initials ?? "··",
        text,
      },
    });
    await logAudit({ user: user?.name ?? "Sistema", action: "COMENTÓ", entity: `Cuenta ${cuenta}`, detail: `Cruce ${reconciliationId}` });
    revalidatePath(`/conciliacion/resultados/${reconciliationId}`);
    return { ok: true, message: "Comentario registrado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("addReconciliationComment", e) };
  }
}

export async function setRowStatus(formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso("conciliaciones:editar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const rowId = parseId(formData.get("rowId"));
  const status = formData.get("status") as string; // conciliada | excepcion | ajuste
  const reconciliationId = parseId(formData.get("reconciliationId"));
  if (!rowId || !["conciliada", "excepcion", "ajuste"].includes(status)) {
    return { ok: false, message: "Estado de partida inválido." };
  }
  // El cliente se resuelve desde la FILA (no desde el formulario, que es manipulable).
  const alcance = await authorizePermiso("conciliaciones:editar", { clientId: await clienteDeFilaConciliacion(rowId) });
  if (!alcance.ok) return { ok: false, message: alcance.message };

  try {
    const row = await prisma.reconciliationRow.update({ where: { id: rowId }, data: { manualStatus: status } });
    const user = await getCurrentUser();
    const labels: Record<string, string> = { conciliada: "marcó como conciliada", excepcion: "marcó como excepción", ajuste: "solicitó ajuste contable" };
    await logAudit({ user: user?.name ?? "Sistema", action: "ACTUALIZÓ PARTIDA", entity: `Cuenta ${row.cuenta}`, detail: labels[status] });
    if (reconciliationId) revalidatePath(`/conciliacion/resultados/${reconciliationId}`);
    return { ok: true, message: "Partida actualizada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("setRowStatus", e) };
  }
}

export async function sendToReviewer(formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso("conciliaciones:editar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = parseId(formData.get("id"));
  if (!id) return { ok: false, message: "Conciliación inexistente." };
  const alcance = await authorizePermiso("conciliaciones:editar", { clientId: await clienteDeConciliacion(id) });
  if (!alcance.ok) return { ok: false, message: alcance.message };
  try {
    await prisma.reconciliation.update({ where: { id }, data: { status: "REVIEW" } });
    const user = await getCurrentUser();
    await logAudit({ user: user?.name ?? "Sistema", action: "ENVIÓ A REVISOR", entity: `Cruce ${id}`, detail: "Marcado en revisión" });
    revalidatePath(`/conciliacion/resultados/${id}`);
    return { ok: true, message: "Conciliación enviada a revisor." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("sendToReviewer", e) };
  }
}

// Compatibilidad con formularios anteriores: las conciliaciones se ejecutan en
// los módulos con archivos reales. Esta acción solo orienta y nunca persiste cruces.
export async function executeReconciliation(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("conciliaciones:ejecutar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const balanceId = parseId(formData.get("balanceId"));
  const clientId = parseId(formData.get("clientId"));
  const moduleId = parseId(formData.get("moduleId"));
  if (!balanceId || !clientId || !moduleId) {
    return { ok: false, message: "Faltan datos para ejecutar la conciliación." };
  }
  // Ejecutar es la acción operativa por excelencia: exige cartera con escritura.
  const alcance = await authorizePermiso("conciliaciones:ejecutar", { clientId });
  if (!alcance.ok) return { ok: false, message: alcance.message };

  try {
    const mod = await prisma.module.findUnique({ where: { id: moduleId }, select: { code: true } });
    if (!mod) return { ok: false, message: "Módulo inexistente." };
    const descriptor = descriptorModulo(mod.code.trim().toUpperCase());
    if (!descriptor) return { ok: false, message: "El módulo seleccionado no tiene un flujo de conciliación disponible." };

    return {
      ok: false,
      message: `La conciliación de ${descriptor.label} se realiza desde /modulos/${descriptor.codigo.toLowerCase()} con los datos reales cargados. Abre el módulo para continuar.`,
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("executeReconciliation", e) };
  }
}
