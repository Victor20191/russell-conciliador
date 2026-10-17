import { describe, expect, it } from "vitest";
import { entradasOpcionalesActivos, netoCalculadoActivo, validarActivos } from "./validaciones-activos";

const fila = (filaNum: number, datos: Record<string, unknown>, valor = Number(datos.costo ?? 0)) => ({ filaNum, valor, imputable: true, datos });

describe("costo neto del activo", () => {
  it("costo + adiciones + mejoras + valorización − depreciación − deterioro, con depreciación y deterioro en magnitud", () => {
    expect(netoCalculadoActivo({ costo: 1_000, adiciones: 100, mejoras: 50, valorizacion: 25, depreciacion: -300, deterioro: 75 })).toBe(800);
    expect(netoCalculadoActivo({ costo: 1_000, depreciacion: 300 })).toBe(700);
    // Una desvalorización resta.
    expect(netoCalculadoActivo({ costo: 1_000, valorizacion: -200 })).toBe(800);
    expect(netoCalculadoActivo({})).toBe(0);
  });
});

describe("validarActivos", () => {
  it("lista los activos con costo o neto negativo, una vez por activo", () => {
    const v = validarActivos([
      fila(2, { placa: "A-1", costo: -500 }),
      fila(3, { placa: "A-2", costo: 1_000, depreciacion: 1_200 }),
      fila(4, { placa: "A-3", costo: 1_000, depreciacion: 400 }),
      // El neto del archivo manda sobre el calculado para juzgar el negativo.
      fila(5, { placa: "A-4", costo: 1_000, depreciacion: 400, valorNeto: -10 }),
    ]);
    expect(v.negativos.cantidad).toBe(3);
    expect(v.negativos.filas.map((n) => [n.placa, n.costo, n.neto])).toEqual([
      ["A-1", -500, -500],
      ["A-2", null, -200],
      ["A-4", null, -10],
    ]);
    expect(v.negativos.suma).toBe(-1_210);
  });

  it("no juzga las filas de un archivo de solo depreciación ni las que no cuentan", () => {
    const v = validarActivos([
      fila(2, { placa: "D-1", costo: -800, depreciacion: -800, _soloDepreciacion: 1 }),
      { filaNum: 3, valor: -50, imputable: false, datos: { costo: -50 } },
    ]);
    expect(v.negativos.cantidad).toBe(0);
  });

  it("compara el costo neto del archivo con el calculado (más de un peso de diferencia)", () => {
    const v = validarActivos([
      fila(2, { placa: "A-1", costo: 1_000, depreciacion: 300, valorNeto: 700.5 }),
      fila(3, { placa: "A-2", costo: 1_000, depreciacion: 300, deterioro: 100, valorNeto: 700 }),
    ]);
    expect(v.netoVsCalculado.filas).toEqual([{ filaNum: 3, placa: "A-2", archivo: 700, calculado: 600, diferencia: 100 }]);
  });

  it("depreciación sin costo exige comentario; costo sin depreciación solo informa", () => {
    const soloDep = validarActivos([fila(2, { costo: 300, depreciacion: 300, _soloDepreciacion: 1 }, 300)]);
    expect(soloDep).toMatchObject({ faltaCosto: true, faltaDepreciacion: false });
    const soloCosto = validarActivos([fila(2, { costo: 1_000 })]);
    expect(soloCosto).toMatchObject({ faltaCosto: false, faltaDepreciacion: true });
    const ambos = validarActivos([fila(2, { costo: 1_000, depreciacion: 300 })]);
    expect(ambos).toMatchObject({ faltaCosto: false, faltaDepreciacion: false });
  });
});

describe("entradasOpcionalesActivos", () => {
  const cuentas = new Map([["MAQUINARIA", ["1520"]]]);
  const sumaAlCosto = [
    { rol: "adiciones", etiqueta: "adiciones" },
    { rol: "mejoras", etiqueta: "mejoras" },
    { rol: "valorizacion", etiqueta: "valorización" },
  ];

  it("adiciones, mejoras y valorización van a las cuentas del activo; el deterioro a la correctora, en negativo", () => {
    const entradas = entradasOpcionalesActivos({
      detalles: [
        { clasificador: "MAQUINARIA", datos: { costo: 1_000, adiciones: 100, mejoras: 40, deterioro: 30 } },
        { clasificador: "MAQUINARIA", datos: { costo: 500, adiciones: 10, deterioro: -20 } },
        // Sin cuenta asignada: la adición va al saldo sin cuenta, como el costo.
        { clasificador: "OTROS", datos: { costo: 50, valorizacion: 5 } },
        // Lo que no cuenta y las filas de solo depreciación no entran.
        { clasificador: "MAQUINARIA", imputable: false, datos: { adiciones: 999 } },
        { clasificador: "MAQUINARIA", datos: { adiciones: 777, _soloDepreciacion: 1 } },
      ],
      cuentasPorClasificador: cuentas,
      sumaAlCosto,
      correctora: { rol: "deterioro", etiqueta: "deterioro", clave: "1599" },
    });
    expect(entradas).toEqual([
      { clasificador: "MAQUINARIA · adiciones", total: 110, cuentas4: ["1520"] },
      { clasificador: "MAQUINARIA · deterioro", total: -50, cuentas4: ["1599"] },
      { clasificador: "MAQUINARIA · mejoras", total: 40, cuentas4: ["1520"] },
      { clasificador: "OTROS · valorización", total: 5, cuentas4: [] },
    ]);
  });

  it("sin el renglón de la correctora en la cédula, el deterioro va al saldo sin cuenta", () => {
    const entradas = entradasOpcionalesActivos({
      detalles: [{ clasificador: "MAQUINARIA", datos: { deterioro: 30 } }],
      cuentasPorClasificador: cuentas,
      sumaAlCosto,
      correctora: { rol: "deterioro", etiqueta: "deterioro", clave: null },
    });
    expect(entradas).toEqual([{ clasificador: "MAQUINARIA · deterioro", total: -30, cuentas4: [] }]);
  });
});
