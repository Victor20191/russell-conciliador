"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cambiarEstadoTicket } from "@/app/actions/soporte";
import { EstadoProcesando } from "@/components/estado-procesando";
import { notifyActionState } from "@/lib/client-notifications";
import { ESTADOS_TICKET, ETIQUETA_ESTADO_TICKET, type EstadoTicket } from "@/lib/soporte-estados";

export default function TicketGestionForm({
  ticket,
}: {
  ticket: {
    id: number;
    code: string;
    status: string;
    solution: string | null;
    updatedAt: string;
  };
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(cambiarEstadoTicket, undefined);

  useEffect(() => {
    notifyActionState(state, {
      success: `Ticket ${ticket.code} actualizado.`,
      error: "No se pudo actualizar el ticket.",
    });
    if (state?.ok) router.refresh();
  }, [state, router, ticket.code]);

  const estadoActual = (ESTADOS_TICKET as readonly string[]).includes(ticket.status)
    ? (ticket.status as EstadoTicket)
    : "abierto";

  return (
    <form action={action} className="flex min-w-0 flex-col rounded-md border border-ink-150 bg-ink-50 p-4">
      <input type="hidden" name="ticketId" value={ticket.id} />
      <input type="hidden" name="updatedAt" value={ticket.updatedAt} />

      <label htmlFor={`status-${ticket.id}`} className="text-xs font-semibold uppercase tracking-wider text-ink-500">
        Estado
      </label>
      <select
        id={`status-${ticket.id}`}
        name="status"
        defaultValue={estadoActual}
        className="mt-2 rounded-md border border-ink-200 bg-white px-3 py-2.5 text-[13px] text-ink-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      >
        {ESTADOS_TICKET.map((estado) => (
          <option key={estado} value={estado}>
            {ETIQUETA_ESTADO_TICKET[estado]}
          </option>
        ))}
      </select>
      {state?.errors?.status?.[0] && <p className="mt-1.5 text-xs text-err-700">{state.errors.status[0]}</p>}

      <label htmlFor={`solution-${ticket.id}`} className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-500">
        Respuesta / solución
      </label>
      <textarea
        id={`solution-${ticket.id}`}
        name="solution"
        defaultValue={ticket.solution ?? ""}
        minLength={10}
        maxLength={5000}
        rows={6}
        placeholder="Obligatoria al marcar Resuelto. Describe las acciones realizadas."
        className="mt-2 min-h-32 resize-y rounded-md border border-ink-200 bg-white px-3 py-2.5 text-[13px] leading-5 text-ink-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
      {state?.errors?.solution?.[0] && <p className="mt-1.5 text-xs text-err-700">{state.errors.solution[0]}</p>}
      {state?.message && !state.ok && <p className="mt-2 text-xs text-err-700">{state.message}</p>}

      <button type="submit" disabled={pending} className="mt-3 rounded-md bg-navy-700 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-navy-600">
        {pending ? <EstadoProcesando>Guardando</EstadoProcesando> : "Actualizar ticket"}
      </button>
    </form>
  );
}
