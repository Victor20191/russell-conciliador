// Tarifas de los proveedores de IA y cálculo de costo por llamada.
//
// Módulo PURO (sin BD, sin red): convierte el `usage` que devuelve la API en un
// costo en USD. Determinista y testeable (`precios.test.ts`). La conversión a
// pesos colombianos (TRM) y la persistencia viven en `src/lib/ia/uso.ts`.
//
// Precios en USD por 1.000.000 de tokens. En Anthropic, cache write = TTL de
// 5 min (1,25× del input) y cache read = 0,1×. Fuentes: tarifas públicas de cada
// proveedor. Gemini no reporta esos campos en este pipeline, por lo que ambos
// contadores permanecen en cero al registrar sus llamadas.
// Si se cambia `ANTHROPIC_MODEL`, agrega aquí su fila; si falta, se usa
// `TARIFA_DEFECTO` (la del modelo por defecto del proyecto, Opus 4.8).

export type Tarifa = {
  entrada: number; // input_tokens
  salida: number; // output_tokens
  cacheCreacion: number; // cache_creation_input_tokens (escritura de caché, 5 min)
  cacheLectura: number; // cache_read_input_tokens (lectura de caché)
};

/** Subconjunto del `usage` de la respuesta de Anthropic que necesitamos. */
export type UsoTokens = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export const TARIFAS_USD: Record<string, Tarifa> = {
  "claude-opus-4-8": { entrada: 5, salida: 25, cacheCreacion: 6.25, cacheLectura: 0.5 },
  "claude-opus-4-7": { entrada: 5, salida: 25, cacheCreacion: 6.25, cacheLectura: 0.5 },
  "claude-opus-4-6": { entrada: 5, salida: 25, cacheCreacion: 6.25, cacheLectura: 0.5 },
  "claude-sonnet-4-6": { entrada: 3, salida: 15, cacheCreacion: 3.75, cacheLectura: 0.3 },
  "claude-haiku-4-5": { entrada: 1, salida: 5, cacheCreacion: 1.25, cacheLectura: 0.1 },
  "claude-fable-5": { entrada: 10, salida: 50, cacheCreacion: 12.5, cacheLectura: 1.0 },
  "gemini-3.1-flash-lite": { entrada: 0.25, salida: 1.5, cacheCreacion: 0.25, cacheLectura: 0.025 },
};

// Modelo por defecto del proyecto (ver src/lib/anthropic.ts → MODELO_EXTRACCION).
export const TARIFA_DEFECTO: Tarifa = TARIFAS_USD["claude-opus-4-8"];
export const TARIFA_GEMINI_DEFECTO: Tarifa = TARIFAS_USD["gemini-3.1-flash-lite"];

/** Tarifa del modelo (con fallback a la del modelo por defecto). */
export function tarifaPara(modelo: string): Tarifa {
  return TARIFAS_USD[modelo] ?? (modelo.toLowerCase().startsWith("gemini-") ? TARIFA_GEMINI_DEFECTO : TARIFA_DEFECTO);
}

/**
 * Costo en USD de una llamada, sumando los CUATRO componentes del `usage`.
 * Considerar la caché importa: el mapeo por lotes reusa el plan estándar cacheado
 * (lectura a 0,1×), así que ignorar `cache_read_input_tokens` sobreestimaría el costo.
 */
export function calcularCostoUsd(modelo: string, usage: UsoTokens): number {
  const t = tarifaPara(modelo);
  const entrada = usage.input_tokens || 0;
  const salida = usage.output_tokens || 0;
  const cacheCreacion = usage.cache_creation_input_tokens ?? 0;
  const cacheLectura = usage.cache_read_input_tokens ?? 0;
  return (
    (entrada * t.entrada + salida * t.salida + cacheCreacion * t.cacheCreacion + cacheLectura * t.cacheLectura) /
    1_000_000
  );
}

/** Total de tokens de una llamada (los 4 componentes). */
export function totalTokens(usage: UsoTokens): number {
  return (
    (usage.input_tokens || 0) +
    (usage.output_tokens || 0) +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0)
  );
}
