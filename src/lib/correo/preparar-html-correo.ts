/**
 * Prepara el HTML de un documento (reporte ejecutivo) para pegarlo en el
 * cuerpo de un correo. Requiere DOM: se usa solo desde componentes cliente.
 *
 * La lógica de cascada vive en `estilos-en-linea.ts` (pura y probada); aquí
 * solo se parsea el documento, se aplica el volcado y se arma el fragmento.
 */

import {
  aplicarReglasEnLinea,
  combinarDeclaraciones,
  parsearDeclaraciones,
  parsearHojaEstilos,
  serializarDeclaraciones,
  type Declaracion,
} from "./estilos-en-linea";

/** Tipografía y color base por si el documento no los define en <body>. */
const BASE: Declaracion[] = [
  { propiedad: "font-family", valor: "'Helvetica Neue',Helvetica,Arial,sans-serif", importante: false },
  { propiedad: "color", valor: "#1a2330", importante: false },
  { propiedad: "font-size", valor: "14px", importante: false },
  { propiedad: "line-height", valor: "1.5", importante: false },
];

/** Nodos que no pintan nada en un correo (o que no deben viajar en él). */
const SOBRANTES = "script,link,meta,title,noscript,base";

const BARRA_HORIZONTAL_DIV =
  /<div\s+style="([^"]*)">\s*<div\s+style="([^"]*)">\s*<\/div>\s*<\/div>/gi;
const COLOR_CORREO = /^#[0-9a-f]{3,8}$/i;

function valorDeclaracion(estilo: string, propiedad: string): string | null {
  return parsearDeclaraciones(estilo).find((declaracion) => declaracion.propiedad === propiedad)?.valor ?? null;
}

/**
 * Los editores de correo suelen colapsar los `div` vacíos usados como barras,
 * aunque el portapapeles contenga `text/html`. Para la copia se sustituyen por
 * tablas de presentación con celdas no vacías, una estructura que Gmail y
 * Outlook conservan sin cambiar el HTML de la vista previa ni del PDF.
 */
export function hacerBarrasCompatiblesCorreo(html: string): string {
  return html.replace(BARRA_HORIZONTAL_DIV, (original, estiloPista: string, estiloRelleno: string) => {
    const alto = valorDeclaracion(estiloPista, "height");
    const fondoPista =
      valorDeclaracion(estiloPista, "background-color") ?? valorDeclaracion(estiloPista, "background");
    const desborde = valorDeclaracion(estiloPista, "overflow");
    const altoRelleno = valorDeclaracion(estiloRelleno, "height");
    const anchoRelleno = valorDeclaracion(estiloRelleno, "width");
    const fondoRelleno =
      valorDeclaracion(estiloRelleno, "background-color") ??
      valorDeclaracion(estiloRelleno, "background");

    if (
      !alto?.match(/^\d+(?:\.\d+)?px$/) ||
      desborde !== "hidden" ||
      altoRelleno !== "100%" ||
      !anchoRelleno?.match(/^\d+(?:\.\d+)?%$/) ||
      !fondoPista?.match(COLOR_CORREO) ||
      !fondoRelleno?.match(COLOR_CORREO)
    ) {
      return original;
    }

    const porcentaje = Math.min(100, Math.max(0, Number.parseFloat(anchoRelleno)));
    if (!Number.isFinite(porcentaje)) return original;

    const restante = Math.round((100 - porcentaje) * 1000) / 1000;
    const altoNumerico = alto.slice(0, -2);
    const celdaRelleno = `<td width="${porcentaje}%" height="${altoNumerico}" bgcolor="${fondoRelleno}" style="width:${porcentaje}%;height:${alto};padding:0;background-color:${fondoRelleno};font-size:1px;line-height:${alto};mso-line-height-rule:exactly;">&nbsp;</td>`;
    const celdaPista =
      restante > 0
        ? `<td width="${restante}%" height="${altoNumerico}" bgcolor="${fondoPista}" style="width:${restante}%;height:${alto};padding:0;background-color:${fondoPista};font-size:1px;line-height:${alto};mso-line-height-rule:exactly;">&nbsp;</td>`
        : "";

    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:${fondoPista};"><tbody><tr>${celdaRelleno}${celdaPista}</tr></tbody></table>`;
  });
}

/**
 * Devuelve un fragmento autocontenido con TODO el CSS volcado a `style="..."`.
 * Es lo que hace el navegador al copiar una página ya renderizada, y lo único
 * que Gmail respeta: sus etiquetas <style> se descartan al pegar.
 */
export function htmlConEstilosEnLinea(htmlCompleto: string): string {
  if (typeof DOMParser === "undefined") {
    throw new Error("El navegador no permite preparar el formato correo.");
  }

  const doc = new DOMParser().parseFromString(htmlCompleto, "text/html");
  if (!doc.body) throw new Error("El reporte no tiene contenido para copiar.");

  const css = [...doc.querySelectorAll("style")].map((s) => s.textContent ?? "").join("\n");
  doc.querySelectorAll("style").forEach((s) => s.remove());
  doc.querySelectorAll(SOBRANTES).forEach((n) => n.remove());

  const { reglas, variables, cssRestante } = parsearHojaEstilos(css);
  aplicarReglasEnLinea(reglas, (selector) => [...doc.querySelectorAll(selector)], variables);

  // <html> y <body> desaparecen al pegar: sus estilos (fondo, tipografía,
  // márgenes) se trasladan al div contenedor para no perder la herencia.
  const contenedor = serializarDeclaraciones(
    combinarDeclaraciones(BASE, [
      ...parsearDeclaraciones(doc.documentElement?.getAttribute("style") ?? ""),
      ...parsearDeclaraciones(doc.body.getAttribute("style") ?? ""),
    ]),
    variables,
  );

  const estilosResiduales = cssRestante.trim()
    ? `\n<style type="text/css">${cssRestante.trim()}</style>`
    : "";

  const cuerpo = hacerBarrasCompatiblesCorreo(doc.body.innerHTML.trim());

  return `<div style="${contenedor}">${estilosResiduales}\n${cuerpo}\n</div>`;
}
