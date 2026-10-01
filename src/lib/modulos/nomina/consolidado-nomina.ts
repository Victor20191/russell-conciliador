// CONSOLIDADO de un cargue de Nómina: un renglón por (concepto, agrupador) —y por cuenta del
// archivo cuando la fila la trae— con lo guardado en la memoria del cliente y, si no hay memoria
// exacta, la SUGERENCIA de `resolverCuentaConcepto` (cuenta del archivo, memoria base + regla de
// clase, grupo por nombre…). Además, la lista de agrupadores del archivo con su clase guardada y la
// que sugiere su valor, para el panel «Clases por centro de costo». Puro: la página carga las filas
// y llama aquí.

import { claveCruceContable } from "../cuentas-modulo";
import { SIN_CLASIFICAR } from "../promocion";
import { claveConsolidado } from "./clave-consolidado";
import {
  cuentaArchivoValida,
  digitosCuenta,
  indexarMemoria,
  resolverCuentaConcepto,
  sugerirClaseAgrupador,
  type ClaseNomina,
  type ContextoHomologacion,
  type FilaHomologacion,
  type ResolucionConcepto,
} from "./homologacion";

export type FilaDetalleNomina = {
  clasificador: string | null;
  valor: number;
  datos: Record<string, unknown>;
};

export type MemoriaConceptoRow = FilaHomologacion & { descripcion?: string | null; agrupador: string; cuenta6: string };

export type SugerenciaConsolidado = Pick<
  ResolucionConcepto,
  "cuentas" | "via" | "motivo" | "destino" | "grupo" | "subcuentaPuc" | "cuentaCliente" | "clase" | "origenCuentaArchivo" | "memoriaDistinta" | "cuentaArchivoReemplazada"
>;

export type RenglonConsolidadoNomina = {
  /** Clave del renglón («1», «1 ∥ GYA» o, con cuenta del archivo, «1 ∥ GYA # 51050601»). */
  clasificador: string;
  codigo: string;
  agrupador: string;
  /** Cuenta contable del cliente que traen las filas del renglón (null si el archivo no la trae). */
  cuentaArchivo: string | null;
  descripcion: string | null;
  total: number;
  filas: number;
  /** Cuentas Russell GUARDADAS para (concepto, agrupador) —y esa cuenta del cliente, si la trae—. */
  cuentas: string[];
  sugerencia: SugerenciaConsolidado;
};

export type AgrupadorConsolidado = {
  agrupador: string;
  filas: number;
  total: number;
  /** Clase guardada en `clase_agrupador_modulo`. */
  clase: ClaseNomina | null;
  /** Clase que sugiere el valor del agrupador («GYA» → 51). */
  sugerida: ClaseNomina | null;
};

const texto = (v: unknown): string | null => {
  if (v == null) return null;
  const t = String(v).trim();
  return t ? t : null;
};

/** El valor más frecuente de `datos[rol]` dentro de un grupo de filas. */
function moda(filas: FilaDetalleNomina[], rol: string): string | null {
  const conteo = new Map<string, number>();
  for (const f of filas) {
    const v = texto(f.datos[rol]);
    if (v) conteo.set(v, (conteo.get(v) ?? 0) + 1);
  }
  let mejor: string | null = null;
  let n = 0;
  for (const [v, c] of conteo) if (c > n) { mejor = v; n = c; }
  return mejor;
}

/**
 * Un renglón del consolidado ANTES de homologar: el concepto en su centro —y en su cuenta del
 * archivo, cuando la fila trae una válida— con sus cifras y el valor más repetido de los roles que
 * la homologación mira. Se puede armar leyendo las filas (`agruparDetalleNomina`) o pidiéndoselo a
 * la base con un GROUP BY: un cargue de nómina tiene cientos de miles de filas y no hacen falta
 * todas para saber a qué cuenta va cada concepto.
 */
export type GrupoNominaAgregado = {
  /** Clave del renglón («1», «1 ∥ GYA» o «1 ∥ GYA # 51050601»). */
  clasificador: string;
  codigo: string;
  agrupador: string;
  filas: number;
  total: number;
  /** Valor más repetido del nombre del concepto en las filas del grupo (la `moda`). */
  concepto: string | null;
  /**
   * Cuenta contable del cliente de las filas del grupo (dígitos, `cuentaArchivoValida`), o null.
   * Parte el renglón: un concepto registrado en dos cuentas son dos grupos con su valor real.
   */
  cuenta: string | null;
  /** Buk: la moda de cada columna de cuenta por clase (no parten el renglón). */
  cuentaAdmin: string | null;
  cuentaVentas: string | null;
  cuentaMOD: string | null;
  cuentaMOI: string | null;
};

const ROLES_MODA = ["concepto", "cuentaAdmin", "cuentaVentas", "cuentaMOD", "cuentaMOI"] as const;

/**
 * Agrupa el detalle por (concepto, centro, cuenta del archivo) con la moda de los roles que mira la
 * homologación. Es la especificación del GROUP BY de `gruposNominaDelCargue`: mismas claves, mismo
 * orden (valor absoluto descendente y luego la clave).
 */
export function agruparDetalleNomina(detalle: readonly FilaDetalleNomina[]): GrupoNominaAgregado[] {
  const grupos = new Map<string, { codigo: string; agrupador: string; cuenta: string | null; total: number; filas: FilaDetalleNomina[] }>();
  for (const d of detalle) {
    const codigo = d.clasificador?.trim() || SIN_CLASIFICAR;
    const agrupador = texto(d.datos.agrupador) ?? "";
    const cuenta = cuentaArchivoValida(d.datos.cuenta);
    const k = claveConsolidado(codigo, agrupador, cuenta);
    const g = grupos.get(k) ?? { codigo, agrupador, cuenta, total: 0, filas: [] };
    g.total += d.valor;
    g.filas.push(d);
    grupos.set(k, g);
  }
  return [...grupos.entries()]
    .map(([clasificador, g]) => ({
      clasificador,
      codigo: g.codigo,
      agrupador: g.agrupador,
      filas: g.filas.length,
      total: Math.round(g.total * 100) / 100 + 0 || 0,
      cuenta: g.cuenta,
      ...(Object.fromEntries(ROLES_MODA.map((rol) => [rol, moda(g.filas, rol)])) as Record<(typeof ROLES_MODA)[number], string | null>),
    }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.clasificador.localeCompare(b.clasificador));
}

export function construirConsolidadoNomina(input: {
  detalle: FilaDetalleNomina[];
  memoria: MemoriaConceptoRow[];
  reglasClase: ReadonlyMap<string, ClaseNomina>;
  mapeoCliente?: ReadonlyMap<string, string>;
  cuentasRussell6: readonly string[];
}): { renglones: RenglonConsolidadoNomina[]; agrupadores: AgrupadorConsolidado[] } {
  return construirConsolidadoNominaDeGrupos({ ...input, grupos: agruparDetalleNomina(input.detalle) });
}

/** El mismo consolidado partiendo de los grupos ya agregados (sin las filas del archivo). */
export function construirConsolidadoNominaDeGrupos(input: {
  grupos: readonly GrupoNominaAgregado[];
  memoria: MemoriaConceptoRow[];
  reglasClase: ReadonlyMap<string, ClaseNomina>;
  mapeoCliente?: ReadonlyMap<string, string>;
  cuentasRussell6: readonly string[];
}): { renglones: RenglonConsolidadoNomina[]; agrupadores: AgrupadorConsolidado[] } {
  const consolidado = input.grupos;
  // Memoria: filas por (concepto, centro) y descripción por concepto. Lo GUARDADO de un renglón con
  // cuenta del archivo son solo las filas de esa cuenta del cliente (más una asignación «Solo
  // {período}» del par, que rige para todas sus cuentas); sin cuenta, todas las del par, como antes.
  const memoriaPorPar = new Map<string, MemoriaConceptoRow[]>();
  const descripcionPorCodigo = new Map<string, string>();
  for (const m of input.memoria) {
    const k = claveConsolidado(m.clasificador, m.agrupador);
    memoriaPorPar.set(k, [...(memoriaPorPar.get(k) ?? []), m]);
    if (m.descripcion && !descripcionPorCodigo.has(m.clasificador)) descripcionPorCodigo.set(m.clasificador, m.descripcion);
  }
  const guardadasDe = (c: GrupoNominaAgregado): string[] => {
    const filas = (memoriaPorPar.get(claveConsolidado(c.codigo ?? c.clasificador, c.agrupador ?? "")) ?? [])
      .filter((m) => !c.cuenta || m.soloPeriodo || digitosCuenta(m.cuentaCliente) === c.cuenta);
    return [...new Set(filas.map((m) => claveCruceContable(m.cuenta6, 6)).filter((c6): c6 is string => !!c6))].sort();
  };
  // El nombre es del CONCEPTO, no de la cuenta ni del centro: un renglón partido cuyas filas no lo
  // traen lo toma de sus hermanos del mismo código (el de más peso primero).
  const nombrePorCodigo = new Map<string, string>();
  for (const c of [...consolidado].sort((a, b) => Math.abs(b.total) - Math.abs(a.total))) {
    const codigo = c.codigo ?? c.clasificador;
    if (c.concepto && !nombrePorCodigo.has(codigo)) nombrePorCodigo.set(codigo, c.concepto);
  }
  const ctx: ContextoHomologacion = {
    memoria: input.memoria,
    reglasClase: input.reglasClase,
    mapeoCliente: input.mapeoCliente,
    cuentasRussell6: input.cuentasRussell6,
  };
  const indice = indexarMemoria(input.memoria);

  const renglones: RenglonConsolidadoNomina[] = consolidado.map((c) => {
    const codigo = c.codigo ?? c.clasificador;
    const agrupador = c.agrupador ?? "";
    const descripcion = descripcionPorCodigo.get(codigo) ?? c.concepto ?? nombrePorCodigo.get(codigo) ?? null;
    const r = resolverCuentaConcepto(
      {
        clasificador: codigo,
        agrupador,
        nombre: descripcion,
        cuentaArchivo: c.cuenta,
        cuentasPorClaseArchivo: {
          "51": c.cuentaAdmin,
          "52": c.cuentaVentas,
          "72": c.cuentaMOD,
          "73": c.cuentaMOI,
        },
      },
      ctx,
      indice,
    );
    return {
      clasificador: c.clasificador,
      codigo,
      agrupador,
      cuentaArchivo: c.cuenta,
      descripcion,
      total: c.total,
      filas: c.filas,
      cuentas: guardadasDe(c),
      sugerencia: {
        cuentas: r.cuentas,
        via: r.via,
        motivo: r.motivo,
        destino: r.destino,
        grupo: r.grupo,
        subcuentaPuc: r.subcuentaPuc,
        cuentaCliente: r.cuentaCliente,
        clase: r.clase,
        origenCuentaArchivo: r.origenCuentaArchivo,
        memoriaDistinta: r.memoriaDistinta,
        cuentaArchivoReemplazada: r.cuentaArchivoReemplazada,
      },
    };
  });

  const porAgrupador = new Map<string, { filas: number; total: number }>();
  for (const c of consolidado) {
    if (!c.agrupador) continue;
    const b = porAgrupador.get(c.agrupador) ?? { filas: 0, total: 0 };
    b.filas += c.filas;
    b.total += c.total;
    porAgrupador.set(c.agrupador, b);
  }
  const agrupadores: AgrupadorConsolidado[] = [...porAgrupador.entries()]
    .map(([agrupador, b]) => ({
      agrupador,
      filas: b.filas,
      total: Math.round(b.total * 100) / 100,
      clase: input.reglasClase.get(agrupador) ?? input.reglasClase.get(agrupador.toUpperCase()) ?? null,
      sugerida: sugerirClaseAgrupador(agrupador),
    }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.agrupador.localeCompare(b.agrupador));

  return { renglones, agrupadores };
}

// ===== Cuenta contable del archivo =====

/**
 * Lo que el banner del Consolidado dice de un cargue cuyo archivo trae la cuenta contable del
 * cliente: cuántos renglones cruzan por ella (y no necesitan el catálogo de conceptos) y cuántos
 * requieren atención. `null` si ningún renglón trae cuenta.
 */
export type ResumenCuentaArchivo = {
  /** Renglones con cuenta del archivo. */
  conCuenta: number;
  /** De ellos, los que cruzan por la cuenta del archivo contra el gasto de la cédula. */
  porArchivo: number;
  /** De esos, los derivados por estructura PUC (el balance no tiene homologada la cuenta). */
  porEstructura: number;
  /** Van al control de deducciones o quedan fuera del módulo por su cuenta. */
  control: number;
  /** La cuenta del archivo no se pudo homologar: siguen por la memoria o esperan cuenta. */
  sinResolver: number;
  /** Una asignación «Solo {período}» reemplazó la cuenta del archivo. */
  reemplazadas: number;
  /** La memoria del cliente dice otra cuenta (no rige mientras el archivo traiga la suya). */
  memoriaDistinta: number;
  /** Renglones SIN cuenta válida en un archivo que sí la trae: siguen por la memoria. */
  sinCuenta: number;
};

/** Lo mínimo de un renglón para el resumen (el del consolidado o el que pinta la pestaña). */
type RenglonConCuentaArchivo = { cuentaArchivo?: string | null; sugerencia?: SugerenciaConsolidado | null };

export function resumenCuentaArchivo(renglones: readonly RenglonConCuentaArchivo[]): ResumenCuentaArchivo | null {
  const conCuenta = renglones.filter((r): r is RenglonConCuentaArchivo & { sugerencia: SugerenciaConsolidado } => !!r.cuentaArchivo && !!r.sugerencia);
  if (conCuenta.length === 0) return null;
  const porArchivo = conCuenta.filter((r) => r.sugerencia.via === "archivo" && r.sugerencia.destino === "gasto");
  return {
    conCuenta: conCuenta.length,
    porArchivo: porArchivo.length,
    porEstructura: porArchivo.filter((r) => r.sugerencia.origenCuentaArchivo === "estructura").length,
    control: conCuenta.filter((r) => r.sugerencia.via === "archivo" && r.sugerencia.destino !== "gasto").length,
    sinResolver: conCuenta.filter((r) => r.sugerencia.via !== "archivo" && !r.sugerencia.cuentaArchivoReemplazada).length,
    reemplazadas: conCuenta.filter((r) => r.sugerencia.cuentaArchivoReemplazada).length,
    memoriaDistinta: conCuenta.filter((r) => r.sugerencia.memoriaDistinta?.length).length,
    sinCuenta: renglones.length - conCuenta.length,
  };
}

/**
 * Las cuentas con que el renglón entra al cruce y de dónde salen, para la hoja «Consolidado» del
 * Excel: la misma regla de `entradasCruceFormalNomina` (lo determinista cruza; lo propuesto no).
 */
export function cuentasEfectivasRenglon(r: RenglonConsolidadoNomina): { cuentas: string[]; origen: string } {
  const s = r.sugerencia;
  if (s.destino === "control") return { cuentas: [], origen: "Control de deducciones" };
  if (s.destino === "fuera") return { cuentas: [], origen: "Fuera del módulo" };
  switch (s.via) {
    case "archivo":
      return { cuentas: [...s.cuentas], origen: s.origenCuentaArchivo === "estructura" ? "Cuenta del archivo (por estructura PUC)" : "Cuenta del archivo" };
    case "memoria_exacta":
      return { cuentas: [...s.cuentas], origen: s.cuentaArchivoReemplazada ? "Solo el período (reemplaza la del archivo)" : "Memoria del cliente" };
    case "memoria_clase":
      return { cuentas: [...s.cuentas], origen: "Memoria del cliente + clase" };
    case "multi":
      return { cuentas: [...s.cuentas], origen: s.cuentaArchivoReemplazada ? "Solo el período · varias cuentas (reparto)" : "Varias cuentas (reparto)" };
    case "memoria_centros":
    case "sugerido_nombre":
      return { cuentas: [], origen: "Propuesta sin confirmar" };
    default:
      return { cuentas: [], origen: "Sin cuenta" };
  }
}
