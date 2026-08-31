/**
 * Resuelve un dato del ERP de un proceso durante la transición desde el ERP
 * único de `clientes`. Una asignación explícita siempre manda, incluso cuando
 * su valor es null (estado pendiente); el legado solo aplica si no hay fila.
 */
export function resolverValorErpProceso<T>(
  asignacion: { valor: T | null } | undefined,
  valorLegado: T | null,
): T | null {
  return asignacion === undefined ? valorLegado : asignacion.valor;
}
