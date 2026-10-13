import { describe, it, expect } from "vitest";
import { MODULOS_IMPORT } from "./descriptores";
import {
  alertasCostoDeFila,
  detectarAlertasCosto,
  detectarDescuadres,
  detectarNegativos,
  esDescuadreProducto,
  resumirAlertasCosto,
} from "./validaciones";

const INV = MODULOS_IMPORT.INV;

describe("detectarNegativos (INV)", () => {
  it("marca existencias y costos negativos en las columnas configuradas", () => {
    const filas = [
      { filaNum: 2, clasificador: "1405", datos: { referencia: "A", cantidad: 10, valorTotal: 1000, valorUnitario: 100 } },
      { filaNum: 3, clasificador: "1405", datos: { referencia: "B", cantidad: -5, valorTotal: 200, valorUnitario: 40 } },
      { filaNum: 4, clasificador: "1430", datos: { referencia: "C", cantidad: 3, valorTotal: -300, valorUnitario: -100 } },
    ];
    const neg = detectarNegativos(INV, filas);
    expect(neg).toHaveLength(3); // fila 3 (cantidad) + fila 4 (valorTotal y valorUnitario)
    expect(neg.map((n) => `${n.filaNum}:${n.campo}`)).toEqual(["3:cantidad", "4:valorUnitario", "4:valorTotal"]);
    expect(neg[0].referencia).toBe("B");
    expect(neg[1].etiqueta).toBe("Valor unitario");
  });

  it("sin negativos → lista vacía", () => {
    const filas = [{ filaNum: 2, clasificador: "1405", datos: { referencia: "A", cantidad: 1, valorTotal: 10, valorUnitario: 10 } }];
    expect(detectarNegativos(INV, filas)).toEqual([]);
  });
});

describe("descuadre valor total vs cantidad × unitario", () => {
  it("ignora el redondeo del unitario a 2 decimales (no es descuadre)", () => {
    // 14727 × 257.05 = 3.785.623,35, pero el total del archivo es 3.785.612,21 (unitario redondeado).
    expect(esDescuadreProducto(3785612.21, 14727, 257.05)).toBe(false);
    const filas = [{ filaNum: 5, clasificador: "IEMPAQUE", datos: { referencia: "0000016", cantidad: 14727, valorUnitario: 257.05, valorTotal: 3785612.21 } }];
    expect(detectarDescuadres(INV, filas)).toEqual([]);
  });

  it("marca descuadre cuando el total no corresponde a cantidad × unitario", () => {
    // 10 × 100 = 1000, pero el total dice 9000 → descuadre.
    expect(esDescuadreProducto(9000, 10, 100)).toBe(true);
    const filas = [{ filaNum: 3, clasificador: "X", datos: { referencia: "R", cantidad: 10, valorUnitario: 100, valorTotal: 9000 } }];
    const d = detectarDescuadres(INV, filas);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ filaNum: 3, referencia: "R", esperado: 1000, declarado: 9000 });
  });

  it("no valida si falta el unitario (unitario = 0 o ausente)", () => {
    const filas = [{ filaNum: 4, clasificador: "X", datos: { referencia: "R", cantidad: 10, valorUnitario: 0, valorTotal: 9999 } }];
    expect(detectarDescuadres(INV, filas)).toEqual([]);
  });
});

describe("alertas de costo (INV)", () => {
  it("costo cero con existencias: cantidad > 0 y costo unitario o valor total en cero", () => {
    expect(alertasCostoDeFila({ cantidad: 5, unitario: 0, total: 0 })).toEqual(["costo_cero_con_existencias"]);
    // Unitario en cero aunque el total traiga valor: el costo de la referencia sigue en cero.
    expect(alertasCostoDeFila({ cantidad: 5, unitario: 0, total: 120 })).toEqual(["costo_cero_con_existencias"]);
    // Sin unitario en el archivo: basta el total en cero (al centavo).
    expect(alertasCostoDeFila({ cantidad: 0.25, unitario: null, total: 0.004 })).toEqual(["costo_cero_con_existencias"]);
    expect(alertasCostoDeFila({ cantidad: 5, unitario: 10, total: 50 })).toEqual([]);
  });

  it("sin existencias y con costo: cantidad escrita en cero y valor total distinto de cero", () => {
    expect(alertasCostoDeFila({ cantidad: 0, unitario: null, total: 3500 })).toEqual(["sin_existencias_con_costo"]);
    expect(alertasCostoDeFila({ cantidad: 0, unitario: 70, total: -3500 })).toEqual(["sin_existencias_con_costo"]);
    // Cantidad vacía: no se sabe si hay existencias.
    expect(alertasCostoDeFila({ cantidad: null, unitario: null, total: 3500 })).toEqual([]);
    // Sin existencias y sin valor: nada que alertar.
    expect(alertasCostoDeFila({ cantidad: 0, unitario: 70, total: 0 })).toEqual([]);
  });

  it("costo unitario 1, al centavo; puede sumarse a «sin existencias»", () => {
    expect(alertasCostoDeFila({ cantidad: 40, unitario: 1, total: 40 })).toEqual(["costo_uno"]);
    expect(alertasCostoDeFila({ cantidad: 40, unitario: 1.004, total: 40.16 })).toEqual(["costo_uno"]);
    expect(alertasCostoDeFila({ cantidad: 40, unitario: 1.01, total: 40.4 })).toEqual([]);
    expect(alertasCostoDeFila({ cantidad: 0, unitario: 1, total: 12 })).toEqual(["sin_existencias_con_costo", "costo_uno"]);
  });

  it("existencias negativas no son «costo cero con existencias» (ya las marca el control de negativos)", () => {
    expect(alertasCostoDeFila({ cantidad: -3, unitario: 0, total: 0 })).toEqual([]);
  });

  it("detectarAlertasCosto lee las columnas del descriptor y conserva la referencia", () => {
    const filas = [
      { filaNum: 2, clasificador: "1435", datos: { referencia: "A", cantidad: 10, valorUnitario: 0, valorTotal: 0 } },
      { filaNum: 3, clasificador: "1435", datos: { referencia: "B", cantidad: 0, valorUnitario: null, valorTotal: "1.500,00" } },
      { filaNum: 4, clasificador: "1435", datos: { referencia: "C", cantidad: 8, valorUnitario: 1, valorTotal: 8 } },
      { filaNum: 5, clasificador: "1435", datos: { referencia: "D", cantidad: 8, valorUnitario: 25, valorTotal: 200 } },
    ];
    const alertas = detectarAlertasCosto(INV, filas);
    expect(alertas.map((a) => `${a.filaNum}:${a.tipo}`)).toEqual([
      "2:costo_cero_con_existencias",
      "3:sin_existencias_con_costo",
      "4:costo_uno",
    ]);
    expect(alertas[1]).toMatchObject({ referencia: "B", cantidad: 0, total: 1500 });
  });

  it("un módulo sin el bloque de alertas de costo no calcula nada", () => {
    const filas = [{ filaNum: 2, clasificador: "1516", datos: { cantidad: 0, valorTotal: 100 } }];
    expect(detectarAlertasCosto(MODULOS_IMPORT.AFI, filas)).toEqual([]);
  });

  it("resumirAlertasCosto cuenta, suma y respeta el orden aunque una alerta esté en cero", () => {
    const resumen = resumirAlertasCosto([
      { tipo: "sin_existencias_con_costo", filaNum: 3, total: 1500 },
      { tipo: "sin_existencias_con_costo", filaNum: 9, total: 250.5 },
      { tipo: "costo_uno", filaNum: 4, total: 8 },
    ]);
    expect(resumen.map((r) => [r.tipo, r.referencias, r.valorTotal, r.filas])).toEqual([
      ["costo_cero_con_existencias", 0, 0, []],
      ["sin_existencias_con_costo", 2, 1750.5, [3, 9]],
      ["costo_uno", 1, 8, [4]],
    ]);
  });
});
