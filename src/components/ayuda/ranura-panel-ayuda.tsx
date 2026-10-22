"use client";

import dynamic from "next/dynamic";
import type { RolesAyuda } from "@/lib/ayuda/roles";
import { useEstadoAyuda } from "./contexto";

// El panel y sus fichas se descargan solo la primera vez que se abre la ayuda.
const PanelAyuda = dynamic(() => import("./panel-ayuda"));

export type DatosPanelAyuda = {
  rolesAyuda: RolesAyuda;
  rol: string;
  permisos: readonly string[];
  modulosVisibles: readonly string[];
};

/** Lugar del panel junto al contenido; solo se monta mientras la ayuda está abierta. */
export default function RanuraPanelAyuda(props: DatosPanelAyuda) {
  const { abierta } = useEstadoAyuda();
  return abierta ? <PanelAyuda {...props} /> : null;
}
