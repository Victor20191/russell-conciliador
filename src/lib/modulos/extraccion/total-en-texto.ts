// Total del archivo escrito junto a su rótulo en una sola celda — puro.
//
// Algunos ERP cierran el reporte con una línea de pie como «Valor stock : 6,042,080,922.47»
// (Kardex de KOEN PACK): el importe no está en la columna del valor sino en el mismo texto
// del rótulo. Leída como una fila más, era un producto sin valor que bloqueaba la lectura,
// aunque fuera justamente el total contra el cual controlar el detalle.
import { normalizarMonto } from "@/lib/balance/extraccion/transformar";

/** Lo que va después de los dos puntos: solo un importe («6,042,080,922.47», «$ (1.234,50)»). */
const IMPORTE = /^\(?\s*-?\s*\$?\s*\d[\d.,\s]*\)?$/;

/** «Rótulo : importe» en una celda. El rótulo debe tener letras; lo demás, solo el importe. */
export function totalEnTexto(valor: unknown): { rotulo: string; importe: number } | null {
  if (typeof valor !== "string") return null;
  const dosPuntos = valor.indexOf(":");
  if (dosPuntos < 1) return null;
  const rotulo = valor.slice(0, dosPuntos).replace(/\s+/g, " ").trim();
  const resto = valor.slice(dosPuntos + 1).trim();
  if (!/\p{L}/u.test(rotulo) || !IMPORTE.test(resto)) return null;
  const importe = normalizarMonto(resto);
  return importe == null || !Number.isFinite(importe) ? null : { rotulo, importe };
}

/** La fila es solo esa celda: ni producto ni otro dato al lado. `columna` es 1-based. */
export function filaDeTotalEnTexto(fila: readonly unknown[]): { columna: number; rotulo: string; importe: number } | null {
  const llenas = fila.flatMap((valor, i) => (String(valor ?? "").trim() !== "" ? [{ valor, columna: i + 1 }] : []));
  if (llenas.length !== 1) return null;
  const total = totalEnTexto(llenas[0].valor);
  return total ? { columna: llenas[0].columna, ...total } : null;
}
