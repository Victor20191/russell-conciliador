// CRUCE POR TERCERO de un módulo contra el balance por terceros — puro, sin BD.
//
// Un renglón por tercero: lo que dice la contabilidad, desglosado por cuenta Russell de seis
// dígitos, contra lo que dice el auxiliar del módulo, separado en nacional y exterior. Lo usan
// Cartera y CxP con sus saldos materializados, e Ingresos con las claves de siempre.
//
// Tres reglas que no se ven a simple vista:
//  - El SIGNO llega resuelto con la naturaleza del módulo en ambos lados: un anticipo resta
//    del saldo del tercero en la contabilidad igual que en el auxiliar.
//  - Nada se descarta en silencio. Lo que está en el grupo contable pero en cuentas que no
//    son del módulo, y lo que no tiene tercero (la fila propia de una cuenta sin detalle), se
//    devuelve aparte: es lo que explica el total del grupo.
//  - Dos pasadas AUTOMÁTICAS sobre lo que la clave exacta dejó suelto, ambas marcadas en el
//    renglón y ambas reversibles con una SEPARACIÓN del auditor:
//      · por DV: un lado trae el NIT y el otro el mismo NIT con su dígito de verificación
//        pegado (el auxiliar «41954149», el balance «419541491»). Se une solo cuando el dígito
//        de más es el DV válido (módulo 11) y hay un único candidato en cada lado.
//      · por NÚCLEO de nueve dígitos: para no perder los cruces contra capturas antiguas, que
//        truncaban el documento. Solo cuando uno de los dos lados es un núcleo (nueve dígitos
//        o menos) y hay un único candidato en cada lado, porque dos cédulas de diez dígitos
//        pueden compartir los nueve primeros.
//  - Lo que sigue suelto pasa por la validación de coherencia (`coherencia-tercero.ts`), que
//    solo PROPONE: saldo idéntico, NIT con sufijo, nombre parecido.
import { dvValido, nucleoNit } from "@/lib/nit";
import {
  claveParSeparado,
  nombreComparable,
  sugerirEmparejamientosTercero,
  type SugerenciaEmparejamiento,
  type SugerenciaFila,
} from "./coherencia-tercero";
import { esClaveSinNit } from "./tercero-cartera";

export { nombreComparable };

export type MovimientoContableTercero = {
  /** Cuenta Russell de seis dígitos de la cuenta del cliente. */
  cuenta6: string;
  /** Clave del tercero; `null` en la fila propia de una cuenta sin detalle por tercero. */
  clave: string | null;
  nombre: string | null;
  /** Valor con la naturaleza del módulo aplicada. */
  valor: number;
};

export type SaldoModuloTercero = {
  /** Clave del tercero; `null` cuando la fila del auxiliar no lo identifica. */
  clave: string | null;
  nombre: string | null;
  saldo: number;
  origenCartera: "nacional" | "exterior" | null;
  /** Cuenta Russell de seis dígitos asignada en el Consolidado a la cuenta del archivo, si hay una. */
  cuenta6: string | null;
  /** La cuenta del archivo no tiene asignada en el Consolidado ninguna cuenta del módulo: no entra al cruce. */
  sinCuentaDelModulo?: boolean;
  /** Cuenta del archivo tal como la trae el auxiliar, para decir cuáles faltan por asignar. */
  cuentaArchivo?: string | null;
};

export type EstadoCruceTercero = "cuadra" | "descuadre" | "solo_contable" | "solo_modulo" | "sin_saldo";

export type FilaCruceTerceroCartera = {
  clave: string;
  nombre: string | null;
  /** Tercero sin identificador numérico, agrupado por nombre (`~NOMBRE`). */
  sinNit: boolean;
  /** Clave del módulo que se unió a este renglón por NIT + dígito de verificación (revisar). */
  claveModuloPorDv: string | null;
  /** Clave del módulo que se unió a este renglón por núcleo de nueve dígitos (revisar). */
  claveModuloPorNucleo: string | null;
  /**
   * Tercero del OTRO lado que la validación de coherencia propone como el mismo (saldo idéntico,
   * NIT con sufijo, nombre parecido…). Es una sugerencia: nunca se aplica sola, el auditor la
   * confirma (una a una o en lote).
   */
  sugerencia: SugerenciaFila | null;
  /** Claves del auxiliar que un emparejamiento manual unió a este tercero del balance. */
  emparejadoDesde: string[];
  /** Claves del auxiliar que el auditor SEPARÓ de este tercero del balance (no se unen solas). */
  separadoDe: string[];
  contable: { porCuenta: Record<string, number>; total: number };
  modulo: { nacional: number; exterior: number; sinOrigen: number; total: number };
  /** Contabilidad − módulo. */
  diferencia: number;
  /** Por importes: un tercero que existe en un lado con neto cero cuenta como ausente. */
  estado: EstadoCruceTercero;
};

export type AcumuladoCuentas = { total: number; filas: number; porCuenta: Record<string, number> };

export type ResumenCruceTerceroCartera = {
  /** Diferencias primero (mayor |diferencia|), luego lo que cuadra y al final lo que no tiene saldo. */
  filas: FilaCruceTerceroCartera[];
  /** Cuentas Russell de seis dígitos con saldo en el cruce, ordenadas. */
  cuentas: string[];
  totales: { contable: number; modulo: number; diferencia: number; porCuenta: Record<string, number> };
  conteo: Record<EstadoCruceTercero, number>;
  sinNit: number;
  porDv: number;
  porNucleo: number;
  /** Propuestas de la validación de coherencia entre terceros sueltos (uno en cada lado). */
  sugerencias: SugerenciaEmparejamiento[];
  /** Del grupo contable, cuentas que no son del módulo: se informan, no se concilian. */
  contableFueraDelModulo: AcumuladoCuentas;
  /** Filas propias de las cuentas del módulo que no tienen detalle por tercero. */
  contableSinTercero: AcumuladoCuentas;
  /** Del auxiliar, saldos en cuentas del archivo sin una cuenta del módulo asignada en el Consolidado. */
  moduloFueraDelModulo: AcumuladoCuentas;
  /** Del auxiliar, filas sin tercero identificado. */
  moduloSinTercero: { total: number; filas: number };
};

const redondear = (v: number): number => Math.round(v * 100) / 100 + 0 || 0;

const PRIORIDAD: Record<EstadoCruceTercero, number> = { descuadre: 0, solo_contable: 0, solo_modulo: 0, cuadra: 1, sin_saldo: 2 };

function acumular(acumulado: AcumuladoCuentas, cuenta: string, valor: number): void {
  acumulado.total += valor;
  acumulado.filas += 1;
  acumulado.porCuenta[cuenta] = (acumulado.porCuenta[cuenta] ?? 0) + valor;
}

function redondearCuentas(porCuenta: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(porCuenta).sort(([a], [b]) => a.localeCompare(b)).map(([cuenta, valor]) => [cuenta, redondear(valor)]),
  );
}

const cerrar = (a: AcumuladoCuentas): AcumuladoCuentas => ({ total: redondear(a.total), filas: a.filas, porCuenta: redondearCuentas(a.porCuenta) });

const esNumerica = (clave: string) => /^\d{5,}$/.test(clave);

/** Un par (contable, módulo) que el auditor separó no se une solo por ninguna pasada. */
type EstaSeparado = (claveBalance: string, claveModulo: string) => boolean;

/**
 * Pares clave contable → clave del módulo que la pasada exacta dejó sueltos y donde una clave es
 * la otra más su dígito de verificación DIAN (en cualquiera de los dos lados). Solo 1:1: una base
 * con dos candidatos en el otro lado no se une.
 */
function emparejarPorDv(contables: readonly string[], modulos: readonly string[], separado: EstaSeparado): Map<string, string> {
  const modulosExactos = new Set(modulos.filter(esNumerica));
  const modulosPorBase = new Map<string, string[]>();
  for (const m of modulosExactos) {
    if (m.length <= 5) continue;
    const base = m.slice(0, -1);
    if (dvValido(base, m[m.length - 1])) modulosPorBase.set(base, [...(modulosPorBase.get(base) ?? []), m]);
  }
  const candidatos: [string, string][] = [];
  for (const c of contables) {
    if (!esNumerica(c)) continue;
    // El balance trae el DV y el auxiliar no («419541491» ↔ «41954149»).
    if (c.length > 5) {
      const base = c.slice(0, -1);
      if (modulosExactos.has(base) && dvValido(base, c[c.length - 1])) candidatos.push([c, base]);
    }
    // El auxiliar trae el DV y el balance no.
    for (const m of modulosPorBase.get(c) ?? []) candidatos.push([c, m]);
  }
  const vivos = candidatos.filter(([c, m]) => !separado(c, m));
  const vecesContable = new Map<string, number>();
  const vecesModulo = new Map<string, number>();
  for (const [c, m] of vivos) {
    vecesContable.set(c, (vecesContable.get(c) ?? 0) + 1);
    vecesModulo.set(m, (vecesModulo.get(m) ?? 0) + 1);
  }
  return new Map(vivos.filter(([c, m]) => vecesContable.get(c) === 1 && vecesModulo.get(m) === 1));
}

/** Pares clave contable → clave del módulo que las pasadas anteriores dejaron sueltos y comparten núcleo. */
function emparejarPorNucleo(contables: readonly string[], modulos: readonly string[], separado: EstaSeparado): Map<string, string> {
  const agrupar = (claves: readonly string[]) => {
    const grupos = new Map<string, string[]>();
    for (const clave of claves) {
      if (!esNumerica(clave)) continue;
      const nucleo = nucleoNit(clave);
      grupos.set(nucleo, [...(grupos.get(nucleo) ?? []), clave]);
    }
    return grupos;
  };
  const nucleosModulo = agrupar(modulos);
  const pares = new Map<string, string>();
  for (const [nucleo, clavesContables] of agrupar(contables)) {
    const clavesModulo = nucleosModulo.get(nucleo);
    if (clavesContables.length !== 1 || clavesModulo?.length !== 1) continue;
    const [contable] = clavesContables;
    const [modulo] = clavesModulo;
    // Dos documentos completos distintos no son el mismo tercero aunque compartan los 9 primeros.
    if (contable.length > 9 && modulo.length > 9) continue;
    if (separado(contable, modulo)) continue;
    pares.set(contable, modulo);
  }
  return pares;
}

export function construirCruceTerceroCartera(input: {
  contable: readonly MovimientoContableTercero[];
  modulo: readonly SaldoModuloTercero[];
  /** Cuentas Russell de seis dígitos del módulo; `null` = todas las cuentas del grupo. */
  cuentasModulo: readonly string[] | null;
  /** Emparejamientos manuales: la clave del auxiliar se lee como la del balance (N:1). */
  emparejamientos?: readonly { claveModulo: string; claveBalance: string }[];
  /** Pares que el auditor separó: no se unen por DV ni por núcleo, ni se vuelven a proponer. */
  separaciones?: readonly { claveModulo: string; claveBalance: string }[];
  tolerancia?: number;
}): ResumenCruceTerceroCartera {
  const tolerancia = input.tolerancia ?? 0.01;
  const delModulo = input.cuentasModulo ? new Set(input.cuentasModulo) : null;
  const separadas = new Set((input.separaciones ?? []).map((s) => claveParSeparado(s.claveModulo, s.claveBalance)));
  const separado: EstaSeparado = (claveBalance, claveModulo) => separadas.has(claveParSeparado(claveModulo, claveBalance));

  const contable = new Map<string, { porCuenta: Record<string, number>; total: number; nombre: string | null }>();
  const modulo = new Map<string, { nacional: number; exterior: number; sinOrigen: number; total: number; nombre: string | null }>();
  const contableFuera: AcumuladoCuentas = { total: 0, filas: 0, porCuenta: {} };
  const contableSinTercero: AcumuladoCuentas = { total: 0, filas: 0, porCuenta: {} };
  const moduloFuera: AcumuladoCuentas = { total: 0, filas: 0, porCuenta: {} };
  const moduloSinTercero = { total: 0, filas: 0 };
  const reLlave = new Map(
    (input.emparejamientos ?? []).filter((e) => e.claveModulo !== e.claveBalance).map((e) => [e.claveModulo, e.claveBalance]),
  );
  const emparejadas = new Map<string, Set<string>>();

  for (const m of input.contable) {
    if (delModulo && !delModulo.has(m.cuenta6)) {
      acumular(contableFuera, m.cuenta6, m.valor);
      continue;
    }
    if (!m.clave) {
      acumular(contableSinTercero, m.cuenta6, m.valor);
      continue;
    }
    const lado = contable.get(m.clave) ?? { porCuenta: {}, total: 0, nombre: null };
    lado.porCuenta[m.cuenta6] = (lado.porCuenta[m.cuenta6] ?? 0) + m.valor;
    lado.total += m.valor;
    lado.nombre ??= m.nombre;
    contable.set(m.clave, lado);
  }

  for (const s of input.modulo) {
    if (s.sinCuentaDelModulo || (delModulo && s.cuenta6 && !delModulo.has(s.cuenta6))) {
      acumular(moduloFuera, s.cuentaArchivo?.trim() || s.cuenta6 || "(sin cuenta)", s.saldo);
      continue;
    }
    if (!s.clave) {
      moduloSinTercero.total += s.saldo;
      moduloSinTercero.filas += 1;
      continue;
    }
    const clave = reLlave.get(s.clave) ?? s.clave;
    if (clave !== s.clave) emparejadas.set(clave, (emparejadas.get(clave) ?? new Set()).add(s.clave));
    const lado = modulo.get(clave) ?? { nacional: 0, exterior: 0, sinOrigen: 0, total: 0, nombre: null };
    if (s.origenCartera === "nacional") lado.nacional += s.saldo;
    else if (s.origenCartera === "exterior") lado.exterior += s.saldo;
    else lado.sinOrigen += s.saldo;
    lado.total += s.saldo;
    lado.nombre ??= s.nombre;
    modulo.set(clave, lado);
  }

  const contablesSueltas = [...contable.keys()].filter((clave) => !modulo.has(clave));
  const modulosSueltas = [...modulo.keys()].filter((clave) => !contable.has(clave));
  const porDv = emparejarPorDv(contablesSueltas, modulosSueltas, separado);
  const unidasPorDv = new Set(porDv.values());
  const porNucleo = emparejarPorNucleo(
    contablesSueltas.filter((clave) => !porDv.has(clave)),
    modulosSueltas.filter((clave) => !unidasPorDv.has(clave)),
    separado,
  );
  const unidasPorNucleo = new Set(porNucleo.values());
  // Separaciones vigentes entre terceros que están los dos en el cruce: se pintan en el renglón del balance.
  const separadoDe = new Map<string, string[]>();
  for (const s of input.separaciones ?? []) {
    if (!contable.has(s.claveBalance) || !modulo.has(s.claveModulo)) continue;
    separadoDe.set(s.claveBalance, [...(separadoDe.get(s.claveBalance) ?? []), s.claveModulo]);
  }

  const filas: FilaCruceTerceroCartera[] = [];
  const claves = new Set([...contable.keys(), ...[...modulo.keys()].filter((clave) => !unidasPorDv.has(clave) && !unidasPorNucleo.has(clave))]);
  for (const clave of claves) {
    const c = contable.get(clave);
    const claveModuloPorDv = porDv.get(clave) ?? null;
    const claveModuloPorNucleo = porNucleo.get(clave) ?? null;
    const m = modulo.get(claveModuloPorDv ?? claveModuloPorNucleo ?? clave);
    const totalContable = redondear(c?.total ?? 0);
    const totalModulo = redondear(m?.total ?? 0);
    const diferencia = redondear(totalContable - totalModulo);
    let estado: EstadoCruceTercero;
    if (totalContable === 0 && totalModulo === 0) estado = "sin_saldo";
    else if (totalModulo === 0) estado = "solo_contable";
    else if (totalContable === 0) estado = "solo_modulo";
    else estado = Math.abs(diferencia) <= tolerancia ? "cuadra" : "descuadre";
    filas.push({
      clave,
      nombre: c?.nombre ?? m?.nombre ?? null,
      sinNit: esClaveSinNit(clave),
      claveModuloPorDv,
      claveModuloPorNucleo,
      sugerencia: null,
      emparejadoDesde: [...(emparejadas.get(clave) ?? [])].sort(),
      separadoDe: [...(separadoDe.get(clave) ?? [])].sort(),
      contable: { porCuenta: redondearCuentas(c?.porCuenta ?? {}), total: totalContable },
      modulo: {
        nacional: redondear(m?.nacional ?? 0),
        exterior: redondear(m?.exterior ?? 0),
        sinOrigen: redondear(m?.sinOrigen ?? 0),
        total: totalModulo,
      },
      diferencia,
      estado,
    });
  }

  // Validación de coherencia: propuestas (nunca aplicadas solas) entre lo que quedó suelto en
  // cada lado —típicamente el proveedor que el auxiliar trae sin NIT o con un sufijo, o el
  // mismo saldo al centavo bajo otro identificador. Anota `sugerencia` en los dos renglones.
  const sugerencias = sugerirEmparejamientosTercero(filas, { tolerancia, separadas });

  filas.sort((a, b) =>
    PRIORIDAD[a.estado] - PRIORIDAD[b.estado]
    || (PRIORIDAD[a.estado] === 0 ? Math.abs(b.diferencia) - Math.abs(a.diferencia) : 0)
    || a.clave.localeCompare(b.clave));

  const conteo: Record<EstadoCruceTercero, number> = { cuadra: 0, descuadre: 0, solo_contable: 0, solo_modulo: 0, sin_saldo: 0 };
  const totalPorCuenta: Record<string, number> = {};
  let totalContable = 0;
  let totalModulo = 0;
  for (const f of filas) {
    conteo[f.estado] += 1;
    totalContable += f.contable.total;
    totalModulo += f.modulo.total;
    for (const [cuenta, valor] of Object.entries(f.contable.porCuenta)) totalPorCuenta[cuenta] = (totalPorCuenta[cuenta] ?? 0) + valor;
  }
  const porCuenta = redondearCuentas(totalPorCuenta);

  return {
    filas,
    cuentas: Object.keys(porCuenta),
    totales: {
      contable: redondear(totalContable),
      modulo: redondear(totalModulo),
      diferencia: redondear(totalContable - totalModulo),
      porCuenta,
    },
    conteo,
    sinNit: filas.filter((f) => f.sinNit).length,
    porDv: porDv.size,
    porNucleo: porNucleo.size,
    sugerencias,
    contableFueraDelModulo: cerrar(contableFuera),
    contableSinTercero: cerrar(contableSinTercero),
    moduloFueraDelModulo: cerrar(moduloFuera),
    moduloSinTercero: { total: redondear(moduloSinTercero.total), filas: moduloSinTercero.filas },
  };
}

/**
 * ¿Se puede emparejar, en el cruce vigente, la clave del auxiliar con la del balance? La del
 * auxiliar tiene que estar SOLO en el auxiliar (si la contabilidad ya la tiene, no hay nada que
 * emparejar) y la del balance tiene que existir en la contabilidad del período.
 */
export function validarEmparejamientoTercero(
  resumen: Pick<ResumenCruceTerceroCartera, "filas">,
  claveModulo: string,
  claveBalance: string,
): { ok: true } | { ok: false; message: string } {
  if (claveModulo === claveBalance) return { ok: false, message: "El tercero del auxiliar y el del balance son el mismo." };
  const delModulo = resumen.filas.find((f) => f.clave === claveModulo);
  if (!delModulo || delModulo.estado !== "solo_modulo") {
    return { ok: false, message: "Ese tercero ya no está solo en el auxiliar. Recarga la pantalla." };
  }
  const delBalance = resumen.filas.find((f) => f.clave === claveBalance);
  if (!delBalance || Object.keys(delBalance.contable.porCuenta).length === 0) {
    return { ok: false, message: "Ese tercero no aparece en la contabilidad del período." };
  }
  return { ok: true };
}
