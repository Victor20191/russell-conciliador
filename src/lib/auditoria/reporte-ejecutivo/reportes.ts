/**
 * El reporte ejecutivo de uso y adopción se genera con OpenCode Go
 * (Kimi K3, endpoint `/zen/go/v1/chat/completions`). Es el ÚNICO flujo de la plataforma que usa este
 * proveedor; balances y novedades siguen con Anthropic/Gemini/OpenRouter.
 */
export const MODELO_REPORTE_EJECUTIVO_USO =
  process.env.OPENCODE_MODEL?.trim() || "kimi-k3";
const TEMPERATURA_ENV = Number(process.env.OPENCODE_TEMPERATURE ?? "0");
export const TEMPERATURA_REPORTE_EJECUTIVO_USO =
  Number.isFinite(TEMPERATURA_ENV) && TEMPERATURA_ENV >= 0 && TEMPERATURA_ENV <= 2
    ? TEMPERATURA_ENV
    : 0;
export const VERSION_PROMPT_REPORTE_EJECUTIVO_USO =
  "reporte-para-gerencia-claro-v13";

/**
 * Tope de salida por intento (el reintento usa el reducido). La respuesta final
 * es un JSON breve de lectura editorial; este margen contempla también el
 * razonamiento del modelo. El HTML factual se construye en la aplicación.
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
