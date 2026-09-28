"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { hayModalAbierto } from "@/lib/bloqueo-scroll";

// Modo «pantalla completa» de las tablas largas (balance: detalle oficial, borrador y
// terceros; módulos: consolidado, detalle, cruces y borrador): la tabla ocupa el
// viewport, el scroll del documento se bloquea y se sale con Esc. La región se marca
// con `data-balance-table-fullscreen`, que en `globals.css` amplía tipografía, iconos
// y alto de fila — dentro de la vista completa hay espacio de sobra y la densidad
// normal se vuelve incómoda.
//
// Vive aquí (y no duplicado en cada pantalla) para que todas se comporten igual:
// mismo atajo, mismo bloqueo de scroll y mismas clases de contenedor.

const SELECTOR_REGION = '[data-balance-table-fullscreen="true"]';

export function usePantallaCompletaTabla() {
  const [pantallaCompleta, setPantallaCompleta] = useState(false);

  useEffect(() => {
    if (!pantallaCompleta) return;
    const overflowAnterior = document.body.style.overflow;
    // Con un modal abierto encima (comentarios, marcas…), Esc no saca de la vista: el modal
    // se cierra solo con su X y quedaría flotando sobre la página normal.
    const salirConEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !hayModalAbierto()) setPantallaCompleta(false);
    };
    // Un enlace interno de la tabla que apunta FUERA de la región (la marca de un cruce lleva
    // a su observación, al pie de la página) caería detrás de la vista completa: se sale de
    // ella y se sigue el enlace ya con la página a la vista, para que el desplazamiento se
    // calcule con la tabla de vuelta en su lugar.
    const seguirEnlaceFuera = (event: MouseEvent) => {
      const enlace = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#"]') : null;
      const region = enlace?.closest(SELECTOR_REGION);
      const destino = enlace && enlace.hash.length > 1 ? document.getElementById(decodeURIComponent(enlace.hash.slice(1))) : null;
      if (!enlace || !region || !destino || region.contains(destino)) return;
      event.preventDefault();
      setPantallaCompleta(false);
      requestAnimationFrame(() => {
        if (enlace.isConnected) enlace.click();
      });
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", salirConEscape);
    document.addEventListener("click", seguirEnlaceFuera);
    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", salirConEscape);
      document.removeEventListener("click", seguirEnlaceFuera);
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
 * `sticky` se ancla al contenedor que scrollea, no al documento—. Con `altoNormal`
 * en null la vista normal no acota nada (la tabla crece con la página, como las
 * cédulas de los cruces) y solo la vista completa fija el encabezado.
 */
export function claseScrollTabla(activa: boolean, altoNormal: string | null = "max-h-[560px]") {
  if (activa) return "min-h-0 flex-1 overflow-auto overscroll-contain";
  return altoNormal == null ? "overflow-x-auto" : `${altoNormal} overflow-auto`;
}

export function BotonPantallaCompleta({ activa, onToggle }: { activa: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={activa}
      onClick={onToggle}
      title={activa ? "Salir de pantalla completa (Esc)" : "Abrir la tabla a pantalla completa"}
      aria-label={activa ? "Salir de pantalla completa" : "Pantalla completa"}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-[11px] font-semibold transition ${activa ? "border-navy-700 bg-navy-700 text-white hover:bg-navy-600" : "border-ink-200 bg-white text-ink-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"}`}
    >
      <Icon name={activa ? "minimize" : "maximize"} size={13} />
      {/* En móvil solo el icono: la barra de la tabla ya va apretada y el título dice qué hace. */}
      <span className="hidden sm:inline">{activa ? "Salir de pantalla completa" : "Pantalla completa"}</span>
      {activa && <kbd className="ml-0.5 hidden rounded border border-white/30 px-1 font-sans text-[9px] font-medium text-white/80 sm:inline">Esc</kbd>}
    </button>
  );
}
