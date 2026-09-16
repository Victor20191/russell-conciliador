import { describe, expect, it } from "vitest";
import type { ReglaContableModulo } from "./valor-contable";
import {
  calcularValorContableModulo,
  calcularValorContableTercero,
  resolverReglaContableModulo,
} from "./valor-contable";
import { descriptorModulo } from "./descriptores";

const regla = (
  moduloCodigo: string,
  cuentaRussell: string,
  baseCalculo: "saldo" | "movimiento",
): ReglaContableModulo => ({ moduloCodigo, cuentaRussell, baseCalculo, activa: true });

const catalogo: ReglaContableModulo[] = [
  regla("ING", "41", "movimiento"),
  regla("CXP", "22", "saldo"),
  regla("CXP", "2335", "saldo"),
  regla("INV", "14", "saldo"),
  regla("NOM", "5105", "movimiento"),
];

describe("valor contable para cruces de módulos", () => {
  it("ING 41 usa créditos menos débitos y no el saldo acumulado", () => {
    expect(calcularValorContableModulo({
      moduloCodigo: "ING",
      cuentaRussell: "413505",
      fila: { saldoFinal: -7_000, debitos: 100, creditos: 900 },
      catalogo,
    })).toEqual({ valor: 800, baseCalculo: "movimiento", cuentaRegla: "41" });
  });

  it("CXP 22 presenta el saldo crédito como magnitud positiva", () => {
    expect(calcularValorContableModulo({
      moduloCodigo: "CXP",
      cuentaRussell: "220505",
      fila: { saldoFinal: -1_250, debitos: 0, creditos: 0 },
      catalogo,
    })?.valor).toBe(1_250);
  });

  it("INV 14 conserva el saldo débito", () => {
    expect(calcularValorContableModulo({
      moduloCodigo: "INV",
      cuentaRussell: "143505",
      fila: { saldoFinal: 700, debitos: 0, creditos: 0 },
      catalogo,
    })?.valor).toBe(700);
  });

  it("ING suma ventas crédito y resta devoluciones débito por cuenta", () => {
    expect(calcularValorContableModulo({
      moduloCodigo: "ING",
      cuentaRussell: "413500",
      fila: { saldoFinal: -1_000, debitos: 0, creditos: 1_000 },
      catalogo,
    })?.valor).toBe(1_000);
    expect(calcularValorContableModulo({
      moduloCodigo: "ING",
      cuentaRussell: "417500",
      fila: { saldoFinal: 200, debitos: 200, creditos: 0 },
      catalogo,
    })?.valor).toBe(-200);
  });

  it("NOM 5105 usa débitos menos créditos con naturaleza débito", () => {
    expect(calcularValorContableModulo({
      moduloCodigo: "NOM",
      cuentaRussell: "510506",
      fila: { saldoFinal: 8_000, debitos: 950, creditos: 50 },
      catalogo,
    })?.valor).toBe(900);
  });

  it("elige el prefijo activo más específico y falla cerrado sin regla", () => {
    expect(resolverReglaContableModulo("CXP", "233595", catalogo)?.cuentaRussell).toBe("2335");
    expect(resolverReglaContableModulo("ING", "420505", catalogo)).toBeNull();
    expect(calcularValorContableModulo({
      moduloCodigo: "ING",
      cuentaRussell: "420505",
      fila: { saldoFinal: -1, debitos: 0, creditos: 1 },
      catalogo,
    })).toBeNull();
  });
});

describe("valor contable del cruce por tercero", () => {
  const catalogoCartera: ReglaContableModulo[] = [regla("CAR", "13", "saldo"), regla("CAR", "2805", "saldo")];
  const saldo = (saldoFinal: number) => ({ saldoFinal, debitos: 0, creditos: 0 });
  const tercero = (cuentaRussell: string, saldoFinal: number, naturaleza?: "D" | "C", catalogo = catalogoCartera, moduloCodigo = "CAR") =>
    calcularValorContableTercero({ moduloCodigo, cuentaRussell, fila: saldo(saldoFinal), catalogo, naturaleza })?.valor ?? null;

  it("cartera (naturaleza D): el anticipo de 280505 RESTA del saldo del tercero, como en el auxiliar", () => {
    expect((tercero("130505", 100, "D") ?? 0) + (tercero("280505", -30, "D") ?? 0)).toBe(70);
  });

  it("sin naturaleza conserva el factor por cuenta: el mismo anticipo se sumaría", () => {
    expect((tercero("130505", 100) ?? 0) + (tercero("280505", -30) ?? 0)).toBe(130);
  });

  it("naturaleza C invierte todas las cuentas del módulo por igual", () => {
    const cxp: ReglaContableModulo[] = [regla("CXP", "22", "saldo"), regla("CXP", "1330", "saldo")];
    expect([tercero("220505", -500, "C", cxp, "CXP"), tercero("133005", 200, "C", cxp, "CXP")]).toEqual([500, -200]);
  });

  it("una cuenta sin regla del módulo sigue fuera del cruce", () => {
    expect(tercero("510506", 1, "D")).toBeNull();
  });

  it("Cartera declara naturaleza D", () => {
    expect(descriptorModulo("CAR")?.crucePorTercero.naturaleza).toBe("D");
  });
});

describe("valor contable del cruce contable con la naturaleza del módulo", () => {
  const catalogoModulos: ReglaContableModulo[] = [
    regla("CAR", "13", "saldo"),
    regla("CAR", "28", "saldo"),
    regla("CXP", "22", "saldo"),
    regla("CXP", "1330", "saldo"),
    regla("NOM", "5105", "movimiento"),
  ];
  const conSaldo = (saldoFinal: number) => ({ saldoFinal, debitos: 0, creditos: 0 });

  it("Cartera (D): el anticipo 2805 queda negativo como en el auxiliar y los clientes 1305 no cambian", () => {
    // Aceros Mapa: el balance trae la 2805 en −1.295.115.489,85 (crédito) y el auxiliar también.
    const car = (cuentaRussell: string, saldoFinal: number, naturaleza?: "D" | "C") =>
      calcularValorContableModulo({ moduloCodigo: "CAR", cuentaRussell, fila: conSaldo(saldoFinal), catalogo: catalogoModulos, naturaleza })?.valor;
    expect(car("280505", -1_295_115_489.85, "D")).toBe(-1_295_115_489.85);
    expect(car("280505", -1_295_115_489.85)).toBe(1_295_115_489.85); // sin naturaleza: factor del pasivo
    expect(car("130505", 24_317_578_654.59, "D")).toBe(24_317_578_654.59);
  });

  it("CxP (C): la deuda 2205 sigue positiva y el anticipo 1330 pasa a restar", () => {
    const cxp = (cuentaRussell: string, saldoFinal: number) =>
      calcularValorContableModulo({ moduloCodigo: "CXP", cuentaRussell, fila: conSaldo(saldoFinal), catalogo: catalogoModulos, naturaleza: "C" })?.valor;
    expect(cxp("220505", -1_250)).toBe(1_250);
    expect(cxp("133005", 300)).toBe(-300);
  });

  it("la base efectiva de Nómina manda con o sin naturaleza", () => {
    expect(calcularValorContableModulo({
      moduloCodigo: "NOM",
      cuentaRussell: "510506",
      fila: { saldoFinal: 9_000, debitos: 700, creditos: 100 },
      catalogo: catalogoModulos,
      baseEfectiva: "saldo",
    })?.valor).toBe(9_000);
  });
});

describe("cuentas de la cédula fuera del prevalidador", () => {
  it("una cuenta adicional sin regla usa su propia base y el signo de su clase", () => {
    // Nómina 251010 por movimiento: la provisión (crédito) se presenta positiva.
    expect(calcularValorContableModulo({
      moduloCodigo: "NOM",
      cuentaRussell: "251010",
      fila: { saldoFinal: -5_000, debitos: 200, creditos: 1_200 },
      catalogo,
      baseAdicional: "movimiento",
    })).toEqual({ valor: 1_000, baseCalculo: "movimiento", cuentaRegla: "251010" });
    // Ingresos 422005: el catálogo solo tiene la 41.
    expect(calcularValorContableModulo({
      moduloCodigo: "ING",
      cuentaRussell: "422005",
      fila: { saldoFinal: -3_000, debitos: 0, creditos: 450 },
      catalogo,
      baseAdicional: "movimiento",
    })?.valor).toBe(450);
  });

  it("sin base adicional, la misma cuenta sigue sin regla", () => {
    expect(calcularValorContableModulo({
      moduloCodigo: "NOM",
      cuentaRussell: "251010",
      fila: { saldoFinal: 0, debitos: 0, creditos: 1 },
      catalogo,
    })).toBeNull();
  });

  it("la depreciación 1592 se presenta como crédito aunque la regla sea la del activo", () => {
    const conAfi = [...catalogo, regla("AFI", "15", "saldo")];
    const fila = { saldoFinal: -800, debitos: 0, creditos: 0 };
    expect(calcularValorContableModulo({ moduloCodigo: "AFI", cuentaRussell: "159205", fila, catalogo: conAfi })?.valor).toBe(-800);
    expect(calcularValorContableModulo({ moduloCodigo: "AFI", cuentaRussell: "159205", fila, catalogo: conAfi, naturalezaCuenta: "C" }))
      .toEqual({ valor: 800, baseCalculo: "saldo", cuentaRegla: "15" });
  });
});
