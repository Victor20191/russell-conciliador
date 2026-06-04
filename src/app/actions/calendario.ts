"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/rbac";

export async function createCalendarEvent(formData: FormData): Promise<void> {
  await requireRole("Auditor");
  const dateStr = formData.get("date") as string; // YYYY-MM-DD
  const type = (formData.get("type") as string) || "req";
  const title = ((formData.get("title") as string) ?? "").trim();
  const subtitle = ((formData.get("subtitle") as string) ?? "").trim();
  const clientId = (formData.get("clientId") as string) || null;
  if (!dateStr || !title) return;

  const [y, m, d] = dateStr.split("-").map(Number);
  await prisma.calendarEvent.create({ data: { date: new Date(y, m - 1, d), type, title, subtitle, clientId: type === "req" ? clientId : null, order: 999 } });
  const user = await getCurrentUser();
  await logAudit({ user: user?.name ?? "Sistema", action: "CREÓ EVENTO", entity: title, detail: `${type} · ${dateStr}` });
  revalidatePath("/calendario");
}
