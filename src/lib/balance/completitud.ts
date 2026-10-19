/**
 * Completitud del mapeo de un balance: % de sus cuentas homologadas a una cuenta
 * Russell. Se TRUNCA, nunca se redondea hacia arriba: 100 % (y la barra verde)
 * significa que no falta ninguna. Con redondeo, 341 de 342 cuentas daban «100 %»
 * al lado de «1 sin mapeo».
 */
export function porcentajeCompletitud(mapeadas: number, sinMapear: number): number {
  if (sinMapear <= 0) return 100;
  const total = mapeadas + sinMapear;
  return Math.min(99, Math.floor((Math.max(0, mapeadas) / total) * 100));
}
