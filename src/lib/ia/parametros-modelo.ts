// Parámetros de muestreo y razonamiento que acepta cada generación de Claude.
//
// Módulo PURO (sin SDK, sin red) para poder probarlo: `src/lib/anthropic.ts` lo
// usa para armar las llamadas deterministas de la extracción y del mapeo. Cada
// generación cambió lo que la API acepta y una combinación inválida responde 400:
// - Claude 4.6 y anteriores (Haiku 4.5, Sonnet 4.6…): `temperature: 0` con el
//   thinking DESACTIVADO (son incompatibles entre sí) ⇒ decodificación voraz.
// - Claude 4.7 en adelante, Fable y Mythos: rechazan `temperature`/`top_p`/`top_k`
//   con un valor distinto del predeterminado. Se usa thinking adaptativo y el
//   anclaje a los datos recae en la salida estructurada y en el prompt.
// - Sonnet 5.5 en adelante: además rechaza `thinking: disabled`; su equivalente
//   es `between_tools` (sin razonamiento previo; sin herramientas en la llamada,
//   la respuesta es solo texto, como el «disabled» de antes). Así el tier rápido
//   de la cascada conserva su costo y latencia.
// - Opus 5.5: el thinking adaptativo está SIEMPRE activo (`disabled` → 400).
//
// Ojo: `temperature: 0` reduce la aleatoriedad, pero la garantía fuerte contra
// invenciones la da el diseño del pipeline (en modo tabular el modelo solo
// describe la estructura; la transcripción de montos la hace el código).

export type ThinkingDeterminista = { type: "adaptive" } | { type: "disabled" } | { type: "between_tools" };

export type AjustesDeterministas = {
  temperature?: number;
  thinking?: ThinkingDeterminista;
};

type VersionClaude = { familia: string; mayor: number; menor: number };

/**
 * Familia y versión de un ID de Claude: `claude-opus-5-5` → opus 5.5,
 * `claude-haiku-4-5-20251001` → haiku 4.5, `claude-opus-5` → opus 5.0. También
 * reconoce los IDs con prefijo de plataforma (`anthropic.claude-sonnet-5-5`).
 * Null si el ID no sigue ese patrón (p. ej. `claude-mythos-preview`).
 */
export function versionClaude(modelo: string): VersionClaude | null {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?!\d)/.exec(modelo.toLowerCase());
  if (!m) return null;
  return { familia: m[1], mayor: Number(m[2]), menor: m[3] ? Number(m[3]) : 0 };
}

const desde = (v: VersionClaude, mayor: number, menor: number) => v.mayor > mayor || (v.mayor === mayor && v.menor >= menor);

/** ¿El modelo rechaza `temperature`/`top_p`/`top_k` distintos del predeterminado? */
export function rechazaMuestreo(modelo: string): boolean {
  const m = modelo.toLowerCase();
  if (m.includes("fable") || m.includes("mythos")) return true;
  const v = versionClaude(m);
  return v != null && desde(v, 4, 7);
}

/** Ajustes deterministas válidos para el modelo (ver la tabla del encabezado). */
export function ajustesDeterministas(modelo: string): AjustesDeterministas {
  if (!rechazaMuestreo(modelo)) return { temperature: 0, thinking: { type: "disabled" } };
  const v = versionClaude(modelo);
  if (v?.familia === "sonnet" && desde(v, 5, 5)) return { thinking: { type: "between_tools" } };
  return { thinking: { type: "adaptive" } };
}

/**
 * ¿El error es un 400 por un parámetro de muestreo o de thinking que el modelo
 * no acepta? Pasa con una familia nueva que aún no contempla `ajustesDeterministas`;
 * la llamada se reintenta entonces con los valores predeterminados de la API.
 */
export function esAjusteNoSoportado(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const status = (e as { status?: unknown }).status;
  const msg = e instanceof Error ? e.message : "";
  return status === 400 && /temperature|top_p|top_k|thinking/i.test(msg);
}
