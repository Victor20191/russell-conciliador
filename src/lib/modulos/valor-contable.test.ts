import { describe, expect, it } from "vitest";
import type { ReglaContableModulo } from "./valor-contable";
import {
  calcularValorContableModulo,
  resolverReglaContableModulo,
} from "./valor-contable";

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
