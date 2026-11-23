import { describe, expect, it } from "vitest";
import { aplicarAsignacionMasiva, contarConCuentas, cuentasDeSeleccion, parseModoAsignacionMasiva, quitarCuentasMasivo } from "./consolidacion-masiva";

const VALORES = {
  "MERCANCIA A": ["1435"],
  "MERCANCIA B": [],
  "MATERIA PRIMA": ["1405", "1410"],
  REPUESTOS: [],
};

describe("asignación masiva de cuentas del consolidado", () => {
  it("rechaza un modo que no confirmó el usuario", () => {
    expect(parseModoAsignacionMasiva(undefined)).toBeNull();
    expect(parseModoAsignacionMasiva("todas")).toBeNull();
    expect(parseModoAsignacionMasiva("agregar")).toBe("agregar");
  });

  it("agrega sin perder las cuentas previas ni duplicarlas", () => {
    const r = aplicarAsignacionMasiva(VALORES, ["MERCANCIA A", "MERCANCIA B"], ["1435", "1455"], "agregar");
    expect(r["MERCANCIA A"]).toEqual(["1435", "1455"]);
    expect(r["MERCANCIA B"]).toEqual(["1435", "1455"]);
    // Los no seleccionados quedan intactos.
    expect(r["MATERIA PRIMA"]).toEqual(["1405", "1410"]);
    expect(r.REPUESTOS).toEqual([]);
  });

  it("reemplaza el conjunto completo de los seleccionados", () => {
    const r = aplicarAsignacionMasiva(VALORES, ["MATERIA PRIMA", "REPUESTOS"], ["1435"], "reemplazar");
    expect(r["MATERIA PRIMA"]).toEqual(["1435"]);
    expect(r.REPUESTOS).toEqual(["1435"]);
    expect(r["MERCANCIA A"]).toEqual(["1435"]);
  });

  it("deduplica las cuentas elegidas y ordena el resultado", () => {
    const r = aplicarAsignacionMasiva({}, ["X"], ["1455", "1405", "1455"], "reemplazar");
    expect(r.X).toEqual(["1405", "1455"]);
  });

  it("no hace nada con una selección vacía y nunca muta la entrada", () => {
    const original = { A: ["1435"] };
    const r = aplicarAsignacionMasiva(original, [], ["1405"], "reemplazar");
    expect(r).toEqual(original);
    expect(r).not.toBe(original);

    aplicarAsignacionMasiva(original, ["A"], ["1405"], "agregar");
    expect(original.A).toEqual(["1435"]);
  });

  it("cuenta cuántos seleccionados ya tienen cuentas (aviso antes de reemplazar)", () => {
    expect(contarConCuentas(VALORES, ["MERCANCIA A", "MERCANCIA B", "MATERIA PRIMA"])).toBe(2);
    expect(contarConCuentas(VALORES, ["MERCANCIA B", "REPUESTOS"])).toBe(0);
    expect(contarConCuentas(VALORES, ["INEXISTENTE"])).toBe(0);
  });
});

describe("quitar cuentas en bloque del consolidado", () => {
  it("lista las cuentas de la selección con en cuántos renglones está cada una", () => {
    const valores = { ...VALORES, REPUESTOS: ["1435"] };
    expect(cuentasDeSeleccion(valores, ["MERCANCIA A", "MATERIA PRIMA", "REPUESTOS", "MERCANCIA B"])).toEqual([
      { codigo: "1405", renglones: 1 },
      { codigo: "1410", renglones: 1 },
      { codigo: "1435", renglones: 2 },
    ]);
    expect(cuentasDeSeleccion(valores, ["MERCANCIA B"])).toEqual([]);
  });

  it("sin cuentas elegidas quita todas; solo cambian los renglones que tenían alguna", () => {
    const r = quitarCuentasMasivo(VALORES, ["MERCANCIA A", "MERCANCIA B", "MATERIA PRIMA"], null);
    expect(r.valores["MERCANCIA A"]).toEqual([]);
    expect(r.valores["MATERIA PRIMA"]).toEqual([]);
    expect(r.cambiados).toEqual(["MERCANCIA A", "MATERIA PRIMA"]);
    // No muta la entrada ni toca lo no seleccionado.
    expect(VALORES["MATERIA PRIMA"]).toEqual(["1405", "1410"]);
  });

  it("con cuentas elegidas quita solo esas y deja las demás", () => {
    const r = quitarCuentasMasivo(VALORES, ["MERCANCIA A", "MATERIA PRIMA"], ["1405", "1435"]);
    expect(r.valores["MERCANCIA A"]).toEqual([]);
    expect(r.valores["MATERIA PRIMA"]).toEqual(["1410"]);
    expect(r.cambiados).toEqual(["MERCANCIA A", "MATERIA PRIMA"]);
    expect(quitarCuentasMasivo(VALORES, ["MATERIA PRIMA"], ["9999"]).cambiados).toEqual([]);
  });
});
