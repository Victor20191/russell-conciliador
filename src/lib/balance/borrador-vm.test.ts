import { describe, expect, it } from "vitest";
import type { FilaBorrador } from "./borrador";
import { construirVistaBorrador, resolverTotalesClaseArchivo, resolverTotalesPyGArchivo } from "./borrador-vm";

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

// Pie de subtotal del ERP: la etiqueta viaja en la COLUMNA DE CÓDIGO y la fila no tiene
// código numérico. Es el layout «summary-below» de SUPER TECHOS COLOMBIA.
function pie(filaNum: number, etiqueta: string, saldoFinal: number, omitida?: boolean): FilaBorrador {
  return {
    filaNum, codigo: "", codigoCrudo: etiqueta, nombre: etiqueta.replace(/\s+/g, ""),
    nivel: null, tipoFila: "total", saldoInicial: saldoFinal, debitos: 0, creditos: 0, saldoFinal,
    ...(omitida === undefined ? {} : { omitida }),
  };
}

describe("resolverTotalesClaseArchivo", () => {
  it("lee el total de la clase del pie rotulado cuando el encabezado viene en cero", () => {
    // El ERP abre el grupo sin totales y lo cierra con el subtotal: por eso
    // `totalArchivo("1")` devolvía 0 —no null— y la tarjeta marcaba descuadre falso.
    const r = resolverTotalesClaseArchivo([
      fila(1, "1", "1", 0),
      fila(2, "1105", "CAJA", 0),
      fila(3, "110505", "CAJA GENERAL", 400, "movimiento"),
      pie(4, "TOTAL CAJA", 400),
      pie(5, "TOTAL ACTIVO", 400),
    ]);
    expect(r?.activo).toBe(400);
  });

  it("devuelve null sin pies rotulados: el camino por dígito queda intacto", () => {
    expect(resolverTotalesClaseArchivo([
      fila(1, "1", "ACTIVO", 400),
      fila(2, "110505", "CAJA GENERAL", 400, "movimiento"),
    ])).toBeNull();
  });

  it("suma costos de ventas (6) y de producción (7) aunque el rótulo no sea exacto", () => {
    // El archivo real cierra la clase 7 como «TOTAL COSTOS DE PRODUCCIÓN O DE OPERACIÓN»:
    // exigir el nombre exacto de la clase la perdería y costos quedaría a la mitad.
    const r = resolverTotalesClaseArchivo([
      fila(1, "6", "6", 0),
      fila(2, "613500", "COMERCIO", 89, "movimiento"),
      pie(3, "TOTAL COSTOS DE VENTAS", 89),
      fila(4, "7", "7", 0),
      fila(5, "710501", "MATERIAS PRIMAS", 188, "movimiento"),
      pie(6, "TOTAL COSTOS DE PRODUCCIÓN O DE OPERACIÓN", 188),
    ]);
    expect(r?.costos).toBe(277);
  });

  it("ignora los subtotales intermedios: gana el último pie que cierra la clase", () => {
    // En el archivo real hay seis «TOTAL GASTOS …» antes del «TOTAL GASTOS» verdadero.
    const r = resolverTotalesClaseArchivo([
      fila(1, "5", "5", 0),
      fila(2, "5105", "GASTOS DE PERSONAL", 0),
      fila(3, "510506", "SUELDOS", 200, "movimiento"),
      pie(4, "TOTAL GASTOS DE PERSONAL", 200),
      fila(5, "5115", "IMPUESTOS", 0),
      fila(6, "511505", "INDUSTRIA Y COMERCIO", 50, "movimiento"),
      pie(7, "TOTAL GASTOS LEGALES", 50),
      pie(8, "TOTAL GASTOS", 250),
    ]);
    expect(r?.gastos).toBe(250);
  });

  it("no confunde un pie de otra clase que menciona la palabra ajena", () => {
    // «TOTAL COSTOS Y GASTOS POR PAGAR» vive dentro del pasivo en el archivo real.
    const r = resolverTotalesClaseArchivo([
      fila(1, "2", "2", 0),
      fila(2, "233595", "COSTOS Y GASTOS POR PAGAR", 170, "movimiento"),
      pie(3, "TOTAL COSTOS Y GASTOS POR PAGAR", 170),
      pie(4, "TOTAL PASIVO", 170),
    ]);
    expect(r?.pasivo).toBe(170);
    expect(r?.gastos).toBeNull();
    expect(r?.costos).toBeNull();
  });

  it("descarta «TOTAL PASIVO Y PATRIMONIO»: abre con pasivo pero suma dos clases", () => {
    const r = resolverTotalesClaseArchivo([
      fila(1, "2", "2", 0),
      fila(2, "220505", "PROVEEDORES", 300, "movimiento"),
      pie(3, "TOTAL PASIVO", 300),
      pie(4, "TOTAL PASIVO Y PATRIMONIO", 900),
    ]);
    expect(r?.pasivo).toBe(300);
  });

  it("respeta un pie que el usuario omitió a mano", () => {
    const r = resolverTotalesClaseArchivo([
      fila(1, "1", "1", 0),
      fila(2, "110505", "CAJA GENERAL", 400, "movimiento"),
      pie(3, "TOTAL ACTIVO", 400, true),
    ]);
    expect(r).toBeNull();
  });

  it("las tarjetas por clase cuadran en un layout summary-below completo", () => {
    const vista = construirVistaBorrador([
      fila(1, "1", "1", 0),
      fila(2, "110505", "CAJA GENERAL", 1000, "movimiento"),
      pie(3, "TOTAL ACTIVO", 1000),
      fila(4, "2", "2", 0),
      fila(5, "220505", "PROVEEDORES", -600, "movimiento"),
      pie(6, "TOTAL PASIVO", -600),
      fila(7, "3", "3", 0),
      fila(8, "310505", "CAPITAL", -400, "movimiento"),
      pie(9, "TOTAL PATRIMONIO", -400),
    ]);
    expect(vista.validacion.activoArchivo).toBe(1000);
    expect(vista.validacion.activoCuadra).toBe(true);
    expect(vista.validacion.pasivoCuadra).toBe(true);
    expect(vista.validacion.patrimonioCuadra).toBe(true);
  });
});
