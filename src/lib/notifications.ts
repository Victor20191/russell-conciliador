import "server-only";

import prisma from "@/lib/prisma";
import { registrarError } from "@/lib/errores";

type ProcessNotificationInput = {
  actor?: string | null;
  text: string;
  target: string;
};

export async function createProcessNotification({
  actor,
  text,
  target,
}: ProcessNotificationInput): Promise<void> {
  // Efecto secundario: si la notificación falla, NO debe tumbar la operación
  // principal. Se registra el error en el servidor y se continúa.
  try {
    await prisma.notification.create({
      data: {
        kind: "system",
        who: actor?.trim() || "Sistema",
        text,
        target,
        time: "ahora",
        unread: true,
      },
    });
  } catch (e) {
    registrarError("createProcessNotification", e);
  }
}
