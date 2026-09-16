/**
 * Aplicativos (ERP) de un campo de la ficha del cliente. Lo asignado manda; el ERP legado de
 * `clientes.erp_id` solo cuenta cuando el consumidor lo pide (Contabilidad/balance) y el campo
 * no tiene ninguno. Nunca se infiere como aplicativo de Nómina, Inventarios o Activos fijos.
 */
export function aplicativosDelProceso<T>(
  asignados: readonly (T | null | undefined)[],
  legado: T | null,
  usarLegadoSiFalta = false,
): T[] {
  const lista = [...new Set(asignados.filter((valor): valor is T => valor != null))];
  if (lista.length > 0) return lista;
  return usarLegadoSiFalta && legado != null ? [legado] : [];
}
