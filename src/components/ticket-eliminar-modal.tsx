"use client";

import { useActionState, useEffect } from "react";
import { eliminarTicketSoporte } from "@/app/actions/soporte";
import { Modal } from "@/components/modal";
import { EstadoProcesando } from "@/components/estado-procesando";
import { notifyActionState } from "@/lib/client-notifications";

export type TicketEliminable = {
  id: number;
  code: string;
  subject: string;
  adjuntos: number;
};

/**
 * Confirmación del borrado definitivo de un ticket. La comparten la bandeja de
 * Xentria (`/config/soporte`) y el listado de novedades (`/reportes`), por eso
 * vive en `components/` y no dentro de una ruta. Solo la monta quien tiene
 * `soporte:eliminar` (Superadministrador); la Server Action vuelve a verificarlo.
 * El id viaja junto al código para que una bandeja desactualizada no borre otro
 * ticket.
 */
export default function TicketEliminarModal({
  ticket,
  onClose,
  onEliminado,
}: {
  ticket: TicketEliminable;
  onClose: () => void;
  onEliminado: () => void;
}) {
  const [state, action, pending] = useActionState(eliminarTicketSoporte, undefined);

  useEffect(() => {
    notifyActionState(state, {
      success: `Ticket ${ticket.code} eliminado.`,
      error: "No se pudo eliminar el ticket.",
    });
    if (state?.ok) onEliminado();
  }, [state, onEliminado, ticket.code]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Eliminar reporte"
      footer={
        <button
          type="submit"
          form="eliminar-ticket-form"
          disabled={pending}
          className="rounded-md bg-err-700 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-err-700/90 disabled:opacity-60"
        >
          {pending ? <EstadoProcesando>Eliminando</EstadoProcesando> : "Eliminar definitivamente"}
        </button>
      }
    >
      <form id="eliminar-ticket-form" action={action} className="flex flex-col gap-4">
        <input type="hidden" name="ticketId" value={ticket.id} />
        <input type="hidden" name="code" value={ticket.code} />

        <p className="text-[13px] text-ink-600">
          Vas a eliminar permanentemente el ticket{" "}
          <strong className="font-mono">{ticket.code}</strong> — «{ticket.subject}».
          {ticket.adjuntos > 0 && (
            <> También se borrarán sus {ticket.adjuntos} imagen(es) adjuntas.</>
          )}
        </p>
        <p className="text-[12px] text-ink-500">
          Esta acción no se puede deshacer: el reporte desaparece de la bandeja, de la
          vista del usuario y de su enlace de seguimiento. Si solo quieres darlo por
          terminado, cámbialo a <strong>Cerrado</strong> en lugar de eliminarlo.
        </p>

        {state?.message && !state.ok && <p className="text-[12px] text-err-700">{state.message}</p>}
        {state?.errors && (
          <p className="text-[12px] text-err-700">
            {Object.values(state.errors).flat().filter(Boolean)[0]}
          </p>
        )}
      </form>
    </Modal>
  );
}
