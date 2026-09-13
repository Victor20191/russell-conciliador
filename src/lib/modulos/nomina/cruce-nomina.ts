// CRUCE CONTABLE de Nómina, las dos piezas que la cédula Russell a 6 dígitos no da (D1, D6):
//
//  1. VISTA POR SUBCUENTA PUC SUMANDO CLASES — el papel que hace el auditor (Kakaraka, Pure
//     Nature): un renglón por subcuenta del gasto de personal (06 sueldos, 15 horas extras,
//     18 comisiones, 24 incapacidades, 27 aux. transporte, 45 auxilios, 48 bonificaciones,
//     60 indemnizaciones…); el lado contable es la Σ de las cuentas del cliente con esa
//     subcuenta en TODAS las clases (510506 + 520506 + 720506) y el lado módulo la Σ de los
//     conceptos cuya subcuenta coincide. No exige regla de clase ni reparto: cuadra aunque la
//     clase la ponga el centro de costo (SIIGO «00»). Russell 6 no la puede reproducir porque
//     colapsa esas subcuentas en «xx95 Otros».
//  2. CONTROL DE DEDUCCIONES — los conceptos cuya cuenta del cliente es de pasivo/activo/
//     ingreso (libranzas 2370, retención 2365, embargos 237025, préstamos 1365, intereses
//     4210): un renglón por cuenta del cliente con la Σ del módulo (negativa) contra el
//     movimiento de esa cuenta en el balance. Solo informa: no suma al gasto ni bloquea.
//
// BASE CONTABLE (D7): `movimiento` = débitos − créditos del balance que cubre exactamente el
// rango del cargue; `saldo_acumulado` = saldo final del balance del mes final cuando el rango
// arranca en enero (las cuentas de resultado acumulan el año). Se recibe ya decidida.
//
// Puro: sin BD. Pruebas en `cruce-nomina.test.ts`.

import type { RangoCargue } from "../compuerta-cruce";
import { etiquetaSubcuentaPuc } from "./grupos-concepto";
import { digitosCuenta, esClaseNomina } from "./homologacion";
import type { RenglonConsolidadoNomina } from "./consolidado-nomina";

export type BaseContableNomina = "movimiento" | "saldo_acumulado";

/** Fila IMPUTABLE del balance (las agrupadoras ya vienen excluidas por el prevalidador). */
export type FilaBalanceNomina = {
  cuenta8: string;
  nombreCuenta: string;
  debitos: number;
  creditos: number;
  saldoFinal: number;
};

export type CuentaSubcuenta = { cuenta8: string; nombre: string; clase: string; valor: number };
export type ConceptoSubcuenta = { clasificador: string; codigo: string; agrupador: string; descripcion: string | null; total: number };

export type FilaSubcuentaNomina = {
  subcuenta: string;
  etiqueta: string;
  contable: number;
  modulo: number;
  diferencia: number;
  cuadra: boolean;
  estado: "cuadra" | "descuadre" | "solo_contable" | "solo_modulo";
  cuentas: CuentaSubcuenta[];
  conceptos: ConceptoSubcuenta[];
};

export type VistaSubcuentaNomina = {
  base: BaseContableNomina;
  filas: FilaSubcuentaNomina[];
  totales: { contable: number; modulo: number; diferencia: number };
  /** Conceptos de gasto cuya subcuenta no se conoce (sin cuenta del cliente ni memoria). */
  sinSubcuenta: ConceptoSubcuenta[];
};

export type FilaControlDeducciones = {
  /** Cuenta del cliente como la trae la memoria (dígitos). */
  cuentaCliente: string;
  nombre: string | null;
  /** Cuentas del balance con las que se comparó (exacta o hijas). */
  cuentasBalance: string[];
  contable: number | null;
  modulo: number;
  diferencia: number | null;
  cuadra: boolean;
  conceptos: ConceptoSubcuenta[];
};

export type ControlDeduccionesNomina = {
  base: BaseContableNomina;
  filas: FilaControlDeducciones[];
  totales: { contable: number; modulo: number; diferencia: number };
};

const redondear = (v: number): number => Math.round(v * 100) / 100 + 0 || 0;

/**
 * Valor contable de una fila en la convención del balance (débito positivo, crédito negativo):
 * el gasto queda positivo y las deducciones acreditadas a pasivo quedan negativas, igual que
 * las deducciones del módulo.
 */
export function valorContableNomina(fila: Pick<FilaBalanceNomina, "debitos" | "creditos" | "saldoFinal">, base: BaseContableNomina): number {
  return redondear(base === "movimiento" ? fila.debitos - fila.creditos : fila.saldoFinal);
}

/** ¿La cuenta del cliente es del gasto/costo de personal que concilia el módulo (51/52/72/73 + prefijos)? */
function esCuentaGastoPersonal(cuenta8: string, prefijos: readonly string[]): boolean {
  if (!esClaseNomina(cuenta8.slice(0, 2))) return false;
  return prefijos.some((p) => cuenta8.startsWith(p));
}

const conceptoDe = (r: RenglonConsolidadoNomina): ConceptoSubcuenta => ({
  clasificador: r.clasificador,
  codigo: r.codigo,
  agrupador: r.agrupador,
  descripcion: r.descripcion,
  total: r.total,
});

export function construirVistaSubcuenta(input: {
  balance: readonly FilaBalanceNomina[];
  renglones: readonly RenglonConsolidadoNomina[];
  /** Prefijos del módulo en el prevalidador (5105, 5205, 7205, 7305). */
  prefijos: readonly string[];
  base: BaseContableNomina;
  tolerancia?: number;
}): VistaSubcuentaNomina {
  const tolerancia = input.tolerancia ?? 0.01;
  const porSub = new Map<string, { cuentas: CuentaSubcuenta[]; conceptos: ConceptoSubcuenta[] }>();
  const bucket = (sub: string) => {
    const b = porSub.get(sub) ?? { cuentas: [], conceptos: [] };
    porSub.set(sub, b);
    return b;
  };
  for (const f of input.balance) {
    const cuenta8 = digitosCuenta(f.cuenta8);
    if (cuenta8.length < 6 || !esCuentaGastoPersonal(cuenta8, input.prefijos)) continue;
    bucket(cuenta8.slice(4, 6)).cuentas.push({ cuenta8, nombre: f.nombreCuenta, clase: cuenta8.slice(0, 2), valor: valorContableNomina(f, input.base) });
  }
  const sinSubcuenta: ConceptoSubcuenta[] = [];
  for (const r of input.renglones) {
    if (r.sugerencia.destino !== "gasto") continue;
    const sub = r.sugerencia.subcuentaPuc;
    if (!sub) { sinSubcuenta.push(conceptoDe(r)); continue; }
    bucket(sub).conceptos.push(conceptoDe(r));
  }
  const filas: FilaSubcuentaNomina[] = [...porSub.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([subcuenta, b]) => {
      const contable = redondear(b.cuentas.reduce((s, c) => s + c.valor, 0));
      const modulo = redondear(b.conceptos.reduce((s, c) => s + c.total, 0));
      const diferencia = redondear(contable - modulo);
      const cuadra = Math.abs(diferencia) <= tolerancia;
      let estado: FilaSubcuentaNomina["estado"];
      if (modulo === 0 && contable !== 0) estado = "solo_contable";
      else if (contable === 0 && modulo !== 0) estado = "solo_modulo";
      else estado = cuadra ? "cuadra" : "descuadre";
      return {
        subcuenta,
        etiqueta: etiquetaSubcuentaPuc(subcuenta),
        contable,
        modulo,
        diferencia,
        cuadra,
        estado,
        cuentas: b.cuentas.sort((x, y) => x.cuenta8.localeCompare(y.cuenta8)),
        conceptos: b.conceptos.sort((x, y) => Math.abs(y.total) - Math.abs(x.total)),
      };
    });
  const totales = filas.reduce(
    (acc, f) => ({ contable: acc.contable + f.contable, modulo: acc.modulo + f.modulo, diferencia: acc.diferencia + f.diferencia }),
    { contable: 0, modulo: 0, diferencia: 0 },
  );
  return {
    base: input.base,
    filas,
    totales: { contable: redondear(totales.contable), modulo: redondear(totales.modulo), diferencia: redondear(totales.diferencia) },
    sinSubcuenta,
  };
}

/**
 * Cuenta del cliente COMPARABLE con el balance: SIIGO imprime «2370300100» (10 dígitos, con
 * un par «00» de relleno) y el balance trae «23703001». Se prueba el código tal cual y, si no
 * hay fila, se le quitan pares «00» del final (nunca por debajo de 6 dígitos) hasta que alguna
 * cuenta del balance empiece por él: así «1365950000» compara contra 13659501 + 13659502.
 */
export function emparejarCuentaControl(cuentaCliente: string, balance: readonly FilaBalanceNomina[]): FilaBalanceNomina[] {
  let clave = digitosCuenta(cuentaCliente);
  while (clave.length >= 6) {
    const exacta = balance.filter((f) => digitosCuenta(f.cuenta8) === clave);
    if (exacta.length > 0) return exacta;
    const hijas = balance.filter((f) => digitosCuenta(f.cuenta8).startsWith(clave));
    if (hijas.length > 0) return hijas;
    if (!clave.endsWith("00") || clave.length - 2 < 6) break;
    clave = clave.slice(0, -2);
  }
  return [];
}

export function construirControlDeducciones(input: {
  balance: readonly FilaBalanceNomina[];
  renglones: readonly RenglonConsolidadoNomina[];
  base: BaseContableNomina;
  tolerancia?: number;
}): ControlDeduccionesNomina {
  const tolerancia = input.tolerancia ?? 0.01;
  const porCuenta = new Map<string, ConceptoSubcuenta[]>();
  for (const r of input.renglones) {
    if (r.sugerencia.destino !== "control") continue;
    const cuenta = digitosCuenta(r.sugerencia.cuentaCliente) || "?";
    porCuenta.set(cuenta, [...(porCuenta.get(cuenta) ?? []), conceptoDe(r)]);
  }
  const filas: FilaControlDeducciones[] = [...porCuenta.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cuentaCliente, conceptos]) => {
      const modulo = redondear(conceptos.reduce((s, c) => s + c.total, 0));
      const emparejadas = cuentaCliente === "?" ? [] : emparejarCuentaControl(cuentaCliente, input.balance);
      const contable = emparejadas.length > 0 ? redondear(emparejadas.reduce((s, f) => s + valorContableNomina(f, input.base), 0)) : null;
      const diferencia = contable == null ? null : redondear(contable - modulo);
      return {
        cuentaCliente,
        nombre: emparejadas[0]?.nombreCuenta ?? null,
        cuentasBalance: emparejadas.map((f) => digitosCuenta(f.cuenta8)),
        contable,
        modulo,
        diferencia,
        cuadra: diferencia != null && Math.abs(diferencia) <= tolerancia,
        conceptos: conceptos.sort((x, y) => Math.abs(y.total) - Math.abs(x.total)),
      };
    });
  const totales = filas.reduce(
    (acc, f) => ({ contable: acc.contable + (f.contable ?? 0), modulo: acc.modulo + f.modulo, diferencia: acc.diferencia + (f.diferencia ?? 0) }),
    { contable: 0, modulo: 0, diferencia: 0 },
  );
  return {
    base: input.base,
    filas,
    totales: { contable: redondear(totales.contable), modulo: redondear(totales.modulo), diferencia: redondear(totales.diferencia) },
  };
}

/** Concepto «multi» sin reparto guardado, con la sugerencia proporcional al balance (D4). */
export type RepartoPendienteVm = {
  clasificador: string;
  codigo: string;
  agrupador: string;
  descripcion: string | null;
  total: number;
  cuentas: string[];
  sugerido: Record<string, number>;
  /** Movimiento contable de cada cuenta candidata (para el editor). */
  contablePorCuenta: Record<string, number>;
};

/** Lo que el cruce de Nómina añade al resultado común (pestaña, exportación y cierre). */
export type ResultadoCruceNomina = {
  rango: RangoCargue;
  base: BaseContableNomina | null;
  vistaSubcuenta: VistaSubcuentaNomina | null;
  control: ControlDeduccionesNomina | null;
  repartosPendientes: RepartoPendienteVm[];
  /** Repartos guardados (clave del consolidado → cuenta → valor). */
  repartos: RepartoConcepto[];
  /** Conceptos que entraron a la cédula por reparto. */
  repartidos: number;
  renglones: RenglonConsolidadoNomina[];
};

// ===== Lado módulo de la cédula formal (Russell 6) =====

export type RepartoConcepto = { clasificador: string; valores: Record<string, number> };

export type EntradaCruceFormal = { clasificador: string; total: number; cuentas4: string[] };

/**
 * Lo que entra a la cédula Russell 6 desde el consolidado de Nómina. Solo cuentan las vías
 * DETERMINISTAS (cuenta del archivo, memoria exacta, memoria + clase); una sugerencia por
 * nombre no cruza hasta que el auditor la guarde. Los `multi` cruzan por su REPARTO (RF-NOM-12)
 * y, sin reparto, quedan como «asignado a varias» (ambiguo). Control y fuera no entran.
 */
export function entradasCruceFormalNomina(renglones: readonly RenglonConsolidadoNomina[], repartos: readonly RepartoConcepto[]): {
  entradas: EntradaCruceFormal[];
  /** Renglones que cruzan por reparto (para la UI). */
  repartidos: number;
  /** Renglones «multi» sin reparto. */
  pendientesReparto: RenglonConsolidadoNomina[];
} {
  const repartoPor = new Map(repartos.map((r) => [r.clasificador, r.valores]));
  const entradas: EntradaCruceFormal[] = [];
  const pendientesReparto: RenglonConsolidadoNomina[] = [];
  let repartidos = 0;
  for (const r of renglones) {
    const s = r.sugerencia;
    if (s.destino !== "gasto") continue;
    const reparto = repartoPor.get(r.clasificador);
    if (reparto && Object.keys(reparto).length > 0) {
      repartidos++;
      for (const [cuenta, valor] of Object.entries(reparto)) {
        if (valor === 0) continue;
        entradas.push({ clasificador: `${r.clasificador} → ${cuenta}`, total: redondear(valor), cuentas4: [cuenta] });
      }
      continue;
    }
    if (s.via === "multi") {
      pendientesReparto.push(r);
      entradas.push({ clasificador: r.clasificador, total: r.total, cuentas4: [...s.cuentas] });
      continue;
    }
    const determinista = s.via === "archivo" || s.via === "memoria_exacta" || s.via === "memoria_clase";
    if (determinista && s.cuentas.length === 1) entradas.push({ clasificador: r.clasificador, total: r.total, cuentas4: [s.cuentas[0]] });
    else entradas.push({ clasificador: r.clasificador, total: r.total, cuentas4: [] });
  }
  return { entradas, repartidos, pendientesReparto };
}

/** Σ del reparto vs total del concepto: el reparto debe cerrar al centavo. */
export function validarReparto(total: number, valores: Record<string, number>, tolerancia = 0.01): string | null {
  const suma = Object.values(valores).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
  if (Object.keys(valores).length === 0) return "Indica al menos una cuenta con valor.";
  if (Object.values(valores).some((v) => !Number.isFinite(v))) return "Todos los valores deben ser números.";
  if (Math.abs(suma - total) > tolerancia) return `La suma del reparto (${suma.toLocaleString("es-CO")}) no cierra con el total del concepto (${total.toLocaleString("es-CO")}).`;
  return null;
}
