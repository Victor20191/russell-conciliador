import { describe, expect, it } from "vitest";
import {
  explicarPeriodoSugerido,
  sugerirPeriodoReporte,
  sumarDias,
  ultimosDias,
} from "@/lib/auditoria/reporte-ejecutivo/periodo-sugerido";

describe("sumarDias / ultimosDias", () => {
  it("cruza fin de mes y de año", () => {
    expect(sumarDias("2026-09-11", 1)).toBe("2026-09-12");
    expect(sumarDias("2026-08-31", 1)).toBe("2026-09-01");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("la ventana de N días incluye hoy", () => {
    expect(ultimosDias("2026-09-20", 30)).toEqual({ desde: "2026-08-22", hasta: "2026-09-20" });
    expect(ultimosDias("2026-09-20", 1)).toEqual({ desde: "2026-09-20", hasta: "2026-09-20" });
  });
});

describe("sugerirPeriodoReporte", () => {
  it("continúa el día siguiente al fin del último reporte", () => {
    expect(sugerirPeriodoReporte({ hoy: "2026-09-20", ultimoReporte: { desde: "2026-08-28", hasta: "2026-09-11" } })).toEqual({
      desde: "2026-09-12",
      hasta: "2026-09-20",
      base: "continuacion",
      ultimoReporteHasta: "2026-09-11",
    });
  });

  it("sin reportes previos propone los últimos 30 días", () => {
    expect(sugerirPeriodoReporte({ hoy: "2026-09-20", ultimoReporte: null })).toMatchObject({
      desde: "2026-08-22",
      hasta: "2026-09-20",
      base: "ultimos_30_dias",
    });
  });

  it("si el último reporte ya llega hasta hoy repite su período", () => {
    expect(sugerirPeriodoReporte({ hoy: "2026-09-20", ultimoReporte: { desde: "2026-09-12", hasta: "2026-09-20" } })).toMatchObject({
      desde: "2026-09-12",
      hasta: "2026-09-20",
      base: "ultimo_reporte",
    });
    // También cuando el período declarado se pasa de hoy.
    expect(sugerirPeriodoReporte({ hoy: "2026-09-20", ultimoReporte: { desde: "2026-09-01", hasta: "2026-10-05" } }).base).toBe("ultimo_reporte");
  });

  it("acepta una marca de tiempo completa y una fecha inválida no rompe", () => {
    expect(sugerirPeriodoReporte({ hoy: "2026-09-20", ultimoReporte: { desde: "2026-08-28T00:00:00.000Z", hasta: "2026-09-11T23:59:59.999Z" } }).desde).toBe("2026-09-12");
    expect(sugerirPeriodoReporte({ hoy: "2026-09-20", ultimoReporte: { desde: "x", hasta: "ayer" } }).base).toBe("ultimos_30_dias");
  });

  it("explica de dónde sale el período", () => {
    expect(explicarPeriodoSugerido(sugerirPeriodoReporte({ hoy: "2026-09-20", ultimoReporte: { desde: "2026-08-28", hasta: "2026-09-11" } }))).toContain("2026-09-11");
    expect(explicarPeriodoSugerido(sugerirPeriodoReporte({ hoy: "2026-09-20" }))).toContain("Últimos 30 días");
  });
});
