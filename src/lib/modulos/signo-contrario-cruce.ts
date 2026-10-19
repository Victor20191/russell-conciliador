// SIGNO CONTRARIO en el cruce contable — puro (19/Oct/2026).
//
// Un archivo que llega con el signo contrario al de la cédula deja en el cruce una diferencia que es
// casi el DOBLE del saldo, y la cifra sola no dice por qué. Pasó con Ingresos de Kakaraka (dic-2025):
// el ERP exporta el auxiliar con el signo contable —ventas en negativo, devoluciones en positivo— y
// la cédula presenta la clase 4 en positivo: contabilidad 71.488.944.207,09 contra un módulo de
// −71.338.100.736,09, diferencia 142.827.044.943,18. Con el signo invertido la diferencia real es
// 150.843.471,00. Cuando el módulo es casi igual a la contabilidad con el signo contrario, el cruce lo
// avisa con la diferencia que quedaría invertido. Solo informa: no cambia cifras, marcas ni el cierre;
// el arreglo es volver a cargar el archivo con su signo (Ingresos: «las ventas vienen en negativo»).
import type { FilaCruceContable } from "./cruce-contable";

/** Hasta cuánto pueden diferir las magnitudes para tomarlas por casi iguales: el 10 % de la mayor. */
export const PROPORCION_SIGNO_CONTRARIO = 0.1;

const redondear = (v: number): number => Math.round(v * 100) / 100 + 0 || 0;

export type SignoContrarioFila = {
  /** Clave del renglón (`FilaCruceContable.cuenta4`). */
  clave: string;
  /** Contabilidad y módulo SIN lo no modular de cada lado: lo que se concilia. */
  contable: number;
  modulo: number;
  /** La diferencia que se ve hoy (la ajustada). */
  diferencia: number;
  /** La que quedaría con el módulo en el signo de la contabilidad. */
  diferenciaInvertida: number;
};

/**
 * ¿El módulo es casi igual a la contabilidad con el signo contrario? Los dos lados con saldo y de
 * signos opuestos, magnitudes a no más de `PROPORCION_SIGNO_CONTRARIO` de la mayor, y una diferencia
 * que exige marca (desde `umbral`, y nunca por debajo de un centavo).
 */
export function signoContrarioFila(
  fila: Pick<FilaCruceContable, "cuenta4" | "contable" | "inventario" | "noModular" | "noModularModulo" | "diferencia">,
  umbral: number,
): SignoContrarioFila | null {
  const contable = redondear(fila.contable - fila.noModular);
  const modulo = redondear(fila.inventario - fila.noModularModulo);
  if (contable === 0 || modulo === 0 || Math.sign(contable) === Math.sign(modulo)) return null;
  if (Math.abs(fila.diferencia) < Math.max(umbral, 0.01)) return null;
  const diferenciaInvertida = redondear(contable + modulo);
  if (Math.abs(diferenciaInvertida) > PROPORCION_SIGNO_CONTRARIO * Math.max(Math.abs(contable), Math.abs(modulo))) return null;
  return { clave: fila.cuenta4, contable, modulo, diferencia: fila.diferencia, diferenciaInvertida };
}

export type ResumenSignoContrario = {
  filas: SignoContrarioFila[];
  /** Σ de las diferencias de esos renglones, hoy y con el módulo invertido. */
  diferencia: number;
  diferenciaInvertida: number;
};

/** Los renglones de la cédula con el módulo en el signo contrario; null si no hay ninguno. */
export function resumenSignoContrario(
  filas: readonly Pick<FilaCruceContable, "cuenta4" | "contable" | "inventario" | "noModular" | "noModularModulo" | "diferencia">[],
  umbral: number,
): ResumenSignoContrario | null {
  const detectadas = filas.map((f) => signoContrarioFila(f, umbral)).filter((f): f is SignoContrarioFila => f != null);
  if (detectadas.length === 0) return null;
  return {
    filas: detectadas,
    diferencia: redondear(detectadas.reduce((s, f) => s + f.diferencia, 0)),
    diferenciaInvertida: redondear(detectadas.reduce((s, f) => s + f.diferenciaInvertida, 0)),
  };
}
