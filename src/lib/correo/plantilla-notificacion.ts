import { franjaHtml } from "@/lib/marca/html";
import { COLOR, FUENTE_CORREO, NEUTRO, SPACE_BLUE } from "@/lib/marca/paleta";

export class ErrorPlantillaNotificacion extends Error {}

/**
 * Identificador de la imagen incrustada del logotipo. El correo lleva el archivo
 * oficial como adjunto en línea (CID): Gmail y Outlook lo muestran sin descargar
 * nada de la plataforma.
 */
export const CID_LOGO_CORREO = "logo-russell-bedford";

/** Plantilla sin recursos externos ni contenido HTML aportado por usuarios. */
function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Encabezado con el logotipo blanco sobre el azul institucional (Manual §1.2):
 * 170 px de ancho, por encima de los 30 mm mínimos, y 34 px de espacio libre (20 %)
 * por cada lado. Sin logo disponible, el encabezado conserva el color. La franja
 * institucional va al pie, sobre blanco, como en el membrete (§5.1).
 */
function encabezado(logoSrc: string | null): string {
  const logo = logoSrc
    ? `<img src="${escapar(logoSrc)}" width="170" height="37" alt="Russell Bedford · taking you further" style="display:block;border:0;width:170px;height:37px">`
    : "";
  return `<div style="background:${SPACE_BLUE[100]};padding:34px">${logo}</div>`;
}

export function mensajeNotificacion(input: {
  titulo: string;
  texto: string;
  urlPlataforma?: unknown;
  ruta?: string;
  /** `cid:` del logotipo adjunto (por defecto) o null si no se pudo adjuntar. */
  logoSrc?: string | null;
}) {
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
  const logoSrc = input.logoSrc === undefined ? `cid:${CID_LOGO_CORREO}` : input.logoSrc;
  // Arial en el correo (Manual §2.2): quien lo abre puede no tener Lato.
  return {
    asunto: `Russell · ${input.titulo}`.replace(/[\r\n]/g, " ").slice(0, 200),
    texto: `${input.texto}${enlace ? `\n\nAbrir Russell: ${enlace}` : ""}\n\nAviso automático de Russell Conciliador.`,
    html: `<!doctype html><html lang="es"><body style="margin:0;background:${NEUTRO.k5};font-family:${FUENTE_CORREO};color:${COLOR.texto}"><div style="max-width:600px;margin:24px auto;background:${NEUTRO.blanco};border:1px solid ${COLOR.borde};border-radius:12px;overflow:hidden">${encabezado(logoSrc)}<div style="padding:24px 34px 28px"><p style="margin:0 0 6px;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${COLOR.textoSecundario}">Russell Conciliador</p><h1 style="font-size:20px;font-weight:normal;margin-top:0;color:${COLOR.titulo}">${escapar(input.titulo)}</h1><p style="line-height:1.7;white-space:pre-wrap">${escapar(input.texto)}</p>${enlace ? `<p style="margin-top:28px"><a href="${escapar(enlace)}" style="display:inline-block;background:${SPACE_BLUE[100]};color:${NEUTRO.blanco};text-decoration:none;padding:12px 20px;border-radius:6px">Abrir Russell</a></p>` : ""}<p style="font-size:12px;color:${COLOR.textoSecundario};margin-top:28px">Aviso automático. Ingresa a Russell para consultar el detalle.</p></div>${franjaHtml(4)}</div></body></html>`,
  };
}
