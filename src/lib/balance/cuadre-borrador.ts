// Veredicto «Cuadrado / Descuadrado» de un borrador de balance (lista de
// /balance/borradores). Un borrador está DESCUADRADO si cumple al menos una de
// estas cuatro condiciones, las mismas que muestra la pantalla del borrador:
//
//   1. Ecuación contable (Activo = Pasivo + Patrimonio + Resultado): la diferencia
//      alcanza el umbral «descuadre» (inclusive).
//   2. Partida doble del período (Σ débitos = Σ créditos): la diferencia alcanza el
//      umbral «descuadre» (inclusive).
//   (Hasta el 20/Oct/2026 estas dos usaban su propio margen, «cuadre_contable», que se retiró:
//   un solo parámetro, «Diferencias y descuadres del balance», rige las cuatro.)
//   3. Tarjetas por clase (total calculado vs total del archivo): una clase que no
//      cruza, que ninguna reubicación aprobada explica y cuya diferencia alcanza el
//      umbral «descuadre». El Resultado no cuenta: es derivado de ingresos, gastos y
//      costos, igual que en el diagnóstico.
//   4. Agrupadoras que no cuadran con su desglose, desde el umbral «descuadre».
//
// La lista no reconstruye el view-model de cada borrador: al guardar se persiste el
// RESUMEN de esas medidas (`ResumenCuadreBorrador`) y el veredicto se evalúa al leer
// con los umbrales VIGENTES, así cambiar un parámetro en /config/parametros cambia
// la lista de inmediato, igual que el detalle.
import { detectarManipulacionesRiesgosas, type FilaBorrador, type NodoBorrador } from "./borrador";
import { construirVistaBorrador, type VistaBorrador } from "./borrador-vm";
import { calcularExplicacionesClaseReubicacion } from "./conciliacion-reubicaciones";
import { colapsarTerceros, esBalancePorTercero } from "./terceros";
import { esDescuadreAccionable, type UmbralesAlertas } from "./umbrales-alertas";

export const VERSION_RESUMEN_CUADRE = 1;
/** Tope de agrupadoras guardadas (las de mayor diferencia). El veredicto no cambia
 *  al recortar: si alguna de las omitidas alcanza el umbral, las guardadas también. */
export const MAX_AGRUPADORAS_RESUMEN = 200;

export type ClaseResumen = "Activo" | "Pasivo" | "Patrimonio" | "Ingresos" | "Gastos" | "Costos";

export type ResumenCuadreBorrador = {
  v: number;
  /** `revision_contenido` del lote con que se calculó: si el lote cambió después
   *  (p. ej. lo editó una versión anterior de la app), el resumen no vale. */
  revision: number;
  ecuacionDiff: number;
  partidaDobleDiff: number;
  /** Clases que NO cruzan con el archivo y que ninguna reubicación aprobada explica. */
  clases: { clase: ClaseResumen; diff: number }[];
  /** Agrupadoras con diferencia ≠ 0, de mayor a menor (recortadas a `MAX_AGRUPADORAS_RESUMEN`). */
  agrupadoras: { codigo: string; diff: number }[];
  agrupadorasTotal: number;
};

export type MotivoDescuadre =
  | { tipo: "ecuacion"; monto: number }
  | { tipo: "partida_doble"; monto: number }
  | { tipo: "clases"; clases: { clase: ClaseResumen; diff: number }[] }
  | { tipo: "agrupadoras"; cantidad: number; masDe: boolean; codigos: string[] };

export type VeredictoCuadreBorrador =
  | { estado: "cuadrado"; motivos: [] }
  | { estado: "descuadrado"; motivos: MotivoDescuadre[] }
  /** Sin resumen vigente: la partida doble y la ecuación (si se conoce) cuadran,
   *  pero las clases y las agrupadoras no se pudieron revisar. */
  | { estado: "sin_verificar"; motivos: [] };

const redondear = (n: number) => Math.round(n * 100) / 100;

function aplanar(nodos: NodoBorrador[]): NodoBorrador[] {
  const out: NodoBorrador[] = [];
  const rec = (n: NodoBorrador) => { out.push(n); n.hijos.forEach(rec); };
  nodos.forEach(rec);
  return out;
}

/**
 * Resumen de las cuatro medidas a partir de la vista del borrador y de las filas
 * (sin mutar) con que se construyó. `filasRevisadas` son las reubicaciones que el
 * revisor aprobó (justificación guardada).
 */
export function resumirCuadreBorrador(
  vista: Pick<VistaBorrador, "validacion" | "partidaDoble" | "arbol" | "filasContabilizadas">,
  filas: FilaBorrador[],
  filasRevisadas: ReadonlySet<number>,
  revision: number,
): ResumenCuadreBorrador {
  const v = vista.validacion;
  const explicaciones = calcularExplicacionesClaseReubicacion(
    detectarManipulacionesRiesgosas(filas),
    filasRevisadas,
    new Set(vista.filasContabilizadas),
    { "1": v.activoDiff, "2": v.pasivoDiff, "3": v.patrimonioDiff, "4": v.ingresosDiff, "5": v.gastosDiff, "6": v.costosDiff },
  );
  const tarjetas: { clase: ClaseResumen; codigo: string; diff: number | null; cuadra: boolean | null }[] = [
    { clase: "Activo", codigo: "1", diff: v.activoDiff, cuadra: v.activoCuadra },
    { clase: "Pasivo", codigo: "2", diff: v.pasivoDiff, cuadra: v.pasivoCuadra },
    { clase: "Patrimonio", codigo: "3", diff: v.patrimonioDiff, cuadra: v.patrimonioCuadra },
    { clase: "Ingresos", codigo: "4", diff: v.ingresosDiff, cuadra: v.ingresosCuadra },
    { clase: "Gastos", codigo: "5", diff: v.gastosDiff, cuadra: v.gastosCuadra },
    { clase: "Costos", codigo: "6", diff: v.costosDiff, cuadra: v.costosCuadra },
  ];
  const clases = tarjetas
    .filter((t) => t.cuadra === false && t.diff != null && explicaciones.get(t.codigo)?.resuelta !== true)
    .map((t) => ({ clase: t.clase, diff: redondear(t.diff!) }));
  const agrupadoras = aplanar(vista.arbol)
    .filter((n) => n.descuadre != null && n.descuadre !== 0)
    .map((n) => ({ codigo: n.codigo || n.codigoCrudo, diff: redondear(n.descuadre!) }))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  return {
    v: VERSION_RESUMEN_CUADRE,
    revision,
    ecuacionDiff: redondear(v.ecuacionDiff),
    partidaDobleDiff: redondear(vista.partidaDoble.diff),
    clases,
    agrupadoras: agrupadoras.slice(0, MAX_AGRUPADORAS_RESUMEN),
    agrupadorasTotal: agrupadoras.length,
  };
}

/**
 * Construye la vista como la pantalla del borrador —terceros con NIT colapsados
 * como en `stagingBorradorLote`, agrupadoras forzadas a mano y auxiliares
 * consolidados— y la resume. No muta `filas`.
 */
export function resumenCuadreDeFilas(
  filas: FilaBorrador[],
  filasRevisadas: ReadonlySet<number>,
  revision: number,
): ResumenCuadreBorrador {
  const base = esBalancePorTercero(filas) ? colapsarTerceros(filas) : filas;
  const vista = construirVistaBorrador(base.map((f) => ({ ...f })), {
    preservarAgrupadorasForzadas: true,
    consolidarAuxiliares: true,
  });
  return resumirCuadreBorrador(vista, base, filasRevisadas, revision);
}

/** Fila del staging tal como la lee Prisma (montos `Decimal`). */
export type FilaStagingCuadre = {
  filaNum: number;
  codigo: string;
  codigoCrudo: string;
  nombre: string;
  nivel: number | null;
  tipoFila: string;
  tipoFilaForzado: string | null;
  desacoplada: boolean;
  omitida: boolean | null;
  padreManual: number | null;
  saldoInicial: unknown;
  debitos: unknown;
  creditos: unknown;
  saldoFinal: unknown;
  justificacionReubicacion: string | null;
  reubicacionRevisadaEn: Date | null;
};

/** Columnas que necesita el resumen (mismo orden de lectura: `filaNum` ascendente). */
export const SELECT_STAGING_CUADRE = {
  filaNum: true, codigo: true, codigoCrudo: true, nombre: true, nivel: true,
  tipoFila: true, tipoFilaForzado: true, desacoplada: true, omitida: true, padreManual: true,
  saldoInicial: true, debitos: true, creditos: true, saldoFinal: true,
  justificacionReubicacion: true, reubicacionRevisadaEn: true,
} as const;

/** Staging → filas del borrador, con el tri-estado `omitida` de la pantalla (null → sin tocar). */
export function filasBorradorDeStaging(rows: readonly FilaStagingCuadre[]): FilaBorrador[] {
  return rows.map((f) => ({
    filaNum: f.filaNum,
    codigo: f.codigo,
    codigoCrudo: f.codigoCrudo,
    nombre: f.nombre,
    nivel: f.nivel,
    tipoFila: f.tipoFila as FilaBorrador["tipoFila"],
    tipoFilaForzado: f.tipoFilaForzado === "agrupadora" || f.tipoFilaForzado === "movimiento" ? f.tipoFilaForzado : null,
    desacoplada: f.desacoplada,
    omitida: f.omitida ?? undefined,
    padreManual: f.padreManual,
    saldoInicial: Number(f.saldoInicial),
    debitos: Number(f.debitos),
    creditos: Number(f.creditos),
    saldoFinal: Number(f.saldoFinal),
  }));
}

/** Reubicaciones aprobadas: justificación guardada y fecha de revisión, como en la pantalla. */
export function reubicacionesAprobadasDeStaging(rows: readonly FilaStagingCuadre[]): Set<number> {
  return new Set(rows.filter((f) => f.justificacionReubicacion?.trim() && f.reubicacionRevisadaEn).map((f) => f.filaNum));
}

const esNumero = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const CLASES: ReadonlySet<string> = new Set(["Activo", "Pasivo", "Patrimonio", "Ingresos", "Gastos", "Costos"]);

/** Lee el JSON guardado en el lote. null si falta, es de otra versión o está mal formado. */
export function leerResumenCuadre(json: unknown): ResumenCuadreBorrador | null {
  if (json == null || typeof json !== "object" || Array.isArray(json)) return null;
  const r = json as Record<string, unknown>;
  if (r.v !== VERSION_RESUMEN_CUADRE || !esNumero(r.revision) || !esNumero(r.ecuacionDiff)
    || !esNumero(r.partidaDobleDiff) || !esNumero(r.agrupadorasTotal)
    || !Array.isArray(r.clases) || !Array.isArray(r.agrupadoras)) return null;
  const clases = r.clases.filter((c): c is { clase: ClaseResumen; diff: number } =>
    c != null && typeof c === "object" && CLASES.has((c as { clase?: unknown }).clase as string) && esNumero((c as { diff?: unknown }).diff));
  const agrupadoras = r.agrupadoras.filter((a): a is { codigo: string; diff: number } =>
    a != null && typeof a === "object" && typeof (a as { codigo?: unknown }).codigo === "string" && esNumero((a as { diff?: unknown }).diff));
  if (clases.length !== r.clases.length || agrupadoras.length !== r.agrupadoras.length) return null;
  return {
    v: r.v,
    revision: r.revision,
    ecuacionDiff: r.ecuacionDiff,
    partidaDobleDiff: r.partidaDobleDiff,
    clases,
    agrupadoras,
    agrupadorasTotal: r.agrupadorasTotal,
  };
}

/** Las condiciones 1 y 2: ecuación y partida doble desde el umbral «descuadre» (inclusive). */
function motivosIdentidades(
  ecuacionDiff: number | null,
  partidaDobleDiff: number,
  umbrales: UmbralesAlertas,
): MotivoDescuadre[] {
  const motivos: MotivoDescuadre[] = [];
  if (ecuacionDiff != null && esDescuadreAccionable(ecuacionDiff, umbrales)) {
    motivos.push({ tipo: "ecuacion", monto: ecuacionDiff });
  }
  if (esDescuadreAccionable(partidaDobleDiff, umbrales)) {
    motivos.push({ tipo: "partida_doble", monto: partidaDobleDiff });
  }
  return motivos;
}

/** Veredicto con las cuatro condiciones sobre un resumen vigente. */
export function evaluarCuadreBorrador(
  resumen: ResumenCuadreBorrador,
  umbrales: UmbralesAlertas,
): VeredictoCuadreBorrador {
  const motivos = motivosIdentidades(resumen.ecuacionDiff, resumen.partidaDobleDiff, umbrales);
  const clases = resumen.clases.filter((c) => esDescuadreAccionable(c.diff, umbrales));
  if (clases.length > 0) motivos.push({ tipo: "clases", clases });
  const agrupadoras = resumen.agrupadoras.filter((a) => esDescuadreAccionable(a.diff, umbrales));
  if (agrupadoras.length > 0) {
    // Si se guardaron recortadas y TODAS las guardadas alcanzan el umbral, puede
    // haber más entre las omitidas: se informa «más de N».
    const masDe = resumen.agrupadorasTotal > resumen.agrupadoras.length
      && agrupadoras.length === resumen.agrupadoras.length;
    motivos.push({
      tipo: "agrupadoras",
      cantidad: agrupadoras.length,
      masDe,
      codigos: agrupadoras.slice(0, 5).map((a) => a.codigo),
    });
  }
  return motivos.length > 0 ? { estado: "descuadrado", motivos } : { estado: "cuadrado", motivos: [] };
}

/** Las cuatro condiciones (su orden y sus rótulos viven en `comentarios-descuadre.ts`). */
export type TipoMotivoDescuadre = MotivoDescuadre["tipo"];

/** Una condición que fallaba al cargar, con el comentario que la justifica (uno por condición). */
export type MotivoConComentario = MotivoDescuadre & { comentario: string };

/** De dónde salió el descuadre: el borrador (cualquier condición) o el archivo fuente (la ecuación). */
export type OrigenDescuadre = "borrador" | "archivo_fuente";

/**
 * Constancia que guarda el balance cuando se carga un borrador «Descuadrado» o con la diferencia
 * del archivo fuente (`balance_prueba_encabezado.descuadre_borrador`): qué condiciones fallaban,
 * por cuánto, con qué umbral y el comentario de cada una. Forma la «Justificación del descuadre»
 * del balance cargado. Tiene versión propia (no la del resumen de la lista):
 *  - v1 (19/Oct/2026): las condiciones y los dos umbrales de entonces; el comentario, uno solo,
 *    vive en `comentario_aprobacion`.
 *  - v2 (20/Oct/2026): un comentario por condición, el umbral único y el origen.
 */
export const VERSION_CONSTANCIA_DESCUADRE = 2;

export type DescuadreAlCargarV1 = {
  v: 1;
  motivos: MotivoDescuadre[];
  umbrales: { cuadre_contable: number; descuadre: number };
};

export type DescuadreAlCargarV2 = {
  v: 2;
  origen: OrigenDescuadre;
  motivos: MotivoConComentario[];
  umbrales: { descuadre: number };
};

export type DescuadreAlCargar = DescuadreAlCargarV1 | DescuadreAlCargarV2;

export function constanciaDescuadre(
  motivos: MotivoConComentario[],
  umbrales: UmbralesAlertas,
  origen: OrigenDescuadre = "borrador",
): DescuadreAlCargarV2 {
  return { v: VERSION_CONSTANCIA_DESCUADRE, origen, motivos, umbrales: { descuadre: umbrales.descuadre } };
}

function esMotivo(m: unknown): m is MotivoDescuadre {
  if (m == null || typeof m !== "object") return false;
  const r = m as Record<string, unknown>;
  switch (r.tipo) {
    case "ecuacion":
    case "partida_doble":
      return esNumero(r.monto);
    case "clases":
      return Array.isArray(r.clases) && r.clases.length > 0 && r.clases.every((c) =>
        c != null && typeof c === "object" && CLASES.has((c as { clase?: unknown }).clase as string) && esNumero((c as { diff?: unknown }).diff));
    case "agrupadoras":
      return esNumero(r.cantidad) && typeof r.masDe === "boolean"
        && Array.isArray(r.codigos) && r.codigos.every((c) => typeof c === "string");
    default:
      return false;
  }
}

function esMotivoConComentario(m: unknown): m is MotivoConComentario {
  if (m == null || typeof m !== "object") return false;
  const comentario = (m as Record<string, unknown>).comentario;
  return esMotivo(m) && typeof comentario === "string" && comentario.trim().length > 0;
}

/** Lee la constancia guardada en el balance (v1 o v2). null si falta o está mal formada. */
export function leerDescuadreAlCargar(json: unknown): DescuadreAlCargar | null {
  if (json == null || typeof json !== "object" || Array.isArray(json)) return null;
  const r = json as Record<string, unknown>;
  const u = r.umbrales as Record<string, unknown> | undefined;
  if (!Array.isArray(r.motivos) || r.motivos.length === 0 || u == null || typeof u !== "object" || !esNumero(u.descuadre)) {
    return null;
  }
  if (r.v === 1) {
    if (!r.motivos.every(esMotivo) || !esNumero(u.cuadre_contable)) return null;
    return { v: 1, motivos: r.motivos, umbrales: { cuadre_contable: u.cuadre_contable, descuadre: u.descuadre } };
  }
  if (r.v === VERSION_CONSTANCIA_DESCUADRE) {
    if (r.origen !== "borrador" && r.origen !== "archivo_fuente") return null;
    if (!r.motivos.every(esMotivoConComentario)) return null;
    // Una condición, un comentario: un tipo repetido no es una constancia válida.
    if (new Set(r.motivos.map((m) => m.tipo)).size !== r.motivos.length) return null;
    return { v: 2, origen: r.origen, motivos: r.motivos, umbrales: { descuadre: u.descuadre } };
  }
  return null;
}

/**
 * Veredicto de una fila de la lista. Con resumen vigente evalúa las cuatro
 * condiciones; sin él (lote de antes de este cambio, editado por una versión
 * anterior de la app o sin encabezado) solo puede afirmar el descuadre por la
 * ecuación o la partida doble: si esas cuadran, queda «sin verificar».
 */
export function veredictoBorradorLista(
  entrada: {
    resumen: ResumenCuadreBorrador | null;
    revisionLote: number | null;
    ecuacionDiff: number | null;
    partidaDobleDiff: number;
  },
  umbrales: UmbralesAlertas,
): VeredictoCuadreBorrador {
  const { resumen } = entrada;
  if (resumen && entrada.revisionLote != null && resumen.revision === entrada.revisionLote) {
    return evaluarCuadreBorrador(resumen, umbrales);
  }
  const motivos = motivosIdentidades(entrada.ecuacionDiff, entrada.partidaDobleDiff, umbrales);
  return motivos.length > 0 ? { estado: "descuadrado", motivos } : { estado: "sin_verificar", motivos: [] };
}
