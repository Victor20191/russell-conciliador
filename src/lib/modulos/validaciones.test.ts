import { describe, it, expect } from "vitest";
import { MODULOS_IMPORT } from "./descriptores";
import { detectarNegativos, detectarDescuadres, esDescuadreProducto } from "./validaciones";

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
