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

test("los reportes guardados con «Próximos pasos» se muestran sin esa sección y conservan lo demás", () => {
  const guardado =
    '<html><head></head><body><main><section id="tickets-atendidos"><h2>Tickets atendidos</h2><p>7</p></section>' +
    '<section id="proximos-pasos"><h2>Próximos pasos</h2><ul><li>Revisar los indicadores con el contexto operativo del período.</li></ul></section>' +
    '<footer class="nota">Fuente: registros de actividad.</footer></main></body></html>';
  const ajustado = ajustarMaquetacionReporte(guardado);
  expect(ajustado).not.toContain("proximos-pasos");
  expect(ajustado).not.toContain("Próximos pasos");
  expect(ajustado).toContain('<section id="tickets-atendidos"><h2>Tickets atendidos</h2><p>7</p></section>');
  expect(ajustado).toContain('<footer class="nota">Fuente: registros de actividad.</footer>');
});
