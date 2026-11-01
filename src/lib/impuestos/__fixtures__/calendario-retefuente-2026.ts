import type { VencimientoDian } from "../calendario";

/**
 * Calendario DIAN 2026 · Retención en la fuente (página 1 de «Calendario_Tributario_2026.pdf»),
 * comprobado contra la hoja «Vencimientos» del Programa de Impuestos de Russell. Por período,
 * el día de vencimiento (del mes siguiente) para los dígitos 1, 2, 3, 4, 5, 6, 7, 8, 9, 0.
 */
const DIAS: readonly (readonly number[])[] = [
  [10, 11, 12, 13, 16, 17, 18, 19, 20, 23], // enero → febrero
  [10, 11, 12, 13, 16, 17, 18, 19, 20, 24], // febrero → marzo
  [13, 14, 15, 16, 20, 21, 22, 23, 24, 27], // marzo → abril
  [12, 13, 14, 15, 19, 20, 21, 22, 25, 26], // abril → mayo
  [10, 11, 12, 16, 17, 18, 19, 22, 23, 24], // mayo → junio
  [9, 10, 14, 15, 16, 17, 21, 22, 23, 24], // junio → julio
  [12, 13, 14, 18, 19, 20, 21, 24, 25, 26], // julio → agosto
  [9, 10, 11, 14, 15, 16, 17, 18, 21, 22], // agosto → septiembre
  [9, 13, 14, 15, 16, 19, 20, 21, 22, 23], // septiembre → octubre
  [11, 12, 13, 17, 18, 19, 20, 23, 24, 25], // octubre → noviembre
  [10, 11, 14, 15, 16, 17, 18, 21, 22, 23], // noviembre → diciembre
  [13, 14, 15, 18, 19, 20, 21, 22, 25, 26], // diciembre → enero 2027
];

const DIGITOS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

export const CALENDARIO_RETEFUENTE_2026: VencimientoDian[] = DIAS.flatMap((dias, i) => {
  const periodo = i + 1;
  const anio = periodo === 12 ? 2027 : 2026;
  const mes = periodo === 12 ? 1 : periodo + 1;
  return dias.map((dia, j) => ({
    periodo,
    ultimoDigito: DIGITOS[j],
    fecha: `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`,
  }));
});
