import { describe, expect, it } from "vitest";
import { descriptorModulo } from "../descriptores";
import { CLAVE_EDADES } from "./detalle-cartera";
import { columnasDetalleModulo, rotulosEdadesDeEncabezado } from "./columnas-cartera";

const CAR = descriptorModulo("CAR")!;
const INV = descriptorModulo("INV")!;

describe("rotulosEdadesDeEncabezado", () => {
  it("conserva el orden y el rótulo literal del ERP", () => {
    expect(rotulosEdadesDeEncabezado(["Corriente", "De 1 a 90", "De 361 o mas"]))
      .toEqual(["Corriente", "De 1 a 90", "De 361 o mas"]);
  });

  it("descarta repetidos y vacíos sin perder los buenos", () => {
    expect(rotulosEdadesDeEncabezado(["1 - 30", "  ", "1 - 30", null, 7, "31 - 60"]))
      .toEqual(["1 - 30", "31 - 60"]);
  });

  it("tolera los cargues anteriores, que no traen nada", () => {
    expect(rotulosEdadesDeEncabezado(null)).toEqual([]);
    expect(rotulosEdadesDeEncabezado(undefined)).toEqual([]);
    expect(rotulosEdadesDeEncabezado("no es una lista")).toEqual([]);
    expect(rotulosEdadesDeEncabezado({})).toEqual([]);
  });
});

describe("columnasDetalleModulo", () => {
  it("un módulo sin familias devuelve exactamente las columnas de su descriptor", () => {
    const cols = columnasDetalleModulo(INV, ["1 - 30 DIAS"]);
    expect(cols.map((c) => c.nombre)).toEqual(INV.columnas.map((c) => c.nombre));
    expect(cols.every((c) => c.familia === undefined)).toBe(true);
  });

  it("cartera añade una columna por balde, detrás de las del descriptor", () => {
    const cols = columnasDetalleModulo(CAR, ["Corriente", "De 1 a 90"]);
    expect(cols).toHaveLength(CAR.columnas.length + 2);
    expect(cols.slice(-2).map((c) => c.etiqueta)).toEqual(["Corriente", "De 1 a 90"]);
    expect(cols.slice(-2).every((c) => c.tipo === "moneda")).toBe(true);
  });

  it("cada balde sabe de dónde leer su importe", () => {
    const balde = columnasDetalleModulo(CAR, ["De 1 a 90"]).at(-1)!;
    expect(balde.familia).toEqual({ clave: CLAVE_EDADES, etiqueta: "De 1 a 90" });
  });

  it("el nombre del balde no puede chocar con un rol del descriptor", () => {
    const cols = columnasDetalleModulo(CAR, ["total", "nit"]);
    const roles = new Set(CAR.columnas.map((c) => c.nombre));
    expect(cols.filter((c) => c.familia).every((c) => !roles.has(c.nombre))).toBe(true);
    expect(new Set(cols.map((c) => c.nombre)).size).toBe(cols.length);
  });

  it("un cargue de cartera sin rangos se ve como antes", () => {
    expect(columnasDetalleModulo(CAR, []).map((c) => c.nombre))
      .toEqual(CAR.columnas.map((c) => c.nombre));
  });
});
