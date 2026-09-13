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

export function construirConsolidadoNomina(input: {
  detalle: FilaDetalleNomina[];
  memoria: MemoriaConceptoRow[];
  reglasClase: ReadonlyMap<string, ClaseNomina>;
  mapeoCliente?: ReadonlyMap<string, string>;
  cuentasRussell6: readonly string[];
}): { renglones: RenglonConsolidadoNomina[]; agrupadores: AgrupadorConsolidado[] } {
  const consolidado = consolidarPorClasificador(
    input.detalle.map((d) => ({ clasificador: d.clasificador, valor: d.valor, agrupador: texto(d.datos.agrupador) })),
    { porAgrupador: true },
  );
  // Filas de cada renglón (para la cuenta del archivo y el nombre del concepto).
  const filasPorClave = new Map<string, FilaDetalleNomina[]>();
  for (const d of input.detalle) {
    const k = claveConsolidado(d.clasificador?.trim() || "(sin clasificar)", texto(d.datos.agrupador));
    filasPorClave.set(k, [...(filasPorClave.get(k) ?? []), d]);
  }
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
    const filas = filasPorClave.get(c.clasificador) ?? [];
    const descripcion = descripcionPorCodigo.get(codigo) ?? moda(filas, "concepto");
    const r = resolverCuentaConcepto(
      {
        clasificador: codigo,
        agrupador,
        nombre: descripcion,
        cuentaArchivo: moda(filas, "cuenta"),
        cuentasPorClaseArchivo: {
          "51": moda(filas, "cuentaAdmin"),
          "52": moda(filas, "cuentaVentas"),
          "72": moda(filas, "cuentaMOD"),
          "73": moda(filas, "cuentaMOI"),
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
