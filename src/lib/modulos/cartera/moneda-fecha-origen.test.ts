import { describe, expect, it } from "vitest";
import { aPesos, esMonedaExtranjera, monedaPorNombreHoja, montoConDivisa, normalizarMoneda, validarTrm } from "./moneda";
import { deducirFechaCorte, diasEntre, fechaISO, finDePeriodo, sumarDias } from "./fecha-corte";
import { resolverOrigenCartera, ubicadorCuentaCliente } from "./origen-cartera";

describe("moneda", () => {
  it("normaliza códigos y nombres, y descarta lo que no es una moneda", () => {
    expect(["usd", "Dólares", "EUR", "pesos", "cop", "OTRA MONEDA", "8496", ""].map(normalizarMoneda))
      .toEqual(["USD", "USD", "EUR", "COP", "COP", null, null, null]);
    expect([esMonedaExtranjera("USD"), esMonedaExtranjera("COP"), esMonedaExtranjera(null)]).toEqual([true, false, false]);
  });

  it("solo una hoja llamada USD o EUR declara su moneda", () => {
    expect(["USD", "Euros", "COP", "Hoja1", "ABC"].map(monedaPorNombreHoja)).toEqual(["USD", "EUR", null, null, null]);
  });

  it("lee importes con el código escrito en la celda, con separadores anglosajones o latinos", () => {
    expect(montoConDivisa("USD (54,323.40)")).toEqual({ moneda: "USD", valor: -54_323.4 });
    expect(montoConDivisa("EUR 1.200,00")).toEqual({ moneda: "EUR", valor: 1_200 });
    expect(montoConDivisa("USD -1,234")).toEqual({ moneda: "USD", valor: -1_234 });
    expect(montoConDivisa("54,323.40")).toBeNull();
    expect(montoConDivisa(54_323.4)).toBeNull();
  });

  it("convierte al centavo y valida la TRM", () => {
    expect([aPesos(100.5, 4_000), aPesos(-0.125, 4_000), aPesos(5_142.67, 4_000)]).toEqual([402_000, -500, 20_570_680]);
    expect([validarTrm(3_757.08), validarTrm("3757.08"), validarTrm(0), validarTrm("abc")]).toEqual([3_757.08, 3_757.08, null, null]);
  });
});

describe("fecha de corte", () => {
  it("lee fechas ISO, dd/mm/aaaa y números de serie de Excel", () => {
    expect([fechaISO("2025-12-31"), fechaISO("31/12/2025"), fechaISO(46022), fechaISO("2025-02-30"), fechaISO("0"), fechaISO(12)])
      .toEqual(["2025-12-31", "2025-12-31", "2025-12-31", null, null, null]);
  });

  it("fin del período, días entre fechas y suma de días", () => {
    expect([finDePeriodo("2025-12"), finDePeriodo("2024-02"), finDePeriodo("2025-13")]).toEqual(["2025-12-31", "2024-02-29", null]);
    expect(diasEntre("2025-12-19", "2025-12-31")).toBe(12);
    expect(sumarDias("2025-12-19", 25)).toBe("2026-01-13");
  });

  it("deduce la fecha a la que se calcularon los días, con evidencia suficiente", () => {
    const filas = [
      { vencimiento: "2025-12-19", diasVencidos: 25 },
      { vencimiento: "2025-12-30", diasVencidos: 14 },
      { vencimiento: "2026-01-11", diasVencidos: 2 },
      { vencimiento: "2026-01-29", diasVencidos: 0 }, // por vencer: no cuenta
    ];
    expect(deducirFechaCorte(filas)).toEqual({ fecha: "2026-01-13", coincidencias: 3, filasConDias: 3 });
    expect(deducirFechaCorte(filas.slice(0, 2))).toBeNull();
  });
});

describe("origen de la cartera", () => {
  const base = { cuentasExterior: ["130510"], cuentasNacional: ["130505"], declarado: null, moneda: null, sugerido: null } as const;

  it("manda la cuenta de la fila, luego lo declarado, la moneda y la sugerencia", () => {
    expect(resolverOrigenCartera({ ...base, cuenta6: "130510", declarado: "nacional" })).toBe("exterior");
    expect(resolverOrigenCartera({ ...base, cuenta6: "130505", declarado: "exterior" })).toBe("nacional");
    expect(resolverOrigenCartera({ ...base, cuenta6: null, declarado: "exterior" })).toBe("exterior");
    expect(resolverOrigenCartera({ ...base, cuenta6: null, declarado: "mixta", moneda: "USD" })).toBe("exterior");
    expect(resolverOrigenCartera({ ...base, cuenta6: "138025", declarado: "mixta", sugerido: "exterior" })).toBe("exterior");
    expect(resolverOrigenCartera({ ...base, cuenta6: null })).toBeNull();
  });

  it("ubica la cuenta del archivo por la homologación del cliente o, si se pide, por sus propios dígitos", () => {
    const cuentas = [{ code: "13051001", cuenta6Russell: "130510" }, { code: "1305", cuenta6Russell: "130505" }];
    const ubicar = ubicadorCuentaCliente(cuentas);
    expect([ubicar("13051001"), ubicar("13050599"), ubicar("280505"), ubicar(null)]).toEqual(["130510", "130505", null, null]);
    expect(ubicadorCuentaCliente(cuentas, { usarPropia: true })("280505")).toBe("280505");
  });
});
