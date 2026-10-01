// Cliente de Claude (Anthropic) — primera integración de IA de la plataforma.
// Se usa para la extracción asistida de balances (src/lib/balance/extraccion).
// Singleton perezoso: no exige la API key hasta que realmente se llama, para que
// el resto de la app siga compilando/ejecutando sin la clave configurada.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ThinkingConfigParam } from "@anthropic-ai/sdk/resources/messages/messages";
import { ajustesDeterministas as ajustesDeterministasModelo, esAjusteNoSoportado } from "@/lib/ia/parametros-modelo";

// Modelo por defecto: máxima calidad para extracción estructurada (Opus 5.5).
// Configurable por entorno sin tocar código.
export const MODELO_EXTRACCION = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

let cliente: Anthropic | null = null;

/** Devuelve el cliente Anthropic; lanza un error claro si falta la API key. */
export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Falta ANTHROPIC_API_KEY. Configúrala en .env para usar la extracción de balances con IA.",
    );
  }
  cliente ??= new Anthropic({
    // 10 min por llamada; la extracción (sobre todo de PDF) puede tardar.
    // No delegamos reintentos al SDK: una cascada Sonnet→Opus con 2 reintentos
    // por modelo podría superar incluso los 30 min del host. El flujo de balance
    // reintenta de forma explícita e idempotente usando la identidad del lote.
    timeout: 10 * 60 * 1000,
    maxRetries: 0,
  });
  return cliente;
}

/** ¿Está configurada la extracción con IA? (para decidir UI/fallback). */
export function iaDisponible(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Ajustes que se esparcen en `messages.parse`, con el tipo del SDK. */
type AjustesLlamada = { temperature?: number; thinking?: ThinkingConfigParam };

/**
 * Ajustes para que la lectura de archivos sea **determinista** y se ciña a los
 * datos reales, según lo que acepta cada generación de Claude (la tabla y su
 * porqué viven en `src/lib/ia/parametros-modelo.ts`, puro y probado).
 */
export function ajustesDeterministas(model: string = MODELO_EXTRACCION): AjustesLlamada {
  const { temperature, thinking } = ajustesDeterministasModelo(model);
  // El SDK instalado aún no tipa `between_tools` (Sonnet 5.5); la API lo acepta.
  return { ...(temperature != null ? { temperature } : {}), ...(thinking ? { thinking: thinking as unknown as ThinkingConfigParam } : {}) };
}

/**
 * Ejecuta una llamada determinista y, si el modelo configurado RECHAZA el
 * muestreo o el modo de thinking (400 — p. ej. una familia nueva no contemplada
 * en `ajustesDeterministas`), reintenta UNA vez con los valores predeterminados
 * de la API (sin `temperature` ni `thinking`), que todo modelo acepta. Evita que
 * apuntar `ANTHROPIC_MODEL` a un modelo más nuevo rompa la extracción de forma
 * opaca. El callback recibe los ajustes para esparcirlos.
 */
export async function conReintentoSinTemperatura<T>(llamar: (ajustes: AjustesLlamada) => Promise<T>, model: string = MODELO_EXTRACCION): Promise<T> {
  try {
    return await llamar(ajustesDeterministas(model));
  } catch (e) {
    if (esAjusteNoSoportado(e)) return await llamar({});
    throw e;
  }
}
