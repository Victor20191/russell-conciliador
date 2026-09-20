import "server-only";
import { ajustarMaquetacionReporte } from "./maquetacion";
import { createHash } from "node:crypto";
import { z } from "zod";
import prisma from "@/lib/prisma";
import type { ReporteEjecutivoUso } from "./reportes";
import { METODOLOGIA_USO_VIGENTE } from "./metodologia";

const Metadatos = z.object({
  porcentajeAdopcion: z.number().nullable(),
  versionIdsIncluidos: z.array(z.number().int()),
  corte: z.string(),
});

export function claveAlcanceReporte(desde: Date, hasta: Date, versiones: number[] | null): string {
  return createHash("sha256").update(JSON.stringify({
    formato: "instantanea-gerencia-v1",
    desde: desde.toISOString(), hasta: hasta.toISOString(),
    versiones: versiones?.length ? [...new Set(versiones)].sort((a, b) => a - b) : "publicadas",
  })).digest("hex");
}

export type InstantaneaReporte = {
  id: number;
  report: ReporteEjecutivoUso;
  model: string;
  generatedAt: string;
  totalAcciones: number;
  totalUsuarios: number;
  totalNovedades: number;
  porcentajeAdopcion: number | null;
  versionIdsIncluidos: number[];
  corte: string;
};

type Fila = Awaited<ReturnType<typeof prisma.reporteEjecutivoUsoIA.findUnique>>;
function leerFila(row: NonNullable<Fila>): InstantaneaReporte {
  const datos = Metadatos.parse(row.metadatos);
  return {
    id: row.id, report: { titulo: row.titulo, html: ajustarMaquetacionReporte(row.html) }, model: row.modelo,
    generatedAt: row.creadoEn.toISOString(), totalAcciones: row.totalAcciones,
    totalUsuarios: row.totalUsuarios, totalNovedades: row.totalNovedades, ...datos,
  };
}

export async function leerInstantanea(clave: string): Promise<InstantaneaReporte | null> {
  const row = await prisma.reporteEjecutivoUsoIA.findFirst({
    where: { claveAlcance: clave }, orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
  });
  return row ? leerFila(row) : null;
}

export async function guardarInstantanea(params: {
  clave: string; anteriorId: number | null; report: ReporteEjecutivoUso;
  modelo: string; desde: Date; hasta: Date; totalAcciones: number; totalUsuarios: number;
  totalNovedades: number; porcentajeAdopcion: number | null; versionIdsIncluidos: number[];
  corte: string; fuente: unknown; userId: number | null;
}): Promise<InstantaneaReporte> {
  // Dos generaciones concurrentes de la misma revisión convergen en una sola fila.
  const huella = createHash("sha256").update(`${params.clave}:${params.anteriorId ?? "inicial"}`).digest("hex");
  try {
    const row = await prisma.reporteEjecutivoUsoIA.create({ data: {
      huellaContexto: huella, claveAlcance: params.clave,
      // `metodologia` marca con qué reglas se calcularon estas cifras: el
      // comparativo descarta las instantáneas viejas en vez de mezclarlas.
      metadatos: JSON.parse(JSON.stringify({ porcentajeAdopcion: params.porcentajeAdopcion,
        versionIdsIncluidos: params.versionIdsIncluidos, corte: params.corte,
        metodologia: METODOLOGIA_USO_VIGENTE, fuente: params.fuente })),
      modelo: params.modelo, titulo: params.report.titulo, html: params.report.html,
      periodoDesde: params.desde, periodoHasta: params.hasta,
      totalAcciones: params.totalAcciones, totalUsuarios: params.totalUsuarios,
      totalNovedades: params.totalNovedades, creadoPorId: params.userId,
    } });
    return leerFila(row);
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "P2002")) throw error;
    const row = await prisma.reporteEjecutivoUsoIA.findUnique({ where: { huellaContexto: huella } });
    if (!row) throw error;
    return leerFila(row);
  }
}
