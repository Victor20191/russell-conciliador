"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cambiarEstadoTicket } from "@/app/actions/soporte";
import { EstadoProcesando } from "@/components/estado-procesando";
import { notifyActionState } from "@/lib/client-notifications";
import {
  ESTADO_TICKET_CERRADO,
  ESTADOS_TICKET,
  ETIQUETA_ESTADO_TICKET,
  type EstadoTicket,
} from "@/lib/soporte-estados";

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
  const estadoActual = (ESTADOS_TICKET as readonly string[]).includes(ticket.status)
    ? (ticket.status as EstadoTicket)
    : "abierto";
  const [estadoSeleccionado, setEstadoSeleccionado] = useState<EstadoTicket>(estadoActual);

  // Re-sincroniza la selección cuando el servidor devuelve otro estado para el
  // ticket. Se ajusta durante el render (no en un efecto) para no encadenar un
  // segundo render con el valor viejo ya pintado.
  const [estadoPrevio, setEstadoPrevio] = useState<EstadoTicket>(estadoActual);
  if (estadoPrevio !== estadoActual) {
    setEstadoPrevio(estadoActual);
    setEstadoSeleccionado(estadoActual);
  }

  useEffect(() => {
    notifyActionState(state, {
      success: `Ticket ${ticket.code} actualizado.`,
      error: "No se pudo actualizar el ticket.",
    });
    if (state?.ok) {
      if (estadoSeleccionado === ESTADO_TICKET_CERRADO) {
        router.push("/config/soporte");
        router.refresh();
      } else {
        router.refresh();
      }
    }
  }, [state, router, ticket.code, estadoSeleccionado]);

  return (
    <form action={action} className="flex min-w-0 flex-col rounded-md border border-ink-150 bg-ink-50 p-4">
      <input type="hidden" name="ticketId" value={ticket.id} />
      <input type="hidden" name="updatedAt" value={ticket.updatedAt} />

      <h2 className="text-[13px] font-semibold text-ink-800">Gestión de Xentria</h2>
      <p className="mt-1 text-[11.5px] text-ink-500">
        El estado y la respuesta quedan visibles para quien reportó la novedad.
      </p>

      <label htmlFor={`status-${ticket.id}`} className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-500">
        Estado
      </label>
      <select
        id={`status-${ticket.id}`}
        name="status"
        value={estadoSeleccionado}
        onChange={(e) => setEstadoSeleccionado(e.target.value as EstadoTicket)}
        className="mt-2 rounded-md border border-ink-200 bg-white px-3 py-2.5 text-[13px] text-ink-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      >
        {ESTADOS_TICKET.map((estado) => (
          <option key={estado} value={estado}>
            {ETIQUETA_ESTADO_TICKET[estado]}
          </option>
        ))}
      </select>
      {state?.errors?.status?.[0] && <p className="mt-1.5 text-xs text-err-700">{state.errors.status[0]}</p>}
      <p className="mt-1.5 text-[11.5px] text-ink-500">
        Usa «En evaluación» cuando la novedad no sea una falla sino una mejora de la plataforma que está en estudio.
      </p>

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
