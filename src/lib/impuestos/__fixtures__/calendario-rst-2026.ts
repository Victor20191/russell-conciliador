import type { VencimientoDian } from "../calendario";

/**
 * Calendario DIAN 2026 · «RST - Anticipo bimestral» (página 2 de «Calendario_Tributario_2026.pdf»).
 * Por bimestre, el día de vencimiento para los dígitos 1, 2, 3, 4, 5, 6, 7, 8, 9, 0. El primer
 * bimestre vence en mayo; el sexto, en enero de 2027. Caso real: NIT terminado en 8, el 1.er bimestre
 * vence el 22 de mayo y el 2.º el 22 de junio.
 */
const DIGITOS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

const filas = (periodo: number, anio: number, mes: number, dias: readonly number[]): VencimientoDian[] =>
  dias.map((dia, j) => ({ periodo, ultimoDigito: DIGITOS[j], fecha: `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}` }));

export const CALENDARIO_RST_ANTICIPO_2026: VencimientoDian[] = [
  ...filas(1, 2026, 5, [12, 13, 14, 15, 19, 20, 21, 22, 25, 26]),
  ...filas(2, 2026, 6, [10, 11, 12, 16, 17, 18, 19, 22, 23, 24]),
  ...filas(3, 2026, 7, [9, 10, 14, 15, 16, 17, 21, 22, 23, 24]),
  ...filas(4, 2026, 9, [9, 10, 11, 14, 15, 16, 17, 18, 21, 22]),
  ...filas(5, 2026, 11, [11, 12, 13, 17, 18, 19, 20, 23, 24, 25]),
  ...filas(6, 2027, 1, [13, 14, 15, 18, 19, 20, 21, 22, 25, 26]),
];
