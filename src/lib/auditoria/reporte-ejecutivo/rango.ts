// Rango de fechas del uso: el del reporte generado y el que se elige en el
// tablero de «Reportes para gerencia». Los dos se leen con la misma regla, así
// que el tablero de un período muestra exactamente las cifras del reporte que se
// genere para ese mismo período.
//
// Módulo PURO.

/** Tope del rango: más días saturan la agregación de la bitácora. */
export const MAX_DIAS_RANGO = 366;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 86_400_000;

/**
 * Normaliza ISO o YYYY-MM-DD a inicio/fin de día UTC del rango inclusive. null
 * si alguna fecha no se entiende, si «desde» va después de «hasta» o si el rango
 * pasa de `MAX_DIAS_RANGO` días.
 */
export function parseRangoReporte(desdeRaw: string, hastaRaw: string): { desde: Date; hasta: Date } | null {
  const d = Date.parse(desdeRaw);
  const h = Date.parse(hastaRaw);
  if (!Number.isFinite(d) || !Number.isFinite(h) || d > h) return null;

  const desde = new Date(d);
  const hasta = new Date(h);

  // Si llegó solo la fecha (YYYY-MM-DD), se toma el día completo.
  if (FECHA.test(desdeRaw.trim())) desde.setUTCHours(0, 0, 0, 0);
  if (FECHA.test(hastaRaw.trim())) hasta.setUTCHours(23, 59, 59, 999);

  if (hasta.getTime() - desde.getTime() > MAX_DIAS_RANGO * DIA_MS) return null;
  return { desde, hasta };
}

/** Suma días a una fecha de calendario AAAA-MM-DD. */
function sumarDiasCalendario(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

/**
 * Los días de calendario contra los que se compara un período (la misma regla que
 * `periodoAnteriorIgual`, en fechas): del 9 al 15-nov (7 días) → del 2 al 8-nov.
 * Sirve para decirlo en pantalla antes de generar. null si las fechas no sirven.
 */
export function periodoAnteriorEnFechas(
  desde: string,
  hasta: string,
): { desde: string; hasta: string; dias: number } | null {
  if (!FECHA.test(desde) || !FECHA.test(hasta) || desde > hasta) return null;
  const dias = Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS) + 1;
  if (!Number.isFinite(dias) || dias < 1) return null;
  return { desde: sumarDiasCalendario(desde, -dias), hasta: sumarDiasCalendario(desde, -1), dias };
}

/** Primer valor de un parámetro de la URL, sin espacios; null si no vino. */
function parametro(valor: string | string[] | undefined): string | null {
  const v = (Array.isArray(valor) ? valor[0] : valor)?.trim();
  return v ? v : null;
}

export type RangoElegido =
  /** No se pidió un rango: el tablero usa el suyo por defecto. */
  | { estado: "sin_elegir" }
  /** Rango válido (solo fechas YYYY-MM-DD). */
  | { estado: "valido"; desde: Date; hasta: Date; desdeTexto: string; hastaTexto: string }
  /** Se pidió algo que no sirve: el tablero lo dice y usa el suyo por defecto. */
  | { estado: "invalido"; motivo: string };

/**
 * Lee el rango que llega en la URL del tablero (`?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`).
 * Solo acepta fechas de calendario: es lo que manda el selector y lo que se
 * puede compartir como enlace.
 */
export function leerRangoElegido(params: {
  desde?: string | string[];
  hasta?: string | string[];
}): RangoElegido {
  const desdeTexto = parametro(params.desde);
  const hastaTexto = parametro(params.hasta);
  if (!desdeTexto && !hastaTexto) return { estado: "sin_elegir" };
  if (!desdeTexto || !hastaTexto) {
    return { estado: "invalido", motivo: "Faltó una de las dos fechas del período." };
  }
  if (!FECHA.test(desdeTexto) || !FECHA.test(hastaTexto)) {
    return { estado: "invalido", motivo: "Las fechas del período no tienen el formato AAAA-MM-DD." };
  }
  // Una fecha imposible (2026-02-30) la corrige `Date`: se rechaza en vez de moverla.
  const esFechaReal = (t: string) => new Date(`${t}T00:00:00Z`).toISOString().slice(0, 10) === t;
  if (!esFechaReal(desdeTexto) || !esFechaReal(hastaTexto)) {
    return { estado: "invalido", motivo: "Una de las fechas del período no existe en el calendario." };
  }
  if (desdeTexto > hastaTexto) {
    return { estado: "invalido", motivo: "La fecha «Desde» va después de «Hasta»." };
  }
  const rango = parseRangoReporte(desdeTexto, hastaTexto);
  if (!rango) {
    return { estado: "invalido", motivo: `El período supera ${MAX_DIAS_RANGO} días.` };
  }
  return { estado: "valido", ...rango, desdeTexto, hastaTexto };
}
