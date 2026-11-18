import { describe, expect, it } from "vitest";
import { libroRetencion } from "@/lib/export/retencion";
import { CALENDARIO_RST_ANTICIPO_2026 } from "../__fixtures__/calendario-rst-2026";
import { RENGLON_TOTAL_F2593 } from "../formularios/f2593";
import { RST } from "../impuestos-dian";
import { evaluarCierreRetencion } from "../retencion/cierre";
import { oportunidadRevision, pagosDeFila } from "../retencion/oportunidad";
import { pagosRevision } from "../retencion/pagos";
import { etiquetaPeriodoRevision, periodosRevision, type Formulario350, type Formulario490 } from "../retencion/periodos-revision";
import { renglonDeFila, vistasRevision } from "../retencion/vistas";

/**
 * Anticipos bimestrales del Régimen Simple: vistas, oportunidad, pagos efectuados, novedades y Excel.
 * Cifras de los bimestres 1 y 2 de 2026 de recibos reales; NIT ficticio terminado en 8 (como el real):
 * el 1.er bimestre vence el 22 de mayo y el 2.º el 22 de junio.
 */

const NIT = "900000008";

const f2593 = (id: number, periodo: number, valores: Record<number, number>): Formulario350 & { periodo: number } => ({
  id, periodo, numero: `259366121721${String(id).padStart(2, "0")}`, codigoCorreccion: null, numeroAnterior: null, fechaPresentacion: null, valores,
});
const f490 = (id: number, periodo: number, pagado: string, fechaPago: string, impuesto: number, sancion = 0): Formulario490 & { periodo: number } => ({
  id, periodo, numero: `49111224392${String(id).padStart(2, "0")}`, concepto: "27", numeroPagado: pagado, fechaPago, autoadhesivo: `79966030${id}`,
  valores: { 34: sancion, 35: 0, 36: impuesto, 980: sancion + impuesto },
});

// Bimestre 1: pagó el 20 de mayo (vence el 22). Bimestre 2: pagó el 22 de junio, el mismo día del vencimiento.
const B1 = f2593(1, 1, { 28: 870_016_000, 39: 870_016_000, 41: 870_016_000, 42: 39_151_000, 43: 10_005_000, 56: 28_033_000, 74: 140_202_000, 76: 10_005_000, 77: 28_033_000, 78: 0, 79: 140_202_000 });
const B2 = f2593(3, 2, { 28: 870_016_000, 39: 870_016_000, 41: 870_016_000, 42: 39_151_000, 43: 10_005_000, 56: 28_014_000, 74: 140_202_000, 76: 10_005_000, 77: 28_014_000, 78: 0, 79: 140_202_000 });

const periodos = (recibos: (Formulario490 & { periodo: number })[] = [f490(2, 1, B1.numero, "2026-05-20", 178_240_000), f490(4, 2, B2.numero, "2026-06-22", 178_221_000)]) =>
  periodosRevision({ impuesto: "RST", periodicidad: "Bimestral", mesCorte: 4, porConfirmar: [], causales: [], formularios350: [B1, B2], formularios490: recibos });

const EN_CONSTRUCCION = { estado: "bloqueado" as const, mensaje: RST.cruce.mensajeNoDisponible!, balance: null, umbral: 0 };
const etq = (p: number) => etiquetaPeriodoRevision("Bimestral", p);

describe("vistas de una revisión de RST", () => {
  it("una columna por bimestre y el total de los valores a pagar calculado, con su rótulo", () => {
    const vista = vistasRevision(periodos(), "RST", "Bimestral");
    expect(vista.meses.map((m) => m.etiqueta)).toEqual(["Bimestre 01 · Enero-Febrero", "Bimestre 02 · Marzo-Abril"]);
    expect(vista).toMatchObject({ conPersonas: false, codigo: "2593", unidad: "período" });
    const total = vista.filas.find((f) => f.renglonPj === RENGLON_TOTAL_F2593)!;
    expect(total).toMatchObject({ tipo: "total", etiqueta: "Total valores a pagar (76 + 77 + 78 + 79)", total: 356_461_000 });
    expect(total.meses.map((m) => m.valor)).toEqual([178_240_000, 178_221_000]);
    expect(renglonDeFila(total)).toBe("76 a 79");
    expect(renglonDeFila(vista.filas.find((f) => f.renglonPj === 77)!)).toBe("77");
    // El total va justo después de los cuatro valores a pagar.
    const orden = vista.filas.map((f) => f.renglonPj);
    expect(orden.slice(orden.indexOf(76), orden.indexOf(76) + 5)).toEqual([76, 77, 78, 79, RENGLON_TOTAL_F2593]);
    expect(vista.pagos.map((p) => p.etiqueta)).toEqual([
      "Valor pago sanciones (34)", "Valor pago intereses de mora (35)", "Valor pago impuesto · concepto 27 (36)", "Total pagado",
    ]);
  });
});

describe("oportunidad de RST", () => {
  it("mide solo el pago del 490 concepto 27 contra el calendario «RST · Anticipo bimestral»", () => {
    const filas = oportunidadRevision({ impuesto: "RST", anio: 2026, nit: NIT, periodos: periodos(), calendario: CALENDARIO_RST_ANTICIPO_2026, calendarioAplica: true, marcas: [] });
    expect(filas.map((f) => [f.vencimiento, f.estadoPresentacion, f.presentacion, f.admiteMarca])).toEqual([
      ["2026-05-22", "no_aplica", null, false],
      ["2026-06-22", "no_aplica", null, false],
    ]);
    expect(filas.map((f) => pagosDeFila(f, RST).map((p) => [p.id, p.pago.estado, p.pago.fecha]))).toEqual([
      [["490", "oportuno", "2026-05-20"]],
      [["490", "oportuno", "2026-06-22"]],
    ]);
    // Sin el campo de Retención en las filas.
    expect(filas[0]).not.toHaveProperty("pago61");
  });

  it("un pago tarde es extemporáneo; sin recibo, «Sin pago»", () => {
    const filas = oportunidadRevision({
      impuesto: "RST", anio: 2026, nit: NIT, periodos: periodos([f490(2, 1, B1.numero, "2026-05-28", 178_240_000)]), calendario: CALENDARIO_RST_ANTICIPO_2026, calendarioAplica: true, marcas: [],
    });
    expect(pagosDeFila(filas[0], RST)[0].pago).toMatchObject({ estado: "extemporaneo", dias: 6 });
    expect(pagosDeFila(filas[1], RST)[0].pago.estado).toBe("sin_pago");
  });
});

describe("pagos efectuados y novedades de RST", () => {
  it("muestra los cuatro valores a pagar y su total contra la casilla 36", () => {
    const r = pagosRevision({ impuesto: "RST", anio: 2026, periodos: periodos(), marcas: [] });
    expect(r.filas[0].componentes).toEqual([{ renglon: 76, valor: 10_005_000 }, { renglon: 77, valor: 28_033_000 }, { renglon: 78, valor: 0 }, { renglon: 79, valor: 140_202_000 }]);
    expect(r.filas.map((f) => [f.totalDeclarado, f.impuestoPagado, f.diferencia, f.estado])).toEqual([
      [178_240_000, 178_240_000, 0, "completo"],
      [178_221_000, 178_221_000, 0, "completo"],
    ]);
    expect(r.totalComponentes).toEqual([{ renglon: 76, valor: 20_010_000 }, { renglon: 77, valor: 56_047_000 }, { renglon: 78, valor: 0 }, { renglon: 79, valor: 280_404_000 }]);
    expect(r.pendientesMarca).toBe(0);
  });

  it("sin cruce disponible, el cruce no es un pendiente; una diferencia en el pago sí", () => {
    const sinDiferencia = periodos();
    const limpio = evaluarCierreRetencion({
      codigo: "2593", periodos: sinDiferencia, cruce: EN_CONSTRUCCION, pagos: pagosRevision({ impuesto: "RST", anio: 2026, periodos: sinDiferencia, marcas: [] }), oportunidad: [], etiquetaPeriodo: etq, sinCruce: true,
    });
    expect(limpio.pendientes).toEqual([]);
    const conDiferencia = periodos([f490(2, 1, B1.numero, "2026-05-20", 178_000_000), f490(4, 2, B2.numero, "2026-06-22", 178_221_000)]);
    const pendiente = evaluarCierreRetencion({
      codigo: "2593", periodos: conDiferencia, cruce: EN_CONSTRUCCION, pagos: pagosRevision({ impuesto: "RST", anio: 2026, periodos: conDiferencia, marcas: [] }), oportunidad: [], etiquetaPeriodo: etq, sinCruce: true,
    });
    expect(pendiente.pendientes.map((p) => p.tipo)).toEqual(["pagos"]);
    // Sin la bandera (Retención e IVA), el cruce no listo sigue siendo un pendiente.
    const conCruce = evaluarCierreRetencion({ codigo: "2593", periodos: sinDiferencia, cruce: EN_CONSTRUCCION, pagos: pagosRevision({ impuesto: "RST", anio: 2026, periodos: sinDiferencia, marcas: [] }), oportunidad: [], etiquetaPeriodo: etq });
    expect(conCruce.pendientes.map((p) => p.tipo)).toEqual(["cruce"]);
  });
});

describe("Excel de una revisión de RST", () => {
  const hojas = () => {
    const p = periodos();
    return libroRetencion(
      { impuesto: RST.nombre, cliente: "Cliente de prueba", nit: NIT, anio: 2026, corte: "abril", periodicidad: "Bimestral" },
      vistasRevision(p, "RST", "Bimestral"),
      [],
      {
        cruce: EN_CONSTRUCCION,
        oportunidad: oportunidadRevision({ impuesto: "RST", anio: 2026, nit: NIT, periodos: p, calendario: CALENDARIO_RST_ANTICIPO_2026, calendarioAplica: true, marcas: [] }),
        pagos: pagosRevision({ impuesto: "RST", anio: 2026, periodos: p, marcas: [] }),
      },
    );
  };
  const encabezados = (wb: ReturnType<typeof hojas>, hoja: string) => {
    let fila: string[] = [];
    wb.getWorksheet(hoja)!.eachRow((row) => {
      const textos = (row.values as unknown[]).slice(1).map((v) => String(v ?? ""));
      if (textos[0] === "Período") fila = textos;
    });
    return fila;
  };

  it("sin hoja de cruce; oportunidad sin presentación; pagos con 76 a 79", () => {
    const wb = hojas();
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Por períodos", "Acumulado", "Formularios", "Oportunidad", "Pagos efectuados"]);
    expect(encabezados(wb, "Oportunidad")).toEqual(["Período", "Recibo 490", "Autoadhesivo 490", "Fecha de vencimiento", "Fecha de pago 490", "Estado pago 490"]);
    expect(encabezados(wb, "Pagos efectuados")).toEqual([
      "Período", "ICA (76)", "Anticipo SIMPLE (77)", "Impuesto al consumo (78)", "IVA (79)", "Total valores a pagar (76 a 79)",
      "Impuesto pagado antes de sanción e intereses (36)", "Diferencia", "Estado", "Alerta", "Sanción pagada (34)", "Intereses pagados (35)", "Marca",
    ]);
  });
});
