"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { requirePermiso } from "@/lib/rbac";
import { registrarError } from "@/lib/errores";

export async function createCalendarEvent(formData: FormData): Promise<void> {
  await requirePermiso("calendario:crear");
  const dateStr = formData.get("date") as string; // YYYY-MM-DD
  const type = (formData.get("type") as string) || "req";
  const title = ((formData.get("title") as string) ?? "").trim();
  const subtitle = ((formData.get("subtitle") as string) ?? "").trim();
  const clientKey = (formData.get("clientKey") as string) || null;
  if (!dateStr || !title) return;

  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    await prisma.calendarEvent.create({ data: { date: new Date(y, m - 1, d), type, title, subtitle, clientKey: type === "req" ? clientKey : null, order: 999 } });
    const user = await getCurrentUser();
    await logAudit({ user: user?.name ?? "Sistema", action: "CREÓ EVENTO", entity: title, detail: `${type} · ${dateStr}` });
    revalidatePath("/calendario");
  } catch (e) {
    // Registra el error en el servidor y lo propaga al error boundary.
    registrarError("createCalendarEvent", e);
    throw e;
  }
}
