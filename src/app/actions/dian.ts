"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/rbac";

export async function addDianComment(formData: FormData): Promise<void> {
  await requireRole("Auditor");
  const formId = formData.get("formId") as string;
  const lineKey = formData.get("lineKey") as string;
  const periodId = formData.get("periodId") as string;
  const text = ((formData.get("text") as string) ?? "").trim();
  if (!formId || !lineKey || !text) return;

  const user = await getCurrentUser();
  await prisma.dianComment.create({
    data: { formId, lineKey, who: user?.name ?? "Usuario", initials: user?.initials ?? "··", text, time: "ahora" },
  });
  await logAudit({ user: user?.name ?? "Sistema", action: "COMENTÓ", entity: `Renglón ${lineKey}`, detail: `DIAN ${formId}` });
  if (periodId) revalidatePath(`/dian/${periodId}`);
}

// IA simulada: genera una observación heurística sobre la diferencia del renglón.
export async function requestDianAiAnalysis(formData: FormData): Promise<void> {
  await requireRole("Auditor");
  const formId = formData.get("formId") as string;
  const lineKey = formData.get("lineKey") as string;
  const periodId = formData.get("periodId") as string;
  const diff = Number(formData.get("diff") ?? 0);
  if (!formId || !lineKey) return;

  const abs = Math.abs(diff);
  const text = abs === 0
    ? "Sin diferencia entre declaración y contabilidad. El renglón concilia; no requiere acción."
    : abs > 1000000
      ? `Diferencia material de $${abs.toLocaleString("es-CO")}. Patrón típico: documentos registrados fuera del corte o reclasificación de tarifa. Recomiendo validar la causación posterior y confirmar inclusión en la próxima declaración.`
      : `Diferencia menor de $${abs.toLocaleString("es-CO")} (no material). Probable redondeo o ajuste de oportunidad. Documentar y monitorear en el siguiente período.`;

  await prisma.dianComment.create({
    data: { formId, lineKey, who: "IA", initials: "IA", isAI: true, time: "sugerencia automática", text },
  });
  const user = await getCurrentUser();
  await logAudit({ user: user?.name ?? "Sistema", action: "PIDIÓ ANÁLISIS IA", entity: `Renglón ${lineKey}`, detail: `DIAN ${formId}` });
  if (periodId) revalidatePath(`/dian/${periodId}`);
}

export async function saveDianMapping(
  formId: string,
  lineKey: string,
  rows: { account: string; desc: string; sign: string }[],
): Promise<void> {
  await requireRole("Líder");
  if (!formId || !lineKey) return;
  const clean = rows.filter((r) => r.account.trim());
  await prisma.dianMapping.deleteMany({ where: { formId, lineKey } });
  if (clean.length) {
    await prisma.dianMapping.createMany({
      data: clean.map((r, i) => ({ formId, lineKey, account: r.account.trim(), desc: r.desc.trim(), sign: r.sign === "-" ? "-" : "+", order: i })),
    });
  }
  const user = await getCurrentUser();
  await logAudit({ user: user?.name ?? "Sistema", action: "GUARDÓ MAPEO DIAN", entity: `Renglón ${lineKey}`, detail: `${clean.length} cuenta(s) · ${formId}` });
  revalidatePath("/config/dian");
  revalidatePath("/dian/[periodId]", "page");
}
