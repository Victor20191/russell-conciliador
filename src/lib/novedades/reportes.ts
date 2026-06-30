export const MODELO_REPORTE_NOVEDADES = process.env.GEMINI_MODEL?.trim() || "gemini-3-flash-preview";
const TEMPERATURA_ENV = Number(process.env.GEMINI_TEMPERATURE ?? "0");
export const TEMPERATURA_REPORTE_NOVEDADES =
  Number.isFinite(TEMPERATURA_ENV) && TEMPERATURA_ENV >= 0 && TEMPERATURA_ENV <= 2 ? TEMPERATURA_ENV : 0;
export const VERSION_PROMPT_REPORTE_NOVEDADES = "reporte-novedades-html-factual-gemini-v5";

export type ReporteNovedades = {
  titulo: string;
  html: string;
};

export type UsoOpenRouterReporte = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};
