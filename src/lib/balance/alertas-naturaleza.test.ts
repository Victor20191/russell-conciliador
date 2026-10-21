import { describe, expect, it } from "vitest";
import type { Validation } from "./calcular";
import {
  ajustarValidacionNaturaleza,
  anclaConversacion,
  anclaReubicada,
  esSaldoContrarioPendiente,
  okHeredables,
  resumenAlertasBalance,
  validadosNaturaleza,
  type CuentaAlerta,
} from "./alertas-naturaleza";
import { UMBRALES_ALERTAS_DEFECTO } from "./umbrales-alertas";

const U = UMBRALES_ALERTAS_DEFECTO; // naturaleza $50.000

const cuenta = (code: string, balance: number, saldoOk: boolean, mapped = true): CuentaAlerta => ({ code, balance, saldoOk, mapped });

const CUENTAS: CuentaAlerta[] = [
  cuenta("11050501", 1_000_000, true), // saldo correcto
  cuenta("13059501", -80_000, false), // contrario sobre el umbral, con OK
  cuenta("14550801", -11_810_000, false), // contrario sobre el umbral, sin OK
  cuenta("24080101", 50_000, false), // contrario hasta el umbral: informativo
  cuenta("28059501", 0, true, false), // sin mapeo
];

describe("validadosNaturaleza", () => {
  it("solo cuenta los OK dados a la cuenta del cliente; los de agrupadoras quedan sin efecto", () => {
    const set = validadosNaturaleza([
      { anchor: "13059501", tipoAlerta: "naturaleza" },
      { anchor: "1305", tipoAlerta: "saldo_contrario" },
    ]);
    expect([...set]).toEqual(["13059501"]);
  });
});

describe("resumenAlertasBalance", () => {
  const validados = new Set(["13059501"]);

  it("cuenta los saldos contrarios sobre el umbral, los OK, los pendientes y los informativos", () => {
    expect(resumenAlertasBalance(CUENTAS, validados, U)).toEqual({
      naturaleza: { total: 2, conOk: 1, pendientes: 1, informativas: 1 },
      sinMapeo: 1,
      pendientes: 2,
    });
  });

  it("con todos los OK solo quedan pendientes las cuentas sin mapeo", () => {
    const todos = new Set(["13059501", "14550801"]);
    expect(resumenAlertasBalance(CUENTAS, todos, U)).toMatchObject({ naturaleza: { pendientes: 0 }, pendientes: 1 });
  });

  it("el umbral manda: subirlo vuelve informativos los saldos contrarios", () => {
    expect(resumenAlertasBalance(CUENTAS, validados, { ...U, naturaleza: 100_000_000 }).naturaleza)
      .toEqual({ total: 0, conOk: 0, pendientes: 0, informativas: 3 });
  });

  it("esSaldoContrarioPendiente es la misma regla, cuenta por cuenta", () => {
    expect(CUENTAS.filter((c) => esSaldoContrarioPendiente(c, validados, U)).map((c) => c.code)).toEqual(["14550801"]);
  });
});

describe("ajustarValidacionNaturaleza", () => {
  const V2: Validation = { id: "V2", rule: "Naturaleza de cuenta vs saldo", status: "warn", detail: "2 cuenta(s) con naturaleza contraria por encima de $ 50.000", count: 2 };
  const V1: Validation = { id: "V1", rule: "Cuadre de saldos finales", status: "ok", detail: "…" };

  it("descuenta los OK: sigue en alerta con los pendientes", () => {
    const [, v2] = ajustarValidacionNaturaleza([V1, V2], resumenAlertasBalance(CUENTAS, new Set(["13059501"]), U), U);
    expect(v2).toEqual({ ...V2, status: "warn", count: 1, detail: "2 cuenta(s) con naturaleza contraria por encima de $ 50.000 · 1 con OK · 1 pendiente(s)" });
  });

  it("con todos los OK queda en OK", () => {
    const [, v2] = ajustarValidacionNaturaleza([V1, V2], resumenAlertasBalance(CUENTAS, new Set(["13059501", "14550801"]), U), U);
    expect(v2.status).toBe("ok");
    expect(v2.count).toBeUndefined();
    expect(v2.detail).toContain("· 2 con OK · 0 pendiente(s)");
  });

  it("sin saldos contrarios sobre el umbral no toca la validación", () => {
    const sin = resumenAlertasBalance([cuenta("11050501", 10, true)], new Set(), U);
    expect(ajustarValidacionNaturaleza([V1, V2], sin, U)).toEqual([V1, V2]);
  });
});

describe("anclaConversacion", () => {
  it("la cuenta del cliente conserva su código y las agrupadoras llevan su nivel", () => {
    expect(anclaConversacion({ nivel: 8, code: "110505" })).toBe("110505");
    expect(anclaConversacion({ nivel: 6, code: "110505" })).toBe("n6:110505");
    expect(anclaConversacion({ nivel: 4, code: "1105" })).toBe("n4:1105");
    expect(anclaConversacion({ nivel: 2, code: "11" })).toBe("n2:11");
  });
});

describe("anclaReubicada (comentarios anclados por código antes del 20/Oct/2026)", () => {
  const cuentasCliente = new Set(["110505", "11051001"]);
  const agrupadoras = [{ nivel: 2, code: "11" }, { nivel: 4, code: "1105" }, { nivel: 6, code: "110505" }, { nivel: 6, code: "110510" }];

  it("si el código es de una cuenta del cliente, el comentario se queda en ella aunque la subcuenta se llame igual", () => {
    expect(anclaReubicada("110505", cuentasCliente, agrupadoras)).toBe("110505");
    expect(anclaReubicada("11051001", cuentasCliente, agrupadoras)).toBe("11051001");
  });

  it("si solo coincide con una agrupadora, pasa a su conversación", () => {
    expect(anclaReubicada("110510", cuentasCliente, agrupadoras)).toBe("n6:110510");
    expect(anclaReubicada("1105", cuentasCliente, agrupadoras)).toBe("n4:1105");
    expect(anclaReubicada("11", cuentasCliente, agrupadoras)).toBe("n2:11");
  });

  it("no toca un ancla ya movida ni la de una cuenta que ya no está", () => {
    expect(anclaReubicada("n6:110510", cuentasCliente, agrupadoras)).toBe("n6:110510");
    expect(anclaReubicada("13059501", cuentasCliente, agrupadoras)).toBe("13059501");
  });
});

describe("okHeredables", () => {
  const previas = [
    { anchor: "13059501", por: "Ana" }, // mismo saldo y sigue contrario → pasa
    { anchor: "14550801", por: "Ana" }, // el saldo cambió → la alerta vuelve
    { anchor: "24080101", por: "Ana" }, // ya no está en la versión nueva
    { anchor: "22050501", por: "Ana" }, // mismo saldo, pero ya no es contrario sobre el umbral
  ];
  const saldosPrevios = new Map([["13059501", -80_000], ["14550801", -11_810_000], ["24080101", 90_000], ["22050501", 20_000]]);
  const nuevas = [
    { code: "13059501", balance: -80_000.004, saldoOk: false }, // al centavo es el mismo saldo
    { code: "14550801", balance: -11_810_100, saldoOk: false },
    { code: "22050501", balance: 20_000, saldoOk: false }, // informativo
  ];

  it("pasa solo el OK de la misma cuenta con el mismo saldo final que sigue con saldo contrario", () => {
    expect(okHeredables(previas, saldosPrevios, nuevas, U).map((v) => v.anchor)).toEqual(["13059501"]);
  });
});
