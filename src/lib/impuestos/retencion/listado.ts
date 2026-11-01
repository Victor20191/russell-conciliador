// Lista de revisiones de Retención en la fuente: buscador y filtro por estado (puro).
// Busca como los listados de los módulos: cliente, NIT con o sin dígito de verificación y año.

import { coincideBusquedaModulo } from "@/lib/modulos/listado";
import { nitCoincide } from "@/lib/nit";

export type EstadoRevision = "en_proceso" | "en_firme";

export const ESTADOS_REVISION: readonly { valor: EstadoRevision; etiqueta: string }[] = [
  { valor: "en_proceso", etiqueta: "En proceso" },
  { valor: "en_firme", etiqueta: "En firme" },
];

/** Estado con que la lista rotula una revisión: la celda y el filtro comparten esta regla. */
export const estadoRevision = (r: { estado: string }): EstadoRevision => (r.estado === "en_firme" ? "en_firme" : "en_proceso");

export const etiquetaEstadoRevision = (estado: EstadoRevision) => (estado === "en_firme" ? "En firme" : "En proceso");

export function contarRevisionesPorEstado(revisiones: readonly { estado: string }[]): Record<EstadoRevision, number> {
  const conteo: Record<EstadoRevision, number> = { en_proceso: 0, en_firme: 0 };
  for (const r of revisiones) conteo[estadoRevision(r)] += 1;
  return conteo;
}

export function filtrarRevisiones<T extends { nombreCliente: string; nitCliente: string; anio: number; estado: string }>(
  revisiones: readonly T[],
  busqueda: string,
  estado: EstadoRevision | null,
): T[] {
  return revisiones.filter(
    (r) =>
      (!estado || estadoRevision(r) === estado) &&
      (coincideBusquedaModulo({ archivoNombre: null, clienteNombre: r.nombreCliente, clienteNit: r.nitCliente, periodo: String(r.anio) }, busqueda) ||
        nitCoincide(busqueda, r.nitCliente)),
  );
}
