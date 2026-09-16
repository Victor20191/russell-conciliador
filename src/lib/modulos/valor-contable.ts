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
  /**
   * Base propia de una cuenta ADICIONAL de la cédula (Nómina 251010, Ingresos 422005): manda sobre
   * el catálogo, que no la cubre, y la cuenta misma hace de regla (su clase fija el signo).
   */
  baseAdicional?: BaseCalculo;
  /**
   * Naturaleza de presentación de la CUENTA cuando el módulo no fija una: la depreciación 1592 es
   * crédito aunque la regla del activo (15) sea débito.
   */
  naturalezaCuenta?: "D" | "C";
}): { valor: number; baseCalculo: BaseCalculo; cuentaRegla: string } | null {
  const regla: Pick<ReglaContableModulo, "cuentaRussell" | "baseCalculo"> | null = args.baseAdicional
    ? { cuentaRussell: normalizarPrefijo(args.cuentaRussell), baseCalculo: args.baseAdicional }
    : resolverReglaContableModulo(args.moduloCodigo, args.cuentaRussell, args.catalogo);
  if (!regla || !regla.cuentaRussell) return null;
  const baseCalculo = args.baseEfectiva ?? regla.baseCalculo;
  const bruto = baseCalculo === "movimiento" ? args.fila.debitos - args.fila.creditos : args.fila.saldoFinal;
  const naturaleza = args.naturaleza ?? args.naturalezaCuenta;
  const valor = naturaleza
    ? redondear((naturaleza === "C" ? -1 : 1) * bruto)
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
