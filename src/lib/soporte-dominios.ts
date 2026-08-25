import { correoEsDelDominio, DOMINIO_RUSSELL, DOMINIO_XENTRIA } from "./dominios-correo";

/**
 * Origen de una novedad según el dominio de correo de quien la reportó: separa
 * lo que reporta el personal de Russell (el uso diario de la plataforma) de lo
 * que anota Xentria (quien la construye).
 *
 * `otros` NO es un cajón de descarte silencioso: es la garantía de que ningún
 * ticket desaparece del listado por no poder clasificarlo — un correo externo,
 * o un usuario que ya fue borrado y del que solo queda su id en el ticket.
 */
export type DominioReporte = "russell" | "xentria" | "otros";

export const DOMINIOS_REPORTE = ["russell", "xentria", "otros"] as const;

export const ETIQUETA_DOMINIO: Record<DominioReporte, string> = {
  russell: "Russell",
  xentria: "Xentria",
  otros: "Otros",
};

export const FILTRO_DOMINIO_TODOS = "todos";

export type FiltroDominioReporte = typeof FILTRO_DOMINIO_TODOS | DominioReporte;

export function esDominioReporte(valor: string): valor is DominioReporte {
  return (DOMINIOS_REPORTE as readonly string[]).includes(valor);
}

export function esFiltroDominioReporte(valor: string): valor is FiltroDominioReporte {
  return valor === FILTRO_DOMINIO_TODOS || esDominioReporte(valor);
}

/**
 * Clasifica un correo. Se apoya en `correoEsDelDominio`, que compara con la
 * arroba incluida, así que `falso@noxentria.co` y `xentria.co@gmail.com` caen
 * en «otros» y no en el dominio que aparentan.
 */
export function clasificarDominioReporte(correo: string | null | undefined): DominioReporte {
  if (correoEsDelDominio(correo, DOMINIO_RUSSELL)) return "russell";
  if (correoEsDelDominio(correo, DOMINIO_XENTRIA)) return "xentria";
  return "otros";
}

/**
 * Filtra por origen conservando el orden de llegada. Genérica sobre `{ dominio }`
 * para no atarla al tipo de la vista: hoy la usa el listado de `/reportes`, y
 * sirve igual para cualquier otra fila que lleve el campo.
 */
export function filtrarPorDominio<T extends { dominio: DominioReporte }>(
  filas: readonly T[],
  filtro: FiltroDominioReporte,
): T[] {
  if (filtro === FILTRO_DOMINIO_TODOS) return [...filas];
  return filas.filter((fila) => fila.dominio === filtro);
}

/** Conteo por origen para las etiquetas del filtro. Siempre trae los 3 orígenes. */
export function contarPorDominio(
  filas: readonly { dominio: DominioReporte }[],
): Record<DominioReporte, number> {
  const conteo = Object.fromEntries(DOMINIOS_REPORTE.map((dominio) => [dominio, 0])) as Record<
    DominioReporte,
    number
  >;
  for (const fila of filas) conteo[fila.dominio] += 1;
  return conteo;
}
