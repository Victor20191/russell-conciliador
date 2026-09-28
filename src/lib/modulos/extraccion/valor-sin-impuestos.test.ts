import { describe, expect, it } from "vitest";
import { MODULOS_IMPORT } from "../descriptores";
import type { SpecModulo } from "./esquema";
import { norm } from "./sugerir";
import {
  avisoValorSinProponer,
  confirmacionValor,
  confirmarValorSinImpuestos,
  detalleAuditoriaValor,
  firmaValor,
  impedimentoValorSinConfirmar,
  retirarConfirmacionValor,
} from "./valor-sin-impuestos";

const ING = MODULOS_IMPORT.ING;
const INV = MODULOS_IMPORT.INV;

// Columnas de SAP Business One: C Documento, M «Total sin Descuento», N «Total Fletes»,
// Q «Total Impuestos», R «Total Documento», S «Subtotal» (para el caso sin «total»).
const ENC: unknown[] = [];
ENC[1] = "Clase de Documento";
ENC[2] = "Documento";
ENC[12] = "Total  sin   Descuento";
ENC[13] = "Total Fletes";
ENC[16] = "Total Impuestos";
ENC[17] = "Total Documento";
ENC[18] = "Subtotal";

const spec = (extra: Partial<SpecModulo> = {}): Pick<SpecModulo, "columnas" | "valorFormula" | "valorSinImpuestosConfirmado"> => ({
  columnas: { concepto: 2, documento: 3, valor: 13 },
  ...extra,
});

describe("confirmación de que el valor excluye el IVA (Ingresos)", () => {
  it("una columna de total pide confirmación y la firma es el rótulo normalizado", () => {
    expect(firmaValor(ING, spec(), ENC)).toEqual({ rotulo: "Total sin Descuento", firma: "total sin descuento" });
    expect(impedimentoValorSinConfirmar(ING, spec(), ENC)).toBe("Confirma que «Total sin Descuento» excluye el IVA: es una columna de total.");
  });

  it("confirmada con esa firma deja de ser impedimento; con otra firma, no", () => {
    const confirmado = spec({ valorSinImpuestosConfirmado: norm("Total sin Descuento") });
    expect(confirmacionValor(ING, confirmado, ENC)).toEqual({ rotulo: "Total sin Descuento", confirmado: true });
    expect(impedimentoValorSinConfirmar(ING, confirmado, ENC)).toBeNull();
    // Se remapeó a «Total Documento»: la confirmación anterior no la valida.
    const remapeado = spec({ columnas: { concepto: 2, documento: 3, valor: 18 }, valorSinImpuestosConfirmado: norm("Total sin Descuento") });
    expect(impedimentoValorSinConfirmar(ING, remapeado, ENC)).toMatch(/«Total Documento»/);
  });

  it("una fórmula pide confirmación si algún término lleva «total», con todos los rótulos en la firma", () => {
    const formula = spec({
      columnas: { concepto: 2, documento: 3, valor: 0 },
      valorFormula: [{ columna: 13, signo: "+" }, { columna: 14, signo: "+" }],
    });
    expect(firmaValor(ING, formula, ENC)).toEqual({
      rotulo: "Total sin Descuento + Total Fletes",
      firma: "+total sin descuento +total fletes",
    });
    const confirmada = confirmarValorSinImpuestos(formula, "+total sin descuento +total fletes");
    expect(impedimentoValorSinConfirmar(ING, confirmada, ENC)).toBeNull();
    expect(retirarConfirmacionValor(confirmada).valorSinImpuestosConfirmado).toBeUndefined();
  });

  it("en una fórmula el signo es parte de lo confirmado: sumar el IVA en vez de restarlo la invalida", () => {
    const resta = spec({
      columnas: { concepto: 2, documento: 3, valor: 0 },
      valorFormula: [{ columna: 18, signo: "+" }, { columna: 17, signo: "-" }],
    });
    const { rotulo, firma } = firmaValor(ING, resta, ENC);
    expect(rotulo).toBe("Total Documento − Total Impuestos");
    const confirmada = confirmarValorSinImpuestos(resta, firma);
    expect(impedimentoValorSinConfirmar(ING, confirmada, ENC)).toBeNull();
    const sumaIva = { ...confirmada, valorFormula: [{ columna: 18, signo: "+" as const }, { columna: 17, signo: "+" as const }] };
    expect(impedimentoValorSinConfirmar(ING, sumaIva, ENC)).toBe("Confirma que «Total Documento + Total Impuestos» excluye el IVA: es una columna de total.");
  });

  it("no pregunta con un rótulo neto, sin valor mapeado ni en otro módulo", () => {
    expect(firmaValor(ING, spec({ columnas: { concepto: 2, valor: 19 } }), ENC).rotulo).toBeNull();
    expect(firmaValor(ING, spec({ columnas: { concepto: 2, valor: 0 } }), ENC).rotulo).toBeNull();
    expect(firmaValor(INV, { columnas: { valorTotal: 13 } }, ENC).rotulo).toBeNull();
    expect(impedimentoValorSinConfirmar(INV, { columnas: { valorTotal: 13 } }, ENC)).toBeNull();
  });

  it("explica por qué no se propuso columna de valor cuando las candidatas llevan «total»", () => {
    const sinValor = spec({ columnas: { concepto: 2, documento: 3, valor: 0 } });
    expect(avisoValorSinProponer(ING, sinValor, ENC)).toMatch(/^No se propuso columna de valor: las candidatas se llaman «Total  sin   Descuento», «Total Fletes», «Total Impuestos»…/);
    expect(avisoValorSinProponer(ING, spec(), ENC)).toBeNull();
    expect(avisoValorSinProponer(ING, sinValor, ["Concepto", "Documento", "Subtotal"])).toBeNull();
    expect(avisoValorSinProponer(INV, { columnas: { valorTotal: 0 } }, ENC)).toBeNull();
  });

  it("deja rastro para la auditoría", () => {
    expect(detalleAuditoriaValor(null, false)).toBe("");
    expect(detalleAuditoriaValor("Total sin Descuento", true)).toBe(" · valor de «Total sin Descuento» confirmado sin IVA");
    expect(detalleAuditoriaValor("Total sin Descuento", false)).toBe(" · valor de «Total sin Descuento» sin confirmar");
  });
});
