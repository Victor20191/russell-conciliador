// Lectura del consumo de IA (`consumo_ia`) para la sección de costos del reporte.
//
// Tres ventanas, siempre con el MISMO filtro: el período actual, el del reporte
// anterior (la que usa el comparativo de uso, para que las dos secciones hablen
// del mismo tramo) y el acumulado del mes en el que cierra el período.
//
// El mes se corta por CALENDARIO UTC, igual que los períodos del reporte, que
// se declaran a medianoche UTC: tomar el mes en hora de Colombia dejaría fuera
// las cinco primeras horas del día 1.
//
// Nunca lanza: sin consumo o ante un fallo de consulta devuelve null y el
// documento simplemente no muestra la sección.
import "server-only";
import prisma from "@/lib/prisma";
import type { BaseComparativo } from "./comparativo";
import {
  agruparPorOperacion,
  construirCostosIA,
  hayConsumoIA,
  type CostosIA,
  type ResumenCostoIA,
} from "./costos-ia";

const numero = (valor: unknown): number => {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const SUMAS = {
  costoCop: true,
  costoUsd: true,
  tokensEntrada: true,
  tokensSalida: true,
  tokensCacheCreacion: true,
  tokensCacheLectura: true,
} as const;

type Sumas = {
  costoCop: unknown; costoUsd: unknown;
  tokensEntrada: unknown; tokensSalida: unknown;
  tokensCacheCreacion: unknown; tokensCacheLectura: unknown;
};

const tokensDe = (s: Sumas): number =>
  numero(s.tokensEntrada) + numero(s.tokensSalida) + numero(s.tokensCacheCreacion) + numero(s.tokensCacheLectura);

/**
 * Gasto de IA de una ventana, acotado a los usuarios del reporte.
 *
 * `usuariosRegistrados` es una lista BLANCA por nombre de actor, la misma que
 * filtra el resto del reporte. Vacía no significa «todos»: significa que no hay
 * a quién atribuirle consumo, y la consulta devuelve cero (fail-closed).
 */
async function resumirCosto(params: {
  desde: Date;
  hasta: Date;
  usuariosRegistrados: readonly string[];
  /** Fechas que se muestran (el período declarado, no el corte de la consulta). */
  etiquetaDesde?: Date;
  etiquetaHasta?: Date;
}): Promise<ResumenCostoIA> {
  const where = {
    creadoEn: { gte: params.desde, lte: params.hasta },
    usuarioNombre: { in: [...params.usuariosRegistrados] },
  };
  const [total, porTipo] = await Promise.all([
    prisma.consumoIA.aggregate({ where, _sum: SUMAS, _count: true }),
    prisma.consumoIA.groupBy({ by: ["tipoOperacion"], where, _sum: SUMAS, _count: true }),
  ]);
  return {
    desde: (params.etiquetaDesde ?? params.desde).toISOString(),
    hasta: (params.etiquetaHasta ?? params.hasta).toISOString(),
    llamadas: total._count,
    costoCop: Math.round(numero(total._sum.costoCop)),
    costoUsd: numero(total._sum.costoUsd),
    tokens: tokensDe(total._sum),
    porOperacion: agruparPorOperacion(
      porTipo.map((t) => ({
        tipo: t.tipoOperacion,
        llamadas: t._count,
        costoCop: Math.round(numero(t._sum.costoCop)),
        tokens: tokensDe(t._sum),
      })),
    ),
  };
}

/** Primer día, a medianoche UTC, del mes en el que cae `fecha`. */
function inicioMesUTC(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), 1));
}

function ventana(desde: string, hasta: string): { desde: Date; hasta: Date } | null {
  const d = Date.parse(desde);
  const h = Date.parse(hasta);
  if (!Number.isFinite(d) || !Number.isFinite(h) || d > h) return null;
  return { desde: new Date(d), hasta: new Date(h) };
}

/**
 * Sección de costos de IA: período actual, reporte anterior y acumulado del mes.
 * Devuelve null si no hubo una sola llamada o si la consulta falla.
 */
export async function construirCostosIAReporte(params: {
  desde: Date;
  hasta: Date;
  /** Cierre efectivo de la consulta cuando el período llega hasta hoy. */
  corte?: Date | null;
  /** Ventana del reporte anterior, en ISO (`ComparativoUso.ventanaPrevia`). */
  ventanaPrevia?: { desde: string; hasta: string } | null;
  base?: BaseComparativo | null;
  usuariosRegistrados: readonly string[];
}): Promise<CostosIA | null> {
  try {
    const corte = params.corte && params.corte < params.hasta ? params.corte : params.hasta;
    const previa = params.ventanaPrevia
      ? ventana(params.ventanaPrevia.desde, params.ventanaPrevia.hasta)
      : null;
    const inicioMes = inicioMesUTC(corte);
    const { usuariosRegistrados } = params;

    const [actual, previo, mes] = await Promise.all([
      resumirCosto({
        desde: params.desde, hasta: corte, usuariosRegistrados,
        etiquetaDesde: params.desde, etiquetaHasta: params.hasta,
      }),
      previa
        ? resumirCosto({ desde: previa.desde, hasta: previa.hasta, usuariosRegistrados })
        : Promise.resolve(null),
      // Redundante solo cuando el período ARRANCA el día 1: ahí el acumulado del
      // mes y el período son la misma cifra. Un período a caballo entre dos
      // meses (28/Ago → 11/Sep) sí necesita su «en lo corrido de septiembre».
      inicioMes.getTime() !== params.desde.getTime()
        ? resumirCosto({ desde: inicioMes, hasta: corte, usuariosRegistrados })
        : Promise.resolve(null),
    ]);

    const costos = construirCostosIA({ actual, previo, base: params.base ?? null, mes });
    return hayConsumoIA(costos) ? costos : null;
  } catch {
    return null;
  }
}
