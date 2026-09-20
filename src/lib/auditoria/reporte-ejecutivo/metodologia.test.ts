import { describe, expect, it } from "vitest";
import { METODOLOGIA_USO_VIGENTE, metodologiaAlDia } from "@/lib/auditoria/reporte-ejecutivo/metodologia";

describe("metodologiaAlDia", () => {
  it("acepta solo la marca vigente", () => {
    expect(metodologiaAlDia({ metodologia: METODOLOGIA_USO_VIGENTE })).toBe(true);
    expect(metodologiaAlDia({ metodologia: METODOLOGIA_USO_VIGENTE - 1 })).toBe(false);
  });

  it("una instantánea sin marca es de antes de esta regla", () => {
    expect(metodologiaAlDia({ corte: "2026-09-11T00:00:00Z" })).toBe(false);
    expect(metodologiaAlDia(null)).toBe(false);
    expect(metodologiaAlDia("2")).toBe(false);
  });
});
