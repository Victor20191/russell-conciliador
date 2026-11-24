import { describe, expect, it } from "vitest";
import {
  desplegadaEnPeriodo,
  despliegueAlPublicar,
  esFechaDespliegueValida,
  fechaDespliegueTexto,
  fechaQueCuenta,
  instanteDespliegue,
} from "./despliegue";
import { parseRangoReporte } from "@/lib/auditoria/reporte-ejecutivo/rango";

describe("fecha de despliegue", () => {
  it("se guarda a mediodía UTC y se lee como el mismo día", () => {
    const d = instanteDespliegue("2026-10-19");
    expect(d.toISOString()).toBe("2026-10-19T12:00:00.000Z");
    expect(fechaDespliegueTexto(d)).toBe("2026-10-19");
    expect(fechaDespliegueTexto(null)).toBeNull();
  });

  it("valida fechas de calendario reales", () => {
    expect(esFechaDespliegueValida("2026-10-19")).toBe(true);
    expect(esFechaDespliegueValida("2026-02-30")).toBe(false);
    expect(esFechaDespliegueValida("19/10/2026")).toBe(false);
    expect(esFechaDespliegueValida("")).toBe(false);
  });

  it("al publicar de noche en Colombia toma el día de Colombia, no el de UTC", () => {
    // 3/Oct 22:00 en Colombia = 4/Oct 03:00 UTC.
    expect(fechaDespliegueTexto(despliegueAlPublicar(new Date("2026-10-04T03:00:00.000Z")))).toBe("2026-10-03");
  });

  it("sin fecha de despliegue vale la de publicación", () => {
    expect(fechaQueCuenta({ deployedAt: null, releasedAt: "2026-10-03T15:00:00.000Z" })?.toISOString()).toBe("2026-10-03T15:00:00.000Z");
    expect(fechaQueCuenta({ deployedAt: null, releasedAt: null })).toBeNull();
  });
});

describe("desplegada en el período", () => {
  const semana = parseRangoReporte("2026-11-09", "2026-11-15")!;

  it("cuenta la versión desplegada en cualquier día del período, incluidos los extremos", () => {
    expect(desplegadaEnPeriodo({ deployedAt: instanteDespliegue("2026-11-09") }, semana.desde, semana.hasta)).toBe(true);
    expect(desplegadaEnPeriodo({ deployedAt: instanteDespliegue("2026-11-15") }, semana.desde, semana.hasta)).toBe(true);
  });

  it("no cuenta la de antes ni la de después: dos períodos distintos no repiten avances", () => {
    expect(desplegadaEnPeriodo({ deployedAt: instanteDespliegue("2026-11-08") }, semana.desde, semana.hasta)).toBe(false);
    expect(desplegadaEnPeriodo({ deployedAt: instanteDespliegue("2026-11-16") }, semana.desde, semana.hasta)).toBe(false);
  });

  it("la fecha de despliegue manda sobre la de publicación", () => {
    // Desplegada el 19/Oct, publicada el 24/Nov: va en octubre.
    const v = { deployedAt: instanteDespliegue("2026-10-19"), releasedAt: new Date("2026-11-24T15:00:00Z") };
    const octubre = parseRangoReporte("2026-10-13", "2026-10-19")!;
    const noviembre = parseRangoReporte("2026-11-18", "2026-11-24")!;
    expect(desplegadaEnPeriodo(v, octubre.desde, octubre.hasta)).toBe(true);
    expect(desplegadaEnPeriodo(v, noviembre.desde, noviembre.hasta)).toBe(false);
  });
});
