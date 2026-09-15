import "server-only";
import { decrypt, encrypt } from "@/lib/crypto";

// Cifrado de las credenciales de una conexión. Cada valor se cifra por
// separado (AES-256-GCM) y el conjunto se persiste como JSON en
// `conexiones_integracion.credenciales`. Igual que `variables_entorno`, los
// valores NUNCA viajan al cliente: la UI solo recibe las claves definidas.

export type CredencialesGuardadas = unknown;

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Cifra los valores no vacíos; omite los campos que se dejan en blanco. */
export function cifrarCredenciales(valores: Record<string, string>): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(valores)) {
    if (typeof valor !== "string" || valor === "") continue;
    salida[clave] = encrypt(valor);
  }
  return salida;
}

/** Descifra el JSON persistido. Un valor corrupto se omite (fail-safe). */
export function descifrarCredenciales(guardadas: CredencialesGuardadas): Record<string, string> {
  if (!esObjeto(guardadas)) return {};
  const salida: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(guardadas)) {
    if (typeof valor !== "string" || valor === "") continue;
    try {
      salida[clave] = decrypt(valor);
    } catch {
      // Valor cifrado ilegible (clave maestra rotada o dato corrupto):
      // se trata como ausente para que la prueba falle con un mensaje claro.
    }
  }
  return salida;
}

/** Claves de credenciales con valor definido (sin exponer los valores). */
export function clavesCredencialesDefinidas(guardadas: CredencialesGuardadas): string[] {
  if (!esObjeto(guardadas)) return [];
  return Object.entries(guardadas)
    .filter(([, valor]) => typeof valor === "string" && valor !== "")
    .map(([clave]) => clave);
}

/**
 * Fusiona lo enviado por el formulario con lo ya guardado: los campos vacíos
 * conservan el valor anterior (el usuario no reescribe el secreto) y los
 * campos con valor se cifran de nuevo.
 */
export function fusionarCredenciales(
  guardadas: CredencialesGuardadas,
  enviadas: Record<string, string>,
): Record<string, string> {
  const anteriores = esObjeto(guardadas) ? (guardadas as Record<string, unknown>) : {};
  const salida: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(anteriores)) {
    if (typeof valor === "string" && valor !== "") salida[clave] = valor;
  }
  for (const [clave, valor] of Object.entries(enviadas)) {
    if (typeof valor !== "string" || valor === "") continue;
    salida[clave] = encrypt(valor);
  }
  return salida;
}
