// CRUCE CONTABLE de Nómina, las dos piezas que la cédula Russell a 6 dígitos no da (D1, D6):
//
//  1. VISTA POR SUBCUENTA PUC SUMANDO CLASES — el papel que hace el auditor (Kakaraka, Pure
//     Nature): un renglón por subcuenta del gasto de personal (06 sueldos, 15 horas extras,
//     18 comisiones, 24 incapacidades, 27 aux. transporte, 45 auxilios, 48 bonificaciones,
//     60 indemnizaciones…); el lado contable es la Σ de las cuentas del cliente con esa
//     subcuenta en TODAS las clases (510506 + 520506 + 720506) y el lado módulo la Σ de los
//     conceptos cuya subcuenta coincide. No exige regla de clase: cuadra aunque la
//     clase la ponga el centro de costo (SIIGO «00»). Russell 6 no la puede reproducir porque
//     colapsa esas subcuentas en «xx95 Otros». La subcuenta del concepto es la de su cuenta del
//     cliente (archivo, catálogo o memoria) y, si no la trae, la de la cuenta Russell que tiene
//     ASIGNADA (510506, 520506 y 720505 → 06; 1/Oct/2026, MOTO ZONE sin cuenta en el archivo).
//  2. CONTROL DE DEDUCCIONES — los conceptos cuya cuenta del cliente es de pasivo/activo/
//     ingreso (libranzas 2370, retención 2365, embargos 237025, préstamos 1365, intereses
//     4210): un renglón por cuenta del cliente con la Σ del módulo (negativa) contra el
//     saldo final de esa cuenta en el balance. Solo informa: no suma al gasto ni bloquea.
//
// BASE CONTABLE: el SALDO FINAL del balance que termina en el mes de corte del cargue (21/Sep/2026,
// todos los módulos). Las cuentas de resultado acumulan el año, así que el archivo de nómina
// tiene que traer lo acumulado del año hasta el corte: entran sus filas de ese año hasta el corte.
//
// Puro: sin BD. Pruebas en `cruce-nomina.test.ts`.

import { factorPresentacion } from "@/lib/balance/prevalidador/calcular";
import { etiquetaSubcuentaPuc } from "./grupos-concepto";
import { digitosCuenta, esClaseNomina, sinClaseDeGasto } from "./homologacion";
import type { RenglonConsolidadoNomina } from "./consolidado-nomina";

/** Fila IMPUTABLE del balance (las agrupadoras ya vienen excluidas por el prevalidador). */
export type FilaBalanceNomina = {
  cuenta8: string;
  nombreCuenta: string;
  debitos: number;
  creditos: number;
  saldoFinal: number;
};

export type CuentaSubcuenta = { cuenta8: string; nombre: string; clase: string; valor: number };
export type ConceptoSubcuenta = {
  clasificador: string;
  codigo: string;
  agrupador: string;
  /** Cuenta contable del cliente que trae el archivo para el renglón (distingue renglones hermanos). */
  cuentaArchivo?: string | null;
  descripcion: string | null;
  total: number;
};

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
  filas: FilaSubcuentaNomina[];
  totales: { contable: number; modulo: number; diferencia: number };
  /**
   * Subcuentas SOLO VISIBLES (las de las cuentas solo visibles de Nómina, 1/Oct/2026): se muestran al
   * final, colapsadas, y no suman a `totales`.
   */
  filasVisibles: FilaSubcuentaNomina[];
  totalesVisibles: { contable: number; modulo: number; diferencia: number };
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
  filas: FilaControlDeducciones[];
  totales: { contable: number; modulo: number; diferencia: number };
};

const redondear = (v: number): number => Math.round(v * 100) / 100 + 0 || 0;

/**
 * Valor contable de una fila: su SALDO FINAL en la convención del balance (débito positivo,
 * crédito negativo): el gasto queda positivo y las deducciones acreditadas a pasivo quedan
 * negativas, igual que las deducciones del módulo.
 */
export function valorContableNomina(fila: Pick<FilaBalanceNomina, "saldoFinal">): number {
  return redondear(fila.saldoFinal);
}

/** ¿La cuenta del cliente es del gasto/costo de personal que concilia el módulo (51/52/72/73 + prefijos)? */
function esCuentaGastoPersonal(cuenta8: string, prefijos: readonly string[]): boolean {
  if (!esClaseNomina(cuenta8.slice(0, 2))) return false;
  return prefijos.some((p) => cuenta8.startsWith(p));
}

/**
 * Subcuenta del concepto para la vista: SOLO la de su cuenta del cliente (2/Oct/2026). Los dos
 * lados de esta tabla hablan el mismo idioma —cuentas del cliente del balance contra cuentas del
 * cliente del módulo—, así que un concepto sin cuenta del cliente no aporta subcuenta: se lista
 * aparte. Antes se caía a la subcuenta de la cuenta Russell asignada y eso mezclaba los dos planes
 * en la misma tabla, con filas que no tenían contraparte posible.
 */
export function subcuentaDelConcepto(s: RenglonConsolidadoNomina["sugerencia"]): string | null {
  return s.subcuentaPuc || null;
}

const conceptoDe = (r: RenglonConsolidadoNomina): ConceptoSubcuenta => ({
  clasificador: r.clasificador,
  codigo: r.codigo,
  agrupador: r.agrupador,
  cuentaArchivo: r.cuentaArchivo,
  descripcion: r.descripcion,
  total: r.total,
});

/**
 * Subcuentas (dígitos 5-6) que SOLO tienen cuentas solo visibles en las clases del gasto de
 * personal (51/52/72/73): 30 cesantías, 36 prima, 69 aportes EPS… Una subcuenta que también tiene
 * una cuenta que concilia, o que no está en ninguna lista (la 19 de MOTO ZONE), queda arriba.
 */
export function subcuentasSoloVisibles(concilian: Iterable<string>, visibles: Iterable<string>): Set<string> {
  const subcuenta = (c: string) => {
    const d = digitosCuenta(c);
    return d.length === 6 && esClaseNomina(d.slice(0, 2)) ? d.slice(4, 6) : null;
  };
  const deLasQueConcilian = new Set([...concilian].map(subcuenta).filter((s): s is string => s != null));
  return new Set([...visibles].map(subcuenta).filter((s): s is string => s != null && !deLasQueConcilian.has(s)));
}

export function construirVistaSubcuenta(input: {
  balance: readonly FilaBalanceNomina[];
  renglones: readonly RenglonConsolidadoNomina[];
  /** Prefijos del módulo en el prevalidador (5105, 5205, 7205, 7305). */
  prefijos: readonly string[];
  /** Subcuentas solo visibles (`subcuentasSoloVisibles`): van al final, fuera de los totales. */
  subcuentasVisibles?: ReadonlySet<string>;
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
    bucket(cuenta8.slice(4, 6)).cuentas.push({ cuenta8, nombre: f.nombreCuenta, clase: cuenta8.slice(0, 2), valor: valorContableNomina(f) });
  }
  const sinSubcuenta: ConceptoSubcuenta[] = [];
  for (const r of input.renglones) {
    if (r.sugerencia.destino !== "gasto") continue;
    // Los conceptos que cruzan contra un pasivo de la cédula (251010…) no son gasto de personal:
    // la vista por subcuenta es el papel del gasto y los dejaría en el balde equivocado.
    if (r.sugerencia.cuentas.length > 0 && r.sugerencia.cuentas.every(sinClaseDeGasto)) continue;
    const sub = subcuentaDelConcepto(r.sugerencia);
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
  const sumar = (lista: readonly FilaSubcuentaNomina[]) => {
    const t = lista.reduce(
      (acc, f) => ({ contable: acc.contable + f.contable, modulo: acc.modulo + f.modulo, diferencia: acc.diferencia + f.diferencia }),
      { contable: 0, modulo: 0, diferencia: 0 },
    );
    return { contable: redondear(t.contable), modulo: redondear(t.modulo), diferencia: redondear(t.diferencia) };
  };
  const visibles = input.subcuentasVisibles ?? new Set<string>();
  const queConcilian = filas.filter((f) => !visibles.has(f.subcuenta));
  const filasVisibles = filas.filter((f) => visibles.has(f.subcuenta));
  return {
    filas: queConcilian,
    totales: sumar(queConcilian),
    filasVisibles,
    totalesVisibles: sumar(filasVisibles),
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
      const contable = emparejadas.length > 0 ? redondear(emparejadas.reduce((s, f) => s + valorContableNomina(f), 0)) : null;
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
    filas,
    totales: { contable: redondear(totales.contable), modulo: redondear(totales.modulo), diferencia: redondear(totales.diferencia) },
  };
}

/** Lo que el cruce de Nómina añade al resultado común (pestaña, exportación y cierre). */
export type ResultadoCruceNomina = {
  vistaSubcuenta: VistaSubcuentaNomina | null;
  control: ControlDeduccionesNomina | null;
  renglones: RenglonConsolidadoNomina[];
};

// ===== Lado módulo de la cédula formal (Russell 6) =====

export type EntradaCruceFormal = { clasificador: string; total: number; cuentas4: string[] };

/**
 * Separa las entradas del cruce formal entre la cédula y las cuentas SOLO VISIBLES (1/Oct/2026): una
 * entrada cuyas cuentas son todas visibles se muestra en su renglón visible, sin conciliarse. Si una
 * entrada mezcla una visible con una que concilia (un concepto con varias cuentas), esa
 * visible se concilia en este cargue (`promovidas`): entra al renglón agrupado con la otra, y con
 * ella las entradas visibles que la comparten. Sin entradas sin cuenta en el lado visible: el saldo
 * sin cuenta siempre se concilia.
 */
export function separarEntradasVisibles(
  entradas: readonly EntradaCruceFormal[],
  visibles: ReadonlySet<string>,
): { concilian: EntradaCruceFormal[]; visibles: EntradaCruceFormal[]; promovidas: Set<string> } {
  const promovidas = new Set<string>();
  const esVisible = (e: EntradaCruceFormal) => e.cuentas4.length > 0 && e.cuentas4.every((c) => visibles.has(c) && !promovidas.has(c));
  for (const e of entradas) {
    if (e.cuentas4.some((c) => visibles.has(c)) && e.cuentas4.some((c) => !visibles.has(c))) {
      for (const c of e.cuentas4) if (visibles.has(c)) promovidas.add(c);
    }
  }
  // Una entrada visible que comparte una cuenta promovida también se concilia, y promueve las suyas.
  let cambio = promovidas.size > 0;
  while (cambio) {
    cambio = false;
    for (const e of entradas) {
      if (e.cuentas4.length > 1 && e.cuentas4.some((c) => promovidas.has(c)) && e.cuentas4.some((c) => visibles.has(c) && !promovidas.has(c))) {
        for (const c of e.cuentas4) if (visibles.has(c) && !promovidas.has(c)) { promovidas.add(c); cambio = true; }
      }
    }
  }
  const concilian: EntradaCruceFormal[] = [];
  const lado: EntradaCruceFormal[] = [];
  for (const e of entradas) (esVisible(e) ? lado : concilian).push(e);
  return { concilian, visibles: lado, promovidas };
}

/**
 * Valor con que un concepto entra a la fila de SU cuenta en la cédula. El archivo de nómina firma
 * desde el empleado (devengo +, deducción −) y la cédula presenta las cuentas de naturaleza crédito
 * (pasivos, ingresos) en positivo. Una deducción siempre se ABONA a su cuenta (retención 2365,
 * libranzas y embargos 2370, intereses 4210): contra una cuenta crédito entra con el signo invertido,
 * así los dos lados quedan en la misma convención y no aparece como diferencia el doble de una cifra
 * que cuadra (Kakaraka: embargos 401.580 contra −401.580). Los devengos (gasto 51/52/72/73 y los
 * pasivos laborales 25xx de la cédula) ya coinciden en signo y no cambian.
 */
export function valorConceptoEnCuenta(cuenta: string, total: number): number {
  return total < 0 && factorPresentacion(cuenta) === -1 ? redondear(-total) : total;
}

/**
 * Lo que entra a la cédula Russell 6 desde el consolidado de Nómina. Solo cuentan las vías
 * DETERMINISTAS (cuenta del archivo, memoria exacta, memoria + clase); una sugerencia por
 * nombre no cruza hasta que el auditor la guarde. Los `multi` cruzan en un renglón AGRUPADO contra
 * la suma de sus cuentas, como en los demás módulos. Repartir un concepto entre sus cuentas
 * (RF-NOM-12) se retiró el 14/Oct/2026 porque nadie lo usaba: los repartos guardados en
 * `reparto_cruce_modulo` ya no se leen. Control y fuera no entran.
 *
 * El signo del agrupado sigue la regla de `valorConceptoEnCuenta`: una deducción contra varias
 * cuentas crédito (retención 236505 + embargos 237025) entra en positivo, como las presenta la
 * contabilidad. Antes solo el reparto la corregía, cuenta por cuenta. Si las cuentas mezclan
 * naturalezas no hay una convención única y se deja con el signo del archivo.
 */
export function entradasCruceFormalNomina(renglones: readonly RenglonConsolidadoNomina[]): EntradaCruceFormal[] {
  const entradas: EntradaCruceFormal[] = [];
  for (const r of renglones) {
    const s = r.sugerencia;
    if (s.destino !== "gasto") continue;
    if (s.via === "multi") {
      const todasCredito = s.cuentas.length > 0 && s.cuentas.every((c) => factorPresentacion(c) === -1);
      const total = todasCredito ? valorConceptoEnCuenta(s.cuentas[0], r.total) : r.total;
      entradas.push({ clasificador: r.clasificador, total, cuentas4: [...s.cuentas] });
      continue;
    }
    const determinista = s.via === "archivo" || s.via === "memoria_exacta" || s.via === "memoria_clase";
    if (determinista && s.cuentas.length === 1) entradas.push({ clasificador: r.clasificador, total: valorConceptoEnCuenta(s.cuentas[0], r.total), cuentas4: [s.cuentas[0]] });
    else entradas.push({ clasificador: r.clasificador, total: r.total, cuentas4: [] });
  }
  return entradas;
}
