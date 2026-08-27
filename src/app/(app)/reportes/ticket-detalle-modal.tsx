"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Modal } from "@/components/modal";
import TicketEliminarModal from "@/components/ticket-eliminar-modal";
import { Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { obtenerDetalleTicket } from "@/app/actions/soporte";
import { fmtDateTime } from "@/lib/format";
import { etiquetaEstadoTicket, tonoEstadoTicket } from "@/lib/soporte-estados";
import type { DetalleTicket } from "@/lib/definitions";
import TicketHistorial from "@/components/ticket-historial";
import TicketMensajeForm from "@/components/ticket-mensaje-form";

type Respuesta = { ticketId: number; detalle: DetalleTicket | null; error: string | null };

/**
 * Detalle de una novedad en modal, para leerla sin salir del listado ni del
 * tablero. El contenido se pide al abrir (Server Action `obtenerDetalleTicket`)
 * y NO viene precargado con el listado: la descripción y los adjuntos de 200
 * tickets pesarían en cada render de `/reportes`.
 *
 * La página `/reportes/[id]` sigue existiendo y es la misma información: el
 * modal no la reemplaza, la adelanta.
 */
export default function TicketDetalleModal({
  ticketId,
  onClose,
  puedeGestionar,
  puedeEliminar = false,
}: {
  ticketId: number | null;
  onClose: () => void;
  puedeGestionar: boolean;
  /** `soporte:eliminar` (Superadministrador): habilita el borrado definitivo. */
  puedeEliminar?: boolean;
}) {
  const router = useRouter();
  // Se guarda el ID en confirmación —y no un booleano— para que una
  // confirmación a medias no sobreviva al salto a otra tarjeta del tablero.
  const [borradoDe, setBorradoDe] = useState<number | null>(null);
  // La respuesta guarda de QUÉ ticket es. Desde el tablero es fácil encadenar
  // dos tarjetas antes de que llegue la primera respuesta; al comparar contra
  // el ticket abierto, la respuesta rezagada se descarta al pintar y no hay que
  // limpiar el estado al vuelo cuando cambia `ticketId`.
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null);

  useEffect(() => {
    if (ticketId === null) return;
    obtenerDetalleTicket(ticketId).then(
      (resultado) =>
        setRespuesta(
          resultado.ok
            ? { ticketId, detalle: resultado.ticket, error: null }
            : { ticketId, detalle: null, error: resultado.message },
        ),
      () => setRespuesta({ ticketId, detalle: null, error: "No se pudo cargar el reporte. Intenta de nuevo." }),
    );
  }, [ticketId]);

  const actual = respuesta?.ticketId === ticketId ? respuesta : null;
  const detalle = actual?.detalle ?? null;
  const error = actual?.error ?? null;

  // Tras enviar un mensaje hay que RECARGAR el detalle: el modal no navega, así
  // que `router.refresh()` repinta el listado de atrás pero no este contenido.
  const recargar = useCallback(() => {
    if (ticketId === null) return;
    obtenerDetalleTicket(ticketId).then(
      (resultado) =>
        setRespuesta(
          resultado.ok
            ? { ticketId, detalle: resultado.ticket, error: null }
            : { ticketId, detalle: null, error: resultado.message },
        ),
      () => {},
    );
  }, [ticketId]);

  return (
    <Modal
      open={ticketId !== null}
      onClose={onClose}
      title={detalle?.code ?? "Reporte"}
      size="3xl"
      footer={
        detalle && (puedeEliminar || puedeGestionar) ? (
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            {puedeEliminar && (
              <button
                type="button"
                onClick={() => setBorradoDe(detalle.id)}
                className="inline-flex items-center gap-1.5 rounded-md border border-err-500/40 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-err-700 transition hover:bg-err-100"
              >
                <Icon name="trash" size={14} /> Eliminar
              </button>
            )}
            {puedeGestionar && (
              <Link
                href={`/config/soporte/${detalle.id}`}
                className="rounded-md bg-navy-700 px-3.5 py-2 text-[12.5px] font-semibold text-white transition hover:bg-navy-600"
              >
                Gestionar este ticket
              </Link>
            )}
          </div>
        ) : undefined
      }
    >
      {error ? (
        <p className="rounded-md border border-err-100 bg-err-100 px-4 py-3 text-[12.5px] font-semibold text-err-700">
          {error}
        </p>
      ) : !detalle ? (
        <p className="px-1 py-8 text-center text-[12.5px] text-ink-400">Cargando el reporte…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold text-ink-900">{detalle.subject}</h3>
              <p className="mt-0.5 text-[11.5px] text-ink-500">
                {detalle.reportante} · {fmtDateTime(detalle.createdAt)}
              </p>
            </div>
            <Chip label={etiquetaEstadoTicket(detalle.status)} tone={tonoEstadoTicket(detalle.status)} />
          </header>

          <section className="rounded-lg border border-ink-150 bg-paper p-4">
            {detalle.ubicacion && (
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-500">
                {detalle.ubicacion}
              </p>
            )}
            <TicketHistorial entradas={detalle.historial} />
            {detalle.puedeEscribir && (
              <TicketMensajeForm
                ticketId={detalle.id}
                code={detalle.code}
                lado={puedeGestionar ? "xentria" : "reportante"}
                onEnviado={recargar}
              />
            )}
          </section>
        </div>
      )}

      {detalle && borradoDe === detalle.id && (
        <TicketEliminarModal
          ticket={{
            id: detalle.id,
            code: detalle.code,
            subject: detalle.subject,
            adjuntos: detalle.adjuntos.length,
          }}
          onClose={() => setBorradoDe(null)}
          onEliminado={() => {
            setBorradoDe(null);
            onClose();
            router.refresh();
          }}
        />
      )}
    </Modal>
  );
}
