// Ventanas de fechas de calendario para el período de «Reportes para gerencia».
//
// El período lo elige la página (selector junto al título; sin elegir, los
// últimos 30 días) y con él se generan también el reporte y sus novedades: ya
// no hay un período propuesto aparte para la ventana de generar.
//
// Módulo PURO: recibe fechas en texto (YYYY-MM-DD) y no consulta nada.

const DIA_MS = 24 * 60 * 60 * 1000;

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
