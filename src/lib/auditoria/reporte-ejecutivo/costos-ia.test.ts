import { describe, expect, it } from "vitest";
import {
  agruparPorOperacion,
  construirCostosIA,
  etiquetaMes,
  etiquetaOperacionIA,
  hayConsumoIA,
  resumenCostoVacio,
  type ResumenCostoIA,
} from "./costos-ia";

const resumen = (p: Partial<ResumenCostoIA>): ResumenCostoIA => ({
  ...resumenCostoVacio("2026-09-11T00:00:00.000Z", "2026-09-20T23:59:59.999Z"),
  ...p,
});

describe("etiquetaOperacionIA", () => {
  it("traduce las operaciones técnicas a lenguaje de negocio", () => {
    expect(etiquetaOperacionIA("extraccion_tabular")).toBe("Lectura de balances (Excel o CSV)");
    expect(etiquetaOperacionIA("mapeo_ia")).toBe("Homologación de cuentas");
  });

  it("nunca deja escapar el código interno ni el nombre del proveedor", () => {
    // El reporte se le entrega al cliente: ningún proveedor ni modelo por su
    // nombre, ni siquiera dentro de un `tipoOperacion` nuevo.
    expect(etiquetaOperacionIA("mapeo_jev")).toBe("Homologación de cuentas");
    expect(etiquetaOperacionIA("resumen_claude_x")).toBe("Otras operaciones con IA");
    expect(etiquetaOperacionIA("gemini_pdf")).toBe("Otras operaciones con IA");
  });
});

describe("agruparPorOperacion", () => {
  it("funde los tipos que son la misma operación y ordena por gasto", () => {
    const filas = [
      { tipo: "extraccion_tabular", llamadas: 94, costoCop: 19502, tokens: 1302330 },
      { tipo: "mapeo_ia", llamadas: 100, costoCop: 30000, tokens: 3000000 },
      { tipo: "mapeo_jev", llamadas: 5, costoCop: 1707, tokens: 462193 },
    ];
    expect(agruparPorOperacion(filas)).toEqual([
      { nombre: "Homologación de cuentas", llamadas: 105, costoCop: 31707, tokens: 3462193 },
      { nombre: "Lectura de balances (Excel o CSV)", llamadas: 94, costoCop: 19502, tokens: 1302330 },
    ]);
  });
});

describe("etiquetaMes", () => {
  it("nombra el mes por calendario UTC, igual que el período del reporte", () => {
    expect(etiquetaMes("2026-09-20T23:59:59.999Z")).toBe("septiembre de 2026");
    // Medianoche UTC del 1: es septiembre, aunque en Colombia aún sea 31 de agosto.
    expect(etiquetaMes("2026-09-01T00:00:00.000Z")).toBe("septiembre de 2026");
    expect(etiquetaMes("no es una fecha")).toBeNull();
  });
});

describe("construirCostosIA", () => {
  const actual = resumen({ llamadas: 56, costoCop: 13079, costoUsd: 4.15, tokens: 1070981 });
  const previo = resumen({
    desde: "2026-08-28T00:00:00.000Z",
    hasta: "2026-09-11T23:59:59.999Z",
    llamadas: 202,
    costoCop: 54840,
    tokens: 5224243,
  });

  it("compara gasto, tokens y operaciones contra el reporte anterior", () => {
    const c = construirCostosIA({ actual, previo, base: "reporte_anterior" });
    expect(c.variaciones.map((v) => v.etiqueta)).toEqual([
      "Gasto en IA (pesos)",
      "Tokens consumidos",
      "Operaciones con IA",
    ]);
    expect(c.variaciones[0]).toMatchObject({ previo: 54840, actual: 13079, direccion: "bajo" });
    expect(c.base).toBe("reporte_anterior");
  });

  it("sin período previo no inventa una comparación", () => {
    const c = construirCostosIA({ actual, base: "reporte_anterior" });
    expect(c.variaciones).toEqual([]);
    expect(c.base).toBeNull();
    expect(c.mesEtiqueta).toBeNull();
  });

  it("rotula el acumulado por el mes en el que cierra", () => {
    const mes = resumen({ desde: "2026-09-01T00:00:00.000Z", llamadas: 90, costoCop: 51210 });
    expect(construirCostosIA({ actual, mes }).mesEtiqueta).toBe("septiembre de 2026");
  });
});

describe("hayConsumoIA", () => {
  it("es falso cuando no hubo una sola llamada en ninguna ventana", () => {
    expect(hayConsumoIA(construirCostosIA({ actual: resumen({}) }))).toBe(false);
    expect(hayConsumoIA(null)).toBe(false);
  });

  it("es verdadero si alguna ventana tuvo consumo", () => {
    const soloPrevio = construirCostosIA({ actual: resumen({}), previo: resumen({ llamadas: 3 }) });
    expect(hayConsumoIA(soloPrevio)).toBe(true);
  });
});
