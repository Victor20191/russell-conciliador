import "server-only";

import prisma from "@/lib/prisma";
import { programarAvisoCorreo } from "@/lib/correo/notificaciones";
import { registrarError } from "@/lib/errores";

type ProcessNotificationInput = {
  actor?: string | null;
  text: string;
  target: string;
  clientId?: number | null;
  actorId?: number | null;
  ruta?: string;
};

export async function createProcessNotification({
  actor,
  text,
  target,
  clientId, actorId, ruta,
}: ProcessNotificationInput): Promise<void> {
  // Efecto secundario: si la notificación falla, NO debe tumbar la operación
  // principal. Se registra el error en el servidor y se continúa.
  try {
    const creada = await prisma.notification.create({
      data: {
        kind: "system",
        who: actor?.trim() || "Sistema",
        text,
        target,
        unread: true,
      },
    });
    if (clientId) programarAvisoCorreo({
      titulo: "Novedad en un balance", texto: `${actor?.trim() || "Sistema"} ${text} ${target}`,
      clienteId: clientId, actorId, permiso: "balance:ver", ruta: ruta ?? "/balance",
      referencia: `Notificación #${creada.id}`,
    });
  } catch (e) {
    registrarError("createProcessNotification", e);
  }
}
