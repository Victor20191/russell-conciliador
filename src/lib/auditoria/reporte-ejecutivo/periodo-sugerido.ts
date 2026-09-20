// Período que el modal de «Generar reporte para gerencia» trae prellenado.
//
// La regla es CONTINUAR donde terminó el último reporte: desde el día siguiente
// a su fin, hasta hoy. Así cada reporte cubre un tramo nuevo, sin traslaparse
// con el anterior —que es justo lo que hace legible el comparativo de uso
// (`comparativo-servidor.ts` exige que el período previo termine antes)— y el
// cliente recibe una serie que encadena en vez de ventanas superpuestas.
//
// Si el último reporte YA llega hasta hoy no queda tramo nuevo: en vez de
// inventar una ventana arbitraria se propone su mismo período, que es lo que
// recupera el reporte guardado. Sin reportes previos, los últimos 30 días.
//
// Módulo PURO: recibe fechas en texto (YYYY-MM-DD) y no consulta nada.

export type BasePeriodoSugerido = "continuacion" | "ultimo_reporte" | "ultimos_30_dias";

export type PeriodoSugerido = {
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
  base: BasePeriodoSugerido;
  /** Fin del período del último reporte, cuando la sugerencia se apoya en él. */
  ultimoReporteHasta: string | null;
};

const DIA_MS = 24 * 60 * 60 * 1000;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Suma días a una fecha de calendario, sin salirse del formato YYYY-MM-DD. */
export function sumarDias(fecha: string, dias: number): string {
  const t = Date.parse(`${fecha}T00:00:00Z`);
  if (!Number.isFinite(t)) return fecha;
  return new Date(t + dias * DIA_MS).toISOString().slice(0, 10);
}

/** Ventana de N días que termina hoy (hoy incluido). */
export function ultimosDias(hoy: string, dias: number): { desde: string; hasta: string } {
  return { desde: sumarDias(hoy, -(dias - 1)), hasta: hoy };
}

/**
 * Período sugerido para el próximo reporte.
 *
 * `ultimoReporte` es el período del último reporte generado; null si nunca se
 * generó uno. Si su fin ya alcanza a hoy no queda tramo nuevo y se repite ese
 * mismo período; sin reporte previo (o con fechas ilegibles), 30 días.
 */
export function sugerirPeriodoReporte(params: {
  hoy: string;
  /** Período del último reporte generado (fechas YYYY-MM-DD o marcas de tiempo ISO). */
  ultimoReporte?: { desde: string; hasta: string } | null;
  diasPorDefecto?: number;
}): PeriodoSugerido {
  const dias = params.diasPorDefecto ?? 30;
  const respaldo = { ...ultimosDias(params.hoy, dias), base: "ultimos_30_dias" as const, ultimoReporteHasta: null };
  if (!FECHA.test(params.hoy)) return respaldo;

  const hastaUltimo = params.ultimoReporte?.hasta?.slice(0, 10) ?? null;
  const desdeUltimo = params.ultimoReporte?.desde?.slice(0, 10) ?? null;
  if (!hastaUltimo || !FECHA.test(hastaUltimo)) return respaldo;

  const desde = sumarDias(hastaUltimo, 1);
  // Hay tramo nuevo: se continúa donde terminó el último reporte.
  if (desde <= params.hoy) {
    return { desde, hasta: params.hoy, base: "continuacion", ultimoReporteHasta: hastaUltimo };
  }
  // El último ya cubre hasta hoy: se repite su período (recupera el guardado).
  if (desdeUltimo && FECHA.test(desdeUltimo)) {
    return { desde: desdeUltimo, hasta: hastaUltimo, base: "ultimo_reporte", ultimoReporteHasta: hastaUltimo };
  }
  return respaldo;
}

/** Texto para la UI que explica de dónde sale el período prellenado. */
export function explicarPeriodoSugerido(p: PeriodoSugerido): string {
  if (p.base === "continuacion" && p.ultimoReporteHasta) {
    return `Continúa donde terminó el último reporte (hasta el ${p.ultimoReporteHasta}). Así no se traslapan los períodos.`;
  }
  if (p.base === "ultimo_reporte") {
    return "El último reporte ya cubre hasta hoy: este es su mismo período y recupera el reporte guardado.";
  }
  return "Últimos 30 días: aún no hay un reporte anterior que continuar.";
}
