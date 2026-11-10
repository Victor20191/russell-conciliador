// Aviso de TRASLAPE entre el período que se va a generar y los reportes ya
// generados.
//
// Dos reportes que comparten días cuentan esos días dos veces ante gerencia, y el
// comparativo de uso (`comparativo-servidor.ts`) solo acepta como período anterior
// a uno que TERMINA antes de que empiece el actual: contra el traslapado se salta
// al anterior y deja un hueco en la serie. En el reporte del 30-oct → 10-nov, el
// del 28 → 30-oct se descartó así y el 28 y el 29-oct se quedaron fuera de la
// comparación.
//
// Es solo un AVISO: el modal no bloquea. Y si el período elegido es EXACTAMENTE el
// de un reporte guardado, no es un traslape: es el que se recupera.
//
// Módulo PURO: recibe fechas en texto y no consulta nada. Los períodos guardados se
// leen como los rotula el comparativo (`soloFecha`), para que el aviso hable de los
// mismos días que el resto de la pantalla.
import { fmtCalendarDate, fmtDate } from "@/lib/format";
import { soloFecha } from "./comparativo";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Lo que el cliente ya recibe de cada reporte generado. */
export type PeriodoGenerado = {
  id: number;
  /** Inicio y fin del período, en ISO. */
  periodoDesde: string;
  periodoHasta: string;
  /** Cuándo se generó, en ISO. */
  generadoEn: string;
};

export type TraslapeReporte = {
  /** El reporte más reciente de ese período (puede haber varias revisiones). */
  id: number;
  /** Período del reporte, en días de calendario (YYYY-MM-DD). */
  desde: string;
  hasta: string;
  generadoEn: string;
  /** Primer y último día compartidos (YYYY-MM-DD) y cuántos son. */
  primerDiaComun: string;
  ultimoDiaComun: string;
  diasEnComun: number;
};

/** Días de calendario entre dos fechas YYYY-MM-DD, ambas incluidas. */
function diasInclusive(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS) + 1;
}

/**
 * Reportes ya generados cuyo período comparte al menos un día con `desde`–`hasta`
 * (YYYY-MM-DD, ambos incluidos), sin contar el que tiene exactamente ese período.
 * Una entrada por período distinto —varias revisiones del mismo no se repiten—, con
 * el más reciente, y ordenados por cercanía: del que termina más tarde al más viejo.
 * Con fechas incompletas o invertidas no hay nada que advertir.
 */
export function detectarTraslapes(params: {
  desde: string;
  hasta: string;
  generados: readonly PeriodoGenerado[];
}): TraslapeReporte[] {
  const { desde, hasta } = params;
  if (!FECHA.test(desde) || !FECHA.test(hasta) || desde > hasta) return [];

  const porPeriodo = new Map<string, TraslapeReporte>();
  for (const g of params.generados) {
    const gDesde = soloFecha(g.periodoDesde);
    const gHasta = soloFecha(g.periodoHasta);
    if (!FECHA.test(gDesde) || !FECHA.test(gHasta) || gDesde > gHasta) continue;
    // Exactamente el mismo período: recupera la instantánea, no se traslapa.
    if (gDesde === desde && gHasta === hasta) continue;
    const primerDiaComun = gDesde > desde ? gDesde : desde;
    const ultimoDiaComun = gHasta < hasta ? gHasta : hasta;
    if (primerDiaComun > ultimoDiaComun) continue;

    const clave = `${gDesde}|${gHasta}`;
    const existente = porPeriodo.get(clave);
    if (existente && existente.generadoEn >= g.generadoEn) continue;
    porPeriodo.set(clave, {
      id: g.id,
      desde: gDesde,
      hasta: gHasta,
      generadoEn: g.generadoEn,
      primerDiaComun,
      ultimoDiaComun,
      diasEnComun: diasInclusive(primerDiaComun, ultimoDiaComun),
    });
  }
  return [...porPeriodo.values()].sort((a, b) => b.hasta.localeCompare(a.hasta) || b.desde.localeCompare(a.desde));
}

export const TITULO_TRASLAPE = "Este período se traslapa con un reporte ya generado";

/** «Del 28/Oct/2026 al 30/Oct/2026, generado el 30/Oct/2026: 1 día en común (30/Oct/2026).» */
export function describirTraslape(t: TraslapeReporte): string {
  const comun =
    t.diasEnComun === 1
      ? `1 día en común (${fmtCalendarDate(t.primerDiaComun)})`
      : `${t.diasEnComun} días en común (${fmtCalendarDate(t.primerDiaComun)} al ${fmtCalendarDate(t.ultimoDiaComun)})`;
  return `Reporte del ${fmtCalendarDate(t.desde)} al ${fmtCalendarDate(t.hasta)}, generado el ${fmtDate(t.generadoEn)}: ${comun}.`;
}

/** Qué pasa si se genera igual. Habla de «ese reporte» o «esos reportes» según cuántos sean. */
export function consecuenciaTraslape(cantidad: number): string {
  const ese = cantidad === 1 ? "ese reporte" : "esos reportes";
  return `Esos días quedarán contados dos veces y el comparativo de uso no podrá usar ${ese} como período anterior. Puedes generar el reporte de todas formas.`;
}
