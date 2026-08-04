/**
 * Historial de cambios SIN GUARDAR (pila de deshacer) para las pantallas que
 * ofrecen «Guardar cambios» / «Descartar cambios».
 *
 * Al descartar, el usuario debe poder elegir entre deshacer SOLO el último
 * cambio o descartarlos TODOS. Para el primer caso hace falta recordar el
 * estado pendiente ANTES de cada edición: cada entrada de la pila es esa
 * fotografía más una descripción legible del cambio que la sucedió.
 *
 * Lógica pura (sin React ni BD) para poder probarla en memoria; el hook que la
 * conecta a la UI vive en `use-historial-cambios.ts`.
 */

export type EntradaHistorial<T> = {
  /** Estado pendiente ANTES de aplicar el cambio (a restaurar al deshacer). */
  estado: T;
  /** Texto corto que describe el cambio aplicado después de esa fotografía. */
  descripcion: string;
};

/**
 * Tope de fotografías guardadas. Truncar es seguro: «descartar todo» no usa la
 * pila (vuelve al estado base) y solo se pierde la posibilidad de deshacer paso
 * a paso los cambios más antiguos.
 */
export const LIMITE_HISTORIAL = 100;

/** Apila una fotografía (descartando las más viejas si se pasa del límite). */
export function apilarCambio<T>(
  pila: readonly EntradaHistorial<T>[],
  entrada: EntradaHistorial<T>,
  limite: number = LIMITE_HISTORIAL,
): EntradaHistorial<T>[] {
  const siguiente = [...pila, entrada];
  if (limite <= 0) return [];
  return siguiente.length > limite ? siguiente.slice(siguiente.length - limite) : siguiente;
}

/** Saca la última fotografía. Con la pila vacía devuelve `entrada: null`. */
export function desapilarCambio<T>(pila: readonly EntradaHistorial<T>[]): {
  pila: EntradaHistorial<T>[];
  entrada: EntradaHistorial<T> | null;
} {
  if (pila.length === 0) return { pila: [], entrada: null };
  return { pila: pila.slice(0, -1), entrada: pila[pila.length - 1] };
}

/** Última fotografía (la que restauraría «deshacer el último cambio»). */
export function ultimoCambio<T>(pila: readonly EntradaHistorial<T>[]): EntradaHistorial<T> | null {
  return pila.length > 0 ? pila[pila.length - 1] : null;
}
