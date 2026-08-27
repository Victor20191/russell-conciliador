// Numeración de versiones de un cargue por (cliente, período). Pura y sin BD.
//
// La versión NO puede derivarse del conteo de cargues existentes: si se elimina
// una versión intermedia (p. ej. queda solo `v2`), «conteo + 1» volvería a
// producir `v2` y chocaría con el índice único (cliente, período, versión).
// Se toma el mayor número visto + 1, así los números nunca se reciclan.

const PATRON_VERSION = /^v(\d+)$/i;

/** Número de una etiqueta `vN`; 0 si la etiqueta no sigue el patrón. */
export function numeroDeVersion(version: string | null | undefined): number {
  const m = PATRON_VERSION.exec((version ?? "").trim());
  return m ? Number(m[1]) : 0;
}

/** Siguiente etiqueta `vN` a partir de las versiones ya existentes del período. */
export function siguienteVersionCargue(versiones: readonly (string | null | undefined)[]): string {
  const mayor = versiones.reduce((max, v) => Math.max(max, numeroDeVersion(v)), 0);
  return `v${mayor + 1}`;
}
