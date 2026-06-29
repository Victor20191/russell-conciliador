// Catálogo de modelos de IA disponibles para el hook que vuelca los commits del
// día a /novedades (scripts/novedades-desde-commits.ts).
//
// PURO y cliente-safe: sin prisma, sin "server-only", sin imports de Next. Lo
// comparten la pantalla de configuración (cliente), la Server Action y el script
// del hook (que lo importa por ruta relativa), para no duplicar las opciones ni
// la clave del ajuste.

/** Clave del ajuste en la tabla `configuracion_plataforma`. */
export const CLAVE_MODELO_NOVEDADES = "novedades.modelo_ia";

export type ModeloNovedades = "opus" | "gemini-flash";

export type ModeloNovedadesDef = {
  valor: ModeloNovedades;
  etiqueta: string;
  detalle: string;
};

/** Opciones que se muestran en el selector (y valores válidos del ajuste). */
export const MODELOS_NOVEDADES: ModeloNovedadesDef[] = [
  {
    valor: "opus",
    etiqueta: "Claude Opus (Anthropic)",
    detalle: "claude-opus-4-8 · máxima calidad de redacción",
  },
  {
    valor: "gemini-flash",
    etiqueta: "Gemini Flash (Google)",
    detalle: "gemini-3.1-flash · rápido y económico",
  },
];

/** Valor por defecto cuando no hay ajuste guardado. */
export const MODELO_NOVEDADES_DEFECTO: ModeloNovedades = "opus";

export function esModeloValido(v: unknown): v is ModeloNovedades {
  return typeof v === "string" && MODELOS_NOVEDADES.some((m) => m.valor === v);
}

/** Devuelve el modelo si es válido; si no, el valor por defecto. */
export function normalizarModelo(v: unknown): ModeloNovedades {
  return esModeloValido(v) ? v : MODELO_NOVEDADES_DEFECTO;
}
