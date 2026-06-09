"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { requirePermiso } from "@/lib/rbac";
import { createProcessNotification } from "@/lib/notifications";
import { registrarError } from "@/lib/errores";

export async function generateRequirement(input: {
  templateCode: string; templateVersion: string; clientName: string; clientCode: string; period: string; recipients: number;
}): Promise<{ id: number; consec: string }> {
  await requirePermiso("requerimientos:ejecutar");
  // Envolvemos toda la lógica de negocio en try-catch: si falla la BD,
  // registramos el error en el servidor y re-lanzamos para que lo capture
  // el error boundary (esta acción no retorna { ok, message }).
  try {
    const count = await prisma.reqSubmission.count();
    const code = `REQ-2026-${100 + count}`;
    const consec = `RFA ${String(count + 1).padStart(3, "0")} – 2026 ${input.clientCode || "XX"}`;
    const user = await getCurrentUser();
    const submission = await prisma.reqSubmission.create({
      data: { code, consec, templateCode: input.templateCode, templateVersion: input.templateVersion, clientName: input.clientName, period: input.period, recipients: input.recipients, status: "Enviado", date: "hoy", sentBy: user?.name ?? "Auditor" },
    });
    await logAudit({ user: user?.name ?? "Sistema", action: "ENVIÓ REQUERIMIENTO", entity: consec, detail: `${input.clientName} · ${input.recipients} destinatario(s)` });
    await createProcessNotification({
      actor: user?.name,
      text: "generó el requerimiento",
      target: `${consec} · ${input.clientName}`,
    });
    revalidatePath("/", "layout");
    revalidatePath("/requerimientos");
    return { id: submission.id, consec };
  } catch (e) {
    registrarError("generateRequirement", e);
    throw e;
  }
}
