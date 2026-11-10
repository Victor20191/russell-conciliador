import { describe, expect, it } from "vitest";
import {
  consecuenciaTraslape,
  describirTraslape,
  detectarTraslapes,
  TITULO_TRASLAPE,
  type PeriodoGenerado,
} from "./traslape";

/** Los períodos reales guardados llevan el medianoche de Colombia en UTC (05:00Z). */
const reporte = (id: number, desde: string, hasta: string, generadoEn: string): PeriodoGenerado => ({
  id,
  periodoDesde: `${desde}T05:00:00.000Z`,
  periodoHasta: `${hasta}T04:59:59.999Z`, // 04:59:59Z = 23:59:59 del día anterior en Colombia
  generadoEn,
});

// Reportes #53, #51 y #50 de producción (fechas de calendario de Colombia).
const generados: PeriodoGenerado[] = [
  reporte(53, "2026-10-30", "2026-11-11", "2026-11-11T00:13:54.022Z"), // 30-oct → 10-nov
  reporte(51, "2026-10-28", "2026-10-31", "2026-10-31T02:15:50.434Z"), // 28 → 30-oct
  reporte(50, "2026-10-14", "2026-10-28", "2026-10-27T23:30:01.695Z"), // 14 → 27-oct
];

describe("detectarTraslapes", () => {
  it("30-oct → 10-nov se traslapa con el reporte del 28 → 30-oct, por un solo día", () => {
    const t = detectarTraslapes({ desde: "2026-10-30", hasta: "2026-11-10", generados });
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({
      id: 51,
      desde: "2026-10-28",
      hasta: "2026-10-30",
      primerDiaComun: "2026-10-30",
      ultimoDiaComun: "2026-10-30",
      diasEnComun: 1,
    });
  });

  it("el período EXACTO de un reporte guardado recupera la instantánea: no es traslape", () => {
    expect(detectarTraslapes({ desde: "2026-10-30", hasta: "2026-11-10", generados: [generados[0]] })).toEqual([]);
    expect(detectarTraslapes({ desde: "2026-10-14", hasta: "2026-10-27", generados: [generados[2]] })).toEqual([]);
  });

  it("empezar el día siguiente al fin del último reporte no se traslapa", () => {
    expect(detectarTraslapes({ desde: "2026-11-11", hasta: "2026-11-12", generados })).toEqual([]);
    expect(detectarTraslapes({ desde: "2026-10-31", hasta: "2026-11-10", generados: [generados[1], generados[2]] })).toEqual([]);
  });

  it("cuenta los días en común cuando hay varios, y detecta un período contenido en otro", () => {
    const t = detectarTraslapes({ desde: "2026-10-20", hasta: "2026-10-29", generados: [generados[1], generados[2]] });
    expect(t.map((x) => [x.id, x.primerDiaComun, x.ultimoDiaComun, x.diasEnComun])).toEqual([
      [51, "2026-10-28", "2026-10-29", 2],
      [50, "2026-10-20", "2026-10-27", 8],
    ]);
    // Contenido: un reporte de un día dentro del período elegido, y un período elegido dentro de un reporte.
    expect(detectarTraslapes({ desde: "2026-10-01", hasta: "2026-12-01", generados: [generados[1]] })[0].diasEnComun).toBe(3);
    expect(detectarTraslapes({ desde: "2026-10-16", hasta: "2026-10-18", generados: [generados[2]] })[0].diasEnComun).toBe(3);
  });

  it("varias revisiones del mismo período salen una sola vez, la más reciente", () => {
    const revisiones = [
      reporte(60, "2026-10-28", "2026-10-31", "2026-10-31T02:15:50.434Z"),
      reporte(61, "2026-10-28", "2026-10-31", "2026-11-02T10:00:00.000Z"),
      reporte(62, "2026-10-28", "2026-10-31", "2026-11-01T10:00:00.000Z"),
    ];
    const t = detectarTraslapes({ desde: "2026-10-30", hasta: "2026-11-10", generados: revisiones });
    expect(t.map((x) => x.id)).toEqual([61]);
  });

  it("lee igual los períodos guardados a medianoche UTC", () => {
    const utc: PeriodoGenerado = {
      id: 7, periodoDesde: "2026-10-28T00:00:00.000Z", periodoHasta: "2026-10-30T23:59:59.999Z", generadoEn: "2026-10-31T02:00:00.000Z",
    };
    expect(detectarTraslapes({ desde: "2026-10-30", hasta: "2026-11-10", generados: [utc] })[0]).toMatchObject({
      desde: "2026-10-28", hasta: "2026-10-30", diasEnComun: 1,
    });
  });

  it("con fechas incompletas, invertidas o sin reportes no hay nada que avisar", () => {
    expect(detectarTraslapes({ desde: "", hasta: "2026-11-10", generados })).toEqual([]);
    expect(detectarTraslapes({ desde: "2026-11-10", hasta: "2026-10-30", generados })).toEqual([]);
    expect(detectarTraslapes({ desde: "2026-10-30", hasta: "2026-11-10", generados: [] })).toEqual([]);
    expect(
      detectarTraslapes({
        desde: "2026-10-30", hasta: "2026-11-10",
        generados: [{ id: 1, periodoDesde: "no es fecha", periodoHasta: "tampoco", generadoEn: "2026-10-31T00:00:00Z" }],
      }),
    ).toEqual([]);
  });
});

describe("texto del aviso", () => {
  const [t] = detectarTraslapes({ desde: "2026-10-30", hasta: "2026-11-10", generados });

  it("dice con qué reporte se traslapa y cuántos días comparten", () => {
    expect(TITULO_TRASLAPE).toBe("Este período se traslapa con un reporte ya generado");
    expect(describirTraslape(t)).toBe(
      "Reporte del 28/Oct/2026 al 30/Oct/2026, generado el 30/Oct/2026: 1 día en común (30/Oct/2026).",
    );
  });

  it("con varios días muestra el rango compartido", () => {
    const [x] = detectarTraslapes({ desde: "2026-10-20", hasta: "2026-10-29", generados: [generados[2]] });
    expect(describirTraslape(x)).toContain("8 días en común (20/Oct/2026 al 27/Oct/2026)");
  });

  it("explica que los días se cuentan dos veces y que el comparativo no podrá usarlo", () => {
    expect(consecuenciaTraslape(1)).toBe(
      "Esos días quedarán contados dos veces y el comparativo de uso no podrá usar ese reporte como período anterior. Puedes generar el reporte de todas formas.",
    );
    expect(consecuenciaTraslape(2)).toContain("esos reportes");
  });
});
