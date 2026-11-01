import { describe, expect, it } from "vitest";
import { F350_2026, F490_2026 } from "../__fixtures__/retencion-2026";
import { periodosRevision } from "./periodos-revision";
import { pagosRevision } from "./pagos";
import { construirCopiaRetencion, leerCopiaRetencion } from "./copia-cierre";

describe("copia congelada de una revisión en firme", () => {
  const periodos = periodosRevision({ periodicidad: "Mensual", mesCorte: 8, formularios350: F350_2026, formularios490: F490_2026, porConfirmar: [], causales: [] });
  const copia = construirCopiaRetencion({
    tomadaEn: new Date("2026-10-31T20:00:00.000Z"),
    periodos,
    cruce: { estado: "sin_balance", mensaje: "x", balance: null, umbral: 6_000 },
    oportunidad: [],
    pagos: pagosRevision({ anio: 2026, periodos, marcas: [] }),
  });

  it("se guarda como JSON y se vuelve a leer igual", () => {
    const leida = leerCopiaRetencion(JSON.parse(JSON.stringify(copia)));
    expect(leida?.huella).toBe(copia.huella);
    expect(leida?.pagos.filas[0].diferencia).toBe(-6_786_000);
  });

  it("una copia alterada, de otro tipo o vacía no se usa", () => {
    const alterada = JSON.parse(JSON.stringify(copia));
    alterada.pagos.filas[0].diferencia = 0;
    expect(leerCopiaRetencion(alterada)).toBeNull();
    expect(leerCopiaRetencion({ ...copia, tipo: "modulo" })).toBeNull();
    expect(leerCopiaRetencion(null)).toBeNull();
  });
});
