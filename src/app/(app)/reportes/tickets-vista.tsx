"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { Chip, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtDateTime } from "@/lib/format";
import { ESTADOS_TICKET, etiquetaEstadoTicket, tonoEstadoTicket, esEstadoTicket, type EstadoTicket } from "@/lib/soporte-estados";
import { filtrarTicketsKanbanPorBusqueda, type TicketKanban } from "@/lib/soporte-kanban";
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
import FiltroEstadosTickets from "./filtro-estados-tickets";
import { guardarEstadosOcultosTickets } from "@/app/actions/soporte-preferencias";

const CLAVE_VISTA = "reportes:vista";
type Vista = "tabla" | "kanban";
const SIN_ESTADOS_OCULTOS: EstadoTicket[] = [];

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
  puedeEliminar,
  estadosOcultosIniciales = SIN_ESTADOS_OCULTOS,
}: {
  estadosOcultosIniciales?: EstadoTicket[];
  tickets: TicketKanban[];
  puedeMover: boolean;
  puedeEliminar: boolean;
}) {
  const vista = useSyncExternalStore(suscribirVista, leerVista, (): Vista => "tabla");
  const [abierto, setAbierto] = useState<number | null>(null);
  const [ocultos, setOcultos] = useState(estadosOcultosIniciales);
  const [preferenciaAnterior, setPreferenciaAnterior] = useState(estadosOcultosIniciales);
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [guardando, startTransition] = useTransition();
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const [avisoGuardado, setAvisoGuardado] = useState(false);
  // Una revalidación actualiza la preferencia guardada, sin convertir «Mostrar
  // todos» (consulta temporal) en una escritura permanente.
  if (preferenciaAnterior !== estadosOcultosIniciales) {
    setPreferenciaAnterior(estadosOcultosIniciales);
    setOcultos(estadosOcultosIniciales);
  }
  // Solo los estados elegidos explícitamente son persistentes. La búsqueda y
  // el origen siguen siendo filtros temporales y siempre visibles.
  const [dominio, setDominio] = useState<FiltroDominioReporte>(FILTRO_DOMINIO_TODOS);
  const [busqueda, setBusqueda] = useState("");

  const termino = busqueda.trim();
  const hayBusqueda = termino.length > 0;

  const conteo = useMemo(() => contarPorDominio(tickets), [tickets]);
  // Memoizado a la fuerza: el tablero descarta su estado optimista cuando
  // cambia la IDENTIDAD del arreglo, así que recrearlo en cada render
  // revertiría en pantalla el arrastre que está confirmándose.
  const coincidentes = useMemo(
    () => filtrarTicketsKanbanPorBusqueda(filtrarPorDominio(tickets, dominio), busqueda),
    [tickets, dominio, busqueda],
  );
  const ocultosEfectivos = mostrarTodos ? SIN_ESTADOS_OCULTOS : ocultos;
  const visibles = useMemo(
    () => coincidentes.filter(ticket => !ocultosEfectivos.includes(esEstadoTicket(ticket.status) ? ticket.status : "abierto")),
    [coincidentes, ocultosEfectivos],
  );


  function cambiarVisibilidad(estado: EstadoTicket, visible: boolean) {
    const anteriores = ocultos;
    const consultaTemporal = mostrarTodos;
    const siguientes = ESTADOS_TICKET.filter(valor => valor === estado ? !visible : ocultosEfectivos.includes(valor));
    setOcultos(siguientes);
    setMostrarTodos(false);
    setAvisoGuardado(false);
    setErrorGuardado(null);
    startTransition(async () => {
      try {
        const resultado = await guardarEstadosOcultosTickets(siguientes);
        if (!resultado.ok) throw new Error(resultado.message || "No se pudo guardar la selección.");
        setOcultos(resultado.estadosOcultos ?? siguientes);
        setAvisoGuardado(true);
      } catch {
        setOcultos(anteriores);
        setMostrarTodos(consultaTemporal);
        setErrorGuardado("No se pudo guardar tu selección. Restauramos la vista anterior; vuelve a intentarlo.");
      }
    });
  }


  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-md border border-ink-200 bg-white px-3 py-2 text-ink-400 shadow-sm focus-within:border-blue-400">
          <Icon name="search" size={15} />
          <input
            type="text"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
            placeholder="Buscar por código, asunto, persona o ubicación…"
            aria-label="Buscar tickets por código, asunto, persona o ubicación"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink-700 outline-none placeholder:text-ink-400"
          />
          {hayBusqueda && (
            <>
              {/* Mientras se busca, el conteo deja claro cuánto se está
                  escondiendo: la lupa filtra el tablero entero, no una columna. */}
              <span className="shrink-0 font-mono text-[11px] text-ink-400">
                {visibles.length} de {tickets.length}
              </span>
              <button
                type="button"
                onClick={() => setBusqueda("")}
                aria-label="Limpiar búsqueda"
                title="Limpiar búsqueda"
                className="shrink-0 rounded p-0.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
              >
                <Icon name="x" size={14} />
              </button>
            </>
          )}
        </div>

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
        <FiltroEstadosTickets
          ocultos={ocultos}
          mostrarTodos={mostrarTodos}
          guardando={guardando}
          avisoGuardado={avisoGuardado}
          onCambiar={cambiarVisibilidad}
          onAlternarTodos={() => setMostrarTodos(actual => !actual)}
        />
      </div>

      {errorGuardado && <p role="alert" className="text-[12px] text-err-700">{errorGuardado}</p>}

      {visibles.length === 0 && (vista !== "kanban" || coincidentes.length === 0 || ocultosEfectivos.length === ESTADOS_TICKET.length) ? (
        <div className="rounded-lg border border-dashed border-ink-200 bg-paper">
          {tickets.length === 0 ? (
            <EmptyState icon="msg" title="Todavía no hay novedades reportadas en la plataforma" />
          ) : coincidentes.length > 0 ? (
            <EmptyState
              icon="filter"
              title="Los tickets coincidentes están en estados ocultos"
              description="Puedes mostrarlos temporalmente o cambiar los estados visibles."
              action={<button type="button" disabled={guardando} onClick={() => setMostrarTodos(true)} className="rounded-md border border-ink-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-ink-700 hover:bg-ink-50">Mostrar todos temporalmente</button>}
            />
          ) : hayBusqueda ? (
            // La búsqueda corre sobre lo ya filtrado por origen: con ambas
            // puertas activas el vacío se explica por las dos y el botón las
            // abre juntas, para no dejar al usuario en un callejón sin salida.
            <EmptyState
              icon="search"
              title="Ningún ticket coincide con la búsqueda"
              description={
                dominio === FILTRO_DOMINIO_TODOS
                  ? `Ninguna de las ${tickets.length} novedades del listado incluye «${termino}» en código, asunto, persona o ubicación.`
                  : `Ninguna de las novedades de ${ETIQUETA_DOMINIO[dominio]} incluye «${termino}» en código, asunto, persona o ubicación.`
              }
              action={
                <button
                  type="button"
                  onClick={() => {
                    setBusqueda("");
                    setDominio(FILTRO_DOMINIO_TODOS);
                  }}
                  className="rounded-md border border-ink-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-ink-700 transition hover:bg-ink-50"
                >
                  {dominio === FILTRO_DOMINIO_TODOS ? "Limpiar búsqueda" : "Limpiar búsqueda y filtro"}
                </button>
              }
            />
          ) : (
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
          )}
        </div>
      ) : null}

      {vista === "kanban" && coincidentes.length > 0 ? (
        <KanbanTablero
          tickets={coincidentes}
          estadosOcultos={ocultosEfectivos}
          puedeMover={puedeMover}
          puedeEliminar={puedeEliminar}
          onAbrir={setAbierto}
        />
      ) : visibles.length > 0 ? (
        <TablaTickets tickets={visibles} onAbrir={setAbierto} />
      ) : null}

      <TicketDetalleModal
        ticketId={abierto}
        onClose={() => setAbierto(null)}
        puedeGestionar={puedeMover}
        puedeEliminar={puedeEliminar}
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
