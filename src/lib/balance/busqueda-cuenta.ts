function normalizarTextoBusqueda(valor: string | null | undefined): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Los códigos se buscan desde su primera posición, no por fragmentos internos. */
export function codigoEmpiezaPor(
  codigo: string | null | undefined,
  entrada: string,
): boolean {
  const prefijo = normalizarTextoBusqueda(entrada);
  return prefijo === "" || normalizarTextoBusqueda(codigo).startsWith(prefijo);
}

/**
 * Búsqueda compartida de las tablas de balance: prefijo para códigos y
 * coincidencia parcial para el nombre de la cuenta.
 */
export function coincideBusquedaCuenta(
  codigos: readonly (string | null | undefined)[],
  nombre: string | null | undefined,
  entrada: string,
): boolean {
  const busqueda = normalizarTextoBusqueda(entrada);
  if (busqueda === "") return true;

  return codigos.some((codigo) => normalizarTextoBusqueda(codigo).startsWith(busqueda))
    || normalizarTextoBusqueda(nombre).includes(busqueda);
}
