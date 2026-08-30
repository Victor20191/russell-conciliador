import {
  factorPresentacion,
} from "@/lib/balance/prevalidador/calcular";
import {
  normalizarPrefijo,
  type BaseCalculo,
  type FilaCatalogoPrevalidador,
} from "@/lib/balance/prevalidador/catalogo";

export type MovimientoContableModulo = {
  debitos: number;
  creditos: number;
  saldoFinal: number;
};

export type ReglaContableModulo = Pick<
  FilaCatalogoPrevalidador,
  "moduloCodigo" | "cuentaRussell" | "baseCalculo" | "activa"
>;

/**
 * Regla activa más específica del módulo que cubre una cuenta Russell. Un
 * catálogo con 23 y 2335 debe resolver 2335 para esa cuenta, no la fila 23.
 */
export function resolverReglaContableModulo(
  moduloCodigo: string,
  cuentaRussell: string | null | undefined,
  catalogo: readonly ReglaContableModulo[],
): ReglaContableModulo | null {
  const codigo = normalizarPrefijo(cuentaRussell);
  if (!codigo) return null;
  const modulo = moduloCodigo.trim().toUpperCase();
  let mejor: ReglaContableModulo | null = null;
  for (const fila of catalogo) {
    if (!fila.activa || fila.moduloCodigo.toUpperCase() !== modulo) continue;
    const prefijo = normalizarPrefijo(fila.cuentaRussell);
    if (!prefijo || !codigo.startsWith(prefijo)) continue;
    if (!mejor || prefijo.length > normalizarPrefijo(mejor.cuentaRussell).length) mejor = fila;
  }
  return mejor;
}

/**
 * Convención de presentación del prevalidador aplicada al lado contable del
 * cruce de módulos. Ingresos y nómina usan movimiento del período; activos,
 * cartera, inventarios y pasivos usan saldo. Las naturalezas crédito se muestran
 * positivas mediante el mismo factor que el prevalidador.
 */
export function valorPresentadoSegunRegla(
  fila: MovimientoContableModulo,
  regla: Pick<ReglaContableModulo, "cuentaRussell" | "baseCalculo">,
): number {
  const bruto = regla.baseCalculo === "movimiento"
    ? fila.debitos - fila.creditos
    : fila.saldoFinal;
  return redondear(factorPresentacion(regla.cuentaRussell) * bruto);
}

export function calcularValorContableModulo(args: {
  moduloCodigo: string;
  cuentaRussell: string | null | undefined;
  fila: MovimientoContableModulo;
  catalogo: readonly ReglaContableModulo[];
}): { valor: number; baseCalculo: BaseCalculo; cuentaRegla: string } | null {
  const regla = resolverReglaContableModulo(
    args.moduloCodigo,
    args.cuentaRussell,
    args.catalogo,
  );
  if (!regla) return null;
  return {
    valor: valorPresentadoSegunRegla(args.fila, regla),
    baseCalculo: regla.baseCalculo,
    cuentaRegla: normalizarPrefijo(regla.cuentaRussell),
  };
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100 + 0 || 0;
}
