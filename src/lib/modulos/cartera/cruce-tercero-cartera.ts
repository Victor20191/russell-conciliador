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
//  - La segunda pasada por NÚCLEO de nueve dígitos existe para no perder los cruces contra
//    capturas antiguas, que truncaban el documento. Solo empareja cuando uno de los dos lados
//    es un núcleo (nueve dígitos o menos) y hay un único candidato en cada lado. El renglón
//    queda marcado, porque dos cédulas de diez dígitos pueden compartir los nueve primeros.
import { nucleoNit } from "@/lib/nit";
import { esClaveSinNit } from "./tercero-cartera";

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
  /** Clave del módulo que se unió a este renglón por núcleo de nueve dígitos (revisar). */
  claveModuloPorNucleo: string | null;
  /**
   * Tercero del OTRO lado con el mismo nombre, cuando es el único candidato en cada lado. Es
   * una sugerencia: nunca se aplica sola, el auditor confirma el emparejamiento.
   */
  sugerenciaPorNombre: { clave: string; nombre: string | null } | null;
  /** Claves del auxiliar que un emparejamiento manual unió a este tercero del balance. */
  emparejadoDesde: string[];
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
  porNucleo: number;
  /** Pares de terceros sueltos (uno en cada lado) con el mismo nombre. */
  sugerenciasPorNombre: number;
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

/** Pares clave contable → clave del módulo que la pasada exacta dejó sueltos y comparten núcleo. */
function emparejarPorNucleo(contables: readonly string[], modulos: readonly string[]): Map<string, string> {
  const agrupar = (claves: readonly string[]) => {
    const grupos = new Map<string, string[]>();
    for (const clave of claves) {
      if (!/^\d{5,}$/.test(clave)) continue;
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
    pares.set(contable, modulo);
  }
  return pares;
}

/** Formas societarias que el balance y el auxiliar escriben distinto («S.A.S.», «SAS», «LTDA»…). */
const FORMA_SOCIETARIA = /\b(?:S A S|SAS|S A|SA|LTDA|LIMITADA|S EN C S|S EN C|SCA|E U|EU|Y CIA|CIA|INC|LLC|CORP|BIC|EN LIQUIDACION)\b/g;

/** Nombre comparable entre el balance y el auxiliar: sin tildes, puntuación ni forma societaria. */
export function nombreComparable(nombre: string | null | undefined): string | null {
  const limpio = String(nombre ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/&/g, " Y ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(FORMA_SOCIETARIA, " ")
    .replace(/\s+/g, " ")
    .trim();
  return limpio || null;
}

export function construirCruceTerceroCartera(input: {
  contable: readonly MovimientoContableTercero[];
  modulo: readonly SaldoModuloTercero[];
  /** Cuentas Russell de seis dígitos del módulo; `null` = todas las cuentas del grupo. */
  cuentasModulo: readonly string[] | null;
  /** Emparejamientos manuales: la clave del auxiliar se lee como la del balance (N:1). */
  emparejamientos?: readonly { claveModulo: string; claveBalance: string }[];
  tolerancia?: number;
}): ResumenCruceTerceroCartera {
  const tolerancia = input.tolerancia ?? 0.01;
  const delModulo = input.cuentasModulo ? new Set(input.cuentasModulo) : null;

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

  const porNucleo = emparejarPorNucleo(
    [...contable.keys()].filter((clave) => !modulo.has(clave)),
    [...modulo.keys()].filter((clave) => !contable.has(clave)),
  );
  const unidasPorNucleo = new Set(porNucleo.values());

  const filas: FilaCruceTerceroCartera[] = [];
  const claves = new Set([...contable.keys(), ...[...modulo.keys()].filter((clave) => !unidasPorNucleo.has(clave))]);
  for (const clave of claves) {
    const c = contable.get(clave);
    const claveModuloPorNucleo = porNucleo.get(clave) ?? null;
    const m = modulo.get(claveModuloPorNucleo ?? clave);
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
      claveModuloPorNucleo,
      sugerenciaPorNombre: null,
      emparejadoDesde: [...(emparejadas.get(clave) ?? [])].sort(),
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

  // Sugerencias por nombre (D4 de CxP): un tercero que solo está en un lado y cuyo nombre
  // coincide con UNO solo del otro lado —típicamente el proveedor que el auxiliar trae sin NIT.
  const sueltosPorNombre = (estado: EstadoCruceTercero) => {
    const porNombre = new Map<string, FilaCruceTerceroCartera[]>();
    for (const f of filas) {
      const nombre = f.estado === estado ? nombreComparable(f.nombre) : null;
      if (nombre) porNombre.set(nombre, [...(porNombre.get(nombre) ?? []), f]);
    }
    return porNombre;
  };
  const soloEnContabilidad = sueltosPorNombre("solo_contable");
  let sugerenciasPorNombre = 0;
  for (const [nombre, delModulo] of sueltosPorNombre("solo_modulo")) {
    const delBalance = soloEnContabilidad.get(nombre);
    if (delModulo.length !== 1 || delBalance?.length !== 1) continue;
    const [m] = delModulo;
    const [c] = delBalance;
    m.sugerenciaPorNombre = { clave: c.clave, nombre: c.nombre };
    c.sugerenciaPorNombre = { clave: m.clave, nombre: m.nombre };
    sugerenciasPorNombre += 1;
  }

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
    porNucleo: porNucleo.size,
    sugerenciasPorNombre,
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
