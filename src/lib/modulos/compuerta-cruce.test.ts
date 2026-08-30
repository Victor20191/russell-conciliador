import { describe, expect, it } from "vitest";
import {
  balanceCubreMesExacto,
  cuentasAgrupadorasExcluidas,
  seleccionarBalanceCruceModulo,
  validarCompuertaPrevalidador,
  validarRangoBalanceModulo,
  type ContextoCompuertaCruce,
} from "./compuerta-cruce";

function contexto(overrides: Partial<ContextoCompuertaCruce> = {}): ContextoCompuertaCruce {
  return {
    balance: {
      clienteId: 7,
      periodoInicio: new Date("2026-08-01T00:00:00.000Z"),
      periodoFin: new Date("2026-08-31T00:00:00.000Z"),
      esOficial: true,
      estaCongelado: true,
    },
    catalogo: [{ moduloCodigo: "ING", baseCalculo: "movimiento", activa: true }],
    prevalidador: { estado: "listo", modulos: [{ codigo: "ING" }], anidamientos: [] },
    revision: { estado: "aprobada", vigente: true },
    ...overrides,
  };
}

describe("compuerta del cruce de módulos", () => {
  it("exige balance oficial, congelado y aprobación vigente", () => {
    expect(validarCompuertaPrevalidador(contexto(), 7, "ING")).toBeNull();
    expect(validarCompuertaPrevalidador(contexto({
      balance: { ...contexto().balance, estaCongelado: false },
    }), 7, "ING")).toContain("oficial y congelado");
    expect(validarCompuertaPrevalidador(contexto({
      revision: { estado: "desactualizada", vigente: false },
    }), 7, "ING")).toContain("desactualizada");
  });

  it("reconoce el primer y último día del mes, incluido febrero bisiesto", () => {
    expect(balanceCubreMesExacto(
      new Date("2026-08-01T00:00:00.000Z"),
      new Date("2026-08-31T00:00:00.000Z"),
      "2026-08",
    )).toBe(true);
    expect(balanceCubreMesExacto(
      new Date("2024-02-01T00:00:00.000Z"),
      new Date("2024-02-29T00:00:00.000Z"),
      "2024-02",
    )).toBe(true);
  });

  it("bloquea ING con un balance YTD/trimestral y permite saldo acumulado", () => {
    const ytd = contexto({
      balance: {
        ...contexto().balance,
        periodoInicio: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    expect(validarRangoBalanceModulo(ytd, "ING", "2026-08")).toContain("exactamente el mes");
    expect(validarRangoBalanceModulo({
      ...ytd,
      catalogo: [{ moduloCodigo: "CAR", baseCalculo: "saldo", activa: true }],
    }, "CAR", "2026-08")).toBeNull();
  });

  it("prioriza el balance mensual exacto oficial y congelado aunque un YTD venga primero", () => {
    const ytd = {
      id: 91,
      periodoInicio: new Date("2026-01-01T00:00:00.000Z"),
      periodoFin: new Date("2026-08-31T00:00:00.000Z"),
      esOficial: true,
      estaCongelado: true,
    };
    const mensualExacto = {
      id: 87,
      periodoInicio: new Date("2026-08-01T00:00:00.000Z"),
      periodoFin: new Date("2026-08-31T00:00:00.000Z"),
      esOficial: true,
      estaCongelado: true,
    };

    expect(seleccionarBalanceCruceModulo(
      [ytd, mensualExacto],
      contexto().catalogo,
      "ING",
      "2026-08",
    )?.id).toBe(87);
  });

  it("no confunde un mensual no oficial con el candidato estructuralmente válido", () => {
    const noOficial = {
      id: 92,
      periodoInicio: new Date("2026-08-01T00:00:00.000Z"),
      periodoFin: new Date("2026-08-31T00:00:00.000Z"),
      esOficial: false,
      estaCongelado: true,
    };
    const valido = { ...noOficial, id: 88, esOficial: true };

    expect(seleccionarBalanceCruceModulo(
      [noOficial, valido],
      contexto().catalogo,
      "ING",
      "2026-08",
    )?.id).toBe(88);
  });

  it("expone solo las agrupadoras del prevalidador listo y normaliza sus códigos", () => {
    expect([...cuentasAgrupadorasExcluidas({
      estado: "listo",
      modulos: [{ codigo: "ING" }],
      anidamientos: [{ cuenta8: "41-05" }, { cuenta8: " 4135 " }],
    })]).toEqual(["4105", "4135"]);
    expect(cuentasAgrupadorasExcluidas({ estado: "sin_catalogo" }).size).toBe(0);
  });
});
