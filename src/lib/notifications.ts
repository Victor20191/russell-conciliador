import "server-only";

import prisma from "@/lib/prisma";
import { programarAvisoCorreo } from "@/lib/correo/notificaciones";
import { usuariosDestinatariosAviso } from "@/lib/correo/destinatarios";
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
    // Un aviso de negocio sin cliente verificable no puede difundirse globalmente.
    if (!clientId) return;
    const destinatarios = await usuariosDestinatariosAviso({ clienteId: clientId, actorId, permiso: "balance:ver" });
    if (destinatarios.length) await prisma.notification.createMany({
      data: destinatarios.map(({ id }) => ({
        userId: id,
        clientId,
        entityType: "balance",
        kind: "system",
        who: actor?.trim() || "Sistema",
        text,
        target,
        unread: true,
      })),
    });
    if (clientId) programarAvisoCorreo({
      titulo: "Novedad en un balance", texto: `${actor?.trim() || "Sistema"} ${text} ${target}`,
      clienteId: clientId, actorId, permiso: "balance:ver", ruta: ruta ?? "/balance",
      referencia: "Notificación de balance",
    });
  } catch (e) {
    registrarError("createProcessNotification", e);
  }
}
