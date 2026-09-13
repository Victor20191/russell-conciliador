import { describe, expect, it } from "vitest";
import {
  balanceCubreMesExacto,
  balanceCubreRangoExacto,
  baseBalanceParaRango,
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

describe("rango del cargue (Nómina, D7)", () => {
  const ene = new Date("2025-01-01T00:00:00.000Z");
  const dic31 = new Date("2025-12-31T00:00:00.000Z");
  const dic1 = new Date("2025-12-01T00:00:00.000Z");
  const nov1 = new Date("2025-11-01T00:00:00.000Z");
  const anual = { desde: "2025-01", hasta: "2025-12" };
  const bimestre = { desde: "2025-11", hasta: "2025-12" };

  it("balanceCubreRangoExacto y baseBalanceParaRango", () => {
    expect(balanceCubreRangoExacto(ene, dic31, anual)).toBe(true);
    expect(balanceCubreRangoExacto(dic1, dic31, anual)).toBe(false);
    expect(balanceCubreRangoExacto(nov1, dic31, bimestre)).toBe(true);
    expect(balanceCubreRangoExacto(ene, dic31, { desde: "2025-12", hasta: "2025-01" })).toBe(false);
    expect(baseBalanceParaRango(ene, dic31, anual)).toBe("movimiento");
    // Kakaraka: balance mensual de diciembre frente al acumulado enero–diciembre → saldo.
    expect(baseBalanceParaRango(dic1, dic31, anual)).toBe("saldo_acumulado");
    // Un bimestre que no arranca en enero no se puede leer por saldo.
    expect(baseBalanceParaRango(dic1, dic31, bimestre)).toBeNull();
    // Rango de un solo mes: solo el mes exacto.
    expect(baseBalanceParaRango(dic1, dic31, { desde: "2025-12", hasta: "2025-12" })).toBe("movimiento");
    expect(baseBalanceParaRango(nov1, dic31, { desde: "2025-12", hasta: "2025-12" })).toBeNull();
  });

  it("seleccionarBalanceCruceModulo prefiere el que cubre el rango exacto y luego el del mes final por saldo", () => {
    const catalogo = [{ moduloCodigo: "NOM", baseCalculo: "movimiento" as const, activa: true }];
    const mensual = { id: "dic", periodoInicio: dic1, periodoFin: dic31, esOficial: true, estaCongelado: true };
    const anualB = { id: "anual", periodoInicio: ene, periodoFin: dic31, esOficial: true, estaCongelado: true };
    const borrador = { id: "borrador", periodoInicio: ene, periodoFin: dic31, esOficial: false, estaCongelado: false };
    expect(seleccionarBalanceCruceModulo([borrador, mensual, anualB], catalogo, "NOM", "2025-12", anual)?.id).toBe("anual");
    expect(seleccionarBalanceCruceModulo([borrador, mensual], catalogo, "NOM", "2025-12", anual)?.id).toBe("dic");
    expect(seleccionarBalanceCruceModulo([borrador], catalogo, "NOM", "2025-12", anual)?.id).toBe("borrador");
    // Sin rango, la regla de siempre (mes exacto).
    expect(seleccionarBalanceCruceModulo([anualB, mensual], catalogo, "NOM", "2025-12")?.id).toBe("dic");
  });

  it("validarRangoBalanceModulo acepta el balance del mes final por saldo y rechaza el resto", () => {
    const base = contexto({ catalogo: [{ moduloCodigo: "NOM", baseCalculo: "movimiento", activa: true }] });
    const dic = { ...base, balance: { ...base.balance, periodoInicio: dic1, periodoFin: dic31 } };
    expect(validarRangoBalanceModulo(dic, "NOM", "2025-12", anual)).toBeNull();
    expect(validarRangoBalanceModulo(dic, "NOM", "2025-12", bimestre)).toContain("2025-11 a 2025-12");
    expect(validarRangoBalanceModulo({ ...base, balance: { ...base.balance, periodoInicio: nov1, periodoFin: dic31 } }, "NOM", "2025-12", bimestre)).toBeNull();
    // Rango de un mes = comportamiento de siempre.
    expect(validarRangoBalanceModulo(dic, "NOM", "2025-12", { desde: "2025-12", hasta: "2025-12" })).toBeNull();
  });
});
