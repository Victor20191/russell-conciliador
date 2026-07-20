import "server-only";
import { iaDisponible as anthropicDisponible, MODELO_EXTRACCION } from "@/lib/anthropic";
import { geminiDisponible } from "@/lib/gemini";
import type { UsoTokens } from "@/lib/ia/precios";

export type ProveedorIABalance = "anthropic" | "gemini";

export type ConfiguracionIABalanceUI = {
  predeterminado: ProveedorIABalance;
  opciones: Array<{
    valor: ProveedorIABalance;
    etiqueta: string;
  }>;
};

/** Modelo económico y estable para cargas de prueba. */
export const MODELO_GEMINI_BALANCE =
  process.env.GEMINI_BALANCE_MODEL?.trim() || "gemini-3.1-flash-lite";

/**
 * Compuerta privada de la herramienta de pruebas.
 *
 * Tiene que ser una habilitación POSITIVA y doble: `next dev` + bandera local.
 * Un build normal de Next usa `NODE_ENV=production`, incluidos los despliegues
 * de preview, por lo que nunca expone el selector ni acepta Gemini.
 */
export function modoDesarrolloIABalanceActivo(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.BALANCE_AI_DEV_SELECTOR?.trim().toLowerCase() === "true"
  );
}

/**
 * Selección del proveedor del módulo de balances.
 *
 * La compuerta de desarrollo es deliberadamente anterior a la lectura de la
 * selección: fuera del modo local autorizado, ni una configuración accidental
 * ni un formulario manipulado pueden habilitar Gemini.
 */
export function proveedorIABalance(solicitado?: unknown): ProveedorIABalance {
  if (!modoDesarrolloIABalanceActivo()) return "anthropic";

  if (solicitado != null && typeof solicitado !== "string") {
    throw new Error('BALANCE_AI_PROVIDER inválido. Usa "anthropic" o "gemini".');
  }
  const elegido = typeof solicitado === "string" ? solicitado.trim().toLowerCase() : "";
  const configurado = elegido || process.env.BALANCE_AI_PROVIDER?.trim().toLowerCase();
  if (!configurado || configurado === "anthropic") return "anthropic";
  if (configurado === "gemini") return "gemini";
  throw new Error(
    `BALANCE_AI_PROVIDER inválido: «${configurado}». Usa "anthropic" o "gemini".`,
  );
}

export function modeloIABalance(solicitado?: unknown): string {
  return proveedorIABalance(solicitado) === "gemini" ? MODELO_GEMINI_BALANCE : MODELO_EXTRACCION;
}

export function iaBalanceDisponible(solicitado?: unknown): boolean {
  return proveedorIABalance(solicitado) === "gemini" ? geminiDisponible() : anthropicDisponible();
}

export function mensajeIABalanceNoDisponible(solicitado?: unknown): string {
  return proveedorIABalance(solicitado) === "gemini"
    ? "La IA de pruebas no está disponible (falta GEMINI_API_KEY)."
    : "La IA no está disponible (falta ANTHROPIC_API_KEY).";
}

/**
 * Opciones mínimas que la Server Component puede serializar hacia el modal.
 * Fuera del desarrollo local autorizado devuelve null: el selector no se
 * serializa y el servidor fuerza Anthropic aunque se envíe `gemini` a mano.
 */
export function configuracionIABalanceUI(): ConfiguracionIABalanceUI | null {
  if (!modoDesarrolloIABalanceActivo()) return null;
  return {
    predeterminado: proveedorIABalance(),
    opciones: [
      {
        valor: "gemini",
        etiqueta: `Gemini · ${MODELO_GEMINI_BALANCE} — económico para pruebas`,
      },
      {
        valor: "anthropic",
        etiqueta: `Anthropic · Claude — flujo de producción (${MODELO_EXTRACCION})`,
      },
    ],
  };
}

/** Adapta usageMetadata de Gemini al contrato común que persiste consumo_ia. */
export function usoTokensGemini(usage?: {
  promptTokens?: number;
  completionTokens?: number;
}): UsoTokens {
  return {
    input_tokens: usage?.promptTokens ?? 0,
    output_tokens: usage?.completionTokens ?? 0,
  };
}
