import { describe, expect, it } from "vitest";
import { leerRangoElegido, MAX_DIAS_RANGO, parseRangoReporte, periodoAnteriorEnFechas } from "./rango";

describe("periodoAnteriorEnFechas", () => {
  it("del 9 al 15-nov (7 días) se compara con el 2 al 8-nov", () => {
    expect(periodoAnteriorEnFechas("2026-11-09", "2026-11-15")).toEqual({ desde: "2026-11-02", hasta: "2026-11-08", dias: 7 });
  });

  it("10 días contra los 10 anteriores, cruzando de mes", () => {
    expect(periodoAnteriorEnFechas("2026-11-03", "2026-11-12")).toEqual({ desde: "2026-10-24", hasta: "2026-11-02", dias: 10 });
  });

  it("un solo día se compara con el día anterior", () => {
    expect(periodoAnteriorEnFechas("2026-11-15", "2026-11-15")).toEqual({ desde: "2026-11-14", hasta: "2026-11-14", dias: 1 });
  });

  it("sin fechas válidas no hay período anterior", () => {
    expect(periodoAnteriorEnFechas("", "2026-11-15")).toBeNull();
    expect(periodoAnteriorEnFechas("2026-11-15", "2026-11-09")).toBeNull();
  });
});

describe("parseRangoReporte", () => {
  it("toma los días completos en UTC cuando llegan solo fechas", () => {
    const r = parseRangoReporte("2026-10-29", "2026-11-10");
    expect(r?.desde.toISOString()).toBe("2026-10-29T00:00:00.000Z");
    expect(r?.hasta.toISOString()).toBe("2026-11-10T23:59:59.999Z");
  });

  it("respeta la hora cuando llega una marca ISO completa", () => {
    const r = parseRangoReporte("2026-10-29T05:00:00.000Z", "2026-11-10T12:00:00.000Z");
    expect(r?.desde.toISOString()).toBe("2026-10-29T05:00:00.000Z");
    expect(r?.hasta.toISOString()).toBe("2026-11-10T12:00:00.000Z");
  });

  it("rechaza fechas ilegibles, invertidas o un rango de más de 366 días", () => {
    expect(parseRangoReporte("ayer", "2026-11-10")).toBeNull();
    expect(parseRangoReporte("2026-11-10", "2026-11-01")).toBeNull();
    expect(parseRangoReporte("2025-01-01", "2026-01-03")).toBeNull();
    // 366 días exactos sí caben (año bisiesto o rango de un año más un día).
    expect(parseRangoReporte("2025-11-23", "2026-11-23")).not.toBeNull();
    expect(MAX_DIAS_RANGO).toBe(366);
  });
});

describe("leerRangoElegido", () => {
  it("sin parámetros no hay rango elegido", () => {
    expect(leerRangoElegido({})).toEqual({ estado: "sin_elegir" });
    expect(leerRangoElegido({ desde: "  ", hasta: "" })).toEqual({ estado: "sin_elegir" });
  });

  it("acepta un período de calendario y conserva el texto para la pantalla", () => {
    const r = leerRangoElegido({ desde: "2026-11-01", hasta: "2026-11-23" });
    expect(r).toMatchObject({ estado: "valido", desdeTexto: "2026-11-01", hastaTexto: "2026-11-23" });
    if (r.estado !== "valido") throw new Error("debía ser válido");
    expect(r.desde.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(r.hasta.toISOString()).toBe("2026-11-23T23:59:59.999Z");
  });

  it("toma el primer valor si el parámetro viene repetido", () => {
    expect(leerRangoElegido({ desde: ["2026-11-01", "2020-01-01"], hasta: "2026-11-02" })).toMatchObject({
      estado: "valido",
      desdeTexto: "2026-11-01",
    });
  });

  it("explica por qué no sirve un rango", () => {
    const motivo = (desde?: string, hasta?: string) => {
      const r = leerRangoElegido({ desde, hasta });
      return r.estado === "invalido" ? r.motivo : r.estado;
    };
    expect(motivo("2026-11-01")).toBe("Faltó una de las dos fechas del período.");
    expect(motivo("01/11/2026", "2026-11-23")).toBe("Las fechas del período no tienen el formato AAAA-MM-DD.");
    expect(motivo("2026-11-01T00:00:00Z", "2026-11-23")).toBe("Las fechas del período no tienen el formato AAAA-MM-DD.");
    expect(motivo("2026-02-30", "2026-03-10")).toBe("Una de las fechas del período no existe en el calendario.");
    expect(motivo("2026-11-23", "2026-11-01")).toBe("La fecha «Desde» va después de «Hasta».");
    expect(motivo("2024-01-01", "2026-11-23")).toBe("El período supera 366 días.");
  });
});
