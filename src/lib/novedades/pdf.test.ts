import { describe, expect, it } from "vitest";
import { generarPdfReporteNovedades } from "./pdf";

describe("generarPdfReporteNovedades", () => {
  it("emite texto compatible con Helvetica sin marcador UTF-16 visible", () => {
    const pdf = generarPdfReporteNovedades({
      titulo: "Reporte Funcional de Actualizaciones",
      html: `
        <!doctype html>
        <html>
          <body>
            <h1>Reporte Funcional de Actualizaciones</h1>
            <h2>Resumen Ejecutivo</h2>
            <p>Precisión del diagnóstico financiero con automatización contable.</p>
            <ul><li>Integridad de la información</li></ul>
          </body>
        </html>
      `,
    });

    const raw = Buffer.from(pdf).toString("ascii");

    expect(raw).not.toContain("FEFF");
    expect(raw).not.toContain("þÿ");
    expect(raw).toContain("(Reporte Funcional de Actualizaciones)");
    expect(raw).toContain("(Resumen Ejecutivo)");
  });
});
