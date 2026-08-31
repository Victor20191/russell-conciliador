/**
 * Resuelve un dato del ERP de un proceso durante la transición desde el ERP
 * único de `clientes`. Una asignación explícita siempre manda, incluso cuando
 * su valor es null (estado pendiente). El legado solo se permite de forma
 * explícita para CONT/balance durante la transición; nunca se infiere como ERP
 * de Nómina, Inventarios u otro módulo.
 */
export function resolverValorErpProceso<T>(
  asignacion: { valor: T | null } | undefined,
  valorLegado: T | null,
  usarLegadoSiFalta = false,
): T | null {
  if (asignacion !== undefined) return asignacion.valor;
  return usarLegadoSiFalta ? valorLegado : null;
}
