import { afterAll, describe, expect, it } from "vitest";
import { cerrarGeneradorPdfNovedades, generarPdfReporteNovedades } from "./pdf";

describe("generarPdfReporteNovedades", () => {
  afterAll(async () => {
    await cerrarGeneradorPdfNovedades();
  });

  it("renderiza el HTML estilizado como PDF sin marcador UTF-16 visible", async () => {
    const pdf = await generarPdfReporteNovedades({
      titulo: "Reporte Funcional de Actualizaciones",
      viewportWidth: 900,
      html: `
        <!doctype html>
        <html>
          <head>
            <style>
              body { margin: 0; font-family: Arial, sans-serif; background: #f5f7fb; color: #172033; }
              main { max-width: 900px; margin: 0 auto; padding: 40px; }
              .card { border: 1px solid #d7e1ee; border-radius: 8px; padding: 24px; background: white; }
              h1 { color: #173a5e; letter-spacing: 0.02em; }
            </style>
          </head>
          <body>
            <main>
              <section class="card">
                <h1>Reporte Funcional de Actualizaciones</h1>
                <h2>Resumen Ejecutivo</h2>
                <p>Precisión del diagnóstico financiero con automatización contable.</p>
                <ul><li>Integridad de la información</li></ul>
              </section>
            </main>
          </body>
        </html>
      `,
    });

    const raw = Buffer.from(pdf).toString("latin1");

    expect(raw.startsWith("%PDF-")).toBe(true);
    expect(raw).not.toContain("FEFF");
    expect(raw).not.toContain("þÿ");
    expect(Buffer.from(pdf).byteLength).toBeGreaterThan(1_000);
  }, 30_000);
});
