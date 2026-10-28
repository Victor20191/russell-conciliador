"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { redirect } from "next/navigation";
import { mensajeErrorBD } from "@/lib/errores";
import type { ActionState } from "@/lib/definitions";

export async function markAllNotificationsRead(): Promise<ActionState> {
  // Validación previa (fuera del try): la guarda de permiso puede redirigir.
  const session = await verifySession();
  if (session.mustChangePassword) redirect("/cambiar-contrasena");
  try {
    // La lectura es personal, también cuando Inicio está en desarrollo para el rol.
    await prisma.notification.updateMany({
      where: { userId: session.userId, unread: true },
      data: { unread: false },
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Notificaciones marcadas como leídas." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("markAllNotificationsRead", e) };
  }
}
