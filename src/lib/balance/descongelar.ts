// Descongelar un balance para corregirlo (4/Oct/2026) — puro, sin BD.
//
// Un balance congelado es inmutable (las acciones lo rechazan y el trigger
// `proteger_detalle_balance_prevalidador` bloquea su detalle). Descongelarlo solo baja la bandera:
// la versión conserva su condición de oficial, su detalle y su aprobación del prevalidador (la
// huella no incluye el congelado). Lo que se edite después sí cambia la huella, así que para volver
// a congelarla hay que aprobar el prevalidador otra vez. Las cuentas que una conciliación de módulo
// dejó en firme siguen protegidas por su propio guard, que no depende del congelado.

/** Estado del encabezado mientras la versión espera volver a congelarse. */
export const ESTADO_DESCONGELADO = "Descongelado";

/** Una conciliación de módulo en firme del mismo corte, ya rotulada para mostrar. */
export type CierreAvisoDescongelar = { modulo: string; cargue: number; cerradoPor: string };

/** Lo que el modal le advierte al usuario antes de descongelar, en orden. */
export function avisosDescongelar(input: { esOficial: boolean; cierres: readonly CierreAvisoDescongelar[] }): string[] {
  const avisos = [
    "El balance se podrá editar otra vez: homologar, mapear y re-homologar cuentas.",
    input.esOficial
      ? "Sigue siendo la versión oficial del período: los cruces de los módulos la siguen usando."
      : "No es la versión oficial del período: descongelarla no cambia cuál lo es.",
    "Cuando termines, vuelve a congelarla. Si cambias cuentas, el prevalidador tendrá que aprobarse otra vez antes de congelar.",
  ];
  if (input.cierres.length > 0) {
    const lista = input.cierres.map((c) => `${c.modulo} (cargue #${c.cargue}, cerró ${c.cerradoPor})`).join(", ");
    avisos.push(`Hay ${input.cierres.length === 1 ? "una conciliación" : "conciliaciones"} en firme en este corte: ${lista}. Sus cuentas siguen bloqueadas aunque el balance quede descongelado.`);
  }
  return avisos;
}

/** ¿La versión fue descongelada y todavía no se vuelve a congelar? */
export function quedoDescongelado(balance: { estaCongelado: boolean; descongeladoEn: Date | string | null | undefined }): boolean {
  return !balance.estaCongelado && balance.descongeladoEn != null;
}
