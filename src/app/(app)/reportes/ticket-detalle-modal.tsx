"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/modal";
import { Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { obtenerDetalleTicket } from "@/app/actions/soporte";
import { fmtDateTime } from "@/lib/format";
import { etiquetaEstadoTicket, tonoEstadoTicket } from "@/lib/soporte-estados";
import type { DetalleTicket } from "@/lib/definitions";
import AdjuntosGaleria from "./adjuntos-galeria";

type Respuesta = { ticketId: number; detalle: DetalleTicket | null; error: string | null };

export function clasesGestionXentria({ solution }: { solution?: string | null }) {
  const tieneRespuesta = Boolean(solution);

  return {
    bloque: tieneRespuesta ? "border-ok-700 bg-ok-700" : "border-ink-150 bg-ink-50",
    titulo: tieneRespuesta ? "text-white" : "text-ink-500",
    respuesta: tieneRespuesta ? "text-white" : "text-ink-800",
    firma: tieneRespuesta ? "text-white/75" : "text-ink-600",
  };
}

/**
 * Detalle de una novedad en modal, para leerla sin salir del listado ni del
 * tablero. El contenido se pide al abrir (Server Action `obtenerDetalleTicket`)
 * y NO viene precargado con el listado: la descripción y los adjuntos de 200
 * tickets pesarían en cada render de `/reportes`.
 *
 * La página `/reportes/[id]` sigue existiendo y es la misma información: el
 * modal no la reemplaza, la adelanta. El pie enlaza a ella para poder abrirla
 * en pestaña aparte o compartir el enlace.
 */
export default function TicketDetalleModal({
  ticketId,
  onClose,
  puedeGestionar,
}: {
  ticketId: number | null;
  onClose: () => void;
  puedeGestionar: boolean;
}) {
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
  const clasesGestion = clasesGestionXentria({ solution: detalle?.solution });

  return (
    <Modal
      open={ticketId !== null}
      onClose={onClose}
      title={detalle?.code ?? "Reporte"}
      size="3xl"
      footer={
        detalle ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <Link
              href={`/reportes/${detalle.id}`}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-blue-500 hover:underline"
            >
              <Icon name="link" size={13} />
              Abrir en su propia página
            </Link>
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

          <article className="rounded-lg border border-ink-150 bg-paper p-4">
            {detalle.ubicacion && (
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-500">
                {detalle.ubicacion}
              </p>
            )}
            <p className="whitespace-pre-wrap text-[13px] leading-6 text-ink-700">{detalle.description}</p>
            <AdjuntosGaleria adjuntos={detalle.adjuntos} />
          </article>

          <section
            className={`rounded-lg border p-4 ${clasesGestion.bloque}`}
          >
            <p className={`text-xs font-semibold uppercase tracking-wider ${clasesGestion.titulo}`}>
              Gestión de Xentria
            </p>
            {detalle.solution ? (
              <>
                <p className={`mt-2.5 whitespace-pre-wrap text-[13px] leading-6 ${clasesGestion.respuesta}`}>
                  {detalle.solution}
                </p>
                <p className={`mt-3 text-[11.5px] ${clasesGestion.firma}`}>
                  {detalle.resolvedByName ?? "Xentria"}
                  {detalle.resolvedAt ? ` · ${fmtDateTime(detalle.resolvedAt)}` : ""}
                </p>
              </>
            ) : (
              <p className="mt-2.5 text-[13px] leading-6 text-ink-700">
                Xentria recibió esta novedad. Aquí se verá la respuesta cuando el equipo actualice el ticket.
              </p>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
