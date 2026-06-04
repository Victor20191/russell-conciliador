"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { verifySession, getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";

export async function addReconciliationComment(formData: FormData): Promise<void> {
  await verifySession();
  const reconciliationId = formData.get("reconciliationId") as string;
  const cuenta = formData.get("cuenta") as string;
  const text = ((formData.get("text") as string) ?? "").trim();
  if (!reconciliationId || !cuenta || !text) return;

  const user = await getCurrentUser();
  await prisma.reconciliationComment.create({
    data: {
      reconciliationId, cuenta,
      who: user?.name ?? "Usuario",
      initials: user?.initials ?? "··",
      text, time: "ahora",
    },
  });
  await logAudit({ user: user?.name ?? "Sistema", action: "COMENTÓ", entity: `Cuenta ${cuenta}`, detail: `Cruce ${reconciliationId}` });
  revalidatePath(`/conciliacion/resultados/${reconciliationId}`);
}

export async function setRowStatus(formData: FormData): Promise<void> {
  await verifySession();
  const rowId = formData.get("rowId") as string;
  const status = formData.get("status") as string; // conciliada | excepcion | ajuste
  const reconciliationId = formData.get("reconciliationId") as string;
  if (!rowId || !["conciliada", "excepcion", "ajuste"].includes(status)) return;

  const row = await prisma.reconciliationRow.update({ where: { id: rowId }, data: { manualStatus: status } });
  const user = await getCurrentUser();
  const labels: Record<string, string> = { conciliada: "marcó como conciliada", excepcion: "marcó como excepción", ajuste: "solicitó ajuste contable" };
  await logAudit({ user: user?.name ?? "Sistema", action: "ACTUALIZÓ PARTIDA", entity: `Cuenta ${row.cuenta}`, detail: labels[status] });
  if (reconciliationId) revalidatePath(`/conciliacion/resultados/${reconciliationId}`);
}

export async function sendToReviewer(formData: FormData): Promise<void> {
  await verifySession();
  const id = formData.get("id") as string;
  if (!id) return;
  await prisma.reconciliation.update({ where: { id }, data: { status: "REVIEW" } });
  const user = await getCurrentUser();
  await logAudit({ user: user?.name ?? "Sistema", action: "ENVIÓ A REVISOR", entity: `Cruce ${id}`, detail: "Marcado en revisión" });
  revalidatePath(`/conciliacion/resultados/${id}`);
}
