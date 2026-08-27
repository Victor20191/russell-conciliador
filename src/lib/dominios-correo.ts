/**
 * Dominios de correo corporativos de la plataforma.
 *
 * Vive aparte —y sin `server-only`— porque lo necesitan las dos orillas: la
 * compuerta de IA en el servidor (`src/lib/ia/proveedor-balance.ts`) y el
 * filtro de novedades en el cliente (`src/lib/soporte-dominios.ts`).
 */

/**
 * Dominios del personal de Russell Bedford, el que usa la plataforma a diario.
 *
 * Son VARIOS a propósito: el buzón corporativo real es `@russellbedford.com.co`
 * y conviven con él `@russellbedford.co` (cuentas antiguas y las semillas) y
 * `@rbcol.co`. Reconocer uno solo dejaba a casi todo el personal clasificado
 * como «otros» en el filtro de `/reportes`.
 *
 * Ninguno es sufijo de otro, así que el orden de la lista no cambia el
 * resultado.
 */
export const DOMINIOS_RUSSELL = ["@russellbedford.com.co", "@russellbedford.co", "@rbcol.co"] as const;

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

/** ¿El correo pertenece a ALGUNO de los dominios? Mismas garantías que el singular. */
export function correoEsDeAlgunDominio(
  correo: string | null | undefined,
  dominios: readonly string[],
): boolean {
  return dominios.some((dominio) => correoEsDelDominio(correo, dominio));
}
