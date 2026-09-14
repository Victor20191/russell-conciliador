// ORIGEN de una fila del auxiliar: nacional o exterior — puro, sin BD.
//
// La primera regla es la cuenta Russell que se le ASIGNÓ en el Consolidado a la cuenta del archivo
// (Cartera 130510 exterior / 130505 nacional; CxP 221005 / 220505). Se aplica al LEER, en el cruce
// por tercero, porque la asignación puede cambiar después de cargar. Al confirmar el cargue se guarda
// lo que no depende de ella: lo declarado por quien cargó, la moneda del importe y, al final, la forma
// del identificador (EIN, RUC, «EXT…»), que es solo una sugerencia. Con «mixta» no hay declaración:
// decide cada fila. Ni la cuenta del archivo ni la homologación del balance intervienen.
import { esMonedaExtranjera } from "./moneda";
import type { OrigenCartera } from "./tercero-cartera";

/** Origen que se guarda al confirmar el cargue: lo declarado, la moneda y la forma del identificador. */
export function resolverOrigenCartera(entrada: {
  declarado: "nacional" | "exterior" | "mixta" | null | undefined;
  moneda: string | null | undefined;
  sugerido: OrigenCartera | null;
}): OrigenCartera | null {
  if (entrada.declarado === "nacional" || entrada.declarado === "exterior") return entrada.declarado;
  if (esMonedaExtranjera(entrada.moneda)) return "exterior";
  return entrada.sugerido;
}

/**
 * Origen por las cuentas asignadas en el Consolidado: todas del exterior → exterior; todas
 * nacionales → nacional. Mixtas, de otras cuentas del módulo (anticipos, 2335xx) o sin asignar →
 * `null`: manda el origen guardado al cargar.
 */
export function origenPorAsignacion(
  cuentasAsignadas: readonly string[],
  cuentasExterior: readonly string[] | undefined,
  cuentasNacional: readonly string[] | undefined,
): OrigenCartera | null {
  if (cuentasAsignadas.length === 0) return null;
  if (cuentasExterior?.length && cuentasAsignadas.every((c) => cuentasExterior.includes(c))) return "exterior";
  if (cuentasNacional?.length && cuentasAsignadas.every((c) => cuentasNacional.includes(c))) return "nacional";
  return null;
}
