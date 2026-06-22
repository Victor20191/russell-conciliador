"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD } from "@/lib/errores";
import type { ActionState } from "@/lib/definitions";

export async function markAllNotificationsRead(): Promise<ActionState> {
  // Validación previa (fuera del try): la guarda de permiso puede redirigir.
  const authz = await authorizePermiso("dashboard:ver");
  if (!authz.ok) return { ok: false, message: authz.message };
  try {
    // Notificaciones globales del sistema (el modelo Notification no tiene dueño): se marcan todas.
    await prisma.notification.updateMany({
      where: { unread: true },
      data: { unread: false },
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Notificaciones marcadas como leídas." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("markAllNotificationsRead", e) };
  }
}
