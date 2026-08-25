"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { cambiarEstadoTicket } from "@/app/actions/soporte";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { fmtDate } from "@/lib/format";
import { ETIQUETA_ESTADO_TICKET, type EstadoTicket } from "@/lib/soporte-estados";
import {
  agruparTicketsKanban,
  COLUMNAS_KANBAN,
  evaluarMovimientoKanban,
  moverTicketKanban,
  type TicketKanban,
} from "@/lib/soporte-kanban";

const TONO_COLUMNA: Record<string, { punto: string; conteo: string; zona: string }> = {
  warn: { punto: "bg-warn-500", conteo: "bg-warn-100 text-warn-700", zona: "border-warn-500 bg-warn-100/50" },
  blue: { punto: "bg-navy-500", conteo: "bg-blue-100 text-navy-700", zona: "border-navy-500 bg-blue-100/50" },
  ok: { punto: "bg-ok-500", conteo: "bg-ok-100 text-ok-700", zona: "border-ok-500 bg-ok-100/50" },
  ink: { punto: "bg-ink-400", conteo: "bg-ink-100 text-ink-600", zona: "border-ink-400 bg-ink-100/60" },
};

/** Movimiento a «Resuelto» esperando el texto de la solución. */
type PendienteSolucion = { ticket: TicketKanban; destino: EstadoTicket };

/**
 * Tablero Kanban de novedades: una columna por estado del pipeline y arrastre
 * de tarjetas para moverlas. Quien no administra soporte ve el mismo tablero
 * en solo lectura — la regla de negocio es que únicamente Xentria cambia el
 * estado, y aquí solo se refleja: el gate real está en `cambiarEstadoTicket`.
 *
 * El movimiento se pinta de inmediato (optimista) y se confirma con la Server
 * Action; si el servidor lo rechaza, la tarjeta vuelve a su columna. Pasar a
 * «Resuelto» abre el modal de la solución, porque la acción la exige.
 */
export default function KanbanTablero({
  tickets,
  puedeMover,
  onAbrir,
}: {
  tickets: TicketKanban[];
  puedeMover: boolean;
  onAbrir: (ticketId: number) => void;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [filas, setFilas] = useState(tickets);
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [zonaActiva, setZonaActiva] = useState<EstadoTicket | null>(null);
  const [porResolver, setPorResolver] = useState<PendienteSolucion | null>(null);
  const [solucion, setSolucion] = useState("");
  const [errorSolucion, setErrorSolucion] = useState<string | null>(null);

  // El servidor manda: cuando la revalidación trae otra lista, se descarta el
  // estado optimista. Se ajusta durante el render para no pintar un frame con
  // los datos viejos.
  const [ticketsPrevios, setTicketsPrevios] = useState(tickets);
  if (ticketsPrevios !== tickets) {
    setTicketsPrevios(tickets);
    setFilas(tickets);
  }

  const columnas = useMemo(() => agruparTicketsKanban(filas), [filas]);

  const confirmar = (ticket: TicketKanban, destino: EstadoTicket, texto?: string) => {
    const origen = ticket.status as EstadoTicket;
    setFilas((actuales) => moverTicketKanban(actuales, ticket.id, destino));
    startTransition(async () => {
      const datos = new FormData();
      datos.set("ticketId", String(ticket.id));
      datos.set("updatedAt", ticket.updatedAt);
      datos.set("status", destino);
      if (texto) datos.set("solution", texto);
      const resultado = await cambiarEstadoTicket(undefined, datos);
      if (resultado?.ok) {
        notifySuccess(
          `${ticket.code} → ${ETIQUETA_ESTADO_TICKET[destino]}`,
          "El estado quedó guardado y visible para quien reportó la novedad.",
        );
        router.refresh();
        return;
      }
      // Rechazo del servidor (permiso, versión desactualizada, validación):
      // se devuelve la tarjeta a su columna para no mentirle al usuario.
      setFilas((actuales) => moverTicketKanban(actuales, ticket.id, origen));
      const detalle =
        resultado?.message ??
        Object.values(resultado?.errors ?? {})
          .flat()
          .join(" ");
      notifyError("No se pudo mover el reporte.", detalle || undefined);
    });
  };

  const soltarEn = (destino: EstadoTicket, ticketId: number | null) => {
    setZonaActiva(null);
    setArrastrando(null);
    if (ticketId == null || !puedeMover) return;
    const movimiento = evaluarMovimientoKanban(filas, ticketId, destino);
    if (!movimiento.ok) {
      if (movimiento.motivo) notifyError("No se pudo mover el reporte.", movimiento.motivo);
      return;
    }
    if (movimiento.pideSolucion) {
      setSolucion("");
      setErrorSolucion(null);
      setPorResolver({ ticket: movimiento.ticket, destino: movimiento.destino });
      return;
    }
    confirmar(movimiento.ticket, movimiento.destino);
  };

  const guardarSolucion = () => {
    if (!porResolver) return;
    const texto = solucion.trim();
    if (texto.length < 10) {
      setErrorSolucion("Explica cómo se solucionó la solicitud (mínimo 10 caracteres).");
      return;
    }
    const { ticket, destino } = porResolver;
    setPorResolver(null);
    confirmar(ticket, destino, texto);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-ink-500">
        {puedeMover
          ? "Arrastra una tarjeta a otra columna para mover la novedad en el pipeline. También puedes usar el selector «Mover a» de cada tarjeta."
          : "Vista de solo lectura: solo Xentria puede mover las novedades entre columnas."}
      </p>

      <div className="grid gap-3 lg:grid-cols-4">
        {COLUMNAS_KANBAN.map((columna) => {
          const tono = TONO_COLUMNA[columna.tono]!;
          const enZona = zonaActiva === columna.estado;
          const cartas = columnas[columna.estado];
          return (
            <section
              key={columna.estado}
              aria-label={`${columna.etiqueta} (${cartas.length})`}
              onDragOver={(e) => {
                if (!puedeMover || arrastrando == null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (!enZona) setZonaActiva(columna.estado);
              }}
              onDragLeave={(e) => {
                // `dragleave` también salta al pasar sobre los hijos: solo
                // apaga el resaltado si el puntero salió de la columna.
                if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                if (enZona) setZonaActiva(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = Number(e.dataTransfer.getData("text/plain"));
                soltarEn(columna.estado, Number.isFinite(id) && id > 0 ? id : arrastrando);
              }}
              className={`flex min-h-[16rem] flex-col rounded-lg border-2 border-dashed p-2.5 transition ${
                enZona ? tono.zona : "border-transparent bg-ink-50/70"
              }`}
            >
              <header className="flex items-center gap-2 px-1 pb-2.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${tono.punto}`} />
                <h3 className="text-[12px] font-semibold uppercase tracking-wider text-ink-600">
                  {columna.etiqueta}
                </h3>
                <span className={`ml-auto rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${tono.conteo}`}>
                  {cartas.length}
                </span>
              </header>

              <div className="flex flex-col gap-2">
                {cartas.length === 0 ? (
                  <p className="rounded-md border border-dashed border-ink-200 px-3 py-6 text-center text-[11.5px] text-ink-400">
                    {columna.ayuda}
                  </p>
                ) : (
                  cartas.map((ticket) => (
                    <TarjetaTicket
                      key={ticket.id}
                      ticket={ticket}
                      puedeMover={puedeMover}
                      moviendo={pendiente && arrastrando === ticket.id}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", String(ticket.id));
                        e.dataTransfer.effectAllowed = "move";
                        setArrastrando(ticket.id);
                      }}
                      onDragEnd={() => {
                        setArrastrando(null);
                        setZonaActiva(null);
                      }}
                      onMover={(destino) => soltarEn(destino, ticket.id)}
                      onAbrir={() => onAbrir(ticket.id)}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      <Modal
        open={porResolver !== null}
        onClose={() => setPorResolver(null)}
        title={`Resolver ${porResolver?.ticket.code ?? ""}`}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPorResolver(null)}
              className="rounded-md border border-ink-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-ink-600 transition hover:bg-ink-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardarSolucion}
              className="rounded-md bg-navy-700 px-3.5 py-2 text-[12.5px] font-semibold text-white transition hover:bg-navy-800"
            >
              Marcar como resuelto
            </button>
          </div>
        }
      >
        <p className="text-[12.5px] text-ink-600">
          <strong className="text-ink-800">{porResolver?.ticket.subject}</strong>. Un reporte solo pasa a
          «Resuelto» con la explicación de cómo se solucionó; quien lo reportó la verá en su seguimiento.
        </p>
        <label htmlFor="kanban-solucion" className="mt-4 block text-xs font-semibold uppercase tracking-wider text-ink-500">
          Solución
        </label>
        <textarea
          id="kanban-solucion"
          value={solucion}
          onChange={(e) => {
            setSolucion(e.target.value);
            if (errorSolucion) setErrorSolucion(null);
          }}
          rows={5}
          maxLength={5000}
          autoFocus
          className="mt-1.5 w-full rounded-md border border-ink-200 px-3 py-2 text-[13px] text-ink-800 outline-none focus:border-navy-500"
          placeholder="Qué se hizo para solucionar la novedad…"
        />
        {errorSolucion && <p className="mt-1.5 text-[11.5px] font-semibold text-err-700">{errorSolucion}</p>}
      </Modal>
    </div>
  );
}

function TarjetaTicket({
  ticket,
  puedeMover,
  moviendo,
  onDragStart,
  onDragEnd,
  onMover,
  onAbrir,
}: {
  ticket: TicketKanban;
  puedeMover: boolean;
  moviendo: boolean;
  onDragStart: (e: React.DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onMover: (destino: EstadoTicket) => void;
  onAbrir: () => void;
}) {
  return (
    <article
      draggable={puedeMover}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`rounded-md border border-ink-150 bg-paper shadow-sm transition focus-within:border-blue-400 hover:border-blue-400 ${
        puedeMover ? "cursor-grab active:cursor-grabbing" : ""
      } ${moviendo ? "opacity-50" : ""}`}
    >
      {/* El cuerpo entero abre el detalle. Va como <button> —y no como enlace—
          porque el destino es un modal: así el teclado lo activa con Enter y
          Espacio sin prometer una navegación que no ocurre. El selector «Mover
          a» queda FUERA para que su clic no abra también el modal. */}
      <button
        type="button"
        onClick={onAbrir}
        className="block w-full px-3 py-2.5 text-left focus:outline-none"
      >
        <span className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-semibold text-ink-600">{ticket.code}</span>
          {ticket.adjuntos > 0 && (
            <span
              className="ml-auto inline-flex items-center gap-1 text-[11px] text-ink-400"
              title={`${ticket.adjuntos} imagen(es)`}
            >
              <Icon name="doc" size={12} />
              {ticket.adjuntos}
            </span>
          )}
        </span>

        <span className="mt-1 block text-[12.5px] font-semibold text-ink-800">{ticket.subject}</span>

        {ticket.ubicacion && <span className="mt-1 block text-[11px] text-ink-500">{ticket.ubicacion}</span>}

        <span className="mt-2 flex items-center gap-2 text-[11px] text-ink-400">
          <span className="truncate">{ticket.esMio ? "Tú" : ticket.reportante}</span>
          <span className="ml-auto shrink-0">{fmtDate(ticket.createdAt)}</span>
        </span>
      </button>

      {puedeMover && (
        <label className="mx-3 mb-2.5 flex items-center gap-1.5 border-t border-ink-100 pt-2 text-[11px] text-ink-400">
          <Icon name="move-tree" size={12} />
          <span className="sr-only">Mover {ticket.code} a</span>
          <select
            value=""
            onChange={(e) => {
              const destino = e.target.value;
              e.currentTarget.value = "";
              if (destino) onMover(destino as EstadoTicket);
            }}
            className="w-full rounded border border-ink-200 bg-white px-1.5 py-1 text-[11px] text-ink-600 outline-none focus:border-navy-500"
          >
            <option value="">Mover a…</option>
            {COLUMNAS_KANBAN.filter((columna) => columna.estado !== ticket.status).map((columna) => (
              <option key={columna.estado} value={columna.estado}>
                {columna.etiqueta}
              </option>
            ))}
          </select>
        </label>
      )}
    </article>
  );
}
