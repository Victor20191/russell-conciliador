import { describe, expect, it } from "vitest";
import { libroRetencion } from "@/lib/export/retencion";
import { periodosRevision, type Formulario350, type Formulario490 } from "../retencion/periodos-revision";
import { faltaDeclaracion, unidadPlural, vistasRevision, vistaConPersonas } from "../retencion/vistas";

const f300 = (id: number, periodo: number, valores: Record<number, number>): Formulario350 & { periodo: number } => ({
  id, periodo, numero: `30066201717${String(id).padStart(2, "0")}`, codigoCorreccion: null, numeroAnterior: null, fechaPresentacion: "2026-03-12", valores,
});
const f490 = (id: number, periodo: number, impuesto: number, sancion = 0): Formulario490 & { periodo: number } => ({
  id, periodo, numero: `49100000000${String(id).padStart(2, "0")}`, concepto: "05", numeroPagado: `30066201717${String(id - 1).padStart(2, "0")}`, fechaPago: "2026-03-12",
  valores: { 34: sancion, 36: impuesto, 980: impuesto + sancion },
});

/** Bimestres 1 y 2 del levantamiento (Vista 1) y el 3 sin cargar. */
const BIM1 = { 28: 151_375_000, 39: 22_639_384_000, 40: 5_435_250_000, 41: 28_226_009_000, 43: 28_226_009_000, 59: 28_761_000, 67: 28_761_000, 82: 28_761_000, 86: 28_761_000, 88: 28_761_000 };
const BIM2 = { 28: 174_244_000, 39: 24_017_299_000, 40: 431_501_000, 41: 24_623_044_000, 43: 24_623_044_000, 59: 33_106_000, 67: 33_106_000, 82: 33_106_000, 86: 33_106_000, 88: 33_106_000 };
const periodos = periodosRevision({
  impuesto: "IVA", periodicidad: "Bimestral", mesCorte: 6, porConfirmar: [], causales: [],
  formularios350: [f300(1, 1, BIM1), f300(3, 2, BIM2)],
  formularios490: [f490(2, 1, 28_761_000), f490(4, 2, 33_106_000, 100_000)],
});
const vista = vistasRevision(periodos, "IVA", "Bimestral");
const fila = (renglon: number) => vista.filas.find((f) => f.renglonPj === renglon)!;

describe("vistas de una revisión de IVA", () => {
  it("una columna por bimestre, con su nombre y el 300 vigente", () => {
    expect(vista.meses.map((m) => m.etiqueta)).toEqual(["Bimestre 01 · Enero-Febrero", "Bimestre 02 · Marzo-Abril", "Bimestre 03 · Mayo-Junio"]);
    expect(vista.meses[2].formulario).toBeNull();
    expect(vistaConPersonas(vista)).toBe(false);
    expect(faltaDeclaracion(vista)).toBe("Falta el 300");
    expect(unidadPlural(vista)).toBe("períodos");
  });

  it("muestra los renglones guardados del 300 en su orden: ingresos, generado, descontable, liquidación, control de saldos y el 980", () => {
    const renglones = vista.filas.map((f) => f.renglonPj);
    expect(renglones[0]).toBe(27);
    expect(renglones).toContain(93);
    expect(renglones.at(-1)).toBe(980);
    expect(renglones).not.toContain(51);
    expect(vista.filas.every((f) => f.tipo !== "concepto")).toBe(true);
    expect([...new Set(vista.filas.map((f) => f.seccion))]).toEqual(["Ingresos", "Impuesto generado", "Impuesto descontable", "Liquidación privada", "Control de saldos", "Informativo"]);
  });

  it("los totales se recalculan y el acumulado es la suma de los bimestres (el que falta queda vacío)", () => {
    expect(fila(59).meses.map((m) => m.valor)).toEqual([28_761_000, 33_106_000, null]);
    expect(fila(59).total).toBe(61_867_000);
    expect(fila(41)).toMatchObject({ tipo: "total", total: 52_849_053_000 });
    expect(fila(88).total).toBe(61_867_000);
  });

  it("el bloque de pagos lleva solo el concepto de la periodicidad", () => {
    expect(vista.pagos.map((p) => p.clave)).toEqual(["sancion", "intereses", "pago_05", "total_pagado"]);
    expect(vista.pagos.find((p) => p.clave === "pago_05")).toMatchObject({ etiqueta: "Valor pago impuesto · concepto 05 (36)", total: 61_867_000 });
    expect(vista.pagos.find((p) => p.clave === "total_pagado")?.total).toBe(61_967_000);
  });

  it("Retención conserva sus columnas por persona y sus nombres", () => {
    const ret = vistasRevision([]);
    expect(vistaConPersonas(ret)).toBe(true);
    expect(ret.pagos.map((p) => p.etiqueta)).toContain("Pago reteIVA · concepto 62 (36)");
    expect(faltaDeclaracion(ret)).toBe("Falta el 350");
  });
});

describe("Excel de una revisión de IVA", () => {
  const meta = { impuesto: "IVA", cliente: "Cliente de prueba", nit: "902058973", anio: 2026, corte: "junio", periodicidad: "Bimestral" };

  it("tiene «Por períodos», «Acumulado» y «Formularios», con una columna por bimestre", () => {
    const wb = libroRetencion(meta, vista, []);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Por períodos", "Acumulado", "Formularios"]);
    const ws = wb.getWorksheet("Por períodos")!;
    expect(ws.getCell("A1").value).toBe("IVA · por períodos");
    const encabezado = ws.getRow(4).values as unknown[];
    expect(encabezado.slice(1)).toEqual(["Concepto", "Renglón", "Bimestre 01 · Enero-Febrero · 3006620171701", "Bimestre 02 · Marzo-Abril · 3006620171703", "Bimestre 03 · Mayo-Junio · falta el 300", "Total"]);
    const formularios = wb.getWorksheet("Formularios")!;
    expect((formularios.getRow(4).values as unknown[])[7]).toBe("300 que paga");
  });

  it("con periodicidad anual no lleva el acumulado", () => {
    const anual = vistasRevision(periodosRevision({ impuesto: "IVA", periodicidad: "Anual", mesCorte: 12, porConfirmar: [], causales: [], formularios350: [], formularios490: [] }), "IVA", "Anual");
    expect(libroRetencion({ ...meta, periodicidad: "Anual" }, anual, []).worksheets.map((w) => w.name)).toEqual(["Por períodos", "Formularios"]);
  });
});
