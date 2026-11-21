import { describe, expect, it } from "vitest";
import { CalendariosDianSchema } from "@/lib/definitions";
import { validarCalendario } from "./calendario";
import { CALENDARIO_IVA_BIMESTRAL_2026 } from "./__fixtures__/calendario-iva-2026";
import { CALENDARIO_RST_ANTICIPO_2026 } from "./__fixtures__/calendario-rst-2026";

/** «Guardar todos los calendarios»: varias grillas del mismo año en un solo envío. */
describe("guardar todos los calendarios", () => {
  const envio = (calendarios: unknown) => CalendariosDianSchema.safeParse({ anio: "2026", calendarios: JSON.stringify(calendarios) });

  it("acepta varias grillas del año, cada una con su origen", () => {
    const r = envio([
      { formulario: "IVA_BIMESTRAL", origen: "pdf", filas: CALENDARIO_IVA_BIMESTRAL_2026 },
      { formulario: "RST_ANTICIPO", filas: CALENDARIO_RST_ANTICIPO_2026 },
    ]);
    expect(r.success).toBe(true);
    expect(r.data?.calendarios.map((c) => [c.formulario, c.origen])).toEqual([["IVA_BIMESTRAL", "pdf"], ["RST_ANTICIPO", "pdf"]]);
    for (const c of r.data?.calendarios ?? []) expect(validarCalendario(2026, c.formulario, c.filas).errores).toEqual([]);
  });

  it("rechaza un formulario repetido, uno que no tiene calendario o un envío vacío", () => {
    expect(envio([{ formulario: "RST_ANTICIPO", filas: [] }, { formulario: "RST_ANTICIPO", filas: [] }]).success).toBe(false);
    expect(envio([{ formulario: "ICA", filas: [] }]).success).toBe(false);
    expect(envio([]).success).toBe(false);
    expect(CalendariosDianSchema.safeParse({ anio: "2026", calendarios: "no es json" }).success).toBe(false);
  });
});
