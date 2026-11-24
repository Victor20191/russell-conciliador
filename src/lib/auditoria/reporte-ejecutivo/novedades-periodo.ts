// Qué versiones de Novedades entran en el reporte para gerencia de un período:
// las PUBLICADAS cuya fecha de despliegue cae en él (sin fecha de despliegue,
// la de publicación). Así dos reportes de fechas distintas no repiten avances,
// y el reporte de un período cuenta lo que de verdad llegó a producción en él.
// Ver `src/lib/novedades/despliegue.ts`.
//
// La consulta y la regla pura dicen lo mismo: el filtro de Prisma lo usan la
// página y la acción; `desplegadaEnPeriodo` lo aplica la ventana de generar con
// las fechas en texto.
import type { Prisma } from "@/generated/prisma/client";

export function filtroVersionesDelPeriodo(desde: Date, hasta: Date): Prisma.PlatformVersionWhereInput {
  return {
    status: "publicada",
    OR: [
      { deployedAt: { gte: desde, lte: hasta } },
      { deployedAt: null, releasedAt: { gte: desde, lte: hasta } },
    ],
  };
}

/** ¿Cae un día de despliegue (AAAA-MM-DD) dentro de un período en fechas de calendario? */
export function despliegueEnFechas(dia: string | null | undefined, desde: string, hasta: string): boolean {
  return Boolean(dia) && desde <= (dia as string) && (dia as string) <= hasta;
}
