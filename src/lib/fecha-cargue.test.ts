import { describe, expect, it } from "vitest";
import {
  fechaCorteSugeridaDe,
  mesActualColombia,
  motivoFechaFutura,
  motivoPeriodoFuturo,
  nombreFecha,
  nombrePeriodo,
  nombreRangoFechas,
  rangoDelPeriodo,
} from "./fecha-cargue";

// 1/Oct/2026 a las 03:00 UTC = 30/Sep/2026 a las 22:00 en Colombia.
const NOCHE_30_SEP = new Date("2026-10-01T03:00:00Z");
const MEDIODIA_15_OCT = new Date("2026-10-15T17:00:00Z");

describe("nombres de período y fecha", () => {
  it("escribe el mes en español y en minúscula", () => {
    expect(nombrePeriodo("2025-12")).toBe("diciembre de 2025");
    expect(nombrePeriodo("2026-01")).toBe("enero de 2026");
    expect(nombreFecha("2025-12-05")).toBe("5 de diciembre de 2025");
  });

  it("rechaza lo que no es un período o una fecha", () => {
    expect(nombrePeriodo("2025-13")).toBeNull();
    expect(nombrePeriodo("")).toBeNull();
    expect(nombreFecha("2025-12")).toBeNull();
  });

  it("nombra un rango de fechas (período del balance)", () => {
    expect(nombreRangoFechas("2025-01-01", "2025-12-31")).toBe("del 1 de enero de 2025 al 31 de diciembre de 2025");
    expect(nombreRangoFechas("2025-01-01", "")).toBeNull();
  });

  it("da el rango del mes, con el último día real", () => {
    expect(rangoDelPeriodo("2025-12")).toBe("del 1 al 31 de diciembre de 2025");
    expect(rangoDelPeriodo("2024-02")).toBe("del 1 al 29 de febrero de 2024");
    expect(rangoDelPeriodo("2026-09")).toBe("del 1 al 30 de septiembre de 2026");
  });
});

describe("período futuro", () => {
  it("usa el calendario de Colombia, no el UTC", () => {
    // En UTC ya es octubre; en Colombia sigue siendo septiembre.
    expect(mesActualColombia(NOCHE_30_SEP)).toBe("2026-09");
    expect(motivoPeriodoFuturo("2026-10", NOCHE_30_SEP)).toContain("octubre de 2026 todavía no empieza");
  });

  it("acepta el mes en curso y los anteriores", () => {
    expect(motivoPeriodoFuturo("2026-10", MEDIODIA_15_OCT)).toBeNull();
    expect(motivoPeriodoFuturo("2025-12", MEDIODIA_15_OCT)).toBeNull();
  });

  it("rechaza los meses posteriores y dice hasta cuál se puede", () => {
    expect(motivoPeriodoFuturo("2026-11", MEDIODIA_15_OCT)).toBe(
      "El período noviembre de 2026 todavía no empieza: elige octubre de 2026 o un mes anterior.",
    );
    // El error típico: diciembre del año que viene en vez del que pasó.
    expect(motivoPeriodoFuturo("2026-12", MEDIODIA_15_OCT)).not.toBeNull();
  });

  it("no opina sobre un período mal escrito", () => {
    expect(motivoPeriodoFuturo("2030-13", MEDIODIA_15_OCT)).toBeNull();
  });
});

describe("fecha futura", () => {
  it("acepta hoy y rechaza mañana", () => {
    expect(motivoFechaFutura("2026-10-15", "La fecha de corte", MEDIODIA_15_OCT)).toBeNull();
    expect(motivoFechaFutura("2026-10-16", "La fecha de corte", MEDIODIA_15_OCT)).toBe(
      "La fecha de corte 16 de octubre de 2026 es posterior a hoy (15 de octubre de 2026): no se aceptan fechas futuras.",
    );
  });

  it("usa el día de Colombia", () => {
    expect(motivoFechaFutura("2026-10-01", "La fecha", NOCHE_30_SEP)).not.toBeNull();
    expect(motivoFechaFutura("2026-09-30", "La fecha", NOCHE_30_SEP)).toBeNull();
  });
});

describe("fecha de corte sugerida", () => {
  it("es el fin del período cuando ya pasó", () => {
    expect(fechaCorteSugeridaDe("2025-12", MEDIODIA_15_OCT)).toBe("2025-12-31");
    expect(fechaCorteSugeridaDe("2026-09", MEDIODIA_15_OCT)).toBe("2026-09-30");
  });

  it("es hoy cuando el período es el mes en curso", () => {
    expect(fechaCorteSugeridaDe("2026-10", MEDIODIA_15_OCT)).toBe("2026-10-15");
  });

  it("es null sin período", () => {
    expect(fechaCorteSugeridaDe("", MEDIODIA_15_OCT)).toBeNull();
  });
});
