import { describe, expect, it } from "vitest";
import type { FilaBorrador } from "./borrador";
import { construirVistaBorrador, resolverTotalesPyGArchivo } from "./borrador-vm";

function fila(
  filaNum: number,
  codigo: string,
  nombre: string,
  saldoFinal: number,
  tipoFila: FilaBorrador["tipoFila"] = "agrupadora",
): FilaBorrador {
  return {
    filaNum,
    codigo,
    codigoCrudo: codigo,
    nombre,
    nivel: codigo.length,
    tipoFila,
    saldoInicial: saldoFinal,
    debitos: 0,
    creditos: 0,
    saldoFinal,
  };
}

describe("resolverTotalesPyGArchivo", () => {
  it("resuelve secciones no-PUC por etiquetas inequívocas y suma otros ingresos/gastos", () => {
    expect(resolverTotalesPyGArchivo([
      fila(1, "4", "Ingresos Operacionales", -100),
      fila(2, "5", "Costos Operacionales", 60),
      fila(3, "6", "Gastos Operacionales", 30),
      fila(4, "7", "Otros Ingresos", -10),
      fila(5, "8", "Otros Gastos", 5),
    ])).toEqual({ ingresos: -110, gastos: 35, costos: 60 });
  });

  it("mantiene el resultado del esquema PUC estándar 4/5/(6+7)", () => {
    expect(resolverTotalesPyGArchivo([
      fila(1, "4", "INGRESOS", -110),
      fila(2, "5", "GASTOS", 35),
      fila(3, "6", "COSTOS DE VENTAS", 40),
      fila(4, "7", "COSTOS DE PRODUCCIÓN", 20),
      fila(5, "8", "CUENTAS DE ORDEN DEUDORAS", 0),
    ])).toEqual({ ingresos: -110, gastos: 35, costos: 60 });
  });

  it("hace fallback si una raíz material es ambigua o falta una categoría", () => {
    expect(resolverTotalesPyGArchivo([
      fila(1, "4", "INGRESOS", -100),
      fila(2, "5", "COSTOS Y GASTOS", 60),
      fila(3, "6", "GASTOS", 30),
    ])).toBeNull();
  });
});

describe("construirVistaBorrador · totales semánticos de P&G", () => {
  it("no crea hallazgos de clase cuando las secciones visuales no usan los números PUC", () => {
    const vista = construirVistaBorrador([
      fila(1, "1", "Activos", 75),
      fila(2, "110101", "Activo", 75, "movimiento"),
      fila(3, "2", "Pasivos", -50),
      fila(4, "220101", "Pasivo", -50, "movimiento"),
      fila(5, "3", "Patrimonio", -10),
      fila(6, "310101", "Patrimonio", -10, "movimiento"),
      fila(7, "4", "Ingresos Operacionales", -100),
      fila(8, "410101", "Ingreso operacional", -100, "movimiento"),
      fila(9, "5", "Costos Operacionales", 60),
      fila(10, "610101", "Costo operacional", 60, "movimiento"),
      fila(11, "6", "Gastos Operacionales", 30),
      fila(12, "510101", "Gasto operacional", 30, "movimiento"),
      fila(13, "7", "Otros Ingresos", -10),
      fila(14, "420101", "Otro ingreso", -10, "movimiento"),
      fila(15, "8", "Otros Gastos", 5),
      fila(16, "520101", "Otro gasto", 5, "movimiento"),
    ]);

    expect(vista.validacion).toMatchObject({
      ingresosArchivo: 110,
      gastosArchivo: 35,
      costosArchivo: 60,
      ingresosCuadra: true,
      gastosCuadra: true,
      costosCuadra: true,
      resultadoCuadra: true,
      ecuacionCuadra: true,
    });
    expect(vista.hallazgos.some((hallazgo) => hallazgo.tipo === "clase")).toBe(false);
    expect(vista.diagnostico.cuadrado).toBe(true);
  });
});
