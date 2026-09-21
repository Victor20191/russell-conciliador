"use client";

// AVISO AL SALIR del Consolidado con cuentas que se ven en pantalla pero no están grabadas (sobre
// todo las PROPUESTAS del sistema, que nunca se graban solas). El cruce contable solo usa lo
// grabado: antes de cambiar de pestaña o seguir un enlace del menú se ofrece grabarlas.
import { useEffect } from "react";
import { Modal } from "@/components/modal";
import type { RenglonSinGuardar } from "@/lib/modulos/consolidado-sin-guardar";

/** Cuántos renglones se nombran en el modal; el resto se cuenta. */
const MAX_LISTADOS = 5;

/**
 * Mientras `activo`: seguir un enlace interno (menú lateral, migas, «Volver a …») se detiene y se
 * entrega el destino a `alInterceptar`, que abre el modal. Mismo criterio de enlace que
 * `useAvisoSalidaSinGuardar` (`src/lib/usar-aviso-salida.ts`): clic izquierdo sin modificadores, en
 * captura, sin `target=_blank`, descargas ni anclas.
 */
export function useInterceptarEnlaces(activo: boolean, alInterceptar: (href: string) => void) {
  useEffect(() => {
    if (!activo) return;
    const antesDeNavegar = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const enlace = event.target instanceof Element ? event.target.closest("a[href]") : null;
      // `data-sin-aviso-salida`: enlaces que no dejan la pantalla (la descarga del Excel).
      if (!(enlace instanceof HTMLAnchorElement) || enlace.target === "_blank" || enlace.hasAttribute("download") || enlace.hasAttribute("data-sin-aviso-salida")) return;
      const href = enlace.getAttribute("href") ?? "";
      if (!href || href.startsWith("#") || enlace.origin !== window.location.origin) return;
      event.preventDefault();
      event.stopPropagation();
      alInterceptar(href);
    };
    document.addEventListener("click", antesDeNavegar, true);
    return () => document.removeEventListener("click", antesDeNavegar, true);
  }, [activo, alInterceptar]);
}

/** Cerrar o recargar la pestaña del navegador con algo sin grabar: el diálogo nativo. */
export function useAvisoCierreNavegador(activo: boolean) {
  useEffect(() => {
    if (!activo) return;
    const alCerrar = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", alCerrar);
    return () => window.removeEventListener("beforeunload", alCerrar);
  }, [activo]);
}

export function ModalCuentasSinGuardar({
  renglones,
  clasificadorEtiqueta,
  guardando,
  onGuardarYContinuar,
  onSalirSinGuardar,
  onClose,
}: {
  renglones: RenglonSinGuardar[];
  clasificadorEtiqueta: string;
  guardando: boolean;
  onGuardarYContinuar: () => void;
  onSalirSinGuardar: () => void;
  /** La X: se queda en el Consolidado. */
  onClose: () => void;
}) {
  const propuestas = renglones.filter((r) => r.origen === "propuesta").length;
  const listados = renglones.slice(0, MAX_LISTADOS);
  return (
    <Modal
      open
      onClose={onClose}
      title="Cuentas sin guardar"
      size="md"
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSalirSinGuardar}
            disabled={guardando}
            className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-50"
          >
            Salir sin guardar
          </button>
          <button
            type="button"
            onClick={onGuardarYContinuar}
            disabled={guardando}
            className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:cursor-wait disabled:opacity-60"
          >
            {guardando ? "Guardando…" : "Guardar y continuar"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-[12.5px] text-ink-700">
        <p className="leading-relaxed">
          {renglones.length === 1 ? "Un renglón" : `${renglones.length} renglones`} del Consolidado{" "}
          {renglones.length === 1 ? "tiene" : "tienen"} cuenta en pantalla pero todavía no {renglones.length === 1 ? "está grabado" : "están grabados"}:
          el cruce contable no {renglones.length === 1 ? "lo tiene" : "los tiene"} en cuenta.
          {propuestas > 0 && (
            <> {propuestas === renglones.length ? "Son cuentas que" : `${propuestas} de ellos traen cuentas que`} el sistema propuso al abrir; se graban solo cuando las confirmas.</>
          )}
        </p>
        <ul className="flex flex-col divide-y divide-ink-100 rounded-md border border-ink-150">
          {listados.map((r) => (
            <li key={r.clasificador} className="flex items-baseline gap-2 px-2.5 py-1.5">
              <span className="min-w-0 flex-1 truncate font-medium text-ink-800" title={`${clasificadorEtiqueta}: ${r.clasificador}`}>{r.clasificador}</span>
              <span className="shrink-0 text-[11.5px] text-ink-600">
                {r.cuentas.length ? r.cuentas.map((c) => `R-${c}`).join(", ") : "sin cuenta"}
              </span>
              <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-wide text-warn-700">
                {r.origen === "propuesta" ? "propuesta" : "sin grabar"}
              </span>
            </li>
          ))}
        </ul>
        {renglones.length > MAX_LISTADOS && <p className="text-[11.5px] text-ink-500">y {renglones.length - MAX_LISTADOS} más.</p>}
      </div>
    </Modal>
  );
}
