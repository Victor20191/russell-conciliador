// TRM oficial (USD → COP) de la Superintendencia Financiera, vía datos.gov.co.
//
// `getTRM()` devuelve los pesos colombianos por 1 USD para convertir el costo de
// las llamadas a Claude. Estrategia (como `getMatriz` en src/lib/rbac/contexto.ts):
//   - unstable_cache (Data Cache de Next) con revalidate diario: el fetch remoto
//     ocurre ~1 vez al día (la primera lectura tras expirar), no en cada request.
//   - Al refrescar, hace UPSERT en `tasas_cambio` (histórico + fallback durable).
//   - Fallback en cascada: remoto/cache → última fila de `tasas_cambio` →
//     env USD_COP_TRM_FALLBACK (default 4000). Nunca lanza.
import "server-only";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";
import { registrarError } from "@/lib/errores";

export const TRM_CACHE_TAG = "trm-usd-cop";
const MONEDA = "USD";

// Dataset "Tasa de Cambio Representativa del Mercado - TRM" (Socrata 32sa-8pi3):
// se pide la fila más reciente por vigencia.
const ENDPOINT =
  "https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=1";

function trmFallback(): number {
  const n = Number(process.env.USD_COP_TRM_FALLBACK ?? "4000");
  return Number.isFinite(n) && n > 0 ? n : 4000;
}

type FilaTRM = { valor?: string; vigenciadesde?: string; vigenciahasta?: string };

/** Normaliza un ISO datetime a la fecha (medianoche UTC) para casar con @db.Date. */
function aDia(iso: string | undefined): Date {
  const d = iso ? new Date(iso) : new Date();
  const base = Number.isNaN(d.getTime()) ? new Date() : d;
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
}

/** Consulta la TRM vigente más reciente en datos.gov.co. Devuelve null si falla. */
async function obtenerTRMRemota(): Promise<{ valor: number; desde: Date; hasta: Date | null } | null> {
  const resp = await fetch(ENDPOINT, {
    headers: { accept: "application/json" },
    // El TTL lo gobierna el unstable_cache externo; evita doble capa de caché.
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) return null;
  const filas = (await resp.json()) as FilaTRM[];
  const fila = Array.isArray(filas) ? filas[0] : undefined;
  const valor = fila?.valor != null ? Number(fila.valor) : NaN;
  if (!Number.isFinite(valor) || valor <= 0) return null;
  return {
    valor,
    desde: aDia(fila?.vigenciadesde),
    hasta: fila?.vigenciahasta ? aDia(fila.vigenciahasta) : null,
  };
}

/** Última TRM conocida en BD (fallback durable). */
async function ultimaTRMBD(): Promise<number | null> {
  try {
    const fila = await prisma.tasaCambio.findFirst({
      where: { moneda: MONEDA },
      orderBy: { vigenciaDesde: "desc" },
      select: { valor: true },
    });
    return fila ? Number(fila.valor) : null;
  } catch {
    return null;
  }
}

/**
 * Refresca la TRM: fetch remoto + upsert en `tasas_cambio`. Siempre devuelve un
 * número (remoto → BD → fallback de entorno); nunca lanza, para no romper la
 * conversión a COP del consumo de IA.
 */
async function refrescarTRM(): Promise<number> {
  try {
    const remota = await obtenerTRMRemota();
    if (remota) {
      await prisma.tasaCambio
        .upsert({
          where: { moneda_vigenciaDesde: { moneda: MONEDA, vigenciaDesde: remota.desde } },
          create: {
            moneda: MONEDA,
            valor: remota.valor,
            vigenciaDesde: remota.desde,
            vigenciaHasta: remota.hasta,
            fuente: "superfinanciera",
          },
          update: { valor: remota.valor, vigenciaHasta: remota.hasta, obtenidaEn: new Date() },
        })
        .catch((e) => registrarError("refrescarTRM.upsert", e));
      return remota.valor;
    }
  } catch (e) {
    registrarError("refrescarTRM", e);
  }
  return (await ultimaTRMBD()) ?? trmFallback();
}

// Refresco ~diario: el fetch+upsert solo corre en el primer acceso tras expirar.
const getTRMCached = unstable_cache(refrescarTRM, ["trm-usd-cop"], {
  tags: [TRM_CACHE_TAG],
  revalidate: 86_400, // 24 h
});

/** Pesos colombianos por 1 USD. Cacheada a diario; nunca lanza. */
export async function getTRM(): Promise<number> {
  try {
    const v = await getTRMCached();
    if (Number.isFinite(v) && v > 0) return v;
  } catch {
    /* cae al fallback BD/entorno */
  }
  return (await ultimaTRMBD()) ?? trmFallback();
}
