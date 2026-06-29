export const MODELO_REPORTE_NOVEDADES = "nvidia/nemotron-3-super-120b-a12b:free";
export const VERSION_PROMPT_REPORTE_NOVEDADES = "reporte-novedades-html-factual-v1";

export type ReporteNovedades = {
  titulo: string;
  html: string;
};

export type UsoOpenRouterReporte = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};
