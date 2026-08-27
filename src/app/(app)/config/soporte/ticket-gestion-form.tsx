"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { gestionarTicket } from "@/app/actions/soporte";
import { EstadoProcesando } from "@/components/estado-procesando";
import { notifyActionState } from "@/lib/client-notifications";
import {
  ESTADO_TICKET_CERRADO,
  ESTADOS_TICKET,
  ETIQUETA_ESTADO_TICKET,
  requiereSolucion,
  type EstadoTicket,
} from "@/lib/soporte-estados";

/**
 * La ÚNICA caja de gestión del ticket: lo que Xentria le escribe a quien reportó
 * y el estado en que queda, en un solo envío al pie del hilo.
 *
 * Antes eran dos formularios —«Enviar mensaje» bajo el historial y «Respuesta /
 * solución» en un panel lateral— con dos cajas de texto que hacían lo mismo a
 * ojos de quien gestiona. La distinción real no era «mensaje vs. respuesta»,
 * sino la transición de estado: por eso ahora hay un solo texto y el destino lo
 * decide el selector (`gestionarTicket` aplica la misma regla en el servidor).
 */
export default function TicketGestionForm({
  ticket,
}: {
  ticket: {
    id: number;
    code: string;
    status: string;
    tieneRespuesta: boolean;
    updatedAt: string;
  };
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(gestionarTicket, undefined);
  const formRef = useRef<HTMLFormElement>(null);
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

  const cambiaEstado = estadoSeleccionado !== estadoActual;
  // El texto se convierte en la respuesta OFICIAL solo al resolver un ticket que
  // todavía no tiene una: una respuesta ya escrita nunca se reescribe.
  const esRespuesta = cambiaEstado && requiereSolucion(estadoSeleccionado) && !ticket.tieneRespuesta;

  useEffect(() => {
    notifyActionState(state, {
      success: `Ticket ${ticket.code} actualizado.`,
      error: "No se pudo actualizar el ticket.",
    });
    if (state?.ok) {
      formRef.current?.reset();
      if (estadoSeleccionado === ESTADO_TICKET_CERRADO) {
        router.push("/config/soporte");
      }
      router.refresh();
    }
  }, [state, router, ticket.code, estadoSeleccionado]);

  return (
    <form ref={formRef} action={action} className="mt-4 border-t border-ink-100 pt-4">
      <input type="hidden" name="ticketId" value={ticket.id} />
      <input type="hidden" name="updatedAt" value={ticket.updatedAt} />

      <label htmlFor={`texto-${ticket.id}`} className="sr-only">
        Escribe la gestión del ticket {ticket.code}
      </label>
      <textarea
        id={`texto-${ticket.id}`}
        name="texto"
        rows={3}
        maxLength={5000}
        placeholder={
          esRespuesta
            ? "Explica cómo se solucionó: este texto queda como la respuesta oficial del ticket."
            : "Responde a quien reportó la novedad, o deja constancia de algo que pasó después…"
        }
        className="w-full resize-y rounded-md border border-ink-200 bg-white px-3 py-2.5 text-[13px] leading-5 text-ink-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
      {state?.errors?.texto?.[0] && <p className="mt-1.5 text-xs text-err-700">{state.errors.texto[0]}</p>}

      <div className="mt-2.5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <label
            htmlFor={`status-${ticket.id}`}
            className="text-[11px] font-semibold uppercase tracking-wider text-ink-500"
          >
            Estado del ticket
          </label>
          <select
            id={`status-${ticket.id}`}
            name="status"
            value={estadoSeleccionado}
            onChange={(e) => setEstadoSeleccionado(e.target.value as EstadoTicket)}
            className="mt-1.5 block rounded-md border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            {ESTADOS_TICKET.map((estado) => (
              <option key={estado} value={estado}>
                {ETIQUETA_ESTADO_TICKET[estado]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-md bg-navy-700 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-navy-600 disabled:opacity-60"
        >
          {pending ? (
            <EstadoProcesando>Guardando</EstadoProcesando>
          ) : cambiaEstado ? (
            "Actualizar ticket"
          ) : (
            "Enviar mensaje"
          )}
        </button>
      </div>

      {state?.errors?.status?.[0] && <p className="mt-1.5 text-xs text-err-700">{state.errors.status[0]}</p>}
      {state?.message && !state.ok && <p className="mt-1.5 text-xs text-err-700">{state.message}</p>}

      <p className="mt-2 text-[11.5px] text-ink-500">
        {esRespuesta
          ? "Al resolver, el texto queda como la respuesta oficial y es obligatorio."
          : "Lo que escribas y el estado quedan visibles para quien reportó la novedad. Usa «En evaluación» cuando la novedad no sea una falla sino una mejora en estudio."}
      </p>
    </form>
  );
}
