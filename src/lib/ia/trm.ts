// TRM oficial (USD → COP) de la Superintendencia Financiera, vía datos.gov.co.
//
// `getTRM()` devuelve los pesos colombianos por 1 USD para convertir el costo de
// las llamadas a Claude. Estrategia (como `getMatriz` en src/lib/rbac/contexto.ts):
//   - unstable_cache (Data Cache de Next) por fecha Colombia: el fetch remoto
//     ocurre ~1 vez al día por vigencia, no en cada request.
//   - Al refrescar, hace UPSERT en `tasas_cambio` (histórico + fallback durable).
//   - Fallback en cascada: remoto/cache → última fila de `tasas_cambio` →
//     env USD_COP_TRM_FALLBACK (default 4000). Nunca lanza.
import "server-only";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";
import { registrarError } from "@/lib/errores";
import { fechaCalendarioPrisma, fechaColombiaISO } from "@/lib/fecha-hora";

export const TRM_CACHE_TAG = "trm-usd-cop";
const MONEDA = "USD";

const BASE_ENDPOINT = "https://www.datos.gov.co/resource/32sa-8pi3.json";

function trmFallback(): number {
  const n = Number(process.env.USD_COP_TRM_FALLBACK ?? "4000");
  return Number.isFinite(n) && n > 0 ? n : 4000;
}

type FilaTRM = { valor?: string; vigenciadesde?: string; vigenciahasta?: string };

function diaUTC(fechaISO: string): Date {
  return fechaCalendarioPrisma(fechaISO);
}

function endpointTRM(fechaISO: string): string {
  const params = new URLSearchParams({
    $select: "valor,vigenciadesde,vigenciahasta",
    $where: `vigenciadesde <= '${fechaISO}T00:00:00.000'`,
    $order: "vigenciadesde DESC",
    $limit: "1",
  });
  return `${BASE_ENDPOINT}?${params.toString()}`;
}

/** Normaliza un ISO datetime a la fecha (medianoche UTC) para casar con @db.Date. */
function aDia(iso: string | undefined): Date {
  const d = iso ? new Date(iso) : new Date();
  const base = Number.isNaN(d.getTime()) ? new Date() : d;
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
}

/** Consulta la TRM vigente más reciente en datos.gov.co. Devuelve null si falla. */
async function obtenerTRMRemota(fechaISO: string): Promise<{ valor: number; desde: Date; hasta: Date | null } | null> {
  const resp = await fetch(endpointTRM(fechaISO), {
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
async function ultimaTRMBD(fechaISO?: string): Promise<number | null> {
  try {
    const fila = await prisma.tasaCambio.findFirst({
      where: { moneda: MONEDA, ...(fechaISO ? { vigenciaDesde: { lte: diaUTC(fechaISO) } } : {}) },
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
async function refrescarTRM(fechaISO: string): Promise<number> {
  try {
    const remota = await obtenerTRMRemota(fechaISO);
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
  return (await ultimaTRMBD(fechaISO)) ?? trmFallback();
}

// Refresco ~diario por fecha: el fetch+upsert solo corre en el primer acceso tras
// expirar para esa vigencia. La fecha va como argumento para entrar en la llave.
const getTRMCached = unstable_cache(refrescarTRM, ["trm-usd-cop-vigente-v2"], {
  tags: [TRM_CACHE_TAG],
  revalidate: 86_400, // 24 h
});

/** Pesos colombianos por 1 USD. Cacheada por fecha Colombia; nunca lanza. */
export async function getTRM(fecha: Date = new Date()): Promise<number> {
  const fechaISO = fechaColombiaISO(fecha);
  try {
    const v = await getTRMCached(fechaISO);
    if (Number.isFinite(v) && v > 0) return v;
  } catch {
    /* cae al fallback BD/entorno */
  }
  return (await ultimaTRMBD(fechaISO)) ?? trmFallback();
}
