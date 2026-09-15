"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { ESTADOS_TICKET, etiquetaEstadoTicket, type EstadoTicket } from "@/lib/soporte-estados";

const PUNTO_ESTADO: Record<EstadoTicket, string> = {
  abierto: "bg-warn-500",
  en_evaluacion: "bg-ai-500",
  en_proceso: "bg-navy-500",
  resuelto: "bg-ok-500",
  cerrado: "bg-ink-400",
};

export default function FiltroEstadosTickets({
  ocultos, mostrarTodos, guardando, avisoGuardado, onCambiar, onAlternarTodos,
}: {
  ocultos: readonly EstadoTicket[];
  mostrarTodos: boolean;
  guardando: boolean;
  avisoGuardado: boolean;
  onCambiar: (estado: EstadoTicket, visible: boolean) => void;
  onAlternarTodos: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const id = useId();
  const cantidad = mostrarTodos ? ESTADOS_TICKET.length : ESTADOS_TICKET.length - ocultos.length;

  useEffect(() => {
    if (!abierto) return;
    const cerrarFuera = (evento: PointerEvent) => {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false);
    };
    document.addEventListener("pointerdown", cerrarFuera);
    return () => document.removeEventListener("pointerdown", cerrarFuera);
  }, [abierto]);

  return (
    <div ref={contenedor} className="relative ml-auto" onBlur={evento => {
      if (evento.relatedTarget && !evento.currentTarget.contains(evento.relatedTarget)) setAbierto(false);
    }} onKeyDown={evento => {
      if (evento.key === "Escape" && abierto) {
        evento.preventDefault();
        evento.stopPropagation();
        setAbierto(false);
        boton.current?.focus();
      }
    }}>
      <button ref={boton} type="button" aria-expanded={abierto} aria-controls={id}
        aria-label={`Estados visibles: ${cantidad} de ${ESTADOS_TICKET.length}${mostrarTodos ? ", temporalmente" : ""}`}
        onClick={() => setAbierto(actual => !actual)}
        className={`inline-flex h-9 items-center gap-2 rounded-md border px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${abierto ? "border-ink-300 bg-ink-50 text-navy-700" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"}`}>
        <Icon name="filter" size={13} />
        Estados
        <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] text-ink-500">{cantidad}/{ESTADOS_TICKET.length}</span>
        {mostrarTodos && <span className="text-[10px] text-blue-600">Temporal</span>}
        <Icon name="chev-d" size={12} className={`transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      <div id={id} hidden={!abierto} className="absolute right-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-3rem)] rounded-lg border border-ink-150 bg-white p-2 shadow-lg">
        <fieldset aria-disabled={guardando} aria-busy={guardando} aria-describedby={`${id}-ayuda`}>
          <legend className="px-2 pt-1 text-[12px] font-semibold text-ink-800">Estados visibles</legend>
          <p id={`${id}-ayuda`} className="px-2 pb-2 pt-1 text-[11px] leading-relaxed text-ink-400">Elige cuáles mostrar en tu vista.</p>
          {ESTADOS_TICKET.map(estado => {
            const visible = mostrarTodos || !ocultos.includes(estado);
            return (
              <label key={estado} className={`flex min-h-9 items-center gap-2.5 rounded-md px-2 text-[12.5px] text-ink-600 transition-colors hover:bg-ink-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-400 ${guardando ? "cursor-wait opacity-60" : "cursor-pointer"}`}>
                <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${PUNTO_ESTADO[estado]}`} />
                <span className="flex-1">{etiquetaEstadoTicket(estado)}</span>
                <input type="checkbox" checked={visible} aria-disabled={guardando} onChange={evento => {
                  // Mantener el foco de teclado mientras se guarda; bloquear
                  // nuevas escrituras sin deshabilitar el elemento enfocado.
                  if (!guardando) onCambiar(estado, evento.target.checked);
                }} className="size-3.5 accent-navy-700" />
              </label>
            );
          })}
        </fieldset>
        <div className="mt-2 border-t border-ink-100 px-2 pb-1 pt-2">
          {ocultos.length > 0 && (
            <button type="button" disabled={guardando} aria-pressed={mostrarTodos} onClick={onAlternarTodos}
              className="inline-flex min-h-8 items-center gap-1.5 rounded text-[11.5px] font-medium text-ink-500 hover:text-navy-700 focus-visible:outline-2 focus-visible:outline-blue-400">
              <Icon name={mostrarTodos ? "eye-off" : "eye"} size={13} />
              {mostrarTodos ? "Volver a mi vista" : "Mostrar todos temporalmente"}
            </button>
          )}
          <p className="text-[11px] leading-relaxed text-ink-400">{mostrarTodos
            ? "Consulta temporal. Cambiar una casilla guardará una nueva selección."
            : "Se guarda para tu usuario en todos tus dispositivos."}</p>
          <p role="status" className={`${guardando || avisoGuardado ? "mt-1" : "sr-only"} text-[11px] text-ok-700`}>
            {guardando ? "Guardando selección…" : avisoGuardado ? "Preferencia guardada para tu usuario." : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
