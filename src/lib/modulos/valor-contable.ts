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
  baseEfectiva?: BaseCalculo,
): number {
  const base = baseEfectiva ?? regla.baseCalculo;
  const bruto = base === "movimiento"
    ? fila.debitos - fila.creditos
    : fila.saldoFinal;
  return redondear(factorPresentacion(regla.cuentaRussell) * bruto);
}

export function calcularValorContableModulo(args: {
  moduloCodigo: string;
  cuentaRussell: string | null | undefined;
  fila: MovimientoContableModulo;
  catalogo: readonly ReglaContableModulo[];
  /**
   * Base que MANDA sobre la del catálogo: Nómina lee por saldo el balance del mes final de un
   * rango que arranca en enero (D7), aunque su regla sea de movimiento.
   */
  baseEfectiva?: BaseCalculo;
  /**
   * Naturaleza del módulo (Cartera «D», CxP «C»). Con ella todas sus cuentas se leen con el MISMO
   * factor —«D» con el signo del balance, «C» invertido— y no con el de cada cuenta: un anticipo
   * 2805 resta en Cartera igual que en el auxiliar, en vez de mostrarse positivo por ser pasivo.
   */
  naturaleza?: "D" | "C";
}): { valor: number; baseCalculo: BaseCalculo; cuentaRegla: string } | null {
  const regla = resolverReglaContableModulo(
    args.moduloCodigo,
    args.cuentaRussell,
    args.catalogo,
  );
  if (!regla) return null;
  const baseCalculo = args.baseEfectiva ?? regla.baseCalculo;
  const valor = args.naturaleza
    ? redondear((args.naturaleza === "C" ? -1 : 1) * (baseCalculo === "movimiento" ? args.fila.debitos - args.fila.creditos : args.fila.saldoFinal))
    : valorPresentadoSegunRegla(args.fila, regla, args.baseEfectiva);
  return { valor, baseCalculo, cuentaRegla: normalizarPrefijo(regla.cuentaRussell) };
}

/**
 * Valor contable de una fila para el cruce POR TERCERO: la misma lectura del cruce contable, con la
 * naturaleza del módulo. Sin naturaleza se conserva el factor por cuenta del prevalidador.
 */
export function calcularValorContableTercero(args: {
  moduloCodigo: string;
  cuentaRussell: string | null | undefined;
  fila: MovimientoContableModulo;
  catalogo: readonly ReglaContableModulo[];
  naturaleza?: "D" | "C";
}): { valor: number; baseCalculo: BaseCalculo; cuentaRegla: string } | null {
  return calcularValorContableModulo(args);
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100 + 0 || 0;
}
