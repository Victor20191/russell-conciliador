"use client";

import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Estado de la ayuda en pantalla, compartido entre el botón «?» de la barra superior, el panel
 * lateral y las pantallas con pestañas (que anuncian la pestaña activa). Va en dos contextos —
 * acciones estables y estado— para que abrir el panel no vuelva a pintar el menú ni la página.
 * Sin proveedor (pruebas de la barra superior) todo es un no-op.
 */
type AccionesAyuda = {
  alternar: () => void;
  cerrar: () => void;
  anunciarPestana: (id: string | null) => void;
};
type EstadoAyuda = { abierta: boolean; pestanaActiva: string | null };

const NADA = () => {};
const AccionesAyudaCtx = createContext<AccionesAyuda>({ alternar: NADA, cerrar: NADA, anunciarPestana: NADA });
const EstadoAyudaCtx = createContext<EstadoAyuda>({ abierta: false, pestanaActiva: null });

export const ID_BOTON_AYUDA = "boton-ayuda";
export const ID_PANEL_AYUDA = "panel-ayuda";

export function AyudaProvider({ children }: { children: ReactNode }) {
  const [abierta, setAbierta] = useState(false);
  const [pestanaActiva, setPestanaActiva] = useState<string | null>(null);
  const alternar = useCallback(() => setAbierta((a) => !a), []);
  const cerrar = useCallback(() => {
    setAbierta(false);
    // El foco vuelve al botón que abre la ayuda, que siempre está en la barra superior.
    requestAnimationFrame(() => document.getElementById(ID_BOTON_AYUDA)?.focus());
  }, []);
  const acciones = useMemo(() => ({ alternar, cerrar, anunciarPestana: setPestanaActiva }), [alternar, cerrar]);
  const estado = useMemo(() => ({ abierta, pestanaActiva }), [abierta, pestanaActiva]);
  return (
    <AccionesAyudaCtx value={acciones}>
      <EstadoAyudaCtx value={estado}>{children}</EstadoAyudaCtx>
    </AccionesAyudaCtx>
  );
}

export function useAccionesAyuda(): AccionesAyuda {
  return use(AccionesAyudaCtx);
}

export function useEstadoAyuda(): EstadoAyuda {
  return use(EstadoAyudaCtx);
}

/** Las pantallas con pestañas dicen cuál está activa, para que la ayuda abra en ella. */
export function useAnunciarPestanaAyuda(id: string): void {
  const { anunciarPestana } = useAccionesAyuda();
  useEffect(() => {
    anunciarPestana(id);
    return () => anunciarPestana(null);
  }, [id, anunciarPestana]);
}
