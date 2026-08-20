/**
 * El reporte ejecutivo de uso y adopción se genera con OpenCode Go
 * (endpoint `/zen/go/v1/messages`). Es el ÚNICO flujo de la plataforma que usa este
 * proveedor; balances y novedades siguen con Anthropic/Gemini/OpenRouter.
 */
export const MODELO_REPORTE_EJECUTIVO_USO =
  process.env.OPENCODE_MODEL?.trim() || "gpt-5.6-luna";
const TEMPERATURA_ENV = Number(process.env.OPENCODE_TEMPERATURE ?? "0");
export const TEMPERATURA_REPORTE_EJECUTIVO_USO =
  Number.isFinite(TEMPERATURA_ENV) && TEMPERATURA_ENV >= 0 && TEMPERATURA_ENV <= 2
    ? TEMPERATURA_ENV
    : 0;
export const VERSION_PROMPT_REPORTE_EJECUTIVO_USO =
  "reporte-para-gerencia-claro-v9";

/**
 * Tope de salida por intento (el reintento usa el reducido). Un reporte real
 * ocupa ~6k tokens; pedir mucho más solo alarga el razonamiento del modelo y
 * arriesga el timeout.
 */
const MAX_TOKENS_ENV = Number(process.env.OPENCODE_MAX_TOKENS ?? "16000");
export const MAX_TOKENS_REPORTE_EJECUTIVO_USO =
  Number.isFinite(MAX_TOKENS_ENV) && MAX_TOKENS_ENV >= 4_000 ? Math.floor(MAX_TOKENS_ENV) : 16_000;
export const MAX_TOKENS_REPORTE_EJECUTIVO_USO_REINTENTO = Math.floor(
  MAX_TOKENS_REPORTE_EJECUTIVO_USO * 0.75,
);

export type ReporteEjecutivoUso = {
  titulo: string;
  html: string;
};
