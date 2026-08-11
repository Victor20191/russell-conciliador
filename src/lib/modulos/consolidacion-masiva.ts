// Asignación MASIVA de cuentas Russell a varios clasificadores del Consolidado
// de módulos. Lógica pura (sin BD ni React) para poder probarla en memoria.
//
// El usuario selecciona N clasificadores en la tabla, elige 1..N cuentas de 4
// dígitos y decide en el momento el modo:
//   - «agregar»    → merge: conserva las cuentas que cada clasificador ya tenía.
//   - «reemplazar» → el conjunto elegido queda como el ÚNICO de cada uno.
export type ModoAsignacionMasiva = "agregar" | "reemplazar";

export function parseModoAsignacionMasiva(value: unknown): ModoAsignacionMasiva | null {
  return value === "agregar" || value === "reemplazar" ? value : null;
}

/**
 * Aplica `cuentas4` a los clasificadores de `seleccion` sobre el mapa
 * clasificador → cuentas. NO muta la entrada: devuelve un objeto nuevo con las
 * listas ordenadas y sin duplicados (misma forma que produce la UI por fila).
 */
export function aplicarAsignacionMasiva(
  valores: Record<string, string[]>,
  seleccion: Iterable<string>,
  cuentas4: string[],
  modo: ModoAsignacionMasiva,
): Record<string, string[]> {
  const elegidas = [...new Set(cuentas4)];
  const siguiente = { ...valores };
  for (const clasificador of seleccion) {
    siguiente[clasificador] =
      modo === "reemplazar"
        ? [...elegidas].sort()
        : [...new Set([...(valores[clasificador] ?? []), ...elegidas])].sort();
  }
  return siguiente;
}

/** Cuántos de los clasificadores seleccionados YA tienen cuentas (para avisar antes de reemplazar). */
export function contarConCuentas(valores: Record<string, string[]>, seleccion: Iterable<string>): number {
  let n = 0;
  for (const clasificador of seleccion) if ((valores[clasificador] ?? []).length > 0) n += 1;
  return n;
}
