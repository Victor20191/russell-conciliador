import { describe, it, expect } from "vitest";
import { filaEnCero, promoverStaging, consolidarPorClasificador, esImputable, type FilaStagingModulo } from "./promocion";

describe("filaEnCero + promoción excluye renglones en cero", () => {
  it("detecta el renglón con todas las columnas numéricas en 0", () => {
    expect(filaEnCero({ cantidad: 0, valorUnitario: 0, valorTotal: 0, referencia: "0000095" }, ["cantidad", "valorUnitario", "valorTotal"])).toBe(true);
    expect(filaEnCero({ cantidad: 0, valorUnitario: 0, valorTotal: 5, referencia: "X" }, ["cantidad", "valorUnitario", "valorTotal"])).toBe(false);
  });

  it("promoverStaging NO lleva al definitivo los renglones en cero", () => {
    const filas: FilaStagingModulo[] = [
      { filaNum: 4, clasificador: "A", valor: 1000, datos: { cantidad: 5, valorTotal: 1000 }, tipoFila: "movimiento", omitida: null },
      { filaNum: 5, clasificador: "A", valor: 0, datos: { cantidad: 0, valorTotal: 0 }, tipoFila: "movimiento", omitida: null },
    ];
    const r = promoverStaging(filas, ["cantidad", "valorTotal"]);
    expect(r.filas).toBe(1);
    expect(r.detalle.map((d) => d.filaNum)).toEqual([4]);
  });
});

const fila = (filaNum: number, clasificador: string | null, valor: number, tipoFila = "movimiento", omitida: boolean | null = null): FilaStagingModulo => ({ filaNum, clasificador, valor, datos: {}, tipoFila, omitida });

describe("esImputable", () => {
  it("solo movimiento NO omitido (rescatada sí cuenta)", () => {
    expect(esImputable({ tipoFila: "movimiento", omitida: null })).toBe(true);
    expect(esImputable({ tipoFila: "movimiento", omitida: false })).toBe(true); // rescatada
    expect(esImputable({ tipoFila: "movimiento", omitida: true })).toBe(false);
    expect(esImputable({ tipoFila: "agrupadora", omitida: null })).toBe(false);
  });
});

describe("esImputable · el valor manda sobre las columnas del descriptor", () => {
  const base = { filaNum: 1, clasificador: "130505", datos: {}, tipoFila: "movimiento", omitida: null };

  it("imputa una fila cuyo importe NO vive en ninguna columna numérica del descriptor", () => {
    // Caso real: en un reporte de cartera de SIESA, 7.908 de 10.131 documentos traen la
    // columna «Total» en cero porque su importe está en el balde de vencimiento. Mirando
    // solo las columnas del descriptor se descartaban en silencio.
    const fila = { ...base, valor: 2_500_000, datos: { total: 0, diasVencidos: 0 } };
    expect(esImputable(fila, ["total", "diasVencidos"])).toBe(true);
  });

  it("sigue descartando la fila que de verdad está en cero", () => {
    const fila = { ...base, valor: 0, datos: { total: 0, diasVencidos: 0 } };
    expect(esImputable(fila, ["total", "diasVencidos"])).toBe(false);
  });

  it("un valor negativo imputa: un anticipo es un saldo, no una fila vacía", () => {
    const fila = { ...base, valor: -180_000, datos: { total: -180_000 } };
    expect(esImputable(fila, ["total"])).toBe(true);
  });
});

describe("promoverStaging", () => {
  it("toma solo imputables, suma el total y arma el detalle", () => {
    const r = promoverStaging([
      fila(1, "MP", 100),
      fila(2, "MP", 50, "movimiento", true), // omitida → fuera
      fila(3, "MP", 999, "agrupadora"), // subtotal → fuera
      fila(4, "PT", 200),
    ]);
    expect(r.filas).toBe(2);
    expect(r.total).toBe(300);
    expect(r.detalle.map((d) => d.filaNum)).toEqual([1, 4]);
  });
});

describe("consolidarPorClasificador", () => {
  it("suma por clasificador, excluye agrupadoras y ordena por magnitud", () => {
    const r = consolidarPorClasificador([
      { clasificador: "MP", valor: 100 },
      { clasificador: "MP", valor: 50 },
      { clasificador: "PT", valor: 300 },
      { clasificador: "MP", valor: 999, tipoFila: "agrupadora" }, // excluida
      { clasificador: null, valor: 10 },
    ]);
    expect(r).toEqual([
      { clasificador: "PT", total: 300, filas: 1 },
      { clasificador: "MP", total: 150, filas: 2 },
      { clasificador: "(sin clasificar)", total: 10, filas: 1 },
    ]);
  });
});

describe("consolidarPorClasificador · filas total", () => {
  it("NO cuenta las filas `total` (subtotales del archivo): solo suman los movimientos", () => {
    const c = consolidarPorClasificador([
      { clasificador: "A", valor: 100, tipoFila: "movimiento" },
      { clasificador: "A", valor: 200, tipoFila: "movimiento" },
      { clasificador: "A", valor: 300, tipoFila: "total" },
    ]);
    expect(c).toEqual([{ clasificador: "A", total: 300, filas: 2 }]);
  });
});

it("consolidarPorClasificador por agrupador (Nómina): un concepto en dos centros son dos renglones", () => {
  const r = consolidarPorClasificador(
    [
      { clasificador: "1", valor: 100, agrupador: "GYA" },
      { clasificador: "1", valor: 50, agrupador: "MOD" },
      { clasificador: "1", valor: 25, agrupador: "GYA" },
      { clasificador: "2", valor: 10, agrupador: null },
      { clasificador: "2", valor: 5, tipoFila: "total", agrupador: "" },
    ],
    { porAgrupador: true },
  );
  expect(r).toEqual([
    { clasificador: "1 ∥ GYA", total: 125, filas: 2, codigo: "1", agrupador: "GYA" },
    { clasificador: "1 ∥ MOD", total: 50, filas: 1, codigo: "1", agrupador: "MOD" },
    { clasificador: "2", total: 10, filas: 1, codigo: "2", agrupador: "" },
  ]);
  // Sin la opción, el agrupador se ignora (los demás módulos no cambian).
  expect(consolidarPorClasificador([{ clasificador: "1", valor: 1, agrupador: "GYA" }, { clasificador: "1", valor: 1, agrupador: "MOD" }])).toEqual([{ clasificador: "1", total: 2, filas: 2 }]);
});
