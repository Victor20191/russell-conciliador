"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "@/components/icons";

export type AccionMenuFila = {
  id: string;
  icono: IconName;
  etiqueta: string;
  descripcion?: string;
  ejecutar: () => void;
  deshabilitada?: boolean;
  tono?: "normal" | "peligro";
};

/**
 * Menú de acciones "⋯" por fila: botón + panel en portal con posición `fixed`, para que una tabla
 * con scroll no lo recorte. Mismo patrón que `MenuAccionesCuenta` (borrador de balance), generalizado
 * para reutilizarse en cualquier tabla con acciones por renglón.
 */
export function MenuAccionesFila({
  id,
  etiquetaAria,
  acciones,
}: {
  /** Identificador único de la fila (para el `id` del panel accesible). */
  id: string;
  /** Texto para `aria-label` del botón y del menú. */
  etiquetaAria: string;
  acciones: AccionMenuFila[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [descripcionActiva, setDescripcionActiva] = useState<string | null>(null);
  const [posicion, setPosicion] = useState({ top: 0, left: 0 });
  const botonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const opcionesRef = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = `menu-acciones-${id}`;
  const conDescripcion = acciones.some((a) => a.descripcion);

  const cerrar = () => {
    setAbierto(false);
    setDescripcionActiva(null);
  };

  const abrirOCerrar = () => {
    if (abierto) {
      cerrar();
      return;
    }
    const rect = botonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margen = 8;
    const ancho = Math.min(288, window.innerWidth - margen * 2);
    const altoEstimado = Math.min(
      window.innerHeight - margen * 2,
      Math.max(96, acciones.length * 38 + (conDescripcion ? 64 : 16)),
    );
    const left = Math.min(
      Math.max(margen, rect.right - ancho),
      window.innerWidth - ancho - margen,
    );
    const topDebajo = rect.bottom + 4;
    const top = topDebajo + altoEstimado <= window.innerHeight - margen
      ? topDebajo
      : Math.max(margen, rect.top - altoEstimado - 4);
    setPosicion({ top, left });
    setAbierto(true);
  };

  useEffect(() => {
    if (!abierto) return;
    const frame = window.requestAnimationFrame(() => {
      opcionesRef.current.find((opcion) => opcion && !opcion.disabled)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const cerrarAfuera = (event: PointerEvent) => {
      const objetivo = event.target as Node;
      if (!botonRef.current?.contains(objetivo) && !menuRef.current?.contains(objetivo)) cerrar();
    };
    const cerrarConEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cerrar();
      botonRef.current?.focus();
    };
    const cerrarAlMoverVista = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      cerrar();
    };
    document.addEventListener("pointerdown", cerrarAfuera, true);
    document.addEventListener("keydown", cerrarConEscape);
    window.addEventListener("resize", cerrarAlMoverVista);
    window.addEventListener("scroll", cerrarAlMoverVista, true);
    return () => {
      document.removeEventListener("pointerdown", cerrarAfuera, true);
      document.removeEventListener("keydown", cerrarConEscape);
      window.removeEventListener("resize", cerrarAlMoverVista);
      window.removeEventListener("scroll", cerrarAlMoverVista, true);
    };
  }, [abierto]);

  const navegarMenu = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const opciones = opcionesRef.current.filter(
      (opcion): opcion is HTMLButtonElement => !!opcion && !opcion.disabled,
    );
    if (opciones.length === 0) return;
    const actual = opciones.indexOf(document.activeElement as HTMLButtonElement);
    let siguiente: number | null = null;
    if (event.key === "ArrowDown") siguiente = actual < 0 ? 0 : (actual + 1) % opciones.length;
    if (event.key === "ArrowUp") siguiente = actual < 0 ? opciones.length - 1 : (actual - 1 + opciones.length) % opciones.length;
    if (event.key === "Home") siguiente = 0;
    if (event.key === "End") siguiente = opciones.length - 1;
    if (event.key === "Tab") {
      botonRef.current?.focus();
      cerrar();
    }
    if (siguiente == null) return;
    event.preventDefault();
    opciones[siguiente]?.focus();
  };

  if (acciones.length === 0) return null;

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        aria-label={`Acciones de ${etiquetaAria}`}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={menuId}
        title="Más acciones"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          abrirOCerrar();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !abierto) {
            event.preventDefault();
            abrirOCerrar();
          }
        }}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-500 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
      >
        <Icon name="more" size={15} />
      </button>
      {abierto && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={`Acciones de ${etiquetaAria}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={navegarMenu}
          style={{ top: posicion.top, left: posicion.left }}
          className="fixed z-[80] max-h-[calc(100vh-1rem)] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-ink-200 bg-white p-1.5 text-left shadow-xl ring-1 ring-navy-900/5"
        >
          <div className="flex flex-col">
            {acciones.map((accion, indice) => (
              <button
                key={accion.id}
                ref={(elemento) => { opcionesRef.current[indice] = elemento; }}
                type="button"
                role="menuitem"
                disabled={accion.deshabilitada}
                aria-describedby={accion.descripcion ? `${menuId}-descripcion` : undefined}
                onMouseEnter={() => setDescripcionActiva(accion.descripcion ?? null)}
                onMouseLeave={() => setDescripcionActiva(null)}
                onFocus={() => setDescripcionActiva(accion.descripcion ?? null)}
                onClick={() => {
                  if (accion.deshabilitada) return;
                  cerrar();
                  botonRef.current?.focus();
                  accion.ejecutar();
                }}
                className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  accion.tono === "peligro"
                    ? "text-err-700 hover:bg-err-50 focus:bg-err-50"
                    : "text-ink-700 hover:bg-blue-50 hover:text-blue-800 focus:bg-blue-50 focus:text-blue-800"
                } focus:outline-none`}
              >
                <Icon name={accion.icono} size={14} className="shrink-0" />
                <span>{accion.etiqueta}</span>
              </button>
            ))}
          </div>
          {conDescripcion && (
            <div
              id={`${menuId}-descripcion`}
              className="mt-1 min-h-10 rounded-md border border-blue-100 bg-blue-50/70 px-2.5 py-2 text-[10.5px] leading-snug text-blue-800"
            >
              {descripcionActiva ?? "Pasa el cursor o enfoca una opción para ver qué hace."}
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
