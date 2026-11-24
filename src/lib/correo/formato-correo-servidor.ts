import "server-only";
import { DOMParser, parseHTML } from "linkedom";
import { htmlConEstilosEnLinea, type ParseadorHtml } from "./preparar-html-correo";
import { prepararMarcaParaCorreo } from "@/lib/marca/html";

/**
 * El «formato correo» del reporte para gerencia, en el SERVIDOR.
 *
 * Es el mismo que produce el botón «Copiar formato correo» del navegador
 * (`htmlConEstilosEnLinea` + `prepararMarcaParaCorreo`): lo único que cambia es quién
 * parsea el HTML. Aquí no hay `DOMParser`, así que se usa `linkedom`, una
 * implementación ligera del DOM sin dependencias nativas ni navegador.
 *
 * Diferencia deliberada con el botón: sin respaldo silencioso. Si la conversión
 * falla, el envío falla y queda registrado; no sale al cliente un correo degradado
 * (sin estilos en línea) que nadie vio.
 */

// linkedom implementa la parte del DOM que usa la conversión; su tipo no es el de lib.dom.
const parsearConLinkedom: ParseadorHtml = (html) => {
  const documento = new DOMParser().parseFromString(html, "text/html");
  // linkedom deja cada referencia de entidad («&amp;», «&nbsp;») como un nodo de texto aparte y el
  // navegador los junta al parsear. Se juntan igual, para no envolver en un `<span>` cada trozo.
  documento.normalize();
  return documento as unknown as Document;
};

/**
 * El HTML completo del reporte → el fragmento autocontenido para el cuerpo de un
 * correo, con el CSS en línea, el logotipo en PNG con dirección absoluta (`origen`) y
 * Arial como tipografía.
 */
export function htmlCorreoDeReporte(htmlCompleto: string, origen: string): string {
  return prepararMarcaParaCorreo(htmlConEstilosEnLinea(htmlCompleto, parsearConLinkedom), origen);
}

function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Pone el fragmento dentro de un documento HTML mínimo (el SMTP envía un mensaje
 * completo). El fragmento no se modifica: es lo que el navegador copiaría.
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
