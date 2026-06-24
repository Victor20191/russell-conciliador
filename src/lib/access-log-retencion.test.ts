import { describe, it, expect } from "vitest";
import { fechaCorteRetencion, MESES_RETENCION_DEFECTO } from "./access-log-retencion";

describe("fechaCorteRetencion", () => {
  it("resta los meses indicados a la fecha de referencia", () => {
    const ahora = new Date("2026-06-24T10:00:00.000Z");
    const corte = fechaCorteRetencion(18, ahora);
    expect(corte.toISOString()).toBe("2024-12-24T10:00:00.000Z");
  });

  it("no muta la fecha de referencia recibida", () => {
    const ahora = new Date("2026-06-24T10:00:00.000Z");
    fechaCorteRetencion(6, ahora);
    expect(ahora.toISOString()).toBe("2026-06-24T10:00:00.000Z");
  });

  it("con el valor por defecto conserva 18 meses", () => {
    const ahora = new Date("2026-06-24T00:00:00.000Z");
    const corte = fechaCorteRetencion(MESES_RETENCION_DEFECTO, ahora);
    // 18 meses atrás = diciembre de 2024
    expect(corte.getUTCFullYear()).toBe(2024);
    expect(corte.getUTCMonth()).toBe(11); // diciembre (0-based)
  });
});
