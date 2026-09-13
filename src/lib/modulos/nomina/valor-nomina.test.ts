import { describe, expect, it } from "vitest";
import {
  esConceptoNeto,
  esPieRepetido,
  esTipoDeduccion,
  evaluarFilaNomina,
  nombreSinCedula,
  normalizarCedula,
  valorFilaNomina,
} from "./valor-nomina";

const mapeados = (...roles: string[]) => new Set(roles);

describe("valorFilaNomina", () => {
  it("Novasoft/SIESA: devengos y deducciones en columnas aparte, deducción negativa", () => {
    expect(valorFilaNomina({ devengo: 355875, deduccion: 0 }, mapeados("devengo", "deduccion"))).toEqual({ valor: 355875, naturaleza: "devengo" });
    expect(valorFilaNomina({ devengo: 0, deduccion: 151600 }, mapeados("devengo", "deduccion"))).toEqual({ valor: -151600, naturaleza: "deduccion" });
    // Zarzal: 182 filas con devengo y deducción a la vez → neto de la fila, naturaleza devengo.
    expect(valorFilaNomina({ devengo: 1000, deduccion: 300 }, mapeados("devengo", "deduccion"))).toEqual({ valor: 700, naturaleza: "devengo" });
  });

  it("Ofimática: la deducción viene en negativo y se toma su magnitud", () => {
    expect(valorFilaNomina({ devengo: 0, deduccion: -195917 }, mapeados("devengo", "deduccion"))).toEqual({ valor: -195917, naturaleza: "deduccion" });
  });

  it("Novasoft: una fila con solo «Neto pagado» es neto, no un concepto", () => {
    expect(valorFilaNomina({ devengo: 0, deduccion: 0, neto: 94900 }, mapeados("devengo", "deduccion", "neto"))).toEqual({ valor: 0, naturaleza: "neto" });
    expect(valorFilaNomina({ devengo: 0, deduccion: 0, neto: 0 }, mapeados("devengo", "deduccion", "neto"))).toEqual({ valor: 0, naturaleza: null });
  });

  it("interfaces contables: débito menos crédito", () => {
    expect(valorFilaNomina({ debito: 13724133, credito: 0 }, mapeados("debito", "credito"))).toEqual({ valor: 13724133, naturaleza: "devengo" });
    expect(valorFilaNomina({ debito: 0, credito: 500 }, mapeados("debito", "credito"))).toEqual({ valor: -500, naturaleza: "deduccion" });
  });

  it("Buk/Pure Nature: un solo valor sin signo y la columna de tipo decide", () => {
    expect(valorFilaNomina({ valor: 1013702, tipo: "Ingreso" }, mapeados("valor", "tipo"))).toEqual({ valor: 1013702, naturaleza: "devengo" });
    expect(valorFilaNomina({ valor: 40548, tipo: "Deducción" }, mapeados("valor", "tipo"))).toEqual({ valor: -40548, naturaleza: "deduccion" });
    expect(valorFilaNomina({ valor: 143234, tipo: "Provisiones" }, mapeados("valor", "tipo"))).toEqual({ valor: 143234, naturaleza: "devengo" });
    expect(valorFilaNomina({ valor: 12, tipo: "DEDUCION" }, mapeados("valor", "tipo"))).toEqual({ valor: -12, naturaleza: "deduccion" }); // así lo escribe SIIGO
  });

  it("SIIGO/LIBRA: un solo valor ya firmado se respeta", () => {
    expect(valorFilaNomina({ valor: 109804800 }, mapeados("valor"))).toEqual({ valor: 109804800, naturaleza: "devengo" });
    expect(valorFilaNomina({ valor: -5868000 }, mapeados("valor"))).toEqual({ valor: -5868000, naturaleza: "deduccion" });
    expect(valorFilaNomina({ valor: "2.700.000,00" }, mapeados("valor"))).toEqual({ valor: 2700000, naturaleza: "devengo" });
    expect(valorFilaNomina({ valor: 0 }, mapeados("valor"))).toEqual({ valor: 0, naturaleza: null });
  });

  it("esTipoDeduccion y esConceptoNeto", () => {
    expect(esTipoDeduccion("Deducciones")).toBe(true);
    expect(esTipoDeduccion("Descuento")).toBe(true);
    expect(esTipoDeduccion("Ganancias")).toBe(false);
    expect(esTipoDeduccion(null)).toBe(false);
    expect(esConceptoNeto("999901", "Neto a Pagar")).toBe(true);
    expect(esConceptoNeto("999908", "Neto - Consignación Fondos")).toBe(true);
    expect(esConceptoNeto("001050", "Apoyo Sostenimiento")).toBe(false);
  });
});

describe("evaluarFilaNomina", () => {
  const rolesTexto = ["codigo", "concepto", "cedula", "empleado", "agrupador"];

  it("excluye el pie repetido de SIIGO («Procesado en…» en todas las columnas)", () => {
    const pie = "Procesado en: 2026/01/19 08:31:56:73";
    expect(evaluarFilaNomina({ codigo: pie, concepto: pie, cedula: pie, empleado: pie, valor: 0 }, mapeados("valor"), rolesTexto)).toMatchObject({ excluir: "pie_repetido" });
    // Dos columnas iguales no bastan: un empleado puede llamarse como su cargo.
    expect(evaluarFilaNomina({ concepto: "X", empleado: "X", valor: 10 }, mapeados("valor"), rolesTexto)).toMatchObject({ excluir: null });
  });

  it("excluye el neto de Novasoft y las filas con importe pero sin concepto", () => {
    expect(evaluarFilaNomina({ codigo: "999901", concepto: "Neto a Pagar", devengo: 0, deduccion: 0, neto: 94900 }, mapeados("devengo", "deduccion", "neto"), rolesTexto))
      .toEqual({ valor: 0, naturaleza: "neto", excluir: "neto" });
    expect(evaluarFilaNomina({ valor: 500 }, mapeados("valor"), rolesTexto)).toMatchObject({ excluir: "sin_concepto", valor: 500 });
    expect(evaluarFilaNomina({ codigo: "001", valor: 500 }, mapeados("valor"), rolesTexto)).toMatchObject({ excluir: null, valor: 500, naturaleza: "devengo" });
  });
});

describe("cédula", () => {
  it("normaliza puntos, sufijos de recontratación y la cédula dentro del nombre", () => {
    expect(normalizarCedula("1.000.396.862")).toBe("1000396862");
    expect(normalizarCedula("1037621378-1")).toBe("1037621378");
    expect(normalizarCedula("4938867-1")).toBe("4938867");
    expect(normalizarCedula("ANA MARIA BETANCOURT O - CC 43590224")).toBe("43590224");
    expect(normalizarCedula(" 3348656 URIBE ALVAREZ LUIS FERNANDO ")).toBe("3348656");
    expect(normalizarCedula(3348656)).toBe("3348656");
    expect(normalizarCedula("PT 5295040")).toBe("5295040");
  });

  it("devuelve null sin dígitos suficientes y limpia el nombre", () => {
    expect(normalizarCedula("F1")).toBeNull();
    expect(normalizarCedula(null)).toBeNull();
    expect(nombreSinCedula("ANA MARIA BETANCOURT O - CC 43590224")).toBe("ANA MARIA BETANCOURT O");
    expect(nombreSinCedula("PAULA ANDREA GOMEZ MONTOYA")).toBe("PAULA ANDREA GOMEZ MONTOYA");
  });

  it("esPieRepetido exige tres roles con el mismo texto", () => {
    expect(esPieRepetido({ a: "x", b: "x", c: "x" }, ["a", "b", "c"])).toBe(true);
    expect(esPieRepetido({ a: "x", b: "x", c: "y" }, ["a", "b", "c"])).toBe(false);
  });
});
