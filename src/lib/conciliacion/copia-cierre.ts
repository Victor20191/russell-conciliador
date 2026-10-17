// COPIA CONGELADA de una conciliación de módulo en firme (14/Oct/2026) — puro, sin `server-only`
// (la usan el cierre, el cargador de insumos del período y el script que respalda los cierres
// anteriores).
//
// El cruce de un período se recalcula al leer. Lo que es del PERÍODO (detalle del cargue, marcas,
// emparejamientos, fecha de corte, agrupar por) queda inmutable con la conciliación en
// firme por las protecciones de las acciones. Pero varios insumos son del CLIENTE o de la
// plataforma y se comparten entre meses: la memoria del Consolidado, las clases por centro y la
// homologación de cuentas de Nómina, las reglas del prevalidador, el umbral del cruce por tercero y
// qué cuentas del balance son agrupadoras. Cambiarlos desde otro mes alteraba una conciliación
// cerrada. Al cerrar se guarda aquí lo que el cruce evaluó, y mientras el cierre esté en firme el
// cruce, el Consolidado y el Excel del período leen esta copia.
import { createHash } from "node:crypto";
import type { FilaCatalogoPrevalidador } from "@/lib/balance/prevalidador/catalogo";
import type { FilaAsignacionPeriodo } from "@/lib/modulos/asignacion-periodo";
import type { FilaConsolidacionPeriodo } from "@/lib/modulos/asignacion-periodo-lectura";
import { esAgruparPor, type AgruparPorNomina } from "@/lib/modulos/nomina/agrupar-por";
import { esClaseNomina, type ClaseNomina } from "@/lib/modulos/nomina/homologacion";

export const VERSION_COPIA_CIERRE = 1;

export type OrigenCopiaCierre = "cierre" | "respaldo";

export type CopiaCierreV1 = {
  version: 1;
  /** `cierre`: tomada al cerrar. `respaldo`: tomada después por el script, para un cierre anterior. */
  origen: OrigenCopiaCierre;
  /** ISO. */
  tomadaEn: string;
  /** El cargue que se cerró. */
  encabezadoId: number;
  /** Dimensión del Consolidado copiado («codigo» fuera de Nómina). */
  agruparPor: AgruparPorNomina;
  /** El Consolidado del período ya fundido (memoria + asignación del período) y la asignación propia. */
  consolidacion: { filas: FilaConsolidacionPeriodo[]; filasPeriodo: FilaAsignacionPeriodo[] };
  /** Reglas activas del prevalidador DEL MÓDULO: dan los prefijos de la cédula y el signo contable. */
  catalogo: FilaCatalogoPrevalidador[];
  /** Nómina: clases por centro de costo y homologación de las cuentas del cliente (cuenta → Russell 6). */
  nomina: { clases: { agrupador: string; clase: ClaseNomina }[]; mapeoCliente: [string, string][] } | null;
  /** Cuentas del cliente (cuenta_8) que el cruce excluyó por agrupadoras en el balance conciliado. */
  agrupadorasExcluidas: string[];
  /** Umbral de descuadre del cruce por tercero (Cartera, CxP); null en los demás módulos. */
  umbralDescuadre: number | null;
  /** SHA-256 del contenido (sin origen, fecha ni la propia huella). */
  huella: string;
};

export type InsumosCopiaCierre = {
  consolidacion: { filas: FilaConsolidacionPeriodo[]; filasPeriodo: FilaAsignacionPeriodo[] };
  catalogoPrevalidador: FilaCatalogoPrevalidador[];
  nomina: { reglasClase: Map<string, ClaseNomina>; mapeoCliente: Map<string, string> } | null;
  agrupadorasExcluidas: Set<string>;
  umbralDescuadre: number | null;
};

const comparar = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const llaveConsolidacion = (f: FilaConsolidacionPeriodo) =>
  [f.clasificador, f.agrupador, f.cuenta4, f.cuenta6, f.cuentaCliente, f.soloPeriodo ? "1" : "0"].join("\u0001");
const llaveAsignacion = (f: FilaAsignacionPeriodo) => [f.clasificador, f.agrupador, f.cuenta4, f.cuenta6].join("\u0001");

/** JSON con las llaves ordenadas: la huella no depende del orden en que se armó el objeto. */
function jsonCanonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(",")}]`;
  if (valor && typeof valor === "object") {
    const entradas = Object.entries(valor as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => comparar(a, b));
    return `{${entradas.map(([k, v]) => `${JSON.stringify(k)}:${jsonCanonico(v)}`).join(",")}}`;
  }
  return JSON.stringify(valor ?? null);
}

/** Huella del contenido de la copia: lo que no es metadato. */
export function huellaCopiaCierre(copia: Omit<CopiaCierreV1, "origen" | "tomadaEn" | "huella">): string {
  return createHash("sha256").update(jsonCanonico(copia)).digest("hex");
}

/**
 * Arma la copia con los insumos que el cruce EVALUÓ. Ordena las filas para que la misma información
 * dé siempre la misma huella, deja del catálogo solo las reglas activas del módulo y de la
 * homologación de Nómina solo pares válidos.
 */
export function construirCopiaCierre(p: {
  origen: OrigenCopiaCierre;
  tomadaEn: Date;
  encabezadoId: number;
  moduloCodigo: string;
  agruparPor: AgruparPorNomina;
  consolidacion: { filas: readonly FilaConsolidacionPeriodo[]; filasPeriodo: readonly FilaAsignacionPeriodo[] };
  catalogo: readonly FilaCatalogoPrevalidador[];
  nomina: { reglasClase: ReadonlyMap<string, ClaseNomina>; mapeoCliente: ReadonlyMap<string, string> } | null;
  agrupadorasExcluidas: Iterable<string>;
  umbralDescuadre: number | null;
}): CopiaCierreV1 {
  const contenido = {
    version: 1 as const,
    encabezadoId: p.encabezadoId,
    agruparPor: p.agruparPor,
    consolidacion: {
      filas: p.consolidacion.filas
        .map((f) => ({
          clasificador: f.clasificador,
          cuenta4: f.cuenta4,
          cuenta6: f.cuenta6,
          agrupador: f.agrupador,
          descripcion: f.descripcion ?? null,
          grupo: f.grupo ?? null,
          subcuentaPuc: f.subcuentaPuc ?? null,
          cuentaCliente: f.cuentaCliente,
          soloPeriodo: f.soloPeriodo,
        }))
        .sort((a, b) => comparar(llaveConsolidacion(a), llaveConsolidacion(b))),
      filasPeriodo: p.consolidacion.filasPeriodo
        .map((f) => ({ clasificador: f.clasificador, agrupador: f.agrupador, cuenta4: f.cuenta4, cuenta6: f.cuenta6 }))
        .sort((a, b) => comparar(llaveAsignacion(a), llaveAsignacion(b))),
    },
    catalogo: p.catalogo
      .filter((f) => f.moduloCodigo === p.moduloCodigo && f.activa !== false)
      .map((f) => ({ ...f }))
      .sort((a, b) => a.orden - b.orden || comparar(a.cuentaRussell, b.cuentaRussell)),
    nomina: p.nomina
      ? {
          clases: [...p.nomina.reglasClase.entries()]
            .map(([agrupador, clase]) => ({ agrupador, clase }))
            .sort((a, b) => comparar(a.agrupador, b.agrupador)),
          mapeoCliente: [...p.nomina.mapeoCliente.entries()]
            .filter(([cuenta, russell]) => cuenta !== "" && russell !== "")
            .sort(([a], [b]) => comparar(a, b)) as [string, string][],
        }
      : null,
    agrupadorasExcluidas: [...new Set(p.agrupadorasExcluidas)].sort(comparar),
    umbralDescuadre: p.umbralDescuadre,
  };
  return { ...contenido, origen: p.origen, tomadaEn: p.tomadaEn.toISOString(), huella: huellaCopiaCierre(contenido) };
}

export type LecturaCopiaCierre =
  | { ok: true; copia: CopiaCierreV1 }
  | { ok: false; motivo: "ausente" | "invalida" | "version_desconocida" };

const esTexto = (v: unknown): v is string => typeof v === "string";
const esTextoONulo = (v: unknown): v is string | null => v === null || typeof v === "string";

function esFilaConsolidacion(v: unknown): v is FilaConsolidacionPeriodo {
  if (!v || typeof v !== "object") return false;
  const f = v as Record<string, unknown>;
  return esTexto(f.clasificador) && esTexto(f.cuenta4) && esTexto(f.cuenta6) && esTexto(f.agrupador)
    && esTextoONulo(f.descripcion) && esTextoONulo(f.grupo) && esTextoONulo(f.subcuentaPuc)
    && esTexto(f.cuentaCliente) && typeof f.soloPeriodo === "boolean";
}

function esFilaAsignacion(v: unknown): v is FilaAsignacionPeriodo {
  if (!v || typeof v !== "object") return false;
  const f = v as Record<string, unknown>;
  return esTexto(f.clasificador) && esTexto(f.agrupador) && esTexto(f.cuenta4) && esTexto(f.cuenta6);
}

function esFilaCatalogo(v: unknown, moduloCodigo: string): v is FilaCatalogoPrevalidador {
  if (!v || typeof v !== "object") return false;
  const f = v as Record<string, unknown>;
  const prefijo = esTexto(f.cuentaRussell) ? f.cuentaRussell.replace(/\D/g, "") : "";
  return typeof f.id === "number" && f.moduloCodigo === moduloCodigo && esTexto(f.moduloNombre)
    && typeof f.moduloOrden === "number" && (prefijo.length === 2 || prefijo.length === 4)
    && esTextoONulo(f.etiqueta) && (f.baseCalculo === "saldo" || f.baseCalculo === "movimiento")
    && typeof f.orden === "number" && f.activa === true;
}

/**
 * Lee y VALIDA la copia guardada en el cierre de `moduloCodigo`. Una copia que no pasa la validación
 * —o cuya huella no coincide con su contenido— se rechaza: el cruce del período cerrado se bloquea en
 * vez de mostrar cifras de una copia dudosa.
 */
export function leerCopiaCierre(json: unknown, moduloCodigo: string): LecturaCopiaCierre {
  if (json == null) return { ok: false, motivo: "ausente" };
  if (typeof json !== "object" || Array.isArray(json)) return { ok: false, motivo: "invalida" };
  const c = json as Record<string, unknown>;
  if (c.version !== VERSION_COPIA_CIERRE) return { ok: false, motivo: "version_desconocida" };
  const consolidacion = c.consolidacion as Record<string, unknown> | null | undefined;
  const nomina = c.nomina as Record<string, unknown> | null | undefined;
  const valida =
    (c.origen === "cierre" || c.origen === "respaldo")
    && esTexto(c.tomadaEn)
    && typeof c.encabezadoId === "number"
    && esAgruparPor(c.agruparPor)
    && !!consolidacion && typeof consolidacion === "object"
    && Array.isArray(consolidacion.filas) && consolidacion.filas.every(esFilaConsolidacion)
    && Array.isArray(consolidacion.filasPeriodo) && consolidacion.filasPeriodo.every(esFilaAsignacion)
    && Array.isArray(c.catalogo) && c.catalogo.every((f) => esFilaCatalogo(f, moduloCodigo))
    && (nomina === null || (
      !!nomina && typeof nomina === "object"
      && Array.isArray(nomina.clases) && nomina.clases.every((x) => !!x && typeof x === "object" && esTexto((x as Record<string, unknown>).agrupador) && esClaseNomina((x as Record<string, unknown>).clase))
      && Array.isArray(nomina.mapeoCliente) && nomina.mapeoCliente.every((x) => Array.isArray(x) && x.length === 2 && esTexto(x[0]) && esTexto(x[1]))
    ))
    && Array.isArray(c.agrupadorasExcluidas) && c.agrupadorasExcluidas.every(esTexto)
    && (c.umbralDescuadre === null || (typeof c.umbralDescuadre === "number" && Number.isFinite(c.umbralDescuadre)))
    && esTexto(c.huella);
  if (!valida) return { ok: false, motivo: "invalida" };
  const copia = json as CopiaCierreV1;
  const { origen: _o, tomadaEn: _t, huella, ...contenido } = copia;
  void _o;
  void _t;
  if (huellaCopiaCierre(contenido) !== huella) return { ok: false, motivo: "invalida" };
  return { ok: true, copia };
}

/** Los insumos del cruce reconstruidos de la copia, con la misma forma que los leídos en vivo. */
export function insumosDesdeCopia(copia: CopiaCierreV1): InsumosCopiaCierre {
  return {
    consolidacion: {
      filas: copia.consolidacion.filas.map((f) => ({ ...f })),
      filasPeriodo: copia.consolidacion.filasPeriodo.map((f) => ({ ...f })),
    },
    catalogoPrevalidador: copia.catalogo.map((f) => ({ ...f })),
    nomina: copia.nomina
      ? {
          reglasClase: new Map(copia.nomina.clases.map((c) => [c.agrupador, c.clase])),
          mapeoCliente: new Map(copia.nomina.mapeoCliente),
        }
      : null,
    agrupadorasExcluidas: new Set(copia.agrupadorasExcluidas),
    umbralDescuadre: copia.umbralDescuadre,
  };
}

/** Texto corto de dónde salen los insumos del período cerrado, para el panel de la conciliación. */
export function descripcionCopiaCierre(copia: { origen: OrigenCopiaCierre; tomadaEn: string } | null, fmtFecha: (iso: string) => string): string {
  if (!copia) return "Sin copia congelada: este cierre es anterior y su cruce lee la memoria vigente del cliente.";
  return copia.origen === "cierre"
    ? `Insumos congelados al cerrar (${fmtFecha(copia.tomadaEn)}).`
    : `Insumos congelados por respaldo el ${fmtFecha(copia.tomadaEn)}: el cierre es anterior a la copia.`;
}
