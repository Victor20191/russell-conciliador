/**
 * Superficie mínima de Web Crypto necesaria para identificar de forma estable
 * una lectura. `randomUUID` solo se expone en contextos seguros; en HTTP,
 * `getRandomValues` sigue disponible y permite construir un UUID v4 válido.
 */
export type FuenteUuidCliente = {
  randomUUID?: () => string;
  getRandomValues?: (bytes: Uint8Array) => Uint8Array;
};

export const MENSAJE_UUID_CLIENTE_NO_DISPONIBLE =
  "Este navegador no permite identificar la lectura de forma segura. Abre Russell mediante HTTPS o usa un navegador actualizado.";

function fuenteUuidGlobal(): FuenteUuidCliente | null {
  const fuente = globalThis.crypto;
  return fuente ? (fuente as unknown as FuenteUuidCliente) : null;
}

/**
 * Genera un UUID v4 sin recurrir a `Math.random`.
 *
 * Prioriza la API nativa y degrada a RFC 4122 con bytes criptográficamente
 * seguros para que la idempotencia de cargas también funcione sobre HTTP.
 */
export function generarUuidV4Cliente(
  fuente: FuenteUuidCliente | null = fuenteUuidGlobal(),
): string {
  if (typeof fuente?.randomUUID === "function") {
    return fuente.randomUUID();
  }
  if (typeof fuente?.getRandomValues !== "function") {
    throw new Error(MENSAJE_UUID_CLIENTE_NO_DISPONIBLE);
  }

  const bytes = fuente.getRandomValues(new Uint8Array(16));
  // RFC 4122: versión 4 (0100) y variante IETF (10xx).
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}
