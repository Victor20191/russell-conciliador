// Cuándo una cuenta de 4 dígitos del Plan Estándar Russell (un «subgrupo») está EN USO (puro).
// Como con las subcuentas de 6 dígitos, una cuenta en uso no cambia de código ni se elimina: los
// balances, la memoria de los módulos y sus filtros la referencian por su código.

export type UsoSubgrupo = {
  /** Algún balance tiene cuentas homologadas a una subcuenta de ese grupo. */
  balances: boolean;
  /** La memoria del Consolidado o una asignación del período de un módulo la usa. */
  memoriaModulos: boolean;
  /** Está en los filtros de cuentas de un módulo (subgrupos que concilia o pareja de depreciación). */
  filtrosModulos: boolean;
};

/** El motivo para no cambiar el código o no eliminar la cuenta, o null si no está en uso. */
export function motivoSubgrupoEnUso(codigo: string, uso: UsoSubgrupo, accion: "cambiar el código de" | "eliminar"): string | null {
  const razones = [
    uso.balances ? "tiene balances de clientes homologados a sus subcuentas" : null,
    uso.memoriaModulos ? "la usa la memoria del Consolidado de un módulo" : null,
    uso.filtrosModulos ? "está en los filtros de cuentas de un módulo" : null,
  ].filter((r): r is string => r !== null);
  if (razones.length === 0) return null;
  const lista = razones.length === 1 ? razones[0] : `${razones.slice(0, -1).join(", ")} y ${razones.at(-1)}`;
  return `No puedes ${accion} la cuenta ${codigo}: ${lista}. Hacerlo rompería esas referencias.`;
}
