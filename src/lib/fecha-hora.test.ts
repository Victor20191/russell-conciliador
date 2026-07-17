import { describe, expect, it } from "vitest";
import {
  ZONA_HORARIA_COLOMBIA,
  anioColombia,
  fechaCalendarioISO,
  fechaCalendarioPrisma,
  fechaColombiaISO,
  fechaHoraColombiaISO,
  inicioDiaColombiaDesdeISO,
  inicioMesColombia,
  partesFechaHoraColombia,
  restarMesesColombia,
} from "./fecha-hora";

describe("política temporal de Colombia", () => {
  it("usa la zona IANA canónica", () => {
    expect(ZONA_HORARIA_COLOMBIA).toBe("America/Bogota");
  });

  it("mantiene el día colombiano en el límite nocturno de UTC", () => {
    const instante = new Date("2026-07-17T04:30:45.123Z");
    expect(partesFechaHoraColombia(instante)).toEqual({
      anio: 2026,
      mes: 7,
      dia: 16,
      hora: 23,
      minuto: 30,
      segundo: 45,
    });
    expect(fechaColombiaISO(instante)).toBe("2026-07-16");
    expect(fechaHoraColombiaISO(instante)).toBe("2026-07-16T23:30:45.123-05:00");
    expect(anioColombia(instante)).toBe(2026);
  });

  it("convierte medianoche y comienzo de mes de Colombia a instantes reales", () => {
    expect(inicioDiaColombiaDesdeISO("2026-07-16").toISOString()).toBe("2026-07-16T05:00:00.000Z");
    expect(inicioMesColombia(new Date("2026-07-17T04:30:00Z")).toISOString()).toBe("2026-07-01T05:00:00.000Z");
  });

  it("conserva las fechas DATE sin desplazarlas", () => {
    expect(fechaCalendarioPrisma("2026-07-16").toISOString()).toBe("2026-07-16T00:00:00.000Z");
    expect(fechaCalendarioISO(fechaCalendarioPrisma("2026-07-16"))).toBe("2026-07-16");
    expect(fechaCalendarioISO("2026-07-16")).toBe("2026-07-16");
    expect(() => fechaCalendarioPrisma("2026-02-30")).toThrow("Fecha ISO inválida");
  });

  it("resta meses según el calendario colombiano y ajusta fin de mes", () => {
    const corte = restarMesesColombia(new Date("2026-08-31T15:20:10.250Z"), 6);
    expect(corte.toISOString()).toBe("2026-02-28T15:20:10.250Z");
  });
});
