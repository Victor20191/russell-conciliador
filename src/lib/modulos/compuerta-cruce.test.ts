import { describe, expect, it } from "vitest";
import {
  balanceCubreMesExacto,
  balanceCubreRangoExacto,
  baseBalanceParaRango,
  cuentasAgrupadorasExcluidas,
  seleccionarBalanceCruceModulo,
  avisoSeleccionBalance,
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
  it("exige aprobación vigente del prevalidador, pero NO que el balance esté congelado", () => {
    expect(validarCompuertaPrevalidador(contexto(), 7, "ING")).toBeNull();
    // Congelar ya no es un paso previo a conciliar: las cuentas del módulo quedan en firme
    // al CERRAR la conciliación, no al congelar toda la versión.
    expect(validarCompuertaPrevalidador(contexto({
      balance: { ...contexto().balance, esOficial: false, estaCongelado: false },
    }), 7, "ING")).toBeNull();
    expect(validarCompuertaPrevalidador(contexto({
      balance: { ...contexto().balance, clienteId: 8 },
    }), 7, "ING")).toContain("no pertenece al cliente");
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

  it("prefiere el oficial del período sobre un mensual no oficial", () => {
    const noOficial = {
      id: 92,
      periodoInicio: new Date("2026-08-01T00:00:00.000Z"),
      periodoFin: new Date("2026-08-31T00:00:00.000Z"),
      esOficial: false,
      estaCongelado: false,
    };
    const valido = { ...noOficial, id: 88, esOficial: true, estaCongelado: true };

    expect(seleccionarBalanceCruceModulo(
      [noOficial, valido],
      contexto().catalogo,
      "ING",
      "2026-08",
    )?.id).toBe(88);
  });

  it("sin balance oficial, cruza contra la versión sin congelar del período (la primera en el orden recibido)", () => {
    const v2 = {
      id: 95,
      periodoInicio: new Date("2026-08-01T00:00:00.000Z"),
      periodoFin: new Date("2026-08-31T00:00:00.000Z"),
      esOficial: false,
      estaCongelado: false,
    };
    const v1 = { ...v2, id: 94 };
    // Módulo de movimiento (ING) y módulo de saldo (CAR): ninguno exige congelado.
    expect(seleccionarBalanceCruceModulo([v2, v1], contexto().catalogo, "ING", "2026-08")?.id).toBe(95);
    expect(seleccionarBalanceCruceModulo(
      [v2, v1],
      [{ moduloCodigo: "CAR", baseCalculo: "saldo", activa: true }],
      "CAR",
      "2026-08",
    )?.id).toBe(95);
  });

  it("en un módulo de movimiento antepone el mensual exacto sin congelar a un YTD oficial", () => {
    const ytdOficial = {
      id: 91,
      periodoInicio: new Date("2026-01-01T00:00:00.000Z"),
      periodoFin: new Date("2026-08-31T00:00:00.000Z"),
      esOficial: true,
      estaCongelado: true,
    };
    const mensualSinCongelar = {
      id: 96,
      periodoInicio: new Date("2026-08-01T00:00:00.000Z"),
      periodoFin: new Date("2026-08-31T00:00:00.000Z"),
      esOficial: false,
      estaCongelado: false,
    };
    expect(seleccionarBalanceCruceModulo([ytdOficial, mensualSinCongelar], contexto().catalogo, "ING", "2026-08")?.id).toBe(96);
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
    const anualSinCongelar = { id: "anual-v2", periodoInicio: ene, periodoFin: dic31, esOficial: false, estaCongelado: false };
    expect(seleccionarBalanceCruceModulo([anualSinCongelar, mensual, anualB], catalogo, "NOM", "2025-12", anual)?.id).toBe("anual");
    expect(seleccionarBalanceCruceModulo([anualSinCongelar, mensual], catalogo, "NOM", "2025-12", anual)?.id).toBe("anual-v2");
    expect(seleccionarBalanceCruceModulo([anualSinCongelar], catalogo, "NOM", "2025-12", anual)?.id).toBe("anual-v2");
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

describe("balance con detalle por tercero (Cartera y CxP)", () => {
  const catalogo = [{ moduloCodigo: "CAR", baseCalculo: "saldo" as const, activa: true }];
  const diciembre = { periodoInicio: new Date("2025-12-01T00:00:00.000Z"), periodoFin: new Date("2025-12-31T00:00:00.000Z"), version: "v1" };
  // Mineralin: la oficial congelada es «Por cuenta»; la «Por terceros» llegó después sin congelar.
  const porCuentaOficial = { ...diciembre, id: 10, esOficial: true, estaCongelado: true, aperturaBalance: "cuenta", conDetalleTercero: false };
  const porTerceros = { ...diciembre, id: 11, esOficial: false, estaCongelado: false, aperturaBalance: "tercero", conDetalleTercero: true };

  it("prefiere la versión que conserva el detalle por tercero aunque la oficial sea «Por cuenta»", () => {
    const candidatos = [porCuentaOficial, porTerceros];
    expect(seleccionarBalanceCruceModulo(candidatos, catalogo, "CAR", "2025-12", null, { preferirDetalleTercero: true })?.id).toBe(11);
    expect(seleccionarBalanceCruceModulo(candidatos, catalogo, "CAR", "2025-12")?.id).toBe(10);
    expect(avisoSeleccionBalance(candidatos, porTerceros, "2025-12")).toBe(
      "Se cruza contra el balance v1 «Por terceros» (2025-12-01 a 2025-12-31) porque conserva el detalle por tercero; el oficial del período, v1 «Por cuenta» (2025-12-01 a 2025-12-31), no lo trae.",
    );
  });

  it("sin ninguna versión con detalle conserva la oficial y no avisa", () => {
    const sinDetalle = { ...porTerceros, conDetalleTercero: false };
    expect(seleccionarBalanceCruceModulo([porCuentaOficial, sinDetalle], catalogo, "CAR", "2025-12", null, { preferirDetalleTercero: true })?.id).toBe(10);
    expect(avisoSeleccionBalance([porCuentaOficial, sinDetalle], porCuentaOficial, "2025-12")).toBeNull();
  });

  it("avisa cuando el mes tiene dos oficiales de distinto rango (KP Empaques)", () => {
    const mensual = { ...porCuentaOficial, id: 30 };
    const anual = { ...porTerceros, id: 26, esOficial: true, estaCongelado: true, periodoInicio: new Date("2025-01-01T00:00:00.000Z") };
    const candidatos = [mensual, anual]; // orden de la consulta: oficiales, fin de período, id descendente
    const elegido = seleccionarBalanceCruceModulo(candidatos, catalogo, "CAR", "2025-12", null, { preferirDetalleTercero: true });
    expect(elegido?.id).toBe(26);
    expect(avisoSeleccionBalance(candidatos, elegido, "2025-12")).toBe(
      "Hay 2 balances oficiales que terminan en 2025-12: v1 «Por cuenta» (2025-12-01 a 2025-12-31), v1 «Por terceros» (2025-01-01 a 2025-12-31). Se cruza contra el v1 «Por terceros» (2025-01-01 a 2025-12-31), el que conserva el detalle por tercero.",
    );
  });
});
