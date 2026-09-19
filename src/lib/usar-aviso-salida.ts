"use client";

import { useEffect } from "react";

import { notifyError } from "@/lib/client-notifications";

/**
 * Protege una pantalla con cambios SIN GUARDAR (guardado manual): mientras `hayCambios`,
 *  - cerrar o recargar la pestaña abre el diálogo nativo del navegador, y
 *  - seguir un enlace interno se detiene con un aviso, para que el usuario guarde o
 *    descarte primero (TKT-76: salir del borrador de CxP perdía las asociaciones).
 * Es el mismo criterio que `useAutoguardadoConsolidacion`, sin el autoguardado.
 */
export function useAvisoSalidaSinGuardar(hayCambios: boolean, mensaje: string) {
  useEffect(() => {
    if (!hayCambios) return;
    const alCerrar = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const antesDeNavegar = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const enlace = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(enlace instanceof HTMLAnchorElement) || enlace.target === "_blank" || enlace.hasAttribute("download") || enlace.getAttribute("href")?.startsWith("#")) return;
      event.preventDefault();
      event.stopPropagation();
      notifyError(mensaje);
    };
    document.addEventListener("click", antesDeNavegar, true);
    window.addEventListener("beforeunload", alCerrar);
    return () => {
      document.removeEventListener("click", antesDeNavegar, true);
      window.removeEventListener("beforeunload", alCerrar);
    };
  }, [hayCambios, mensaje]);
}
