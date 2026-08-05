"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";

// Modo «pantalla completa» de las tablas largas de balance (detalle oficial y
// borrador): la tabla ocupa el viewport, el scroll del documento se bloquea y se
// sale con Esc. La región se marca con `data-balance-table-fullscreen`, que en
// `globals.css` amplía tipografía, iconos y alto de fila — dentro de la vista
// completa hay espacio de sobra y la densidad normal se vuelve incómoda.
//
// Vive aquí (y no duplicado en cada pantalla) para que las dos se comporten
// igual: mismo atajo, mismo bloqueo de scroll y mismas clases de contenedor.

export function usePantallaCompletaTabla() {
  const [pantallaCompleta, setPantallaCompleta] = useState(false);

  useEffect(() => {
    if (!pantallaCompleta) return;
    const overflowAnterior = document.body.style.overflow;
    const salirConEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPantallaCompleta(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", salirConEscape);
    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", salirConEscape);
    };
  }, [pantallaCompleta]);

  const alternar = useCallback(() => setPantallaCompleta((actual) => !actual), []);
  return { pantallaCompleta, alternar };
}

/** Mismo aspecto que `<Card>`, para la región que en vista normal es una tarjeta. */
export const CLASE_TARJETA = "rounded-lg border border-ink-150 bg-white shadow-sm";

/**
 * Props de la región que se expande (contenedor de barra + tabla + pie). En vista
 * completa se toma el viewport y se apila en columna para que la tabla sea lo
 * único que scrollea; `claseNormal` es lo que se aplica fuera de ese modo.
 */
export function propsRegionPantallaCompleta(activa: boolean, claseNormal = "") {
  return {
    "data-balance-table-fullscreen": activa ? "true" : undefined,
    className: activa
      ? "fixed inset-0 z-40 flex min-h-0 flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-inset ring-navy-900/10"
      : claseNormal,
  } as const;
}

/**
 * Clase del contenedor con scroll de la tabla. En vista normal acota el alto —lo
 * que además es la condición para que el encabezado inmóvil funcione, porque el
 * `sticky` se ancla al contenedor que scrollea, no al documento.
 */
export function claseScrollTabla(activa: boolean, altoNormal = "max-h-[560px]") {
  return activa ? "min-h-0 flex-1 overflow-auto overscroll-contain" : `${altoNormal} overflow-auto`;
}

export function BotonPantallaCompleta({ activa, onToggle }: { activa: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={activa}
      onClick={onToggle}
      title={activa ? "Salir de pantalla completa (Esc)" : "Abrir la tabla a pantalla completa"}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition ${activa ? "border-navy-700 bg-navy-700 text-white hover:bg-navy-600" : "border-ink-200 bg-white text-ink-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"}`}
    >
      <Icon name={activa ? "minimize" : "maximize"} size={13} />
      {activa ? "Salir de pantalla completa" : "Pantalla completa"}
      {activa && <kbd className="ml-0.5 rounded border border-white/30 px-1 font-sans text-[9px] font-medium text-white/80">Esc</kbd>}
    </button>
  );
}
