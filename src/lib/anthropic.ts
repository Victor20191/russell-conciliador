// Cliente de Claude (Anthropic) — primera integración de IA de la plataforma.
// Se usa para la extracción asistida de balances (src/lib/balance/extraccion).
// Singleton perezoso: no exige la API key hasta que realmente se llama, para que
// el resto de la app siga compilando/ejecutando sin la clave configurada.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Modelo por defecto: máxima calidad para extracción estructurada (Opus 4.8).
// Configurable por entorno sin tocar código.
export const MODELO_EXTRACCION = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

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

/**
 * Familias de modelo que ya NO aceptan parámetros de muestreo
 * (`temperature`/`top_p`/`top_k`): los rechazan con HTTP 400. En esas familias
 * no se puede fijar `temperature: 0`.
 */
function aceptaTemperatura(model: string): boolean {
  const m = model.toLowerCase();
  return !(m.includes("opus-4-7") || m.includes("opus-4-8") || m.includes("fable") || m.includes("mythos"));
}

/**
 * Ajustes para que la lectura de archivos sea **determinista** y se ciña a los
 * datos reales (no inventar para "cuadrar"):
 * - Modelos que aceptan `temperature` (Sonnet 4.6, Haiku 4.5, Opus 4.6 y
 *   anteriores): `temperature: 0` con el *thinking* DESACTIVADO —son
 *   incompatibles entre sí— ⇒ decodificación voraz, sin aleatoriedad.
 * - Modelos que ya no aceptan `temperature` (Opus 4.7/4.8, Fable 5): se usa
 *   *thinking* adaptativo y el anclaje a los datos recae en la salida
 *   estructurada (Structured Outputs) y en el prompt.
 *
 * Ojo: `temperature: 0` reduce la aleatoriedad, pero la garantía fuerte contra
 * invenciones la da el diseño del pipeline (en modo tabular el modelo solo
 * describe la estructura; la transcripción de montos la hace el código).
 */
export function ajustesDeterministas(model: string = MODELO_EXTRACCION): {
  temperature?: number;
  thinking: { type: "adaptive" } | { type: "disabled" };
} {
  if (aceptaTemperatura(model)) {
    return { temperature: 0, thinking: { type: "disabled" } };
  }
  return { thinking: { type: "adaptive" } };
}

type AjustesDeterministas = ReturnType<typeof ajustesDeterministas>;

/** ¿El error es un 400 por un parámetro de muestreo no soportado por el modelo? */
function esMuestreoNoSoportado(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const status = (e as { status?: unknown }).status;
  const msg = e instanceof Error ? e.message : "";
  return status === 400 && /temperature|top_p|top_k/i.test(msg);
}

/**
 * Ejecuta una llamada determinista y, si el modelo configurado RECHAZA
 * `temperature` (400 — p. ej. una familia nueva sin muestreo no contemplada en
 * `aceptaTemperatura`), reintenta UNA vez sin `temperature` (thinking
 * adaptativo). Evita que apuntar `ANTHROPIC_MODEL` a un modelo más nuevo rompa
 * la extracción de forma opaca. El callback recibe los ajustes para esparcirlos.
 */
export async function conReintentoSinTemperatura<T>(llamar: (ajustes: AjustesDeterministas) => Promise<T>, model: string = MODELO_EXTRACCION): Promise<T> {
  try {
    return await llamar(ajustesDeterministas(model));
  } catch (e) {
    if (esMuestreoNoSoportado(e)) return await llamar({ thinking: { type: "adaptive" } });
    throw e;
  }
}
