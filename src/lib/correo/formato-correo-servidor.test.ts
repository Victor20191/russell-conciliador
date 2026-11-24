import { describe, expect, it } from "vitest";
import { documentoCorreo, htmlATextoPlano, htmlCorreoDeReporte } from "./formato-correo-servidor";

// Mismo caso que se cotejó contra el DOMParser del navegador (jsdom): el servidor debe dar
// el mismo formato correo que el botón «Copiar formato correo». Solo difieren el ORDEN de
// los atributos dentro de cada etiqueta y que el navegador agrega un `<tbody>` implícito a
// las tablas que no lo traen; el reporte real siempre lo escribe.
const DOCUMENTO = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Reporte de uso</title>
<style>
  :root { --azul: #001871; }
  body { font-family: Lato, Arial, Helvetica, sans-serif; color: #3C3C3B; }
  h1 { color: var(--azul); font-size: 22px; }
  .nota { color: #626261; font-size: 11px; }
  td.cifra { text-align: right; }
  @media (max-width: 600px) { h1 { font-size: 18px; } }
</style></head>
<body>
  <img src="/marca/russell-bedford-azul.svg" width="180" height="39" alt="Russell Bedford">
  <h1>Resumen de uso y avances</h1>
  <p class="nota">Período 2026-11-16 – 2026-11-22</p>
  <table><tbody><tr><td class="cifra" style="color:#981D97">12 &amp; 4</td></tr></tbody></table>
  <div style="height:8px;background:#EFF1F4;overflow:hidden"><div style="height:100%;width:67%;background:#001871"></div></div>
</body></html>`;

describe("formato correo en el servidor", () => {
  const html = htmlCorreoDeReporte(DOCUMENTO, "https://russell.test");

  it("lleva el CSS a estilos en línea y envuelve todo en un contenedor con Arial", () => {
    expect(html.startsWith('<div style="font-family:Arial, Helvetica, sans-serif;color:#3C3C3B;font-size:14px;line-height:1.5">')).toBe(true);
    expect(html).toContain('<h1 style="color:#001871;font-size:22px">');
    // La variable CSS se resuelve: un correo no entiende `var(--azul)`.
    expect(html).not.toContain("var(--");
    // La cascada mezcla la clase (`td.cifra`) con el estilo propio del elemento.
    expect(html).toContain('<td class="cifra" style="text-align:right;color:#981D97">');
  });

  it("baja el color hasta el texto (Outlook descarta el color de td, div y p)", () => {
    expect(html).toContain('<h1 style="color:#001871;font-size:22px"><span style="color:#001871">Resumen de uso y avances</span></h1>');
    // Un texto con «&amp;» queda en UN solo span: el navegador junta los nodos de texto al parsear.
    expect(html).toContain('<span style="color:#981D97">12 &amp; 4</span>');
  });

  it("deja solo lo que no se puede volcar (@media) en un <style> reducido y quita <title> y <meta>", () => {
    expect(html).toContain('<style type="text/css">@media (max-width: 600px){h1 { font-size: 18px; }}</style>');
    expect(html).not.toContain("<title");
    expect(html).not.toContain("<meta");
    expect(html).not.toContain(":root");
  });

  it("cambia el logotipo SVG por su PNG con dirección absoluta (el correo no conoce la plataforma)", () => {
    expect(html).toContain('src="https://russell.test/marca/russell-bedford-azul-600.png"');
    expect(html).not.toContain(".svg");
  });

  it("convierte la barra de progreso en una tabla, que Gmail y Outlook sí conservan", () => {
    expect(html).toContain('<table role="presentation"');
    expect(html).toContain('width="67%"');
    expect(html).toContain('bgcolor="#001871"');
    expect(html).toContain('width="33%"');
    expect(html).not.toContain("width:67%;background");
  });

  it("falla cerrado si el documento no tiene contenido (no se envía un correo vacío)", () => {
    expect(() => htmlCorreoDeReporte("", "https://russell.test")).toThrow();
  });
});

describe("documento del correo", () => {
  it("envuelve el fragmento sin tocarlo y escapa el título", () => {
    const doc = documentoCorreo("<div>cuerpo</div>", 'Reporte <b>"1"</b> & más');
    expect(doc.startsWith("<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\">")).toBe(true);
    expect(doc).toContain("<title>Reporte &lt;b&gt;&quot;1&quot;&lt;/b&gt; &amp; más</title>");
    expect(doc).toContain('<body style="margin:0;padding:0"><div>cuerpo</div></body></html>');
  });
});

describe("texto plano alterno", () => {
  it("separa los bloques con saltos de línea, quita estilos y decodifica entidades", () => {
    const texto = htmlATextoPlano(
      '<style>p{color:red}</style><h1>Título</h1><p>Uno &amp; dos</p><ul><li>a</li><li>b</li></ul><p>Fin&nbsp;aquí</p>',
    );
    expect(texto).toBe("Título\nUno & dos\na\nb\nFin aquí");
  });

  it("no deja más de una línea en blanco seguida", () => {
    expect(htmlATextoPlano("<p>a</p><p></p><p></p><p></p><p>b</p>")).toBe("a\n\nb");
  });
});
