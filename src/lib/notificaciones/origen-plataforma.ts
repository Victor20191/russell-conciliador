// Dirección pública de Russell que figura en la conexión SMTP de notificaciones
// (`url_plataforma`). El envío automático del reporte la necesita para armar el
// logotipo del correo (un correo no conoce la plataforma). PURO.

/**
 * El origen (`https://russell.tuempresa.com`, sin barra final) de la dirección
 * configurada, o null si no sirve. Se exige la misma forma que valida la conexión:
 * HTTPS, sin credenciales, ruta, parámetros ni ancla.
 */
export function origenDePlataforma(valor: unknown): string | null {
  if (typeof valor !== "string" || !valor.trim()) return null;
  let url: URL;
  try {
    url = new URL(valor.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
  return url.origin;
}
