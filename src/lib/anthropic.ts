// Cliente de Claude (Anthropic) — primera integración de IA de la plataforma.
// Se usa para la extracción asistida de balances (src/lib/balance/extraccion).
// Singleton perezoso: no exige la API key hasta que realmente se llama, para que
// el resto de la app siga compilando/ejecutando sin la clave configurada.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Modelo por defecto: buen equilibrio velocidad/calidad para extracción estructurada.
// Configurable por entorno sin tocar código.
export const MODELO_EXTRACCION = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

let cliente: Anthropic | null = null;

/** Devuelve el cliente Anthropic; lanza un error claro si falta la API key. */
export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Falta ANTHROPIC_API_KEY. Configúrala en .env para usar la extracción de balances con IA.",
    );
  }
  cliente ??= new Anthropic({
    // 10 min por defecto; la extracción (sobre todo de PDF) puede tardar.
    timeout: 10 * 60 * 1000,
    maxRetries: 2,
  });
  return cliente;
}

/** ¿Está configurada la extracción con IA? (para decidir UI/fallback). */
export function iaDisponible(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
