/**
 * Dominios de correo corporativos de la plataforma.
 *
 * Vive aparte —y sin `server-only`— porque lo necesitan las dos orillas: la
 * compuerta de IA en el servidor (`src/lib/ia/proveedor-balance.ts`) y el
 * filtro de novedades en el cliente (`src/lib/soporte-dominios.ts`).
 */

/** Dominio del personal de Russell Bedford, el que usa la plataforma a diario. */
export const DOMINIO_RUSSELL = "@russellbedford.co";

/** Dominio de Xentria, que construye y opera la plataforma. */
export const DOMINIO_XENTRIA = "@xentria.co";

/**
 * ¿El correo pertenece al dominio? Puro y fail-closed.
 *
 * La comparación incluye la arroba a propósito: sin ella, `falso@noxentria.co`
 * pasaría por un correo de Xentria. Y como es un sufijo, `xentria.co@gmail.com`
 * tampoco cuela.
 */
export function correoEsDelDominio(correo: string | null | undefined, dominio: string): boolean {
  return typeof correo === "string" && correo.trim().toLowerCase().endsWith(dominio);
}
