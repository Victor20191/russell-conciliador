/** Umbrales funcionales para separar avisos informativos de alertas accionables. */
export const UMBRAL_DESCUADRE_ALERTA = 2_000;
export const UMBRAL_NATURALEZA_ALERTA = 50_000;

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
