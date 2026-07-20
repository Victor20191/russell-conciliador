// Registro del consumo de IA (tokens y costos) en `consumo_ia`.
//
// `registrarConsumoIA` recibe los usos (uno por llamada al proveedor) acumulados por
// el pipeline de extracción y los persiste con su costo en USD y COP. El costo es
// SNAPSHOT: se calcula con la tarifa del modelo (precios.ts) y la TRM vigente
// (trm.ts) al momento de registrar. Best-effort: como `logAudit`, nunca tumba la
// operación si falla (la captura `registrarError`).
import "server-only";
import prisma from "@/lib/prisma";
import { registrarError } from "@/lib/errores";
import { calcularCostoUsd, type UsoTokens } from "@/lib/ia/precios";
import { getTRM } from "@/lib/ia/trm";

export type TipoOperacionIA = "extraccion_tabular" | "extraccion_pdf" | "mapeo_ia" | "diagnostico_ia";

/** Un uso = una llamada a la API de IA (lo que devuelve el pipeline). */
export type UsoIA = {
  tipoOperacion: TipoOperacionIA;
  modelo: string;
  usage: UsoTokens;
  loteIndice?: number; // mapeo por lotes
  cuentasLote?: number;
};

/** Contexto del escaneo, conocido por la Server Action (no por el pipeline puro). */
export type ContextoConsumoIA = {
  clienteId?: number | null;
  usuarioId?: number | null;
  usuarioNombre?: string | null;
  archivoNombre?: string | null;
  nitDetectado?: string | null;
  modulo?: string;
};

const red = (n: number, dec: number): number => {
  const f = 10 ** dec;
  return Math.round(n * f) / f;
};

/**
 * Persiste el consumo de IA de un escaneo. Calcula costo USD (tarifa del modelo)
 * y COP (× TRM vigente) por cada llamada y los inserta en una sola query.
 * Best-effort: no lanza.
 */
export async function registrarConsumoIA(usos: UsoIA[], ctx: ContextoConsumoIA): Promise<void> {
  if (!usos || usos.length === 0) return;
  try {
    const trm = await getTRM();
    const data = usos.map((u) => {
      const costoUsd = calcularCostoUsd(u.modelo, u.usage);
      return {
        clienteId: ctx.clienteId ?? null,
        usuarioId: ctx.usuarioId ?? null,
        usuarioNombre: ctx.usuarioNombre ?? null,
        modulo: ctx.modulo ?? "balance",
        tipoOperacion: u.tipoOperacion,
        modelo: u.modelo,
        archivoNombre: ctx.archivoNombre ?? null,
        nitDetectado: ctx.nitDetectado ?? null,
        loteIndice: u.loteIndice ?? null,
        cuentasLote: u.cuentasLote ?? null,
        tokensEntrada: u.usage.input_tokens || 0,
        tokensSalida: u.usage.output_tokens || 0,
        tokensCacheCreacion: u.usage.cache_creation_input_tokens ?? 0,
        tokensCacheLectura: u.usage.cache_read_input_tokens ?? 0,
        costoUsd: red(costoUsd, 6),
        trm: red(trm, 4),
        costoCop: red(costoUsd * trm, 2),
      };
    });
    await prisma.consumoIA.createMany({ data });
  } catch (e) {
    registrarError("registrarConsumoIA", e);
  }
}
