// Estado de un balance cargado (17/Oct/2026) — puro, sin BD.
//
// Al pasar un borrador a balance, la versión queda «En proceso» o «En proceso con alertas» (si la
// validación del cargue encontró alertas). «Cerrar balance» la deja «Cerrado»: inmutable y disponible
// para que los módulos concilien contra ella. «Abrir balance» la devuelve a «En proceso» para corregirla.
//
// Lo que manda es la bandera `estaCongelado` (el nombre interno no cambió); la columna `estado`
// solo recuerda si la versión abierta tiene alertas. Los cargues anteriores guardaron «Única»,
// «Última», «Con alertas», «Congelado» y «Descongelado», y `estadoBalance` los traduce.

export const ESTADO_EN_PROCESO = "En proceso";
export const ESTADO_EN_PROCESO_CON_ALERTAS = "En proceso con alertas";
export const ESTADO_CERRADO = "Cerrado";

export type EstadoBalance = typeof ESTADO_EN_PROCESO | typeof ESTADO_EN_PROCESO_CON_ALERTAS | typeof ESTADO_CERRADO;

/** Estado de una versión abierta según cuántas alertas tiene su validación. */
export function estadoEnProceso(alertas: number): EstadoBalance {
  return alertas > 0 ? ESTADO_EN_PROCESO_CON_ALERTAS : ESTADO_EN_PROCESO;
}

/** «Con alertas» es el rótulo que guardaban los cargues anteriores al 17/Oct/2026. */
const ROTULOS_CON_ALERTAS = new Set<string>([ESTADO_EN_PROCESO_CON_ALERTAS, "Con alertas"]);

/** El estado que se muestra: cerrado si la bandera lo dice; si no, en proceso (con o sin alertas). */
export function estadoBalance(balance: { estaCongelado: boolean; estado: string | null | undefined }): EstadoBalance {
  if (balance.estaCongelado) return ESTADO_CERRADO;
  return ROTULOS_CON_ALERTAS.has(balance.estado ?? "") ? ESTADO_EN_PROCESO_CON_ALERTAS : ESTADO_EN_PROCESO;
}

/** Tono del chip de cada estado. */
export function tonoEstadoBalance(estado: string): "warn" | "blue" | "ink" {
  if (estado === ESTADO_CERRADO) return "blue";
  if (estado === ESTADO_EN_PROCESO_CON_ALERTAS || estado === "Con alertas") return "warn";
  return "ink";
}
