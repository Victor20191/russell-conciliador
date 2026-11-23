// Constantes de los movimientos por tercero del ERP (`movimientos-tercero.ts`), sin dependencias:
// las usan también las pantallas del cruce de impuestos, que corren en el navegador.

/** `balance_tercero_encabezado.origen_extraccion` de una captura hecha con el archivo de movimientos. */
export const ORIGEN_MOVIMIENTOS_ERP = "movimientos-erp";
/** Nombre del tercero de los movimientos que llegan sin NIT ni nombre. */
export const NOMBRE_SIN_TERCERO = "Sin tercero";

export function esCapturaDeMovimientos(origenExtraccion: string | null | undefined): boolean {
  return origenExtraccion === ORIGEN_MOVIMIENTOS_ERP;
}

/** Lo que ve un impuesto de un cliente sin balance por terceros cuando el balance del corte no tiene el archivo. */
export const MENSAJE_SIN_MOVIMIENTOS_ERP =
  "Este cliente no tiene balance por terceros. Para cruzar el impuesto, adjunta al balance cerrado del corte el archivo de movimientos por tercero del ERP (botón «Ver por terceros» del balance).";
