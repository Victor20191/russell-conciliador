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

/** Las cuentas que tienen los clasificadores seleccionados y en cuántos está cada una, por código. */
export function cuentasDeSeleccion(valores: Record<string, string[]>, seleccion: Iterable<string>): { codigo: string; renglones: number }[] {
  const conteo = new Map<string, number>();
  for (const clasificador of new Set(seleccion)) {
    for (const codigo of new Set(valores[clasificador] ?? [])) conteo.set(codigo, (conteo.get(codigo) ?? 0) + 1);
  }
  return [...conteo].map(([codigo, renglones]) => ({ codigo, renglones })).sort((a, b) => a.codigo.localeCompare(b.codigo));
}

/**
 * Quita `cuentas4` de los clasificadores de `seleccion` (todas sus cuentas si es `null`). NO muta la
 * entrada. Devuelve el mapa nuevo y los clasificadores que cambiaron: solo esos se graban.
 */
export function quitarCuentasMasivo(
  valores: Record<string, string[]>,
  seleccion: Iterable<string>,
  cuentas4: string[] | null,
): { valores: Record<string, string[]>; cambiados: string[] } {
  const quitar = cuentas4 ? new Set(cuentas4) : null;
  const siguiente = { ...valores };
  const cambiados: string[] = [];
  for (const clasificador of new Set(seleccion)) {
    const actuales = valores[clasificador] ?? [];
    const quedan = quitar ? actuales.filter((c) => !quitar.has(c)) : [];
    if (quedan.length === actuales.length) continue;
    siguiente[clasificador] = [...quedan].sort();
    cambiados.push(clasificador);
  }
  return { valores: siguiente, cambiados };
}
