import { describe, expect, it } from "vitest";
import { descriptorModulo } from "../descriptores";
import type { SpecModulo } from "../extraccion/esquema";
import { coincidenciaPatron, UMBRAL_COINCIDENCIA_PATRON } from "./coincidencia";

const CXP = descriptorModulo("CXP")!;
const INV = descriptorModulo("INV")!;

const columnasEn = (descriptor: typeof CXP, mapa: Record<string, number>) =>
  Object.fromEntries(descriptor.columnas.map((rol) => [rol.nombre, mapa[rol.nombre] ?? 0]));

// CxP de Mineralin (SIESA): Código en A, #Ter. en H, cinco rangos en J..N y Total en O de la grilla.
const ENCABEZADO_SIESA = ["Código", null, null, null, null, null, null, "#Ter.", null, "Corriente", "De 1 a 90", "De 91 a 180", "De 181 a 360", "De 361 o mas", "Total"];
const SPEC_SIESA: SpecModulo = {
  hoja: "Hoja 1",
  filaEncabezado: 8,
  primeraFilaDatos: 9,
  columnas: columnasEn(CXP, { nit: 1, marcaSeccion: 8, total: 15 }),
  familias: {
    edades: [
      { columna: 10, etiqueta: "Corriente", clase: "corriente" },
      { columna: 11, etiqueta: "De 1 a 90", clase: "vencido" },
      { columna: 12, etiqueta: "De 91 a 180", clase: "vencido" },
      { columna: 13, etiqueta: "De 181 a 360", clase: "vencido" },
      { columna: 14, etiqueta: "De 361 o mas", clase: "vencido" },
    ],
  },
};
const SIESA = { encabezado: ENCABEZADO_SIESA, spec: SPEC_SIESA };

describe("coincidenciaPatron · tipo de formato declarado", () => {
  it("un formato por edades exige que el archivo traiga algún rango", () => {
    const declarado = { encabezado: ENCABEZADO_SIESA, spec: { ...SPEC_SIESA, tipoFormato: "edades" as const } };
    const sinRangos = ["Código", null, null, null, null, null, null, "#Ter.", null, null, null, null, null, null, "Total"];
    // Sin declarar: faltan rótulos pero ninguna columna obligatoria.
    expect(coincidenciaPatron(CXP, SIESA, sinRangos).faltantesRequeridos).toEqual([]);
    expect(coincidenciaPatron(CXP, declarado, sinRangos).faltantesRequeridos).toEqual(["Rangos de vencimiento"]);
    expect(coincidenciaPatron(CXP, declarado, ENCABEZADO_SIESA)).toMatchObject({ faltantesRequeridos: [], elegible: true });
  });

  it("un formato por documento exige la columna del documento", () => {
    const encabezado = ["NIT", "Nombre", "Documento", "Saldo", "Ciudad", "Zona", "Vendedor", "Plazo"];
    const spec: SpecModulo = {
      hoja: "CxP", filaEncabezado: 1, primeraFilaDatos: 2, tipoFormato: "documento",
      columnas: columnasEn(CXP, { nit: 1, nombre: 2, documento: 3, total: 4 }),
    };
    const sinDocumento = ["NIT", "Nombre", "Saldo", "Ciudad", "Zona", "Vendedor", "Plazo"];
    const r = coincidenciaPatron(CXP, { encabezado, spec }, sinDocumento);
    expect(r.faltantesRequeridos).toEqual(["Documento / factura"]);
    expect(r.elegible).toBe(false);
    // En otro módulo el campo no significa nada.
    const inv: SpecModulo = { hoja: "Inv", filaEncabezado: 1, primeraFilaDatos: 2, tipoFormato: "documento", columnas: columnasEn(INV, { tipo: 1, valorTotal: 2 }) };
    expect(coincidenciaPatron(INV, { encabezado: ["Tipo", "Valor total"], spec: inv }, ["Tipo", "Valor total"]).faltantesRequeridos).toEqual([]);
  });
});

describe("coincidenciaPatron", () => {
  it("el mismo encabezado coincide al 100 %", () => {
    const r = coincidenciaPatron(CXP, SIESA, ENCABEZADO_SIESA);
    expect(r).toMatchObject({ porcentaje: 100, faltantes: [], faltantesRequeridos: [], elegible: true });
    expect(r.mapaColumnas[15]).toBe(15);
  });

  it("no le importa la letra: re-mapea las columnas corridas y las mayúsculas o tildes distintas", () => {
    const corrido = [null, null, "CODIGO", null, null, null, null, null, null, "#TER", null, "corriente", "De 1 a 90", "De 91 a 180", "De 181 a 360", "De 361 o mas", "TOTAL "];
    const r = coincidenciaPatron(CXP, SIESA, corrido);
    expect(r.porcentaje).toBe(100);
    expect(r.mapaColumnas).toMatchObject({ 1: 3, 8: 10, 10: 12, 14: 16, 15: 17 });
  });

  it("otros rangos de vencimiento cuentan por cantidad, no por rótulo", () => {
    // Universo: Código, #Ter., cinco rangos y Total, todos leídos (peso 2) = 16. Faltan 2 de un rango.
    const cuatroRangos = ["Código", "#Ter.", "Corriente", "1 - 30 DIAS", "31 - 60 DIAS", "Mas de 60", "Total"];
    const r = coincidenciaPatron(CXP, SIESA, cuatroRangos);
    expect(r.porcentaje).toBe(88);
    expect(r.faltantes).toHaveLength(1);
    expect(r.elegible).toBe(true);
  });

  it("un formato de otro aplicativo no alcanza el umbral", () => {
    const siigo = ["Nit", "Nombre del tercero", "Documento", "Fecha", "Saldo"];
    const r = coincidenciaPatron(CXP, SIESA, siigo);
    expect(r.porcentaje).toBeLessThan(UMBRAL_COINCIDENCIA_PATRON);
    expect(r.elegible).toBe(false);
    expect(r.faltantesRequeridos).toEqual(["NIT / cédula del proveedor"]);
  });

  it("un rótulo repetido se consume en orden", () => {
    const patron = { encabezado: ["Valor", "Valor", "Tipo"], spec: { hoja: "H", filaEncabezado: 1, primeraFilaDatos: 2, columnas: columnasEn(INV, { tipo: 3, valorTotal: 2 }) } };
    // Universo 1 + 2 + 2 = 5; la única «Valor» del archivo se la queda la primera del patrón.
    const r = coincidenciaPatron(INV, patron, ["Tipo", "Valor"]);
    expect(r.porcentaje).toBe(60);
    expect(r.faltantesRequeridos).toEqual(["Valor total"]);
  });

  it("con 80 % exacto es elegible; con una columna obligatoria faltante nunca lo es", () => {
    const encabezado = ["Tipo", "Valor total", "A", "B", "C", "D", "E", "F"];
    const patron = { encabezado, spec: { hoja: "H", filaEncabezado: 1, primeraFilaDatos: 2, columnas: columnasEn(INV, { tipo: 1, valorTotal: 2 }) } };
    const ochenta = coincidenciaPatron(INV, patron, ["Tipo", "Valor total", "A", "B", "C", "D"]);
    expect(ochenta).toMatchObject({ porcentaje: 80, elegible: true });

    const sinValor = coincidenciaPatron(INV, patron, ["Tipo", "A", "B", "C", "D", "E", "F", "Otra"]);
    expect(sinValor).toMatchObject({ porcentaje: 80, elegible: false, faltantesRequeridos: ["Valor total"] });
  });

  it("ubica una columna leída sin rótulo por su vecina, solo si en el archivo también está vacía", () => {
    const patron = { encabezado: ["Código", null, "Total"], spec: { hoja: "H", filaEncabezado: 1, primeraFilaDatos: 2, columnas: columnasEn(CXP, { nit: 1, nombre: 2, total: 3 }) } };
    expect(coincidenciaPatron(CXP, patron, [null, "Código", null, "Total"]).mapaColumnas).toEqual({ 1: 2, 2: 3, 3: 4 });
    expect(coincidenciaPatron(CXP, patron, ["Código", "Otra", "Total"]).mapaColumnas[2]).toBeUndefined();
  });

  it("sin rótulos en el patrón la coincidencia es 0", () => {
    const patron = { encabezado: [null, ""], spec: SPEC_SIESA };
    expect(coincidenciaPatron(CXP, patron, ENCABEZADO_SIESA).porcentaje).toBe(0);
  });
});
