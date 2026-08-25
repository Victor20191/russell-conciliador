"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Chip, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtDateTime } from "@/lib/format";
import { etiquetaEstadoTicket, tonoEstadoTicket } from "@/lib/soporte-estados";
import type { TicketKanban } from "@/lib/soporte-kanban";
import {
  contarPorDominio,
  DOMINIOS_REPORTE,
  esFiltroDominioReporte,
  ETIQUETA_DOMINIO,
  FILTRO_DOMINIO_TODOS,
  filtrarPorDominio,
  type FiltroDominioReporte,
} from "@/lib/soporte-dominios";
import KanbanTablero from "./kanban-tablero";
import TicketDetalleModal from "./ticket-detalle-modal";

const CLAVE_VISTA = "reportes:vista";
type Vista = "tabla" | "kanban";

function esVista(valor: string | null): valor is Vista {
  return valor === "tabla" || valor === "kanban";
}

// La vista elegida vive fuera de React (localStorage) y se lee con
// `useSyncExternalStore`: en el servidor siempre es «tabla», así que el HTML
// entregado y el primer render del cliente coinciden y no hay parpadeo de
// hidratación. La copia en memoria evita releer el almacenamiento en cada
// snapshot y, si el navegador lo bloquea (modo privado), mantiene la
// preferencia al menos durante la sesión.
let vistaEnMemoria: Vista | null = null;
const oyentesVista = new Set<() => void>();

function leerVista(): Vista {
  if (vistaEnMemoria === null) {
    try {
      const guardada = window.localStorage.getItem(CLAVE_VISTA);
      vistaEnMemoria = esVista(guardada) ? guardada : "tabla";
    } catch {
      vistaEnMemoria = "tabla";
    }
  }
  return vistaEnMemoria;
}

function suscribirVista(alCambiar: () => void): () => void {
  oyentesVista.add(alCambiar);
  const alCambiarOtraPestana = (evento: StorageEvent) => {
    if (evento.key !== null && evento.key !== CLAVE_VISTA) return;
    vistaEnMemoria = null;
    alCambiar();
  };
  window.addEventListener("storage", alCambiarOtraPestana);
  return () => {
    oyentesVista.delete(alCambiar);
    window.removeEventListener("storage", alCambiarOtraPestana);
  };
}

function guardarVista(siguiente: Vista): void {
  vistaEnMemoria = siguiente;
  try {
    window.localStorage.setItem(CLAVE_VISTA, siguiente);
  } catch {
    // Sin persistencia la vista sigue funcionando en esta sesión.
  }
  for (const oyente of [...oyentesVista]) oyente();
}

/**
 * Las novedades de `/reportes` en dos lecturas: la tabla (el detalle completo,
 * ordenado por llegada) y el tablero Kanban (el pipeline, con arrastre). La
 * preferencia se recuerda en el navegador (ver el store de arriba).
 */
export default function TicketsVista({
  tickets,
  puedeMover,
}: {
  tickets: TicketKanban[];
  puedeMover: boolean;
}) {
  const vista = useSyncExternalStore(suscribirVista, leerVista, (): Vista => "tabla");
  const [abierto, setAbierto] = useState<number | null>(null);
  // El origen NO se recuerda entre visitas, a diferencia de la vista: un
  // conmutador Tabla/Kanban solo cambia la presentación, pero un filtro
  // guardado escondería novedades y haría creer que dejaron de llegar.
  const [dominio, setDominio] = useState<FiltroDominioReporte>(FILTRO_DOMINIO_TODOS);

  const conteo = useMemo(() => contarPorDominio(tickets), [tickets]);
  // Memoizado a la fuerza: el tablero descarta su estado optimista cuando
  // cambia la IDENTIDAD del arreglo, así que recrearlo en cada render
  // revertiría en pantalla el arrastre que está confirmándose.
  const visibles = useMemo(() => filtrarPorDominio(tickets, dominio), [tickets, dominio]);

  if (tickets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-ink-200 bg-paper px-6 py-12 text-center text-sm text-ink-500">
        Todavía no hay novedades reportadas en la plataforma.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-md border border-ink-200 bg-paper p-0.5">
          <BotonVista actual={vista} valor="tabla" icono="log" etiqueta="Tabla" onClick={guardarVista} />
          <BotonVista actual={vista} valor="kanban" icono="box" etiqueta="Kanban" onClick={guardarVista} />
        </div>

        <label className="flex items-center gap-1.5 text-[12px] font-medium text-ink-500">
          Reportado por
          <select
            value={dominio}
            onChange={(e) => {
              const valor = e.target.value;
              if (esFiltroDominioReporte(valor)) setDominio(valor);
            }}
            aria-label="Filtrar por dominio de correo de quien reportó"
            className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12.5px] text-ink-700 outline-none focus:border-blue-400"
          >
            {/* Los conteos van sobre la lista COMPLETA: así se ve de un vistazo
                cuánto aporta cada origen y por qué una opción sale vacía. */}
            <option value={FILTRO_DOMINIO_TODOS}>Todos ({tickets.length})</option>
            {DOMINIOS_REPORTE.map((valor) => (
              <option key={valor} value={valor}>
                {ETIQUETA_DOMINIO[valor]} ({conteo[valor]})
              </option>
            ))}
          </select>
        </label>
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-200 bg-paper">
          <EmptyState
            icon="filter"
            title="Ningún reporte de ese origen"
            description={
              dominio === FILTRO_DOMINIO_TODOS
                ? undefined
                : `Ninguna de las ${tickets.length} novedades del listado la reportó alguien de ${ETIQUETA_DOMINIO[dominio]}.`
            }
            action={
              <button
                type="button"
                onClick={() => setDominio(FILTRO_DOMINIO_TODOS)}
                className="rounded-md border border-ink-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-ink-700 transition hover:bg-ink-50"
              >
                Ver todas las novedades
              </button>
            }
          />
        </div>
      ) : vista === "kanban" ? (
        <KanbanTablero tickets={visibles} puedeMover={puedeMover} onAbrir={setAbierto} />
      ) : (
        <TablaTickets tickets={visibles} onAbrir={setAbierto} />
      )}

      <TicketDetalleModal
        ticketId={abierto}
        onClose={() => setAbierto(null)}
        puedeGestionar={puedeMover}
      />
    </div>
  );
}

function BotonVista({
  actual,
  valor,
  icono,
  etiqueta,
  onClick,
}: {
  actual: Vista;
  valor: Vista;
  icono: "log" | "box";
  etiqueta: string;
  onClick: (vista: Vista) => void;
}) {
  const activo = actual === valor;
  return (
    <button
      type="button"
      onClick={() => onClick(valor)}
      aria-pressed={activo}
      className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-[12.5px] font-semibold transition ${
        activo ? "bg-navy-700 text-white" : "text-ink-600 hover:bg-ink-50"
      }`}
    >
      <Icon name={icono} size={13} />
      {etiqueta}
    </button>
  );
}

function TablaTickets({
  tickets,
  onAbrir,
}: {
  tickets: TicketKanban[];
  onAbrir: (ticketId: number) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-ink-150 bg-paper">
      <table className="min-w-full text-left text-[13px]">
        <thead className="bg-ink-50 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          <tr>
            <th className="px-4 py-3">Código</th>
            <th className="px-4 py-3">Asunto</th>
            <th className="px-4 py-3">Reportado por</th>
            <th className="px-4 py-3">Ubicación</th>
            <th className="px-4 py-3">Estado</th>
            <th className="px-4 py-3">Imágenes</th>
            <th className="px-4 py-3">Creado</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            // La fila entera abre el detalle en modal. El rol y el manejo de
            // teclado son explícitos porque `<tr>` no es interactivo por sí
            // mismo y un <button> por celda rompería la tabla.
            <tr
              key={ticket.id}
              role="button"
              tabIndex={0}
              onClick={() => onAbrir(ticket.id)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                onAbrir(ticket.id);
              }}
              className="cursor-pointer border-t border-ink-100 transition hover:bg-ink-50 focus:bg-ink-50 focus:outline-none"
            >
              <td className="px-4 py-3 font-mono text-xs font-semibold text-ink-700">{ticket.code}</td>
              <td className="px-4 py-3 text-ink-800">{ticket.subject}</td>
              <td className="px-4 py-3 text-ink-600">{ticket.esMio ? "Tú" : ticket.reportante}</td>
              <td className="px-4 py-3 text-ink-600">{ticket.ubicacion ?? "—"}</td>
              <td className="px-4 py-3">
                <Chip label={etiquetaEstadoTicket(ticket.status)} tone={tonoEstadoTicket(ticket.status)} />
              </td>
              <td className="px-4 py-3 text-ink-600">{ticket.adjuntos}</td>
              <td className="px-4 py-3 text-ink-500">{fmtDateTime(ticket.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
