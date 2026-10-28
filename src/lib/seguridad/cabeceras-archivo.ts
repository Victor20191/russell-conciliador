/**
 * Un adjunto puede ser un SVG o un documento activo. Al abrirlo directamente
 * conserva la URL de Russell, pero nunca debe ejecutar scripts con su origen.
 * La política se aplica también a descargas y a tipos heredados del almacén.
 */
export const CABECERAS_ARCHIVO_PRIVADO = {
  "Content-Security-Policy": "sandbox; default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; base-uri 'none'; form-action 'none'",
  "X-Content-Type-Options": "nosniff",
  // Una copia cacheada no puede sobrevivir a la revocación de sesión o cartera.
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
} as const;
