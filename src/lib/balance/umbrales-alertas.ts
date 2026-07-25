/** Umbrales funcionales para separar avisos informativos de alertas accionables. */
export const UMBRAL_DESCUADRE_ALERTA = 2_000;
export const UMBRAL_NATURALEZA_ALERTA = 50_000;
// Un movimiento (débito o crédito) que vino con signo CONTRARIO al dominante de su
// columna se sube en NEGATIVO. Ese negativo es la "alerta de magnitud".
export const UMBRAL_MAGNITUD_ALERTA = 50_000;

export function esDescuadreAccionable(valor: number | null | undefined): boolean {
  return valor != null && Math.abs(valor) >= UMBRAL_DESCUADRE_ALERTA;
}

export function esDescuadreInformativo(valor: number | null | undefined): boolean {
  return valor != null && Math.abs(valor) > 0 && Math.abs(valor) < UMBRAL_DESCUADRE_ALERTA;
}

export function esSaldoContrarioAccionable(saldo: number, saldoOk: boolean): boolean {
  return !saldoOk && Math.abs(saldo) > UMBRAL_NATURALEZA_ALERTA;
}

export function esSaldoContrarioInformativo(saldo: number, saldoOk: boolean): boolean {
  return !saldoOk && Math.abs(saldo) <= UMBRAL_NATURALEZA_ALERTA;
}

/** Un valor de movimiento (débito/crédito) negativo = vino con signo contrario a su
 *  columna. Accionable si su cuantía supera el umbral; informativo si no. */
export function esMagnitudAccionable(valor: number | null | undefined): boolean {
  return valor != null && valor < 0 && Math.abs(valor) >= UMBRAL_MAGNITUD_ALERTA;
}

export function esMagnitudInformativo(valor: number | null | undefined): boolean {
  return valor != null && valor < 0 && Math.abs(valor) < UMBRAL_MAGNITUD_ALERTA;
}
