// Cuándo NO se puede eliminar un cliente (puro). Los balances, los cargues de los módulos y sus
// borradores referencian al cliente por una FK suave (sin cascada física): borrar el cliente los
// dejaba huérfanos, fuera de toda pantalla. Se eliminan antes, cada uno con sus propias reglas
// (conciliaciones en firme, balances cerrados…), y después el cliente.

export type DatosDelCliente = {
  balances: number;
  borradoresBalance: number;
  cargues: number;
  borradoresModulo: number;
  archivosModulo: number;
  conciliaciones: number;
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** El motivo para no eliminar el cliente, o null si no tiene datos de trabajo. */
export function motivoNoEliminarCliente(d: DatosDelCliente): string | null {
  const partes = [
    d.balances > 0 ? plural(d.balances, "balance", "balances") : null,
    d.borradoresBalance > 0 ? plural(d.borradoresBalance, "borrador de balance", "borradores de balance") : null,
    d.cargues > 0 ? plural(d.cargues, "cargue de módulo", "cargues de módulo") : null,
    d.borradoresModulo > 0 ? plural(d.borradoresModulo, "borrador de módulo", "borradores de módulo") : null,
    d.archivosModulo > 0 ? plural(d.archivosModulo, "archivo recibido en los módulos", "archivos recibidos en los módulos") : null,
    d.conciliaciones > 0 ? plural(d.conciliaciones, "conciliación de módulo", "conciliaciones de módulo") : null,
  ].filter((p): p is string => p !== null);
  if (partes.length === 0) return null;
  const lista = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`;
  return `No se puede eliminar el cliente: tiene ${lista}. Elimínalos primero desde Balance de comprobación y desde cada módulo.`;
}
