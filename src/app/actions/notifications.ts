"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { registrarError } from "@/lib/errores";

export async function markAllNotificationsRead(): Promise<void> {
  // Validación previa (fuera del try): la guarda de permiso puede redirigir.
  await requirePermiso("dashboard:ver");
  try {
    // Notificaciones globales del sistema (el modelo Notification no tiene dueño): se marcan todas.
    await prisma.notification.updateMany({
      where: { unread: true },
      data: { unread: false },
    });
    revalidatePath("/", "layout");
  } catch (e) {
    // Acción void: registramos el error en el servidor y lo relanzamos al error boundary.
    registrarError("markAllNotificationsRead", e);
    throw e;
  }
}
