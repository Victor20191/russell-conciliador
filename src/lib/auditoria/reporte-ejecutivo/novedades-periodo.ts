// Qué versiones de Novedades entran en el reporte para gerencia de un período:
// las que se DESPLEGARON en él, publicadas o en borrador. «Desplegada el» es el
// día en que el código llegó al servidor de producción (lo anota el servidor al
// arrancar con una versión nueva, ver `src/lib/novedades/registro-despliegue.ts`,
// o se escribe en Novedades). Una versión publicada sin esa fecha cuenta por su
// día de publicación; un borrador sin ella no cuenta. Así dos reportes de fechas
// distintas no repiten avances, y el de un período cuenta lo que de verdad llegó
// a producción en él. Ver `src/lib/novedades/despliegue.ts`.
//
// La consulta y la regla pura dicen lo mismo: el filtro de Prisma lo usan la
// página y la acción; `despliegueEnFechas` lo aplica la pantalla con las fechas
// en texto.
import type { Prisma } from "@/generated/prisma/client";

export function filtroVersionesDelPeriodo(desde: Date, hasta: Date): Prisma.PlatformVersionWhereInput {
  return {
    OR: [
      { deployedAt: { gte: desde, lte: hasta } },
      { deployedAt: null, status: "publicada", releasedAt: { gte: desde, lte: hasta } },
    ],
  };
}

/** ¿Cae un día de despliegue (AAAA-MM-DD) dentro de un período en fechas de calendario? */
export function despliegueEnFechas(dia: string | null | undefined, desde: string, hasta: string): boolean {
  return Boolean(dia) && desde <= (dia as string) && (dia as string) <= hasta;
}
