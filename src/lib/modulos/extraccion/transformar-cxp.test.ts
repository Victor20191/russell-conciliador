import { describe, expect, it } from "vitest";
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import { compararSaldosTercero, materializarSaldosTercero } from "../cartera/saldos-tercero";
import { descriptorModulo } from "../descriptores";
import { sugerirSpec } from "./sugerir";
import { transformarModulo } from "./transformar";

// Cuentas por Pagar sobre el motor de Cartera: lo que cambia es de dónde sale el valor, el
// signo con que llega y el saldo del proveedor que SIIGO imprime una sola vez por bloque.

const CXP = descriptorModulo("CXP")!;
const CAR = descriptorModulo("CAR")!;
const hoja = (filas: (string | number | null)[][]): GridHoja => ({ nombre: "Hoja1", filas });
const leer = (h: GridHoja) => transformarModulo(CXP, sugerirSpec(CXP, h), h);
const movimientos = (r: ReturnType<typeof transformarModulo>) => r.filas.filter((f) => f.tipoFila === "movimiento");

describe("CxP · manda el saldo de la columna (D2)", () => {
  it("un documento por vencer sin edad conserva su saldo, y si edades y saldo difieren manda el saldo", () => {
    const h = hoja([
      ["NIT", "Nombre", "Documento", "Saldo", "0 - 30", "31 - 60"],
      ["900123456", "ACME", "F-1", 1000, 1000, null],
      ["900123456", "ACME", "F-2", 500, null, null],
      ["800111222", "BETA", "F-3", 300, null, 300],
      ["800111222", "BETA", "F-4", 200, 150, 0],
    ]);
    expect(movimientos(leer(h)).map((f) => f.valor)).toEqual([1000, 500, 300, 200]);
  });

  it("sin columna de saldo, el valor son las edades", () => {
    const h = hoja([
      ["NIT", "Nombre", "Documento", "Corriente", "De 1 a 30"],
      ["900123456", "ACME", "F-1", 100, 50],
      ["800111222", "BETA", "F-2", null, 70],
    ]);
    expect(movimientos(leer(h)).map((f) => f.valor)).toEqual([150, 70]);
  });

  it("con «TOTAL» y «SALDO» (SEVEN), el valor es lo pendiente y no el valor original", () => {
    const h = hoja([
      ["T.OP", "NRO FACT", "NIT", "TOTAL", "SALDO", "SIN VENCER"],
      ["FC", "F-1", "900123456", 5000, 1200, 1200],
      ["FC", "F-2", "800111222", 800, 800, 800],
    ]);
    const spec = sugerirSpec(CXP, h);
    expect(spec.columnas.total).toBe(5);
    expect(movimientos(transformarModulo(CXP, spec, h)).map((f) => f.valor)).toEqual([1200, 800]);
  });
});

describe("CxP · convención de signo del archivo", () => {
  const filas: (string | number | null)[][] = [
    ["NIT", "Nombre", "Documento", "Saldo vencido", "0 - 30"],
    ["900123456", "ACME", "F-1", -1000, -1000],
    ["900123456", "ACME", "F-2", -500, -500],
    ["800111222", "BETA", "F-3", -300, -300],
    ["800111222", "BETA", "AN-1", 200, 200],
  ];

  it("el sugeridor propone invertir cuando la deuda viene en negativo (SAP)", () => {
    expect(sugerirSpec(CXP, hoja(filas)).invertirSigno).toBe(true);
  });

  it("invertido: deuda +, anticipo −, en el valor y en las edades", () => {
    const r = leer(hoja(filas));
    expect(movimientos(r).map((f) => f.valor)).toEqual([1000, 500, 300, -200]);
    expect(movimientos(r)[0].familias?.edades).toEqual({ "0 - 30": 1000 });
  });

  it("un archivo con la deuda en positivo no se invierte", () => {
    const positivo = filas.map((f, i) => (i === 0 ? f : f.map((c) => (typeof c === "number" ? -c : c))));
    expect(sugerirSpec(CXP, hoja(positivo)).invertirSigno).toBeUndefined();
  });

  it("Cartera nunca propone invertir", () => {
    expect(sugerirSpec(CAR, hoja(filas)).invertirSigno).toBeUndefined();
  });
});

describe("CxP · saldo del proveedor en la primera fila del bloque (SIIGO)", () => {
  const siigo = () => hoja([
    ["CTA", "TERCERO", "NOMBRE", "SALDO", "COMPROBANTE", "<== 90-", "0 ==>"],
    ["22050501", "900123456", "ACME", 1500, "FC-1", 1000, null],
    ["22050501", "900123456", "ACME", null, "FC-2", null, 500],
    ["22050501", "800111222", "BETA", 700, "FC-3", 300, null],
    ["22050501", "800111222", "BETA", null, "FC-4", null, 400],
    ["22050501", "700333444", "GAMA", 250, "FC-5", 250, null],
    ["22050501", "600555666", "DELTA", 1000, "FC-6", 400, null],
    ["22050501", "600555666", "DELTA", null, "FC-7", 500, null],
    ["22050501", "600555666", "DELTA", null, "FC-8", null, 100],
  ]);

  it("el sugeridor lo lleva al rol de control, no al valor", () => {
    const spec = sugerirSpec(CXP, siigo());
    expect(spec.columnas.saldoTercero).toBe(4);
    expect(spec.columnas.total).toBe(0);
  });

  it("cada documento vale sus edades y el control del proveedor cuadra", () => {
    const r = leer(siigo());
    const docs = movimientos(r);
    expect(docs.map((f) => f.valor)).toEqual([1000, 500, 300, 400, 250, 400, 500, 100]);
    const { saldos } = materializarSaldosTercero(
      docs.map((f) => ({
        filaNum: f.filaNum, valor: f.valor, imputable: true, nivel: "documento" as const,
        saldoDeclarado: f.saldoDeclarado ?? null, nit: f.datos.nit, nombre: f.datos.nombre,
        cuentaCliente: typeof f.datos.cuenta === "string" ? f.datos.cuenta : null,
      })),
      { loteId: "L", nivelImputable: "documento" },
    );
    const control = compararSaldosTercero(saldos);
    expect(control.totales.declarado).toBe(3450);
    expect(control.conDiferencia).toBe(0);
  });
});

describe("CxP · importes en moneda extranjera escritos como texto", () => {
  it("se avisan y no se leen como pesos", () => {
    const r = leer(hoja([
      ["NIT", "Nombre", "Documento", "Saldo"],
      ["900123456", "ACME", "F-1", 1000],
      ["900123456", "ACME", "F-2", "USD (54,323.40)"],
      ["800111222", "BETA", "F-3", 300],
    ]));
    expect(r.excepciones.some((e) => e.mensaje.includes("USD (54,323.40)"))).toBe(true);
    expect(movimientos(r).map((f) => f.valor)).not.toContain(54323.4);
    expect(movimientos(r).map((f) => f.valor)).not.toContain(-54323.4);
  });
});

describe("CxP · encabezado bajo filas de metadatos (SIESA)", () => {
  it("las filas «Rótulo: valor» no le ganan al encabezado real", () => {
    const h = hoja([
      ["Reporte de estado de cuenta", null, null, null],
      ["Fecha de corte:", "31/12/2025", "Tipo reporte:", "Vencido y corriente"],
      ["Vencimiento en:", "Fecha de vencimiento", "Cifras:", "PESOS", "Moneda:", "COP-PESOS"],
      ["Código", "Descripción", "#Ter.", "Saldo"],
      ["800161633", "CONSTRUCTORA", null, 100],
    ]);
    const spec = sugerirSpec(CXP, h);
    expect(spec.filaEncabezado).toBe(4);
    expect(spec.columnas).toMatchObject({ nit: 1, marcaSeccion: 3, total: 4 });
  });
});

describe("CxP · un resumen por proveedor no es un saldo de bloque", () => {
  it("edades que se compensan en cero no cuentan como documentos sin saldo (Mineralin)", () => {
    const filas: (string | number | null)[][] = [["Código", "Nombre", "Corriente", "De 1 a 90", "Total"]];
    for (let i = 0; i < 6; i++) filas.push([String(900000000 + i), "P" + i, -300, 300, 0]);
    for (let i = 0; i < 6; i++) filas.push([String(800000000 + i), "Q" + i, 100, 50, 150]);
    const spec = sugerirSpec(CXP, hoja(filas));
    expect(spec.columnas.total).toBe(5);
    expect(spec.columnas.saldoTercero).toBe(0);
  });
});

describe("CxP · SAP con muchos documentos por proveedor sigue siendo jerárquico (Redplas)", () => {
  it("con pocas cabeceras y ninguna fila con identificador y documento, el modo es cabecera", () => {
    const filas: (string | number | null)[][] = [["Código de proveedor", "Nombre de acreedor", "Tipo", "Documento", "Saldo vencido"]];
    for (const [codigo, nombre] of [["P900123456", "ACME"], ["P800111222", "BETA"], ["P700333444", "GAMA"]]) {
      filas.push([codigo, nombre, null, null, -1000]);
      for (let i = 0; i < 10; i++) filas.push([null, null, "TT", String(1000 + i), -100]);
    }
    const h = hoja(filas);
    const spec = sugerirSpec(CXP, h);
    expect(spec.terceroModo).toBe("cabecera");
    const r = transformarModulo(CXP, spec, h);
    expect(movimientos(r)).toHaveLength(30);
    expect(movimientos(r).reduce((s, f) => s + f.valor, 0)).toBe(3000);
  });
});

describe("CxP · una factura en negrita sigue siendo una factura (PLASMAR)", () => {
  it("la negrita no degrada una fila con su propio documento", () => {
    const filas: (string | number | null)[][] = [
      ["PROVEEDOR", "NOMBRE PROVEEDOR", "Documento", "Deuda_Pesos"],
      ["900123456", "ACME", "FI-1", 1000],
      ["900123456", "ACME", "FI-2", 500],
      ["Total 900123456", "ACME", null, 1500],
      ["800111222", "BETA", "NC-9", -200],
    ];
    const negrita = [[], [false, false, false, false], [true, true, true, true], [true, true, true, true], [false, false, false, false]];
    const h: GridHoja = { nombre: "CXP", filas, negrita };
    const r = transformarModulo(CXP, sugerirSpec(CXP, h), h);
    expect(movimientos(r).map((f) => f.valor)).toEqual([1000, 500, -200]);
  });
});

describe("CxP · fila rotulada de proveedor (SEVEN)", () => {
  const seven = () => hoja([
    ["T.OP", "NRO", "NRO FACT", "CUENTA", "FECHA", "TOTAL", "F.VENC", "D.M.", "SALDO", "SIN VENCER"],
    ["PROVEEDOR", "10126963", "HERNAN OROZCO"],
    [1181, 4630, "90146", "233525", "2025-12-30", 2256271, "2026-01-29", 0, 2256271, 2256271],
    [1181, 4624, "90147", "233525", "2025-12-30", 5132397, "2026-01-29", 0, 5132397, 5132397],
    ["TOTAL PROVEEDOR", "HERNAN OROZCO", 7388668, 7388668, 0, 0, 0, 0, 0, 0],
    ["PROVEEDOR", "1015422627", "DANIEL ROBAYO"],
    [1194, 4592, "89955", "23359501", "2025-12-29", 7108808, "2026-01-01", 0, 7108808, 7108808],
    ["TOTAL PROVEEDOR", "DANIEL ROBAYO", 7108808, 7108808, 0, 0, 0, 0, 0, 0],
    ["PROVEEDOR", "1017130374", "SANTIAGO SALAS"],
    [1262, 4561, "2", "233525", "2025-12-23", 100000, "2026-01-22", 0, 100000, 100000],
    ["PROVEEDOR", "1017241965", "MARIA VELEZ"],
    [1300, 4700, "3", "233525", "2025-12-23", 50000, "2026-01-22", 0, 50000, 50000],
    ["PROVEEDOR", "1017241966", "JUAN PEREZ"],
    [1301, 4701, "4", "233525", "2025-12-23", 60000, "2026-01-22", 0, 60000, 60000],
  ]);

  it("el sugeridor reconoce el rótulo y toma el NIT de la columna contigua", () => {
    const spec = sugerirSpec(CXP, seven());
    expect(spec.filaTercero).toEqual({ columnaRotulo: 1, texto: "PROVEEDOR", columnaClave: 2, columnaNombre: 3 });
    expect(spec.terceroModo).toBe("cabecera");
    expect(spec.columnas.nit).toBe(2);
    expect(spec.columnas.total).toBe(9);
  });

  it("cada documento queda con el NIT de su proveedor y el consecutivo no se toma por NIT", () => {
    const r = transformarModulo(CXP, sugerirSpec(CXP, seven()), seven());
    const docs = movimientos(r).filter((f) => f.valor !== 0);
    expect(docs.map((f) => [f.datos.nit, f.valor])).toEqual([
      ["10126963", 2256271], ["10126963", 5132397], ["1015422627", 7108808],
      ["1017130374", 100000], ["1017241965", 50000], ["1017241966", 60000],
    ]);
    const cabeceras = r.filas.filter((f) => f.motivo === "subtotal_tercero:cabecera");
    expect(cabeceras).toHaveLength(5);
    expect(cabeceras.every((f) => f.saldoDeclarado === undefined)).toBe(true);
  });
});

