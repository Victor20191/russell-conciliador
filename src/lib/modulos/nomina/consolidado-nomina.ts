// CONSOLIDADO de un cargue de Nómina: un renglón por (concepto, agrupador) con lo guardado en
// la memoria del cliente y, si no hay memoria exacta, la SUGERENCIA de `resolverCuentaConcepto`
// (cuenta del archivo, memoria base + regla de clase, grupo por nombre…). Además, la lista de
// agrupadores del archivo con su clase guardada y la que sugiere su valor, para el panel «Clases
// por centro de costo». Puro: la página carga las filas y llama aquí.

import { claveCruceContable } from "../cuentas-modulo";
import { consolidarPorClasificador } from "../promocion";
import { claveConsolidado } from "./clave-consolidado";
import {
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

export type SugerenciaConsolidado = Pick<ResolucionConcepto, "cuentas" | "via" | "motivo" | "destino" | "grupo" | "subcuentaPuc" | "cuentaCliente" | "clase">;

export type RenglonConsolidadoNomina = {
  /** Clave del renglón («1» o «1 ∥ GYA»). */
  clasificador: string;
  codigo: string;
  agrupador: string;
  descripcion: string | null;
  total: number;
  filas: number;
  /** Cuentas Russell GUARDADAS para (concepto, agrupador). */
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
 * Un renglón del consolidado ANTES de homologar: el par (concepto, centro) con sus cifras y el
 * valor más repetido de los roles que la homologación mira. Se puede armar leyendo las filas
 * (`agruparDetalleNomina`) o pidiéndoselo a la base con un GROUP BY: un cargue de nómina tiene
 * cientos de miles de filas y no hacen falta todas para saber a qué cuenta va cada concepto.
 */
export type GrupoNominaAgregado = {
  /** Clave del renglón («1» o «1 ∥ GYA»). */
  clasificador: string;
  codigo: string;
  agrupador: string;
  filas: number;
  total: number;
  /** Valor más repetido de cada rol en las filas del grupo (la `moda`). */
  concepto: string | null;
  cuenta: string | null;
  cuentaAdmin: string | null;
  cuentaVentas: string | null;
  cuentaMOD: string | null;
  cuentaMOI: string | null;
};

const ROLES_MODA = ["concepto", "cuenta", "cuentaAdmin", "cuentaVentas", "cuentaMOD", "cuentaMOI"] as const;

/** Agrupa el detalle por (concepto, centro) con la moda de los roles que mira la homologación. */
export function agruparDetalleNomina(detalle: readonly FilaDetalleNomina[]): GrupoNominaAgregado[] {
  const consolidado = consolidarPorClasificador(
    detalle.map((d) => ({ clasificador: d.clasificador, valor: d.valor, agrupador: texto(d.datos.agrupador) })),
    { porAgrupador: true },
  );
  const filasPorClave = new Map<string, FilaDetalleNomina[]>();
  for (const d of detalle) {
    const k = claveConsolidado(d.clasificador?.trim() || "(sin clasificar)", texto(d.datos.agrupador));
    filasPorClave.set(k, [...(filasPorClave.get(k) ?? []), d]);
  }
  return consolidado.map((c) => {
    const filas = filasPorClave.get(c.clasificador) ?? [];
    const modas = Object.fromEntries(ROLES_MODA.map((rol) => [rol, moda(filas, rol)])) as Record<(typeof ROLES_MODA)[number], string | null>;
    return {
      clasificador: c.clasificador,
      codigo: c.codigo ?? c.clasificador,
      agrupador: c.agrupador ?? "",
      filas: c.filas,
      total: c.total,
      ...modas,
    };
  });
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
  // Memoria: guardadas por clave exacta y descripción por concepto.
  const guardadas = new Map<string, string[]>();
  const descripcionPorCodigo = new Map<string, string>();
  for (const m of input.memoria) {
    const c6 = claveCruceContable(m.cuenta6, 6);
    if (c6) {
      const k = claveConsolidado(m.clasificador, m.agrupador);
      guardadas.set(k, [...(guardadas.get(k) ?? []), c6]);
    }
    if (m.descripcion && !descripcionPorCodigo.has(m.clasificador)) descripcionPorCodigo.set(m.clasificador, m.descripcion);
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
    const descripcion = descripcionPorCodigo.get(codigo) ?? c.concepto;
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
      descripcion,
      total: c.total,
      filas: c.filas,
      cuentas: [...new Set(guardadas.get(c.clasificador) ?? [])].sort(),
      sugerencia: { cuentas: r.cuentas, via: r.via, motivo: r.motivo, destino: r.destino, grupo: r.grupo, subcuentaPuc: r.subcuentaPuc, cuentaCliente: r.cuentaCliente, clase: r.clase },
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
