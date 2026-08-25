import "server-only";
import { iaDisponible as anthropicDisponible, MODELO_EXTRACCION } from "@/lib/anthropic";
import { geminiDisponible } from "@/lib/gemini";
import type { UsoTokens } from "@/lib/ia/precios";
import { correoEsDelDominio, DOMINIO_XENTRIA } from "@/lib/dominios-correo";

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
 * Dominio corporativo cuyo personal puede usar la herramienta de pruebas
 * también en la plataforma desplegada (no solo en desarrollo local).
 *
 * El valor vive en `@/lib/dominios-correo` —módulo puro, sin `server-only`—
 * porque el filtro de novedades de `/reportes` lo necesita en el cliente y este
 * archivo no se puede importar desde allí. Se re-exporta con su nombre de
 * siempre para no mover a los consumidores de la compuerta de IA.
 */
export { DOMINIO_XENTRIA as DOMINIO_CORREO_IA_PRUEBAS } from "@/lib/dominios-correo";

/** ¿El correo pertenece al dominio corporativo autorizado? Puro y fail-closed. */
export function correoAutorizadoIAPruebas(correo: string | null | undefined): boolean {
  return correoEsDelDominio(correo, DOMINIO_XENTRIA);
}

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
 * `autorizado: true` = la FRONTERA (Server Action / RSC) ya validó la sesión
 * contra el dominio corporativo (`proveedorIABalanceSesion`). Este módulo no
 * consulta sesión ni BD, así que la autorización se recibe ya resuelta.
 */
type OpcionesAutorizacion = { autorizado?: boolean };

/**
 * Selección del proveedor del módulo de balances.
 *
 * La compuerta es deliberadamente anterior a la lectura de la selección: fuera
 * del modo local autorizado —o de una sesión autorizada por la frontera—, ni
 * una configuración accidental ni un formulario manipulado habilitan Gemini.
 */
export function proveedorIABalance(solicitado?: unknown, opciones?: OpcionesAutorizacion): ProveedorIABalance {
  if (!modoDesarrolloIABalanceActivo() && !opciones?.autorizado) return "anthropic";

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

// Los tres helpers siguientes reciben el proveedor YA RESUELTO por
// `proveedorIABalance`/`proveedorIABalanceSesion` (no valores del formulario);
// sin argumento caen a la compuerta estricta de entorno.
export function modeloIABalance(proveedor: ProveedorIABalance = proveedorIABalance()): string {
  return proveedor === "gemini" ? MODELO_GEMINI_BALANCE : MODELO_EXTRACCION;
}

export function iaBalanceDisponible(proveedor: ProveedorIABalance = proveedorIABalance()): boolean {
  return proveedor === "gemini" ? geminiDisponible() : anthropicDisponible();
}

export function mensajeIABalanceNoDisponible(proveedor: ProveedorIABalance = proveedorIABalance()): string {
  return proveedor === "gemini"
    ? "La IA de pruebas no está disponible (falta GEMINI_API_KEY)."
    : "La IA no está disponible (falta ANTHROPIC_API_KEY).";
}

/**
 * Opciones mínimas que la Server Component puede serializar hacia el modal.
 * Fuera de una sesión autorizada (dev local o dominio corporativo) devuelve
 * null: el selector no se serializa y el servidor fuerza Anthropic aunque se
 * envíe `gemini` a mano.
 */
export function configuracionIABalanceUI(opciones?: OpcionesAutorizacion): ConfiguracionIABalanceUI | null {
  if (!modoDesarrolloIABalanceActivo() && !opciones?.autorizado) return null;
  return {
    predeterminado: proveedorIABalance(undefined, opciones),
    opciones: [
      {
        valor: "gemini",
        etiqueta: "Google",
      },
      {
        valor: "anthropic",
        etiqueta: "Anthropic",
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
