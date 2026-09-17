import { describe, expect, it } from "vitest";
import { descriptorModulo } from "../descriptores";
import type { SpecModulo } from "../extraccion/esquema";
import { normalizarSpecModulo, validarSpecModulo } from "../perfil-modulo";
import {
  faltantesTipoFormato,
  nivelCarteraDeSpec,
  tipoFormatoCartera,
  tipoFormatoSugerido,
} from "./tipo-formato";

const CAR = descriptorModulo("CAR")!;
const CXP = descriptorModulo("CXP")!;
const INV = descriptorModulo("INV")!;
const columnas = (mapa: Record<string, number>) => Object.fromEntries(CAR.columnas.map((rol) => [rol.nombre, mapa[rol.nombre] ?? 0]));
const RANGOS = [
  { columna: 5, etiqueta: "Corriente", clase: "corriente" as const },
  { columna: 6, etiqueta: "De 1 a 30", clase: "vencido" as const },
];
const base = (extra: Partial<SpecModulo> = {}): SpecModulo => ({
  hoja: "Cartera",
  filaEncabezado: 1,
  primeraFilaDatos: 2,
  columnas: columnas({ nit: 1, nombre: 2, total: 7 }),
  ...extra,
});

describe("tipo de formato de cartera", () => {
  it("sin declarar se deduce del nivel y de los rangos de edades", () => {
    expect(tipoFormatoCartera(base({ familias: { edades: RANGOS } }))).toEqual({ tipo: "edades", declarado: false });
    expect(tipoFormatoCartera(base({ columnas: columnas({ nit: 1, documento: 3, total: 7 }) }))).toEqual({ tipo: "documento", declarado: false });
    expect(tipoFormatoSugerido(base({ columnas: columnas({ nit: 1, documento: 3, total: 7 }), familias: { edades: RANGOS } }))).toBe("documento_edades");
    // El nivel declarado a mano manda sobre la columna de documento.
    expect(tipoFormatoSugerido(base({ nivel: "tercero", columnas: columnas({ nit: 1, documento: 3 }) }))).toBe("edades");
    // La antigüedad como rótulo de una columna también cuenta como edades.
    expect(tipoFormatoSugerido(base({ nivel: "documento", edadesModo: "largo", columnas: columnas({ nit: 1, documento: 3, edadEtiqueta: 4 }) }))).toBe("documento_edades");
  });

  it("el tipo declarado manda y fija el nivel", () => {
    const spec = base({ tipoFormato: "edades", nivel: "documento", familias: { edades: RANGOS } });
    expect(tipoFormatoCartera(spec)).toEqual({ tipo: "edades", declarado: true });
    expect(nivelCarteraDeSpec(spec)).toBe("tercero");
    expect(nivelCarteraDeSpec({ tipoFormato: "documento_edades" })).toBe("documento");
    expect(nivelCarteraDeSpec({ columnas: { documento: 0 } })).toBe("tercero");
    const normalizado = normalizarSpecModulo(CAR, spec);
    expect(normalizado).toMatchObject({ tipoFormato: "edades", nivel: "tercero" });
  });

  it("cada tipo exige su columna", () => {
    expect(faltantesTipoFormato(base({ tipoFormato: "documento" }))).toEqual(["El formato por documento necesita la columna del documento."]);
    expect(faltantesTipoFormato(base({ tipoFormato: "edades" }))).toEqual(["El formato por edades necesita los rangos de vencimiento."]);
    expect(faltantesTipoFormato(base({ tipoFormato: "documento_edades" }))).toHaveLength(2);
    expect(faltantesTipoFormato(base({ tipoFormato: "documento_edades", columnas: columnas({ nit: 1, documento: 3, total: 7 }), familias: { edades: RANGOS } }))).toEqual([]);
    // Sin tipo declarado no se exige nada (perfiles y versiones anteriores).
    expect(faltantesTipoFormato(base())).toEqual([]);
  });

  it("la validación del spec lo aplica en Cartera y CxP y lo ignora en los demás módulos", () => {
    const sinRangos = base({ tipoFormato: "edades" });
    expect(validarSpecModulo(CAR, normalizarSpecModulo(CAR, sinRangos))).toBe("El formato por edades necesita los rangos de vencimiento.");
    expect(validarSpecModulo(CXP, normalizarSpecModulo(CXP, sinRangos))).toBe("El formato por edades necesita los rangos de vencimiento.");
    expect(validarSpecModulo(CAR, normalizarSpecModulo(CAR, base({ tipoFormato: "edades", familias: { edades: RANGOS } })))).toBeNull();
    const inventario: SpecModulo = {
      hoja: "Inv", filaEncabezado: 1, primeraFilaDatos: 2,
      columnas: { tipo: 1, valorTotal: 2 }, tipoFormato: "edades",
    };
    const normalizado = normalizarSpecModulo(INV, inventario);
    expect(normalizado.tipoFormato).toBeUndefined();
    expect(validarSpecModulo(INV, normalizado)).toBeNull();
  });
});
