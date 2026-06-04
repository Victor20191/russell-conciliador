"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";

export async function markAllNotificationsRead(): Promise<void> {
  await requireRole("Auditor");
  // Notificaciones globales del sistema (el modelo Notification no tiene dueño): se marcan todas.
  await prisma.notification.updateMany({
    where: { unread: true },
    data: { unread: false },
  });
  revalidatePath("/", "layout");
}
