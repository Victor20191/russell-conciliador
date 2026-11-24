// Novedades que se dejan fuera de UN reporte para gerencia. La página muestra
// los cambios de las versiones desplegadas en su período en tres secciones y
// cada uno se puede marcar «Omitir»; la selección viaja con la generación (no se
// guarda en Novedades) y el documento la deja fuera de todo: tablas de avances,
// conteos y adopción, que se mide sobre las funcionalidades nuevas que sí
// quedan. Los indicadores del tablero no cambian.
import { esFuncionalidadNueva } from "./adopcion";

export type SeccionNovedad = "nuevas" | "mejoras" | "correcciones";

export const SECCIONES_NOVEDAD: ReadonlyArray<{ clave: SeccionNovedad; titulo: string }> = [
  { clave: "nuevas", titulo: "Funcionalidades nuevas" },
  { clave: "mejoras", titulo: "Mejoras" },
  { clave: "correcciones", titulo: "Correcciones" },
];

/**
 * Sección de pantalla de un cambio según su tipo. En el PDF las mejoras y las
 * correcciones comparten «Mejoras y correcciones»; aquí van aparte para elegir
 * mejor qué omitir. Seguridad cuenta como corrección; un tipo desconocido, como
 * mejora (así lo rotula el documento).
 */
export function seccionDeCambio(tipo: string | null | undefined): SeccionNovedad {
  if (esFuncionalidadNueva(tipo)) return "nuevas";
  const t = (tipo ?? "").trim().toLowerCase();
  return t === "correccion" || t === "seguridad" ? "correcciones" : "mejoras";
}

/**
 * Los cambios que de verdad se omiten: los pedidos que pertenecen a las
 * versiones del período, sin repetir y en orden. Un id ajeno al período no
 * cambia nada (ni el documento ni la llave del reporte guardado).
 */
export function omitidosDelPeriodo(
  pedidos: readonly number[] | null | undefined,
  idsDelPeriodo: Iterable<number>,
): number[] {
  if (!pedidos?.length) return [];
  const validos = new Set(idsDelPeriodo);
  return [...new Set(pedidos)].filter((id) => validos.has(id)).sort((a, b) => a - b);
}
