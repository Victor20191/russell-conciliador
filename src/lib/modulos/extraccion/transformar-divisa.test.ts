import { describe, expect, it } from "vitest";
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import { descriptorModulo } from "../descriptores";
import type { SpecModulo } from "./esquema";
import { sugerirSpec } from "./sugerir";
import { transformarModulo } from "./transformar";

// Importes en divisa: se concilia en pesos con la TRM de cierre del cargue (D3 de Cartera), y la
// divisa queda en la fila como constancia de lo que decía el archivo.

const CAR = descriptorModulo("CAR")!;
const CXP = descriptorModulo("CXP")!;
const movimientos = (r: ReturnType<typeof transformarModulo>) => r.filas.filter((f) => f.tipoFila === "movimiento" && !f.omitida);

describe("hoja entera en divisa (hoja «USD» de Plasmar)", () => {
  const hojaUsd: GridHoja = {
    nombre: "USD",
    filas: [
      ["Cliente", "Nombre_Cliente", "Documento", "F_Vencim", "DiasVc", "Saldo", "TC"],
      ["1792714613001", "CLIENTE EXTERIOR", "197984", "2026-01-09", -9, 5142.67, 3913.24],
      ["1792714613001", "CLIENTE EXTERIOR", "198139", "2026-01-22", -22, 9737.16, 3888.76],
    ],
  };

  it("el sugeridor la declara en USD y del exterior", () => {
    expect(sugerirSpec(CAR, hojaUsd)).toMatchObject({ monedaArchivo: "USD", origenCartera: "exterior" });
  });

  it("con la TRM de cierre convierte a pesos y deja la divisa como constancia", () => {
    const r = transformarModulo(CAR, { ...sugerirSpec(CAR, hojaUsd), trmCierre: 4_000 }, hojaUsd);
    expect(movimientos(r).map((f) => [f.valor, f.saldoDivisa, f.moneda, f.trm])).toEqual([
      [20_570_680, 5142.67, "USD", 4_000],
      [38_948_640, 9737.16, "USD", 4_000],
    ]);
    expect(r.excepciones).toEqual([]);
  });

  it("sin TRM de cierre avisa y no convierte", () => {
    const r = transformarModulo(CAR, sugerirSpec(CAR, hojaUsd), hojaUsd);
    expect(r.excepciones.map((e) => e.mensaje)).toEqual([expect.stringContaining("falta la TRM de cierre")]);
    expect(movimientos(r)[0].saldoDivisa).toBeUndefined();
  });

  it("también convierte las edades y su suma", () => {
    const h: GridHoja = {
      nombre: "USD",
      filas: [
        ["NIT", "Nombre", "Documento", "Corriente", "1 a 30"],
        ["900123456", "ACME", "F-1", 10, 5.5],
      ],
    };
    const [fila] = movimientos(transformarModulo(CAR, { ...sugerirSpec(CAR, h), trmCierre: 4_000 }, h));
    expect(fila).toMatchObject({ valor: 62_000, sumaFamilia: 62_000, saldoDivisa: 15.5 });
    expect(fila.familias?.edades).toEqual({ Corriente: 40_000, "1 a 30": 22_000 });
  });

  it("una hoja «USD» que ya trae la columna en pesos no se declara en divisa", () => {
    const h: GridHoja = { nombre: "USD", filas: [["Proveedor", "Nombre", "Documento", "Saldo USD", "Deuda_Pesos"], ["900123456", "ACME", "F-1", 10, 40_000]] };
    expect(sugerirSpec(CXP, h).monedaArchivo).toBeUndefined();
  });
});

describe("importe con su divisa escrita en la celda (SAP en Redplas)", () => {
  const h: GridHoja = {
    nombre: "MODULO",
    filas: [
      ["Código de proveedor", "Nombre de acreedor", "Nº documento", "Saldo vencido"],
      ["P900123456", "ACME", "F-1", 1000],
      ["P800111222", "BETA", "F-2", "USD (100.00)"],
    ],
  };

  it("con la TRM de cierre se convierte a pesos con su signo", () => {
    const r = transformarModulo(CXP, { ...sugerirSpec(CXP, h), trmCierre: 4_000 }, h);
    expect(movimientos(r).map((f) => [f.valor, f.saldoDivisa ?? null, f.moneda ?? null])).toEqual([[1000, null, null], [-400_000, -100, "USD"]]);
    expect(r.excepciones).toEqual([]);
  });

  it("sin TRM queda como excepción que pide la TRM", () => {
    const r = transformarModulo(CXP, sugerirSpec(CXP, h), h);
    expect(r.excepciones.map((e) => e.mensaje)).toEqual([expect.stringContaining("Indica la TRM de cierre")]);
  });
});

describe("rangos de edades con su divisa escrita (CxP de Redplas, deuda en negativo)", () => {
  const columnasCxp = (mapa: Record<string, number>) => Object.fromEntries(CXP.columnas.map((rol) => [rol.nombre, mapa[rol.nombre] ?? 0]));
  const h: GridHoja = {
    nombre: "MODULO",
    filas: [
      ["Código de proveedor", "Nombre de acreedor", "Tipo", "Nº documento", "Saldo vencido", "0 - 30", "31 - 60", "121+"],
      ["P890900841", "COMFAMA", "AS", 29579, -284700, -284700, null, null],
      ["P890903938", "BANCOLOMBIA SA", "PR", 4106, "USD (27,001.00)", null, "USD (27,001.00)", null],
      ["P890903938", "BANCOLOMBIA SA", "PR", 3701, "USD (27,322.40)", null, null, "USD (27,322.40)"],
    ],
  };
  const spec: SpecModulo = {
    hoja: "MODULO",
    filaEncabezado: 1,
    primeraFilaDatos: 2,
    columnas: columnasCxp({ nit: 1, nombre: 2, tipoDocumento: 3, documento: 4, total: 5 }),
    familias: {
      edades: [
        { columna: 6, etiqueta: "0 - 30", clase: "vencido" },
        { columna: 7, etiqueta: "31 - 60", clase: "vencido" },
        { columna: 8, etiqueta: "121+", clase: "vencido" },
      ],
    },
    invertirSigno: true,
    trmCierre: 3757.08,
  };

  it("el rango se lee como el saldo: con el signo del paréntesis, la convención del archivo y en pesos", () => {
    const r = transformarModulo(CXP, spec, h);
    expect(r.excepciones).toEqual([]);
    const [comfama, giro1, giro2] = movimientos(r);
    // La deuda en pesos del archivo es negativa: se guarda positiva…
    expect(comfama).toMatchObject({ valor: 284_700, sumaFamilia: 284_700 });
    // …y la deuda en dólares, entre paréntesis, también: saldo y rango cuadran en pesos.
    expect(giro1).toMatchObject({ valor: 101_444_917.08, sumaFamilia: 101_444_917.08, valorReportado: 101_444_917.08, saldoDivisa: 27_001, moneda: "USD" });
    expect(giro1.familias?.edades).toEqual({ "0 - 30": 0, "31 - 60": 101_444_917.08, "121+": 0 });
    expect(giro2).toMatchObject({ valor: 102_652_442.59, sumaFamilia: 102_652_442.59, saldoDivisa: 27_322.4 });
  });

  it("sin TRM el rango tampoco se lee como pesos y se avisa", () => {
    const r = transformarModulo(CXP, { ...spec, trmCierre: undefined }, h);
    const [, giro1] = movimientos(r);
    expect(giro1.familias?.edades?.["31 - 60"]).toBe(0);
    expect(r.excepciones.map((e) => e.mensaje)).toContain("Importe en moneda extranjera sin convertir en «31 - 60»: USD (27,001.00). Indica la TRM de cierre para convertirlo a pesos.");
  });

  it("en una hoja que ya está en divisa no convierte dos veces", () => {
    const usd: GridHoja = {
      nombre: "USD",
      filas: [["NIT", "Nombre", "Documento", "Saldo", "1 a 30"], ["900123456", "ACME", "F-1", "USD (10.00)", "USD (10.00)"]],
    };
    const specUsd: SpecModulo = {
      hoja: "USD", filaEncabezado: 1, primeraFilaDatos: 2, monedaArchivo: "USD", trmCierre: 4_000,
      columnas: columnasCxp({ nit: 1, nombre: 2, documento: 3, total: 4 }),
      familias: { edades: [{ columna: 5, etiqueta: "1 a 30", clase: "vencido" }] },
    };
    const [fila] = movimientos(transformarModulo(CXP, specUsd, usd));
    expect(fila).toMatchObject({ valor: -40_000, saldoDivisa: -10, moneda: "USD" });
    expect(fila.familias?.edades).toEqual({ "1 a 30": -40_000 });
  });
});
