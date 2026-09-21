// VALOR CONTABLE del lado del balance en el cruce de un módulo — puro.
//
// Todos los módulos se concilian contra el SALDO FINAL del balance (confirmado con los usuarios el
// 21/Sep/2026, también Ingresos y Nómina): el balance que termina en el mes de corte del cargue se
// lee por su saldo final, sin importar desde cuándo arranca ni sus débitos y créditos. La base de
// cálculo del catálogo del prevalidador (saldo | movimiento) rige solo el INFORME del prevalidador;
// aquí la regla activa del módulo sigue siendo obligatoria (sin ella la fila no se valora) pero solo
// aporta el signo de presentación de su prefijo.
import {
  factorPresentacion,
} from "@/lib/balance/prevalidador/calcular";
import {
  normalizarPrefijo,
  type FilaCatalogoPrevalidador,
} from "@/lib/balance/prevalidador/catalogo";

export type MovimientoContableModulo = {
  debitos: number;
  creditos: number;
  saldoFinal: number;
};

export type ReglaContableModulo = Pick<
  FilaCatalogoPrevalidador,
  "moduloCodigo" | "cuentaRussell" | "activa"
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
 * Saldo final de la fila con la convención de presentación del prevalidador: las naturalezas
 * crédito (pasivos, ingresos) se muestran positivas con el mismo factor por prefijo.
 */
export function valorPresentadoSegunRegla(
  fila: Pick<MovimientoContableModulo, "saldoFinal">,
  regla: Pick<ReglaContableModulo, "cuentaRussell">,
): number {
  return redondear(factorPresentacion(regla.cuentaRussell) * fila.saldoFinal);
}

export function calcularValorContableModulo(args: {
  moduloCodigo: string;
  cuentaRussell: string | null | undefined;
  fila: MovimientoContableModulo;
  catalogo: readonly ReglaContableModulo[];
  /**
   * Naturaleza del módulo (Cartera «D», CxP «C»). Con ella todas sus cuentas se leen con el MISMO
   * factor —«D» con el signo del balance, «C» invertido— y no con el de cada cuenta: un anticipo
   * 2805 resta en Cartera igual que en el auxiliar, en vez de mostrarse positivo por ser pasivo.
   */
  naturaleza?: "D" | "C";
  /**
   * La cuenta es ADICIONAL a la cédula (Nómina 251010, Ingresos 422005) o del período: el catálogo
   * no la cubre y la cuenta misma hace de regla (su clase fija el signo).
   */
  adicional?: boolean;
  /**
   * Naturaleza de presentación de la CUENTA cuando el módulo no fija una: la depreciación 1592 es
   * crédito aunque la regla del activo (15) sea débito.
   */
  naturalezaCuenta?: "D" | "C";
}): { valor: number; cuentaRegla: string } | null {
  const regla: Pick<ReglaContableModulo, "cuentaRussell"> | null = args.adicional
    ? { cuentaRussell: normalizarPrefijo(args.cuentaRussell) }
    : resolverReglaContableModulo(args.moduloCodigo, args.cuentaRussell, args.catalogo);
  if (!regla || !regla.cuentaRussell) return null;
  const naturaleza = args.naturaleza ?? args.naturalezaCuenta;
  const valor = naturaleza
    ? redondear((naturaleza === "C" ? -1 : 1) * args.fila.saldoFinal)
    : valorPresentadoSegunRegla(args.fila, regla);
  return { valor, cuentaRegla: normalizarPrefijo(regla.cuentaRussell) };
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
  /** Cuenta que el catálogo no cubre (una cuenta del período). */
  adicional?: boolean;
}): { valor: number; cuentaRegla: string } | null {
  return calcularValorContableModulo(args);
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100 + 0 || 0;
}
