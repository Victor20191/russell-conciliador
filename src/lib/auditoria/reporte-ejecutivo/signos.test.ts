import { describe, expect, it } from "vitest";
import { TRIANGULO_BAJA, TRIANGULO_SUBE, signosDeMarca } from "./signos";
import { ajustarMaquetacionReporte } from "./maquetacion";

describe("signos de los reportes guardados", () => {
  it("▲, ▼ y «A → B» del texto pasan a triángulo SVG y raya; título y estilos no se tocan", () => {
    const html = '<html><head><title>Uso ▲</title><style>.x::after{content:" → "}</style></head><body><p>2026-09-01 → 2026-09-07</p><td>▲ +12 %</td><td>▼ −5 %</td></body></html>';
    const salida = signosDeMarca(html);
    expect(salida).toContain("<title>Uso ▲</title>");
    expect(salida).toContain('content:" → "');
    expect(salida).toContain("<p>2026-09-01 – 2026-09-07</p>");
    expect(salida).toContain(`<td>${TRIANGULO_SUBE} +12 %</td>`);
    expect(salida).toContain(`<td>${TRIANGULO_BAJA} −5 %</td>`);
  });

  it("el ajuste de un reporte guardado no cambia al repetirse", () => {
    const html = '<!doctype html><html><head></head><body><div class="marca">RUSSELL DIAGNÓSTICO</div><p>A → B ▲</p></body></html>';
    const una = ajustarMaquetacionReporte(html);
    expect(una).not.toMatch(/[▲▼→]/);
    expect(ajustarMaquetacionReporte(una)).toBe(una);
  });
});
