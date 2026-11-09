import type { VencimientoDian } from "../calendario";

/**
 * Calendario DIAN 2026 · IVA (página 1 de «Calendario_Tributario_2026.pdf»): secciones «IVA -
 * Bimestral», «IVA - Cuatrimestral» y «RST · Consolidada de IVA» (declaración anual del año
 * gravable 2025, por pares de dígitos). Por período, el día de vencimiento para los dígitos 1, 2,
 * 3, 4, 5, 6, 7, 8, 9, 0. Caso del levantamiento: NIT terminado en 3, bimestral, el 1.er bimestre
 * vence el 12 de marzo.
 */
const DIGITOS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

const filas = (periodo: number, anio: number, mes: number, dias: readonly number[]): VencimientoDian[] =>
  dias.map((dia, j) => ({ periodo, ultimoDigito: DIGITOS[j], fecha: `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}` }));

const MARZO = [10, 11, 12, 13, 16, 17, 18, 19, 20, 24];
const MAYO = [12, 13, 14, 15, 19, 20, 21, 22, 25, 26];
const JULIO = [9, 10, 14, 15, 16, 17, 21, 22, 23, 24];
const SEPTIEMBRE = [9, 10, 11, 14, 15, 16, 17, 18, 21, 22];
const NOVIEMBRE = [11, 12, 13, 17, 18, 19, 20, 23, 24, 25];
const ENERO_2027 = [13, 14, 15, 18, 19, 20, 21, 22, 25, 26];

export const CALENDARIO_IVA_BIMESTRAL_2026: VencimientoDian[] = [
  ...filas(1, 2026, 3, MARZO),
  ...filas(2, 2026, 5, MAYO),
  ...filas(3, 2026, 7, JULIO),
  ...filas(4, 2026, 9, SEPTIEMBRE),
  ...filas(5, 2026, 11, NOVIEMBRE),
  ...filas(6, 2027, 1, ENERO_2027),
];

export const CALENDARIO_IVA_CUATRIMESTRAL_2026: VencimientoDian[] = [
  ...filas(1, 2026, 5, MAYO),
  ...filas(2, 2026, 9, SEPTIEMBRE),
  ...filas(3, 2027, 1, ENERO_2027),
];

/** Año gravable 2025: 1-2 → 16, 3-4 → 17, 5-6 → 18, 7-8 → 19, 9-0 → 20 de febrero de 2026. */
export const CALENDARIO_IVA_ANUAL_2026: VencimientoDian[] = filas(1, 2026, 2, [16, 16, 17, 17, 18, 18, 19, 19, 20, 20]);
