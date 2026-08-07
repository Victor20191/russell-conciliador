import { MESES_LARGOS } from "@/lib/format";

/**
 * Etiqueta legible del período a partir del rango ISO `desde`/`hasta`. Si ambos
 * caen en el mismo mes → «Abril 2026»; si abarcan varios meses → «Enero 2026 –
 * Abril 2026».
 *
 * Es la clave de versionado por período del balance oficial
 * (`clienteId, periodo, version`) y, por eso mismo, también la que agrupa las
 * VERSIONES de un borrador: dos cargues del mismo cliente cuyo rango de fechas
 * cae en el mismo mes son dos versiones del mismo período, no dos borradores
 * sueltos. Vive aparte de la Server Action para que ambos lados compartan
 * exactamente la misma normalización.
 */
export function etiquetaPeriodo(inicio: string, fin: string): string {
  const a = /^(\d{4})-(\d{2})/.exec(inicio);
  const b = /^(\d{4})-(\d{2})/.exec(fin);
  if (!a || !b) return `${inicio} – ${fin}`;
  const nombre = (mm: string, yyyy: string) => `${MESES_LARGOS[Number(mm) - 1] ?? mm} ${yyyy}`;
  return a[1] === b[1] && a[2] === b[2] ? nombre(b[2], b[1]) : `${nombre(a[2], a[1])} – ${nombre(b[2], b[1])}`;
}
