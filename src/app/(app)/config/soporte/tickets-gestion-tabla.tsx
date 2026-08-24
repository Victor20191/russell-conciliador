"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Card, Chip } from "@/components/ui";
import {
  PageSizeSelect,
  PaginationFooter,
  usePagination,
} from "@/components/pagination-controls";
import { fmtDate, fmtDateTime, fmtHora12 } from "@/lib/format";
import {
  ESTADOS_TICKET,
  ETIQUETA_ESTADO_TICKET,
  etiquetaEstadoTicket,
  tonoEstadoTicket,
  type EstadoTicket,
} from "@/lib/soporte-estados";
import {
  contarTicketsPorEstado,
  esFiltroEstadoTicket,
  FILTRO_ESTADO_EN_GESTION,
  FILTRO_ESTADO_TODOS,
  filtrarTicketsGestion,
  type FiltroEstadoTicket,
  type TicketFilaGestion,
} from "@/lib/soporte-bandeja";
import { etiquetaUbicacionNovedad } from "@/lib/soporte-rutas";
import TicketEliminarModal, { type TicketEliminable } from "./ticket-eliminar-modal";

function hrefDetalle(id: number) {
  return `/config/soporte/${id}`;
}

/**
 * Listado de gestión de reportes: una fila por ticket con lo esencial para
 * priorizar (cuándo y a qué hora entró, quién lo reportó, dónde y en qué estado
 * va). Toda la fila abre el detalle en `/config/soporte/[id]`, que es donde se
 * ven las imágenes y se cambia el estado o se documenta la solución.
 */
export default function TicketsGestionTabla({
  tickets,
  puedeEliminar = false,
}: {
  tickets: TicketFilaGestion[];
  puedeEliminar?: boolean;
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState<FiltroEstadoTicket>(FILTRO_ESTADO_TODOS);
  const [aEliminar, setAEliminar] = useState<TicketEliminable | null>(null);

  const conteo = useMemo(() => contarTicketsPorEstado(tickets), [tickets]);
  const filtrados = useMemo(
    () => filtrarTicketsGestion(tickets, { busqueda, estado }),
    [tickets, busqueda, estado],
  );
  const pg = usePagination(filtrados, 50);
  const hayFiltros = busqueda.trim() !== "" || estado !== FILTRO_ESTADO_TODOS;

  const cambiarEstado = (siguiente: FiltroEstadoTicket) => {
    setEstado(siguiente);
    pg.resetToFirstPage();
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Resumen por estado: cada tarjeta también filtra el listado. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ESTADOS_TICKET.map((valor) => (
          <TarjetaEstado
            key={valor}
            estado={valor}
            total={conteo[valor]}
            activa={estado === valor}
            onClick={() => cambiarEstado(estado === valor ? FILTRO_ESTADO_TODOS : valor)}
          />
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 px-4 py-3">
          <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-md border border-ink-200 bg-white px-3 py-2 text-ink-400 shadow-sm focus-within:border-blue-400">
            <Icon name="search" size={15} />
            <input
              type="text"
              value={busqueda}
              onChange={(evento) => {
                setBusqueda(evento.target.value);
                pg.resetToFirstPage();
              }}
              placeholder="Buscar por código, asunto, persona o ubicación…"
              aria-label="Buscar tickets por código, asunto, persona o ubicación"
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink-700 outline-none placeholder:text-ink-400"
            />
            {busqueda.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setBusqueda("");
                  pg.resetToFirstPage();
                }}
                aria-label="Limpiar búsqueda"
                title="Limpiar búsqueda"
                className="rounded p-0.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
              >
                <Icon name="x" size={14} />
              </button>
            )}
          </div>
          <label className="flex items-center gap-1.5 text-[12px] font-medium text-ink-500">
            Estado
            <select
              value={estado}
              onChange={(evento) => {
                const valor = evento.target.value;
                if (esFiltroEstadoTicket(valor)) cambiarEstado(valor);
              }}
              aria-label="Filtrar por estado"
              className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12.5px] text-ink-700 outline-none focus:border-blue-400"
            >
              <option value={FILTRO_ESTADO_TODOS}>Todos</option>
              <option value={FILTRO_ESTADO_EN_GESTION}>En gestión</option>
              {ESTADOS_TICKET.map((valor) => (
                <option key={valor} value={valor}>
                  {ETIQUETA_ESTADO_TICKET[valor]}
                </option>
              ))}
            </select>
          </label>
          <span className="text-[11px] text-ink-400">Más recientes primero</span>
          <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                <th className="px-4 py-2.5 font-semibold">Código</th>
                <th className="px-4 py-2.5 font-semibold">Asunto</th>
                <th className="px-4 py-2.5 font-semibold">Reportado por</th>
                <th className="px-4 py-2.5 font-semibold">Fecha</th>
                <th className="px-4 py-2.5 font-semibold">Hora</th>
                <th className="px-4 py-2.5 font-semibold">Ubicación</th>
                <th className="px-4 py-2.5 text-right font-semibold">Imágenes</th>
                <th className="px-4 py-2.5 font-semibold">Estado</th>
                <th className="px-4 py-2.5 font-semibold">Última gestión</th>
                <th className="px-4 py-2.5"></th>
                {puedeEliminar && <th className="px-4 py-2.5 text-right font-semibold">Eliminar</th>}
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.length === 0 && (
                <tr>
                  <td colSpan={puedeEliminar ? 11 : 10} className="px-4 py-10 text-center text-[12.5px] text-ink-400">
                    {hayFiltros
                      ? "Ningún ticket coincide con la búsqueda o el estado elegido."
                      : "Todavía no hay novedades reportadas."}
                  </td>
                </tr>
              )}
              {pg.pageItems.map((ticket) => {
                const ubicacion = etiquetaUbicacionNovedad(ticket.routeLabel, ticket.menuLabel);
                const destino = hrefDetalle(ticket.id);
                return (
                  <tr
                    key={ticket.id}
                    onClick={() => router.push(destino)}
                    className="cursor-pointer border-b border-ink-50 last:border-0 hover:bg-ink-50"
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11.5px] font-semibold text-ink-700">
                      <Link
                        href={destino}
                        onClick={(evento) => evento.stopPropagation()}
                        className="hover:text-navy-700 hover:underline"
                      >
                        {ticket.code}
                      </Link>
                    </td>
                    <td className="max-w-[320px] px-4 py-2.5">
                      <div className="truncate font-medium text-ink-800" title={ticket.subject}>
                        {ticket.subject}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink-700">
                      <div className="flex items-center gap-1.5">
                        <span>
                          {ticket.reporterFirstName} {ticket.reporterLastName}
                        </span>
                        {ticket.createdById === null && (
                          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-600">
                            Público
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink-700">{fmtDate(ticket.createdAt)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono tabular-nums text-ink-600">
                      {fmtHora12(ticket.createdAt)}
                    </td>
                    <td className="max-w-[240px] px-4 py-2.5 text-ink-600">
                      <div className="truncate" title={ubicacion ?? undefined}>
                        {ubicacion ?? <span className="text-ink-400">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-700">
                      {ticket.adjuntos > 0 ? ticket.adjuntos : <span className="text-ink-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <Chip label={etiquetaEstadoTicket(ticket.status)} tone={tonoEstadoTicket(ticket.status)} />
                    </td>
                    <td className="max-w-[220px] px-4 py-2.5 text-ink-500">
                      {ticket.resolvedByName && ticket.resolvedAt ? (
                        <div className="truncate" title={`${ticket.resolvedByName} · ${fmtDateTime(ticket.resolvedAt)}`}>
                          {ticket.resolvedByName}
                          <span className="text-ink-400"> · {fmtDateTime(ticket.resolvedAt)}</span>
                        </div>
                      ) : (
                        <span className="text-ink-400">Sin gestionar</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <Link
                        href={destino}
                        onClick={(evento) => evento.stopPropagation()}
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-500 hover:underline"
                      >
                        Abrir <Icon name="chev-r" size={12} />
                      </Link>
                    </td>
                    {puedeEliminar && (
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={(evento) => {
                            evento.stopPropagation();
                            setAEliminar({
                              id: ticket.id,
                              code: ticket.code,
                              subject: ticket.subject,
                              adjuntos: ticket.adjuntos,
                            });
                          }}
                          aria-label={`Eliminar el ticket ${ticket.code}`}
                          title="Eliminar definitivamente"
                          className="inline-flex items-center gap-1 rounded p-1 text-ink-400 transition hover:bg-err-100 hover:text-err-700"
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationFooter
          rangeLabel={pg.rangeLabel}
          currentPage={pg.page}
          totalPages={pg.totalPages}
          onPageChange={pg.setPage}
        />
      </Card>

      {aEliminar && (
        <TicketEliminarModal
          ticket={aEliminar}
          onClose={() => setAEliminar(null)}
          onEliminado={() => {
            setAEliminar(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

const ACENTO_ESTADO: Record<EstadoTicket, string> = {
  abierto: "text-warn-700",
  en_proceso: "text-blue-500",
  resuelto: "text-ok-700",
  cerrado: "text-ink-600",
};

function TarjetaEstado({
  estado,
  total,
  activa,
  onClick,
}: {
  estado: EstadoTicket;
  total: number;
  activa: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      title={activa ? "Quitar el filtro por estado" : `Ver solo tickets en estado ${ETIQUETA_ESTADO_TICKET[estado]}`}
      className={`rounded-lg border bg-white px-4 py-3 text-left shadow-sm transition ${
        activa ? "border-navy-700 ring-2 ring-blue-100" : "border-ink-150 hover:border-ink-300"
      }`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
        {ETIQUETA_ESTADO_TICKET[estado]}
      </div>
      <div className={`mt-1 font-mono text-2xl font-semibold ${ACENTO_ESTADO[estado]}`}>{total}</div>
    </button>
  );
}
