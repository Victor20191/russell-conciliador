// Detección de filas TOTALIZADORAS que se están imputando al módulo.
//
// Los archivos de ERP suelen traer un renglón de GRAN TOTAL al final. Si ese renglón entra
// como un ítem más, el módulo queda al DOBLE de su valor real y el cruce contable acusa una
// diferencia que no existe. El motor ya lo evita por dos vías (negrita → omitida, y el
// tri-estado `omitida` del borrador), pero ninguna es infalible: un archivo sin negrita, o
// un «Incluir» hecho a mano, vuelve a colarlo.
//
// La señal es aritmética y no depende del formato: si el valor de UNA fila equivale a la
// suma de TODAS las demás, esa fila es el total, no un ítem. Lógica pura, sin BD.

/** Fila imputable reducida a lo que necesita la detección. */
export type FilaValorModulo = { filaNum: number; valor: number };

export type FilaTotalizadora = {
  filaNum: number;
  /** Valor de la fila sospechosa. */
  valor: number;
  /** Suma de las demás filas imputables (con la que coincide). */
  resto: number;
  /** |valor − resto|: qué tan exacta es la coincidencia. */
  diferencia: number;
};

/**
 * Margen relativo al valor de la fila. No se exige coincidencia exacta: el gran total del
 * ERP casi nunca cuadra al centavo con la suma de sus líneas (redondeos del propio archivo,
 * la misma causa que dispara la novedad de «valor total ≠ cantidad × valor unitario»).
 */
export const TOLERANCIA_FILA_TOTALIZADORA = 0.01; // 1 %

/**
 * Con muy pocas filas la coincidencia deja de ser informativa (en un archivo de 2 líneas
 * iguales siempre se cumple), así que por debajo de este conteo no se avisa.
 */
export const MINIMO_FILAS_TOTALIZADORA = 3;

/**
 * Devuelve las filas cuyo valor equivale a la suma de todas las demás — candidatas a ser el
 * renglón de gran total del archivo imputado por error. Ordenadas de mayor a menor valor.
 */
export function detectarFilasTotalizadoras(
  filas: readonly FilaValorModulo[],
  tolerancia: number = TOLERANCIA_FILA_TOTALIZADORA,
  minimoFilas: number = MINIMO_FILAS_TOTALIZADORA,
): FilaTotalizadora[] {
  if (filas.length < minimoFilas) return [];
  const total = filas.reduce((s, f) => s + f.valor, 0);
  const hallazgos: FilaTotalizadora[] = [];
  for (const f of filas) {
    if (f.valor === 0) continue; // una fila en cero «coincide» con cualquier resto en cero
    const resto = total - f.valor;
    const diferencia = Math.abs(f.valor - resto);
    if (diferencia <= Math.abs(f.valor) * tolerancia) hallazgos.push({ filaNum: f.filaNum, valor: f.valor, resto, diferencia });
  }
  return hallazgos.sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
}
