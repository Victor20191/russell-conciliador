// «Abrir balance» para corregirlo (antes «Descongelar», 4/Oct/2026; renombrado el 17/Oct/2026) — puro, sin BD.
//
// Un balance cerrado es inmutable (las acciones lo rechazan y el trigger
// `proteger_detalle_balance_prevalidador` bloquea su detalle). Abrirlo solo baja la bandera y lo deja
// «En proceso»: conserva su detalle y su aprobación del prevalidador (la huella no incluye el
// cerrado). Lo que se edite después sí cambia la huella, así que para volver a cerrarlo hay que
// aprobar el prevalidador otra vez. Desde el 18/Oct/2026 los módulos cruzan solo contra un balance
// cerrado: mientras esté abierto, los cargues de su corte no lo usan (salvo una conciliación ya en
// firme, que quedó fijada a su balance). Las cuentas que una conciliación de módulo dejó en firme
// siguen protegidas por su propio guard, que no depende del cierre del balance. El nombre interno
// (`estaCongelado`, `descongelado_*`) no cambió.

/** Una conciliación de módulo en firme del mismo corte, ya rotulada para mostrar. */
export type CierreAvisoDescongelar = { modulo: string; cargue: number; cerradoPor: string };

/** Lo que el modal le advierte al usuario antes de abrir el balance, en orden. */
export function avisosDescongelar(input: { cierres: readonly CierreAvisoDescongelar[] }): string[] {
  const avisos = [
    "El balance queda en proceso y se podrá editar otra vez: homologar, mapear y re-homologar cuentas.",
    "Los módulos dejan de cruzar contra este balance hasta que lo vuelvas a cerrar.",
    "Cuando termines, vuelve a cerrarlo. Si cambias cuentas, el prevalidador tendrá que aprobarse otra vez antes de cerrarlo.",
  ];
  if (input.cierres.length > 0) {
    const lista = input.cierres.map((c) => `${c.modulo} (cargue #${c.cargue}, cerró ${c.cerradoPor})`).join(", ");
    avisos.push(`Hay ${input.cierres.length === 1 ? "una conciliación" : "conciliaciones"} en firme en este corte: ${lista}. Sus cuentas siguen bloqueadas aunque el balance quede abierto.`);
  }
  return avisos;
}

/** ¿La versión se abrió para corregirla y todavía no se vuelve a cerrar? */
export function quedoDescongelado(balance: { estaCongelado: boolean; descongeladoEn: Date | string | null | undefined }): boolean {
  return !balance.estaCongelado && balance.descongeladoEn != null;
}
