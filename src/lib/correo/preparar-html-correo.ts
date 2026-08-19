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

  return `<div style="${contenedor}">${estilosResiduales}\n${doc.body.innerHTML.trim()}\n</div>`;
}
