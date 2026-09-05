/** Importes confirmados, comparados a centavos sin umbral de materialidad. */
export const CAMPOS_MONTOS = ["saldoInicial", "debitos", "creditos", "saldoFinal"] as const;
export type CampoMonto = typeof CAMPOS_MONTOS[number];
export type Montos4 = Record<CampoMonto, number>;
export const MONTOS_CERO: Montos4 = { saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 0 };

export function redondearMonto(valor: number): number {
  if (!Number.isFinite(valor)) throw new Error("El cruce contiene un importe no válido.");
  return Math.round((valor + Math.sign(valor) * Number.EPSILON) * 100) / 100;
}

export function sumarMontos(a: Montos4, b: Montos4): Montos4 {
  return Object.fromEntries(CAMPOS_MONTOS.map((campo) => [campo, redondearMonto(a[campo] + b[campo])])) as Montos4;
}

/** Diferencia firmada: por cuenta menos por tercero. */
export function diferenciasMontos(cuenta: Montos4, tercero: Montos4): Montos4 {
  return Object.fromEntries(CAMPOS_MONTOS.map((campo) => [campo, redondearMonto(redondearMonto(cuenta[campo]) - redondearMonto(tercero[campo]))])) as Montos4;
}

export function montosCuadran(diferencias: Montos4): boolean {
  return CAMPOS_MONTOS.every((campo) => diferencias[campo] === 0);
}
