/**
 * Los fallos de transporte de una Server Action no son errores funcionales del
 * balance: el servidor puede haber terminado aunque el navegador haya perdido
 * la respuesta. Solo estos errores conocidos se convierten en un estado
 * recuperable; cualquier otra excepción debe seguir llegando al error boundary.
 */
export function esFalloTransporteCarga(error: unknown): boolean {
  const mensaje =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "string"
        ? error
        : "";

  return /failed to fetch|fetch failed|networkerror|network request failed|load failed|connection.*lost/i.test(
    mensaje,
  );
}

export const MENSAJE_RECUPERAR_LECTURA =
  "Se perdió la respuesta mientras se leía el archivo. El servidor puede haber terminado. Pulsa «Reintentar lectura»: Russell comprobará la misma operación y no duplicará el borrador.";

export const MENSAJE_RECUPERAR_PROMOCION =
  "Se perdió la respuesta mientras se cargaba el balance. Pulsa «Comprobar y continuar»: Russell verificará el mismo lote y nunca creará una versión duplicada.";
