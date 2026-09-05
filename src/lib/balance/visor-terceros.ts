// Lógica PURA del visor interno de solo lectura «Balance por terceros» (`/balance/[id]/terceros`).
//
// Compara, cuenta a cuenta, el detalle del balance normal (`balance_prueba_detalle`)
// contra el detalle de su balance por tercero LIGADO (`balance_tercero_detalle`, mismo
// `loteId` — ver CLAUDE.md § «Balance por tercero») para verificar que la homologación
// al plan estándar Russell se replicó correctamente y que el saldo consolidado de los
// terceros cuadra con el saldo oficial de la cuenta. Mismo espíritu que el prevalidador
// (`src/lib/balance/prevalidador/`): NO propone ni corrige, solo agrega y avisa.
//
// Sin BD ni `server-only`: recibe filas ya resueltas por el loader del servidor.
import { filasEfectivasTercero, esFilaPropiaDeCuenta } from "./staging-tercero";
import type { IdentidadTercero } from "./identidad-tercero";
import { MONTOS_CERO, sumarMontos, diferenciasMontos as calcularDiferenciasMontos, montosCuadran, type Montos4 } from "./montos-cruce";

/** Tolerancia numérica para comparar montos (redondeos de Decimal→number). */
const EPSILON_SALDO = 0.01;

/** Ninguna homologación (cuenta pendiente de mapear): distinto de una lista vacía. */
const SIN_HOMOLOGAR = "SIN_HOMOLOGAR";

export type FilaCuentaBalanceVisor = {
  cuenta8: string;
  nombreCuenta: string;
  cuenta6Russell: string | null;
  saldoInicial: number;
  debitos: number;
  creditos: number;
  saldoFinal: number;
};

export type FilaDetalleTerceroVisor = {
  identidadTercero?: IdentidadTercero;
  cuenta8: string;
  nombreCuenta: string;
  nitTercero: string | null;
  nombreTercero: string | null;
  cuenta6Russell: string | null;
  saldoInicial: number;
  debitos: number;
  creditos: number;
  saldoFinal: number;
};

/** Una fila del detalle por tercero, ya lista para pintar. */
export type TerceroVisor = {
  identidadTercero?: IdentidadTercero;
  nitTercero: string | null;
  nombreTercero: string | null;
  /** Fila «propia» de la cuenta (sin NIT ni nombre de tercero, `staging-tercero.ts`): no es un tercero real. */
  esFilaPropia: boolean;
  cuenta6Russell: string | null;
  saldoInicial: number;
  debitos: number;
  creditos: number;
  saldoFinal: number;
};

export type ComparacionCuentaTerceros = {
  cuenta8: string;
  nombreCuenta: string;
  /** La cuenta existe en el detalle del balance (`balance_prueba_detalle`). */
  enBalance: boolean;
  /** La cuenta tiene al menos una fila en el detalle por tercero ligado. */
  enTercero: boolean;
  cuenta6RussellBalance: string | null;
  saldoInicialBalance: number;
  debitosBalance: number;
  creditosBalance: number;
  saldoFinalBalance: number;
  /** Homologación consolidada del lado tercero: null si es inconsistente o no aplica. */
  cuenta6RussellTercero: string | null;
  /** Las filas de tercero de esta cuenta traen MÁS de una homologación distinta entre sí. */
  homologacionInconsistente: boolean;
  /** Σ saldoFinal de las filas EFECTIVAS (`filasEfectivasTercero`: sin doble conteo de la fila propia). Conservado por compatibilidad; ver `montosTercero`. */
  saldoConsolidadoTercero: number;
  /** Los cuatro componentes (SI/Db/Cr/SF) del lado balance para esta cuenta; `MONTOS_CERO` si no existe en el balance. */
  montosBalance: Montos4;
  /** Los cuatro componentes consolidados EFECTIVOS del lado tercero (misma deduplicación que `saldoConsolidadoTercero`); `MONTOS_CERO` si no hay filas. */
  montosTercero: Montos4;
  /** Diferencia firmada por componente: `montosBalance - montosTercero`. `MONTOS_CERO` cuando falta un lado (no se inventa una diferencia sin datos del otro lado). */
  diferenciasMontos: Montos4;
  /** Todas las filas crudas del lado tercero para esta cuenta (incluida la propia, si existe). */
  terceros: TerceroVisor[];
  /** La homologación del balance no coincide con la consolidada del lado tercero (o esta es inconsistente). */
  diferenciaHomologacion: boolean;
  /** El saldo final del balance no coincide con el consolidado efectivo del lado tercero (tolerancia de redondeo). Conservado por compatibilidad; el saldo final es uno de los cuatro componentes de `diferenciasMontos`/`tieneDiferenciaImportes`, que NO toleran redondeo. */
  diferenciaSaldo: boolean;
  /** Cualquiera de los cuatro componentes (SI/Db/Cr/SF) difiere, aunque sea en un centavo: sin umbral de materialidad. */
  tieneDiferenciaImportes: boolean;
  /** Falta un lado completo: la cuenta no aparece en el balance o no aparece en el detalle por tercero. */
  incompleto: boolean;
  /** Resumen para filtrar: incompleto o alguna diferencia (homologación o cualquier componente de importes). */
  tieneDiferencia: boolean;
};

function claveHomologacion(cuenta6Russell: string | null): string {
  return cuenta6Russell ?? SIN_HOMOLOGAR;
}

/**
 * Compara el detalle del balance contra el detalle por tercero ligado, cuenta a cuenta.
 * Determinista: el orden de entrada no afecta el resultado (se reordena por `cuenta8`).
 */
export function construirComparacionCuentasTerceros(
  filasBalance: readonly FilaCuentaBalanceVisor[],
  filasTercero: readonly FilaDetalleTerceroVisor[],
): ComparacionCuentaTerceros[] {
  const balancePorCuenta = new Map<string, FilaCuentaBalanceVisor>();
  const homologacionesBalance = new Map<string, Set<string>>();
  for (const f of filasBalance) {
    const previa = balancePorCuenta.get(f.cuenta8);
    const montos: Montos4 = { saldoInicial: f.saldoInicial, debitos: f.debitos, creditos: f.creditos, saldoFinal: f.saldoFinal };
    balancePorCuenta.set(f.cuenta8, previa ? { ...previa, ...sumarMontos(previa, montos) } : { ...f });
    const homologaciones = homologacionesBalance.get(f.cuenta8) ?? new Set<string>();
    homologaciones.add(claveHomologacion(f.cuenta6Russell));
    homologacionesBalance.set(f.cuenta8, homologaciones);
  }

  const terceroPorCuenta = new Map<string, FilaDetalleTerceroVisor[]>();
  for (const t of filasTercero) {
    const lista = terceroPorCuenta.get(t.cuenta8);
    if (lista) lista.push(t);
    else terceroPorCuenta.set(t.cuenta8, [t]);
  }

  const cuentas = new Set<string>([...balancePorCuenta.keys(), ...terceroPorCuenta.keys()]);

  const out: ComparacionCuentaTerceros[] = [];
  for (const cuenta8 of cuentas) {
    const b = balancePorCuenta.get(cuenta8) ?? null;
    const filasCuenta = terceroPorCuenta.get(cuenta8) ?? [];
    // Deduplicación oficial: si hay terceros reales, la fila propia NO suma (evita
    // doblar el consolidado); una cuenta sin terceros conserva su(s) fila(s) propia(s).
    const efectivas = filasEfectivasTercero(filasCuenta);

    const homologaciones = new Set(efectivas.map((t) => claveHomologacion(t.cuenta6Russell)));
    const homologacionInconsistente = homologaciones.size > 1;
    const cuenta6RussellTercero = homologacionInconsistente
      ? null
      : (efectivas[0]?.cuenta6Russell ?? null);

    const montosTercero = efectivas.reduce<Montos4>(
      (acc, t) => sumarMontos(acc, { saldoInicial: t.saldoInicial, debitos: t.debitos, creditos: t.creditos, saldoFinal: t.saldoFinal }),
      MONTOS_CERO,
    );
    const saldoConsolidadoTercero = montosTercero.saldoFinal;

    const enBalance = b != null;
    const enTercero = filasCuenta.length > 0;
    const incompleto = !enBalance || !enTercero;

    const montosBalance: Montos4 = b
      ? { saldoInicial: b.saldoInicial, debitos: b.debitos, creditos: b.creditos, saldoFinal: b.saldoFinal }
      : MONTOS_CERO;
    // Sin datos de un lado no se inventa una diferencia (mismo criterio que diferenciaHomologacion).
    const diferencias = enBalance && enTercero ? calcularDiferenciasMontos(montosBalance, montosTercero) : MONTOS_CERO;
    const tieneDiferenciaImportes = enBalance && enTercero && !montosCuadran(diferencias);

    const diferenciaHomologacion =
      enBalance && enTercero && (homologacionInconsistente || (homologacionesBalance.get(cuenta8)?.size ?? 0) > 1 || b!.cuenta6Russell !== cuenta6RussellTercero);
    const diferenciaSaldo =
      enBalance && enTercero && Math.abs(b!.saldoFinal - saldoConsolidadoTercero) > EPSILON_SALDO;

    out.push({
      cuenta8,
      nombreCuenta: b?.nombreCuenta ?? filasCuenta[0]?.nombreCuenta ?? "",
      enBalance,
      enTercero,
      cuenta6RussellBalance: b?.cuenta6Russell ?? null,
      saldoInicialBalance: b?.saldoInicial ?? 0,
      debitosBalance: b?.debitos ?? 0,
      creditosBalance: b?.creditos ?? 0,
      saldoFinalBalance: b?.saldoFinal ?? 0,
      cuenta6RussellTercero,
      homologacionInconsistente,
      saldoConsolidadoTercero,
      montosBalance,
      montosTercero,
      diferenciasMontos: diferencias,
      terceros: filasCuenta.map((t) => ({
        nitTercero: t.nitTercero,
        nombreTercero: t.nombreTercero,
        ...(t.identidadTercero ? { identidadTercero: t.identidadTercero } : {}),
        esFilaPropia: esFilaPropiaDeCuenta(t),
        cuenta6Russell: t.cuenta6Russell,
        saldoInicial: t.saldoInicial,
        debitos: t.debitos,
        creditos: t.creditos,
        saldoFinal: t.saldoFinal,
      })),
      diferenciaHomologacion,
      diferenciaSaldo,
      tieneDiferenciaImportes,
      incompleto,
      tieneDiferencia: incompleto || diferenciaHomologacion || diferenciaSaldo || tieneDiferenciaImportes,
    });
  }

  out.sort((a, b) => a.cuenta8.localeCompare(b.cuenta8, undefined, { numeric: true }));
  return out;
}

/** Resumen agregado para los `StatCard` de la cabecera del visor. */
export type ResumenComparacionTerceros = {
  totalCuentas: number;
  conDiferencia: number;
  incompletas: number;
  saldoBalance: number;
  saldoTercero: number;
};

export function resumirComparacionTerceros(filas: readonly ComparacionCuentaTerceros[]): ResumenComparacionTerceros {
  let conDiferencia = 0;
  let incompletas = 0;
  let saldoBalance = 0;
  let saldoTercero = 0;
  for (const f of filas) {
    if (f.tieneDiferencia) conDiferencia++;
    if (f.incompleto) incompletas++;
    saldoBalance += f.saldoFinalBalance;
    saldoTercero += f.saldoConsolidadoTercero;
  }
  return { totalCuentas: filas.length, conDiferencia, incompletas, saldoBalance, saldoTercero };
}

export type FiltroComparacionTerceros = {
  /** Coincide contra cuenta, nombre de cuenta, NIT o nombre de cualquiera de sus terceros. */
  q?: string;
  /** Solo cuentas con alguna diferencia u omisión (`tieneDiferencia`). */
  soloDiferencias?: boolean;
};

function normalizar(texto: string): string {
  return texto.trim().toLowerCase();
}

/** Filtra la comparación por texto libre y/o «solo diferencias». Determinista y puro. */
export function filtrarComparacionTerceros(
  filas: readonly ComparacionCuentaTerceros[],
  filtro: FiltroComparacionTerceros,
): ComparacionCuentaTerceros[] {
  const q = filtro.q ? normalizar(filtro.q) : "";
  return filas.filter((f) => {
    if (filtro.soloDiferencias && !f.tieneDiferencia) return false;
    if (!q) return true;
    if (normalizar(f.cuenta8).includes(q)) return true;
    if (normalizar(f.nombreCuenta).includes(q)) return true;
    return f.terceros.some(
      (t) => (t.nitTercero && normalizar(t.nitTercero).includes(q)) || (t.nombreTercero && normalizar(t.nombreTercero).includes(q)),
    );
  });
}
