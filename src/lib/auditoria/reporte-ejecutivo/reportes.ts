export const MODELO_REPORTE_EJECUTIVO_USO =
  process.env.GEMINI_MODEL?.trim() || "gemini-3-flash-preview";
const TEMPERATURA_ENV = Number(process.env.GEMINI_TEMPERATURE ?? "0");
export const TEMPERATURA_REPORTE_EJECUTIVO_USO =
  Number.isFinite(TEMPERATURA_ENV) && TEMPERATURA_ENV >= 0 && TEMPERATURA_ENV <= 2
    ? TEMPERATURA_ENV
    : 0;
export const VERSION_PROMPT_REPORTE_EJECUTIVO_USO = "reporte-ejecutivo-uso-adopcion-graficos-v4";

export type ReporteEjecutivoUso = {
  titulo: string;
  html: string;
};
