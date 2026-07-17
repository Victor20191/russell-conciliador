import "server-only";
import { MODELO_EXTRACCION } from "@/lib/anthropic";

// Capa de configuración de modelos: abstrae los IDs de modelo tras roles, porque
// los proveedores deprecan modelos con frecuencia. Cambiar de modelo = cambiar
// una variable de entorno, no reescribir el código de producción.
//
// La CASCADA del mapeo de cuentas al plan Russell escala por costo/dificultad:
//   preclasif (Haiku 4.5) → barre las cuentas obvias a costo/latencia mínimos.
//   estandar  (Sonnet 4.6) → reintenta las que Haiku no resolvió con confianza.
//   complejo  (Opus 4.8)   → último recurso para las ambiguas/raras.
// La caché de reglas SQL (`cuentas_cliente`) resuelve las cuentas CONOCIDAS sin
// IA, así que el costo de IA es proporcional SOLO a las cuentas NUEVAS del mes:
// un cliente recurrente con catálogo estable tiende a costo de IA ≈ 0.
export const MODELOS = {
  preclasif: process.env.ANTHROPIC_MODELO_PRECLASIF ?? "claude-haiku-4-5",
  estandar: process.env.ANTHROPIC_MODELO_ESTANDAR ?? "claude-sonnet-4-6",
  complejo: process.env.ANTHROPIC_MODELO_COMPLEJO ?? "claude-opus-4-8",
} as const;

// Umbrales de confianza (`coincidencia` 0..100) para escalar al siguiente tier.
// Una asignación con coincidencia < UMBRAL se considera no resuelta y se reintenta
// con el modelo más capaz. Configurables por entorno sin tocar código.
export const UMBRAL_ESTANDAR = Number(process.env.ANTHROPIC_UMBRAL_ESTANDAR ?? 85); // Haiku → Sonnet
export const UMBRAL_COMPLEJO = Number(process.env.ANTHROPIC_UMBRAL_COMPLEJO ?? 70); // Sonnet → Opus

// Orden de la cascada con su umbral de ESCALADA: si la mejor coincidencia que
// produjo el tier queda por debajo del umbral, la cuenta pasa al tier siguiente.
export const CASCADA_MAPEO: { modelo: string; umbralEscalar: number }[] = [
  { modelo: MODELOS.preclasif, umbralEscalar: UMBRAL_ESTANDAR },
  { modelo: MODELOS.estandar, umbralEscalar: UMBRAL_COMPLEJO },
  { modelo: MODELOS.complejo, umbralEscalar: 0 }, // último tier: no escala más
];

// ---------------- Cascada de EXTRACCIÓN de estructura (tabular) ----------------
//
// El modo ESTRUCTURA solo devuelve el mapa de columnas del archivo (~20 campos),
// una tarea que un modelo medio resuelve casi siempre: se intenta primero con
// Sonnet (además su mínimo de caché de 2048 tokens SÍ deja cachear el prompt de
// sistema, ~2,5K tokens) y se escala a Opus solo si la confianza queda bajo el
// umbral, el spec dice «no importable» o la transformación no cuadra. Los
// PERFILES guardados por cliente cortan ANTES de esta cascada (0 llamadas).
// La extracción DIRECTA de PDF/texto no cascadea: siempre `MODELO_EXTRACCION`.
export const MODELO_EXTRACCION_RAPIDA = process.env.ANTHROPIC_MODELO_EXTRACCION_RAPIDA ?? "claude-sonnet-4-6";

// Umbral de `confianza` (0..1) del spec para aceptar el intento del tier rápido.
export const UMBRAL_CONFIANZA_EXTRACCION = Number(process.env.ANTHROPIC_UMBRAL_EXTRACCION ?? 0.75);

// Se filtran tiers duplicados por si `ANTHROPIC_MODEL` apunta al mismo modelo rápido.
export const CASCADA_EXTRACCION: { modelo: string; umbralConfianza: number }[] = [
  { modelo: MODELO_EXTRACCION_RAPIDA, umbralConfianza: UMBRAL_CONFIANZA_EXTRACCION },
  { modelo: MODELO_EXTRACCION, umbralConfianza: 0 }, // último tier: no escala más
].filter((tier, i, todos) => todos.findIndex((t) => t.modelo === tier.modelo) === i);
