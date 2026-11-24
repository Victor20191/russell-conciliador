import { describe, expect, it } from "vitest";
import { sumarDias, ultimosDias } from "@/lib/auditoria/reporte-ejecutivo/periodo-sugerido";

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
