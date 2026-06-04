"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/rbac";

export async function generateRequirement(input: {
  templateCode: string; templateVersion: string; clientName: string; clientCode: string; period: string; recipients: number;
}): Promise<{ id: string; consec: string }> {
  await requireRole("Auditor");
  const count = await prisma.reqSubmission.count();
  const id = `REQ-2026-${100 + count}`;
  const consec = `RFA ${String(count + 1).padStart(3, "0")} – 2026 ${input.clientCode || "XX"}`;
  const user = await getCurrentUser();
  await prisma.reqSubmission.create({
    data: { id, consec, templateCode: input.templateCode, templateVersion: input.templateVersion, clientName: input.clientName, period: input.period, recipients: input.recipients, status: "Enviado", date: "hoy", sentBy: user?.name ?? "Auditor" },
  });
  await logAudit({ user: user?.name ?? "Sistema", action: "ENVIÓ REQUERIMIENTO", entity: consec, detail: `${input.clientName} · ${input.recipients} destinatario(s)` });
  revalidatePath("/requerimientos");
  return { id, consec };
}
