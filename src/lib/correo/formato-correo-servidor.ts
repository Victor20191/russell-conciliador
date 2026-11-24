import "server-only";
import { DOMParser, parseHTML } from "linkedom";
import { htmlConEstilosEnLinea, type ParseadorHtml } from "./preparar-html-correo";
import { tipografiaParaCorreo } from "@/lib/marca/html";

/**
 * El «formato correo» del reporte para gerencia, en el SERVIDOR.
 *
 * Es el mismo que produce el botón «Copiar formato correo» del navegador
 * (`htmlConEstilosEnLinea` y la tipografía Arial del correo): lo único que cambia es
 * quién parsea el HTML. Aquí no hay `DOMParser`, así que se usa `linkedom`, una
 * implementación ligera del DOM sin dependencias nativas ni navegador.
 *
 * Dos diferencias deliberadas con el botón, porque el servidor no conoce ninguna dirección
 * pública de la plataforma (producción puede no tener dominio ni HTTPS) y por eso no
 * puede apuntar a `/marca/…`:
 *  - el logotipo viaja INCRUSTADO (`cid:`), como en los avisos de notificación; sin
 *    logotipo disponible el correo sale sin él;
 *  - se omiten las fuentes web Lato: en un correo la tipografía es Arial (Manual §2.2).
 * Ninguna referencia a `/marca/` queda relativa ni apuntando a un origen inventado.
 *
 * Tampoco hay respaldo silencioso: si la conversión falla, el envío falla y queda
 * registrado; no sale al cliente un correo degradado (sin estilos en línea) que nadie vio.
 */

/** Identificador (CID) del logotipo azul incrustado en el correo del reporte. */
export const CID_LOGO_REPORTE = "logo-russell-bedford-azul";

/** El logotipo que lleva el documento del reporte (`logoHtml`): SVG azul, sobre fondo blanco. */
const LOGO_AZUL_SVG = "/marca/russell-bedford-azul.svg";

// linkedom implementa la parte del DOM que usa la conversión; su tipo no es el de lib.dom.
const parsearConLinkedom: ParseadorHtml = (html) => {
  const documento = new DOMParser().parseFromString(html, "text/html");
  // linkedom deja cada referencia de entidad («&amp;», «&nbsp;») como un nodo de texto aparte y el
  // navegador los junta al parsear. Se juntan igual, para no envolver en un `<span>` cada trozo.
  documento.normalize();
  return documento as unknown as Document;
};

/**
 * Cambia las referencias relativas a `public/marca` por lo que sí viaja en el correo: el
 * logotipo azul pasa a su CID (si hay logotipo; si no, se quita junto con su contenedor) y
 * cualquier otro recurso relativo de `/marca/` se quita.
 */
function resolverRecursosDeMarca(html: string, logoCid: string | null): string {
  return html
    .replace(/<img\b[^>]*?\ssrc=(["'])(\/marca\/[^"']*)\1[^>]*>/gi, (img, comilla: string, ruta: string) =>
      ruta === LOGO_AZUL_SVG && logoCid ? img.replace(`src=${comilla}${ruta}${comilla}`, `src="cid:${logoCid}"`) : "",
    )
    // El contenedor del logotipo (`rb-logo`) que quedó sin imagen no deja un hueco.
    .replace(/<div\b[^>]*\bclass=(["'])rb-logo\1[^>]*>\s*<\/div>/gi, "")
    .replace(/\s(?:src|href|background|poster)=(["'])\/marca\/[^"']*\1/gi, "")
    .replace(/url\(\s*["']?\/marca\/[^)]*\)/gi, "none");
}

/**
 * El HTML completo del reporte → el fragmento autocontenido para el cuerpo de un
 * correo, con el CSS en línea, Arial como tipografía y el logotipo referido por
 * `logoCid` (el `cid:` del adjunto en línea; null si no hay logotipo).
 */
export function htmlCorreoDeReporte(htmlCompleto: string, opciones: { logoCid: string | null }): string {
  // Sin fuentes web: no hay una dirección pública de la que descargarlas y el correo usa Arial.
  const sinFuentesWeb = htmlCompleto.replace(/@font-face\s*\{[^}]*\}/gi, "");
  const fragmento = htmlConEstilosEnLinea(sinFuentesWeb, parsearConLinkedom);
  return tipografiaParaCorreo(resolverRecursosDeMarca(fragmento, opciones.logoCid));
}

function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Pone el fragmento dentro de un documento HTML mínimo (el SMTP envía un mensaje
 * completo). El fragmento no se modifica.
 */
export function documentoCorreo(fragmento: string, titulo: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escaparHtml(titulo)}</title></head><body style="margin:0;padding:0">${fragmento}</body></html>`;
}

/**
 * Texto plano alterno del correo (lo que ven los lectores sin HTML): mismo recorrido que
 * el del navegador, con saltos de línea al cerrar cada bloque.
 */
export function htmlATextoPlano(html: string): string {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  const contenedor = document.createElement("div");
  contenedor.innerHTML = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|tr|br|section|article)[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  return (contenedor.textContent ?? "")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
