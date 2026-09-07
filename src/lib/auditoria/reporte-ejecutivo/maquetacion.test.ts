import { expect, test } from "vitest";
import { ajustarMaquetacionReporte } from "./maquetacion";
import { prepararHtmlReporteEjecutivoPdf } from "./pdf";
test("corrige documentos guardados sin modificar cifras y sin duplicar estilos", () => {
  const contenido = '<section id="rd-graficos-uso"><table role="presentation"><tr><td>Visitas</td><td>3.456</td></tr></table></section>';
  const original = `<html><head><style id="rd-estilos-impresion">@page{size:Letter}</style></head><body>${contenido}</body></html>`;
  const corregido = prepararHtmlReporteEjecutivoPdf(original);
  expect(corregido).toContain('table-layout: auto !important');
  expect(corregido).toContain(contenido);
  expect(ajustarMaquetacionReporte(corregido)).toBe(corregido);
  expect(prepararHtmlReporteEjecutivoPdf(corregido)).toBe(corregido);
});
