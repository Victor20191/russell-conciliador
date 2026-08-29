import { describe, it, expect } from "vitest";
import { detectarFilasTotalizadoras, MINIMO_FILAS_TOTALIZADORA } from "./fila-totalizadora";

const fila = (filaNum: number, valor: number) => ({ filaNum, valor });

describe("detectarFilasTotalizadoras", () => {
  it("no avisa cuando ninguna fila equivale a la suma de las demás", () => {
    expect(detectarFilasTotalizadoras([fila(1, 100), fila(2, 250), fila(3, 75), fila(4, 40)])).toEqual([]);
  });

  it("detecta el renglón de gran total imputado como ítem", () => {
    const r = detectarFilasTotalizadoras([fila(1, 100), fila(2, 250), fila(3, 50), fila(4, 400)]);
    expect(r).toHaveLength(1);
    expect(r[0].filaNum).toBe(4);
    expect(r[0].valor).toBe(400);
    expect(r[0].resto).toBe(400);
    expect(r[0].diferencia).toBe(0);
  });

  it("tolera el descuadre de redondeo del propio archivo (dentro del 1 %)", () => {
    // El total declarado no cuadra al centavo con la suma de las líneas: aun así es el total.
    const r = detectarFilasTotalizadoras([fila(1, 100), fila(2, 250), fila(3, 50), fila(4, 402)]);
    expect(r.map((h) => h.filaNum)).toEqual([4]);
    expect(r[0].diferencia).toBe(2);
  });

  it("no avisa si el descuadre supera la tolerancia", () => {
    expect(detectarFilasTotalizadoras([fila(1, 100), fila(2, 250), fila(3, 50), fila(4, 450)])).toEqual([]);
  });

  it("caso real: gran total del inventario de autopartes (25.308 filas, desfase de 126.059,81)", () => {
    // 25.307 ítems que suman 12.012.557.146,74 + el gran total del ERP 12.012.431.086,93.
    const items = Array.from({ length: MINIMO_FILAS_TOTALIZADORA }, (_, i) => fila(i + 1, 12_012_557_146.74 / MINIMO_FILAS_TOTALIZADORA));
    const r = detectarFilasTotalizadoras([...items, fila(25_309, 12_012_431_086.93)]);
    expect(r.map((h) => h.filaNum)).toEqual([25_309]);
  });

  it("ignora las filas en cero (coincidirían con cualquier resto en cero)", () => {
    expect(detectarFilasTotalizadoras([fila(1, 0), fila(2, 0), fila(3, 0)])).toEqual([]);
  });

  it("no avisa por debajo del mínimo de filas", () => {
    // Dos filas iguales siempre «coinciden»: sin contexto suficiente no es una señal.
    expect(detectarFilasTotalizadoras([fila(1, 500), fila(2, 500)])).toEqual([]);
  });

  it("respeta los signos: un valor negativo no coincide con un resto positivo", () => {
    expect(detectarFilasTotalizadoras([fila(1, 100), fila(2, 250), fila(3, 50), fila(4, -400)])).toEqual([]);
  });

  it("no confunde filas de igual valor con un total", () => {
    // Cuatro ítems de 200: ninguno equivale a los 600 restantes.
    expect(detectarFilasTotalizadoras([fila(1, 200), fila(2, 200), fila(3, 200), fila(4, 200)])).toEqual([]);
  });

  it("marca las dos filas cuando el archivo repite el gran total", () => {
    const r = detectarFilasTotalizadoras([fila(1, 100), fila(2, 100), fila(3, 0)]);
    expect(r.map((h) => h.filaNum)).toEqual([1, 2]);
  });
});
