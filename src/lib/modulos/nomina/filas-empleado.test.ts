import { describe, expect, it } from "vitest";
import { detectarFilasDeEmpleado, pareceCedulaEnCodigo, type FilaPorEmpleadoCruda } from "./filas-empleado";

const f = (codigo: string | null, nombre: string | null, valor: number | null): FilaPorEmpleadoCruda => ({ codigo, nombre, valor });

// HGI «LIQUIDACION» de GEN PROMOTORA (2025): las dos primeras personas tal cual vienen.
const HGI: FilaPorEmpleadoCruda[] = [
  f("1022093434", "GALLO LEZCANO DANIEL ALBERTO", 19922093),
  f("01", "SALARIO BASICO", 17082000),
  f("02", "AUXILIO DE TRANSPORTE", 2400000),
  f("14", "INTERESES A LAS CESANTIAS", 183153),
  f("15", "PRIMA", 1623500),
  f("30", "APORTE SALUD", -683280),
  f("31", "APORTE PENSIÓN", -683280),
  f("1022099401", "FLOREZ DIAZ DUVAN ESTIVEN", 12000000),
  f("01", "SALARIO BASICO", 12751316),
  f("31", "APORTE PENSIÓN", -751316),
  f(null, "TOTALES", 31922093),
];

describe("pareceCedulaEnCodigo", () => {
  it("reconoce cédulas y NIT, no códigos de concepto", () => {
    expect(pareceCedulaEnCodigo("1022093434")).toBe(true);
    expect(pareceCedulaEnCodigo("43.590.224")).toBe(true);
    expect(pareceCedulaEnCodigo("890926050-2")).toBe(true);
    expect(pareceCedulaEnCodigo("01")).toBe(false);
    expect(pareceCedulaEnCodigo("C001")).toBe(false);
    expect(pareceCedulaEnCodigo("12345")).toBe(false);
    expect(pareceCedulaEnCodigo(null)).toBe(false);
  });
});

describe("detectarFilasDeEmpleado", () => {
  it("toma como empleado la fila con cédula cuyo valor es la suma de sus conceptos", () => {
    const filas = detectarFilasDeEmpleado(HGI);
    expect([...filas.keys()]).toEqual([0, 7]);
    expect(filas.get(0)).toEqual({ cedula: "1022093434", nombre: "GALLO LEZCANO DANIEL ALBERTO", total: 19922093, sumaConceptos: 19922093, cuadra: true });
    // El bloque se corta en el rótulo «TOTALES»: no lo suma.
    expect(filas.get(7)).toMatchObject({ sumaConceptos: 12000000, cuadra: true });
  });

  it("con la gran mayoría cuadrando, la que no cuadra igual es empleado (y lo dice)", () => {
    const filas: FilaPorEmpleadoCruda[] = [];
    for (let e = 0; e < 5; e++) {
      filas.push(f(`10220934${e}0`, `EMPLEADO ${e}`, e === 4 ? 999 : 300), f("01", "SALARIO", 200), f("02", "AUXILIO", 100));
    }
    const r = detectarFilasDeEmpleado(filas);
    expect(r.size).toBe(5);
    expect(r.get(12)).toMatchObject({ total: 999, sumaConceptos: 300, cuadra: false });
  });

  it("no toca un archivo cuyos códigos largos no son empleados", () => {
    // Códigos de concepto de seis dígitos: la aritmética no los respalda.
    expect(detectarFilasDeEmpleado([
      f("100001", "SALARIO", 1000),
      f("100002", "AUXILIO", 200),
      f("100003", "PRIMA", 300),
    ]).size).toBe(0);
  });

  it("no toca un archivo plano con la cédula en su propia columna", () => {
    expect(detectarFilasDeEmpleado([f("01", "SALARIO", 1000), f("02", "AUXILIO", 200)]).size).toBe(0);
  });
});
