// Fecha de despliegue de una versión de Novedades (`desplegado_en`).
//
// Es el DÍA en que el código llegó al servidor de producción: lo anota el servidor
// al arrancar con una versión nueva (`registro-despliegue.ts`) y se puede escribir
// o corregir en Novedades. Se guarda a mediodía UTC de esa fecha para que caiga
// dentro del mismo día con las dos convenciones que usa el reporte (días UTC de
// `parseRangoReporte` y días de Colombia de la pantalla). Al publicar sin fecha se
// toma el día de la publicación en Colombia.
//
// El reporte para gerencia cuenta como avances del período las versiones
// desplegadas en él, publicadas o en borrador: así dos reportes de fechas
// distintas no repiten los mismos avances.
//
// Módulo PURO.
import { fechaColombiaISO } from "@/lib/fecha-hora";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** ¿Es una fecha de calendario AAAA-MM-DD que existe? */
export function esFechaDespliegueValida(fecha: string | null | undefined): fecha is string {
  if (!fecha || !FECHA.test(fecha)) return false;
  const d = new Date(`${fecha}T12:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

/** «2026-10-19» → el instante que se guarda (mediodía UTC de ese día). */
export function instanteDespliegue(fecha: string): Date {
  return new Date(`${fecha}T12:00:00.000Z`);
}

/** El día guardado, en AAAA-MM-DD (null si no hay fecha). */
export function fechaDespliegueTexto(instante: Date | string | null | undefined): string | null {
  if (!instante) return null;
  const d = typeof instante === "string" ? new Date(instante) : instante;
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

/** Día de despliegue por defecto al publicar: el día de la publicación en Colombia. */
export function despliegueAlPublicar(publicadoEn: Date): Date {
  return instanteDespliegue(fechaColombiaISO(publicadoEn));
}

type VersionConFechas = {
  deployedAt?: Date | string | null;
  releasedAt?: Date | string | null;
  /** Sin estado se asume publicada (llamadores anteriores). */
  status?: string | null;
};

/**
 * Fecha que vale para el reporte: la de despliegue; sin ella, la de publicación
 * de una versión publicada. Un borrador sin fecha de despliegue no cuenta.
 */
export function fechaQueCuenta(v: VersionConFechas): Date | null {
  const publicada = v.status == null || v.status === "publicada";
  const valor = v.deployedAt ?? (publicada ? v.releasedAt : null) ?? null;
  if (!valor) return null;
  const d = typeof valor === "string" ? new Date(valor) : valor;
  return Number.isFinite(d.getTime()) ? d : null;
}

/** ¿La versión se desplegó dentro de `[desde, hasta]`? */
export function desplegadaEnPeriodo(
  v: VersionConFechas,
  desde: Date,
  hasta: Date,
): boolean {
  const fecha = fechaQueCuenta(v);
  return fecha !== null && fecha.getTime() >= desde.getTime() && fecha.getTime() <= hasta.getTime();
}
