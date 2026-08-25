import { describe, expect, test } from "vitest";
import {
  MARCA_ESTILOS_IMPRESION,
  prepararHtmlReporteEjecutivoPdf,
} from "./pdf";

describe("prepararHtmlReporteEjecutivoPdf", () => {
  test("inyecta una sola vez estilos de impresión antes del cierre de head", () => {
    const base = "<!doctype html><html><head><style>section{break-inside:avoid}</style></head><body><section><h2>Actividad</h2></section></body></html>";
    const unaVez = prepararHtmlReporteEjecutivoPdf(base);
    const dosVeces = prepararHtmlReporteEjecutivoPdf(unaVez);

    expect(unaVez).toContain(`id="${MARCA_ESTILOS_IMPRESION}"`);
    expect(unaVez).toContain("section {");
    expect(unaVez).toContain("break-inside: auto !important");
    expect(unaVez).toMatch(/\.rd-chart \{\s+break-inside: avoid !important/);
    expect(unaVez).toContain(".rd-graficos-heading + div");
    expect(unaVez).toContain("break-after: avoid-page !important");
    expect(unaVez).toContain(".section-kicker + *");
    expect(unaVez.indexOf(MARCA_ESTILOS_IMPRESION)).toBeLessThan(
      unaVez.indexOf("</head>"),
    );
    expect((dosVeces.match(new RegExp(MARCA_ESTILOS_IMPRESION, "g")) ?? []).length).toBe(1);
  });
});
