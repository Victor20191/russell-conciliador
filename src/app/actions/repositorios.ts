"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { requirePermiso } from "@/lib/rbac";
import { parseId } from "@/lib/ids";

export async function markRepoItemReceived(formData: FormData): Promise<void> {
  await requirePermiso("requerimientos:crear");
  const itemId = parseId(formData.get("itemId"));
  const repositoryId = parseId(formData.get("repositoryId"));
  if (!itemId || !repositoryId) return;

  const item = await prisma.reqRepoItem.findUnique({ where: { id: itemId }, include: { family: true } });
  if (!item || item.status === "received") return;
  const wasOverdue = item.status === "overdue";

  const user = await getCurrentUser();
  await prisma.reqRepoItem.update({ where: { id: itemId }, data: { status: "received", file: "documento_cargado.pdf", size: "1.0 MB", by: user?.name ?? "Cliente", at: "ahora" } });
  await prisma.reqRepoFamily.update({ where: { id: item.familyId }, data: { received: { increment: 1 }, pending: wasOverdue ? undefined : { decrement: 1 } } });

  const repo = await prisma.reqRepository.findUnique({ where: { id: repositoryId } });
  if (repo) {
    const received = repo.received + 1;
    const pending = wasOverdue ? repo.pending : repo.pending - 1;
    const overdue = wasOverdue ? repo.overdue - 1 : repo.overdue;
    const progress = repo.total > 0 ? Math.round((received / repo.total) * 100) : 0;
    await prisma.reqRepository.update({ where: { id: repo.id }, data: { received, pending, overdue, progress, status: pending + overdue === 0 ? "Completo" : repo.status } });
  }

  await prisma.reqRepoActivity.create({ data: { repositoryId, at: "ahora", actor: user?.name ?? "Cliente", role: "Cliente", action: "Cargó un documento", detail: `${item.family.code} · ${item.doc.slice(0, 50)}`, order: 999 } });
  await logAudit({ user: user?.name ?? "Sistema", action: "RECIBIÓ DOCUMENTO", entity: String(repositoryId), detail: item.doc.slice(0, 60) });
  revalidatePath(`/requerimientos/repositorios/${repositoryId}`);
  revalidatePath("/requerimientos/repositorios");
}

export async function sendRepoReminder(formData: FormData): Promise<void> {
  await requirePermiso("requerimientos:ejecutar");
  const repositoryId = parseId(formData.get("repositoryId"));
  if (!repositoryId) return;
  const user = await getCurrentUser();
  await prisma.reqRepoActivity.create({ data: { repositoryId, at: "ahora", actor: user?.name ?? "Auditor", role: "Auditor", action: "Envió recordatorio", detail: "a los contactos con documentos pendientes", order: 999 } });
  await logAudit({ user: user?.name ?? "Sistema", action: "ENVIÓ RECORDATORIO", entity: String(repositoryId), detail: "Documentos pendientes" });
  revalidatePath(`/requerimientos/repositorios/${repositoryId}`);
}
