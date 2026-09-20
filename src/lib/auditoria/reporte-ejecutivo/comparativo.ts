// Comparativo de uso entre el período del reporte actual y el del reporte
// ANTERIOR: ¿el equipo de Russell usó más o menos la plataforma?
//
// Módulo PURO: recibe dos `ResumenUsoFactual` ya calculados y devuelve las
// variaciones. No consulta BD ni decide de dónde sale el período previo (eso
// vive en `comparativo-servidor.ts`).
//
// Dos cuidados que definen el diseño:
//  1. **Períodos de distinta duración.** Comparar 30 días contra 14 en cifras
//     absolutas engaña. Por eso cada variación viaja también en PROMEDIO DIARIO
//     y el comparativo se marca `comparable: false` cuando las duraciones
//     difieren más del 10 %: la UI lo advierte en vez de callarlo.
//  2. **Usuarios y clientes no se suman entre períodos.** `totalUsuarios` es un
//     conteo de distintos: su variación se lee como «cuántos operaron», nunca
//     como un acumulado.
import type { ConteoNombrado, ResumenUsoFactual } from "./metricas";

export type DireccionVariacion = "subio" | "bajo" | "igual";

export type VariacionUso = {
  etiqueta: string;
  actual: number;
  previo: number;
  diferencia: number;
  /** Variación porcentual; null si el período previo estaba en cero (no se divide por cero). */
  variacionPct: number | null;
  direccion: DireccionVariacion;
};

/** De dónde salió el período de comparación. */
export type BaseComparativo = "reporte_anterior" | "periodo_anterior";

export type PeriodoComparado = {
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
  dias: number;
};

export type ComparativoUso = {
  base: BaseComparativo;
  /** Cuándo se generó el reporte previo (solo cuando la base es un reporte). */
  generadoEn: string | null;
  actual: PeriodoComparado;
  previo: PeriodoComparado;
  /** false cuando las duraciones difieren > 10 %: las cifras absolutas no son equiparables. */
  comparable: boolean;
  /** Operaciones, usuarios, conexiones, visitas y clientes. */
  totales: VariacionUso[];
  /** Operaciones por día: la lectura honesta cuando los períodos no miden igual. */
  promedioDiario: VariacionUso;
  porFamilia: VariacionUso[];
  /** Solo entre los usuarios más activos de cada período. */
  porUsuario: VariacionUso[];
};

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Zona horaria de la operación. Los períodos se declaran en horas locales
 * (00:00 → 23:59:59) y se guardan en UTC: recortar el ISO mostraría el día
 * siguiente en la fecha final. Colombia es la sede de la operación.
 */
export const ZONA_HORARIA_OPERACION = "America/Bogota";

const formatoFecha = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_HORARIA_OPERACION,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * ISO → YYYY-MM-DD legible.
 *
 * Los dos orígenes de un período no usan la misma convención: el reporte
 * generado toma las fechas del formulario y las fija a medianoche UTC, mientras
 * que el tablero arma su ventana con la hora LOCAL del servidor. Formatear todo
 * en una sola zona corría un día alguna de las dos. Por eso, un instante que ya
 * es una fecha de calendario declarada en UTC (medianoche exacta o el último
 * milisegundo del día) se lee tal cual, y cualquier otro se traduce a la zona de
 * la operación.
 */
export function soloFecha(iso: string): string {
  if (/T00:00:00(\.000)?Z$/.test(iso) || /T23:59:59(\.999)?Z$/.test(iso)) return iso.slice(0, 10);
  const t = Date.parse(iso);
  return Number.isFinite(t) ? formatoFecha.format(new Date(t)) : iso.slice(0, 10);
}

/**
 * Duración del período en días, por DIFERENCIA entre sus extremos redondeada.
 * Un período de 00:00 a 23:59:59 mide 29 d 23 h 59 min y debe leerse como 30,
 * y contar días de calendario fallaría con los que se guardaron a medianoche.
 */
export function diasDePeriodo(desdeIso: string, hastaIso: string): number {
  const desde = Date.parse(desdeIso);
  const hasta = Date.parse(hastaIso);
  if (!Number.isFinite(desde) || !Number.isFinite(hasta)) return 1;
  return Math.max(1, Math.round((hasta - desde) / DIA_MS));
}

const redondear2 = (n: number): number => Math.round(n * 100) / 100;

const formatoNumero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
/** Número en formato colombiano (coma decimal), para los textos de la alerta. */
const num = (n: number): string => formatoNumero.format(n);

/** Una variación. `previo` en cero deja `variacionPct` en null: no hay base sobre la cual crecer. */
export function variacion(etiqueta: string, actual: number, previo: number): VariacionUso {
  const a = Number.isFinite(actual) ? actual : 0;
  const p = Number.isFinite(previo) ? previo : 0;
  const diferencia = redondear2(a - p);
  return {
    etiqueta,
    actual: redondear2(a),
    previo: redondear2(p),
    diferencia,
    variacionPct: p > 0 ? redondear2(((a - p) / p) * 100) : null,
    direccion: diferencia > 0 ? "subio" : diferencia < 0 ? "bajo" : "igual",
  };
}

/** Une dos listas nombradas por etiqueta, conservando el orden por magnitud actual. */
function unirConteos(actual: ConteoNombrado[], previo: ConteoNombrado[]): VariacionUso[] {
  const mapaPrevio = new Map(previo.map((c) => [c.nombre, c.total]));
  const mapaActual = new Map(actual.map((c) => [c.nombre, c.total]));
  const etiquetas = new Set([...mapaActual.keys(), ...mapaPrevio.keys()]);
  return Array.from(etiquetas)
    .map((etiqueta) => variacion(etiqueta, mapaActual.get(etiqueta) ?? 0, mapaPrevio.get(etiqueta) ?? 0))
    .sort((a, b) => b.actual - a.actual || Math.abs(b.diferencia) - Math.abs(a.diferencia) || a.etiqueta.localeCompare(b.etiqueta, "es"));
}

/** Tolerancia de duración: más allá de esto, las cifras absolutas no son equiparables. */
const TOLERANCIA_DURACION = 0.1;

export function compararUso(params: {
  actual: ResumenUsoFactual;
  previo: ResumenUsoFactual;
  base: BaseComparativo;
  generadoEn?: string | null;
  maxUsuarios?: number;
}): ComparativoUso {
  const { actual, previo } = params;
  const diasActual = diasDePeriodo(actual.periodoDesde, actual.periodoHasta);
  const diasPrevio = diasDePeriodo(previo.periodoDesde, previo.periodoHasta);
  const desvio = Math.abs(diasActual - diasPrevio) / Math.max(diasActual, diasPrevio);

  const totales = [
    variacion("Operaciones registradas", actual.totalAcciones, previo.totalAcciones),
    variacion("Usuarios que operaron", actual.totalUsuarios, previo.totalUsuarios),
    variacion("Inicios de sesión", actual.totalConexiones, previo.totalConexiones),
    variacion("Visitas a módulos", actual.totalNavegaciones, previo.totalNavegaciones),
    variacion("Clientes con operaciones", actual.totalClientes, previo.totalClientes),
  ];

  const usuariosActual = actual.topUsuarios.map((u) => ({ nombre: u.usuario, total: u.total }));
  const usuariosPrevio = previo.topUsuarios.map((u) => ({ nombre: u.usuario, total: u.total }));

  return {
    base: params.base,
    generadoEn: params.generadoEn ?? null,
    actual: { desde: soloFecha(actual.periodoDesde), hasta: soloFecha(actual.periodoHasta), dias: diasActual },
    previo: { desde: soloFecha(previo.periodoDesde), hasta: soloFecha(previo.periodoHasta), dias: diasPrevio },
    comparable: desvio <= TOLERANCIA_DURACION,
    totales,
    promedioDiario: variacion(
      "Operaciones por día",
      actual.totalAcciones / diasActual,
      previo.totalAcciones / diasPrevio,
    ),
    porFamilia: unirConteos(actual.porFamilia, previo.porFamilia),
    porUsuario: unirConteos(usuariosActual, usuariosPrevio).slice(0, params.maxUsuarios ?? 10),
  };
}

/**
 * Frase de titular para la UI y el documento. Se apoya en el promedio diario
 * cuando los períodos no miden lo mismo, que es cuando el total absoluto miente.
 */
export function titularComparativo(c: ComparativoUso): string {
  const medida = c.comparable ? c.totales[0] : c.promedioDiario;
  const que = c.comparable ? "las operaciones" : "las operaciones por día";
  const desde = c.base === "reporte_anterior" ? "frente al reporte anterior" : "frente al período anterior";
  if (medida.direccion === "igual") return `El uso se mantuvo igual ${desde}.`;
  const verbo = medida.direccion === "subio" ? "subieron" : "bajaron";
  const pct = medida.variacionPct == null ? null : Math.abs(medida.variacionPct);
  const magnitud = pct == null ? `${num(Math.abs(medida.diferencia))} ${que}` : `${num(pct)} %`;
  return `El uso ${medida.direccion === "subio" ? "subió" : "bajó"}: ${que} ${verbo} ${magnitud} ${desde}.`;
}

/* ===== Alerta visible de subida o bajada ===== */

export type NivelAlertaUso = "alza" | "baja" | "estable";

export type AlertaUso = {
  nivel: NivelAlertaUso;
  /** Titular corto para el banner. */
  titulo: string;
  /** Frase explicativa con la magnitud y el período de referencia. */
  mensaje: string;
  /** La medida en la que se apoya la alerta (total o promedio diario). */
  medida: VariacionUso;
};

/**
 * Umbral de MATERIALIDAD en puntos porcentuales. Por debajo de esto el uso se
 * considera estable: sin él, un ±1 % de ruido dispararía una alerta cada mes y
 * la alerta dejaría de significar algo.
 */
export const UMBRAL_ALERTA_USO_PCT = 5;

/**
 * Alerta de uso para el tablero y el documento. Cuando los períodos no miden lo
 * mismo se apoya en el PROMEDIO DIARIO, que es la única comparación honesta ahí.
 */
export function alertaComparativo(c: ComparativoUso, umbralPct: number = UMBRAL_ALERTA_USO_PCT): AlertaUso {
  const medida = c.comparable ? c.totales[0] : c.promedioDiario;
  const referencia = c.base === "reporte_anterior" ? "al reporte anterior" : "al período anterior";
  const ventana = `${c.previo.desde} → ${c.previo.hasta}`;
  const pct = medida.variacionPct;
  const magnitud = pct == null
    ? `${num(Math.abs(medida.diferencia))} ${c.comparable ? "operaciones" : "operaciones por día"}`
    : `${num(Math.abs(pct))} %`;

  if (pct != null && Math.abs(pct) < umbralPct) {
    return {
      nivel: "estable",
      titulo: "El uso se mantuvo estable",
      mensaje: `La variación frente ${referencia} (${ventana}) es de ${magnitud}, por debajo del umbral de ${num(umbralPct)} % que se considera relevante.`,
      medida,
    };
  }
  if (medida.direccion === "bajo") {
    return {
      nivel: "baja",
      titulo: `El uso bajó ${magnitud}`,
      mensaje: `${c.comparable ? "Las operaciones registradas" : "Las operaciones por día"} cayeron ${magnitud} frente ${referencia} (${ventana}). Conviene revisar con el equipo qué cambió en el período antes de concluir.`,
      medida,
    };
  }
  if (medida.direccion === "subio") {
    return {
      nivel: "alza",
      titulo: `El uso subió ${magnitud}`,
      mensaje: `${c.comparable ? "Las operaciones registradas" : "Las operaciones por día"} crecieron ${magnitud} frente ${referencia} (${ventana}).`,
      medida,
    };
  }
  return {
    nivel: "estable",
    titulo: "El uso se mantuvo estable",
    mensaje: `No hubo variación frente ${referencia} (${ventana}).`,
    medida,
  };
}
