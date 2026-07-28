/**
 * Revelado progresivo por bloques para tablas grandes: alternativa a la paginación
 * clásica (páginas + selector de tamaño) que evita el salto de página al validar
 * visualmente un detalle largo. El DOM solo monta un bloque inicial acotado y va
 * creciendo en bloques mientras el usuario se acerca al final del scroll — nunca
 * se pintan de una vez miles de filas.
 *
 * Puro y sin DOM: la conexión con el sensor de scroll (IntersectionObserver) vive
 * en el componente que lo usa (necesita el contenedor y el nodo sensor reales);
 * aquí solo el cálculo de cuántas filas van montadas, testeable en memoria.
 */

/** Bloque inicial: mismo tamaño que tenía la página por defecto (200) para no
 *  cambiar cuánto se pinta al abrir. */
export const BLOQUE_REVELADO_INICIAL = 200;
/** Bloque con el que crece cada vez (manual o por scroll). */
export const BLOQUE_REVELADO_INCREMENTO = 200;

/** Acota la cantidad revelada al rango [0, total] (nunca negativa ni mayor que el total). */
export function acotarRevelado(cantidadRevelada: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.max(cantidadRevelada, 0), total);
}

/** Próximo bloque revelado tras "cargar más" (botón manual o sensor de scroll). */
export function siguienteRevelado(
  cantidadRevelada: number,
  total: number,
  incremento: number = BLOQUE_REVELADO_INCREMENTO,
): number {
  return acotarRevelado(cantidadRevelada + incremento, total);
}

/**
 * Cantidad revelada mínima (en bloques completos de `incremento`) para que la fila
 * en `indice` (0-based) quede montada — usada para enfocar una fila que cayó más
 * abajo de lo ya renderizado (p. ej. tras reubicarla). Si el índice ya está
 * revelado, o es inválido, devuelve la cantidad actual acotada sin cambios.
 */
export function revelarHastaIndice(
  indice: number,
  cantidadRevelada: number,
  total: number,
  incremento: number = BLOQUE_REVELADO_INCREMENTO,
): number {
  const totalAcotado = Math.max(total, 0);
  const actualAcotado = acotarRevelado(cantidadRevelada, totalAcotado);
  if (indice < 0 || indice >= totalAcotado || indice < actualAcotado) return actualAcotado;
  const bloques = Math.floor(indice / incremento) + 1;
  return acotarRevelado(bloques * incremento, totalAcotado);
}
