"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  crearAutoguardadoConsolidacion,
  type GuardarLoteConsolidacion,
  type SnapshotAutoguardadoConsolidacion,
} from "./autoguardado-consolidacion";

import { notifyError } from "@/lib/client-notifications";

const SNAPSHOT_INACTIVO: SnapshotAutoguardadoConsolidacion = { estado: "inactivo", mensaje: null, pendientes: 0 };

/**
 * Wiring de React sobre el controlador PURO de autoguardado del Consolidado (hoy solo
 * Inventarios, `activo` lo decide el llamador). El debounce, el batching en lote, la
 * solicitud única en vuelo y el reintento viven en el controlador; aquí solo se:
 *  - suscribe el snapshot para pintar Guardando/Guardado/Error,
 *  - avisa con el diálogo nativo del navegador si hay cambios sin guardar al cerrar/salir
 *    (nunca se oculta la falla: `beforeunload` pregunta en vez de perder la edición), y
 *  - intenta un envío inmediato cuando la pestaña se oculta (mejor esfuerzo, no bloqueante).
 */
export function useAutoguardadoConsolidacion(
  guardarLote: GuardarLoteConsolidacion,
  activo: boolean,
  opciones?: {
    /**
     * false = no frena la salida (ni `beforeunload` ni los enlaces): quien lo usa ya tiene su
     * propio aviso de salida —el modal del Consolidado, que también cubre las propuestas—.
     */
    interceptarSalida?: boolean;
  },
) {
  const interceptarSalida = opciones?.interceptarSalida !== false;
  const controlador = useMemo(
    () => activo ? crearAutoguardadoConsolidacion({ guardarLote: async () => ({ ok: false, message: "Preparando el guardado." }) }) : null,
    [activo],
  );
  // Mantiene la cola entre renders; actualiza el callback después del commit.
  useEffect(() => { controlador?.actualizarGuardado(guardarLote); }, [controlador, guardarLote]);

  // Un desmontaje (incluido Strict Mode) no cancela ediciones autorizadas. Vacía la
  // cola, que conserva una sola petición en vuelo, y termina aunque cambie la ruta.
  useEffect(() => () => controlador?.intentarAhora(), [controlador]);

  const puedeSalir = useCallback(() => {
    if (!controlador || controlador.obtenerSnapshot().pendientes === 0) return true;
    controlador.intentarAhora();
    notifyError("Espera a que termine el guardado antes de salir. Si falla, pulsa Reintentar.");
    return false;
  }, [controlador]);

  useEffect(() => {
    if (!controlador) return;
    const alOcultarPestana = () => {
      if (document.visibilityState === "hidden") controlador.intentarAhora();
    };
    document.addEventListener("visibilitychange", alOcultarPestana);
    return () => document.removeEventListener("visibilitychange", alOcultarPestana);
  }, [controlador]);

  useEffect(() => {
    if (!controlador || !interceptarSalida) return;
    const avisarSiHayPendientes = (event: BeforeUnloadEvent) => {
      if (controlador.obtenerSnapshot().pendientes === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const antesDeNavegar = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const enlace = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(enlace instanceof HTMLAnchorElement) || enlace.target === "_blank" || enlace.hasAttribute("download") || enlace.getAttribute("href")?.startsWith("#")) return;
      if (!puedeSalir()) { event.preventDefault(); event.stopPropagation(); }
    };
    document.addEventListener("click", antesDeNavegar, true);
    window.addEventListener("beforeunload", avisarSiHayPendientes);
    return () => {
      document.removeEventListener("click", antesDeNavegar, true);
      window.removeEventListener("beforeunload", avisarSiHayPendientes);
    };
  }, [controlador, puedeSalir, interceptarSalida]);

  const snapshot = useSyncExternalStore(
    (onStoreChange) => (controlador ? controlador.suscribir(onStoreChange) : () => {}),
    () => (controlador ? controlador.obtenerSnapshot() : SNAPSHOT_INACTIVO),
    () => SNAPSHOT_INACTIVO,
  );

  return {
    snapshot,
    puedeSalir,
    programar: (clasificador: string, cuentas4: string[]) => controlador?.programar(clasificador, cuentas4),
    reintentar: () => controlador?.intentarAhora(),
  };
}
