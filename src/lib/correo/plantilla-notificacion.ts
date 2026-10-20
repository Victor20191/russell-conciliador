export class ErrorPlantillaNotificacion extends Error {}

/** Plantilla sin recursos externos ni contenido HTML aportado por usuarios. */
function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function mensajeNotificacion(input: { titulo: string; texto: string; urlPlataforma?: unknown; ruta?: string }) {
  let enlace = "";
  if (input.urlPlataforma) {
    let base: URL;
    try { base = new URL(String(input.urlPlataforma)); }
    catch { throw new ErrorPlantillaNotificacion("Configura la dirección HTTPS de Russell en la conexión SMTP."); }
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/") {
      throw new ErrorPlantillaNotificacion("Configura la dirección HTTPS de Russell en la conexión SMTP.");
    }
    const ruta = input.ruta ?? "/dashboard";
    if (!ruta.startsWith("/") || ruta.startsWith("//") || /[\\\r\n]/.test(ruta)) throw new ErrorPlantillaNotificacion("Ruta de notificación inválida.");
    const destino = new URL(ruta, base);
    if (destino.origin !== base.origin) throw new ErrorPlantillaNotificacion("Ruta de notificación inválida.");
    enlace = destino.href;
  }
  return {
    asunto: `Russell · ${input.titulo}`.replace(/[\r\n]/g, " ").slice(0, 200),
    texto: `${input.texto}${enlace ? `\n\nAbrir Russell: ${enlace}` : ""}\n\nAviso automático de Russell Conciliador.`,
    html: `<!doctype html><html lang="es"><body style="margin:0;background:#f3f5f8;font-family:Arial,sans-serif;color:#263248"><div style="max-width:600px;margin:24px auto;background:white;border:1px solid #dde3eb;border-radius:12px;overflow:hidden"><div style="background:#18324f;color:white;padding:24px;font-size:20px;font-weight:bold">Russell Conciliador</div><div style="padding:24px"><h1 style="font-size:20px;margin-top:0">${escapar(input.titulo)}</h1><p style="line-height:1.7;white-space:pre-wrap">${escapar(input.texto)}</p>${enlace ? `<p style="margin-top:28px"><a href="${escapar(enlace)}" style="display:inline-block;background:#18324f;color:white;text-decoration:none;padding:12px 20px;border-radius:6px">Abrir Russell</a></p>` : ""}<p style="font-size:12px;color:#67758a;margin-top:28px">Aviso automático. Ingresa a Russell para consultar el detalle.</p></div></div></body></html>`,
  };
}
