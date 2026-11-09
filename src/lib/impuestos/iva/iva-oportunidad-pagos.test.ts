import { describe, expect, it } from "vitest";
import { libroRetencion } from "@/lib/export/retencion";
import { referenciaCierre } from "@/lib/conciliacion/referencia-cierre";
import { CALENDARIO_IVA_ANUAL_2026, CALENDARIO_IVA_BIMESTRAL_2026 } from "../__fixtures__/calendario-iva-2026";
import { IVA } from "../impuestos-dian";
import { evaluarCierreRetencion } from "../retencion/cierre";
import { construirCopiaRetencion, leerCopiaRetencion } from "../retencion/copia-cierre";
import { etiquetaOportunidad, oportunidadRevision, pagosDeFila } from "../retencion/oportunidad";
import { alertaRecibosSin350, etiquetaPago, pagosRevision } from "../retencion/pagos";
import { etiquetaPeriodoRevision, periodosRevision, type Formulario350, type Formulario490 } from "../retencion/periodos-revision";
import { vistasRevision } from "../retencion/vistas";

// NIT terminado en 3 (sin el DV): el 1.er bimestre de 2026 vence el 12 de marzo, el 2.º el 14 de mayo.
const NIT = "800111223";

const f300 = (id: number, periodo: number, fechaPresentacion: string, valores: Record<number, number>): Formulario350 & { periodo: number } => ({
  id, periodo, numero: `300000000000${id}`, codigoCorreccion: null, numeroAnterior: null, fechaPresentacion, valores,
});
const f490 = (id: number, periodo: number, pagado: string, fechaPago: string, valores: Record<number, number>, concepto = "05"): Formulario490 & { periodo: number } => ({
  id, periodo, numero: `490000000000${id}`, concepto, numeroPagado: pagado, fechaPago, autoadhesivo: `9100${id}`, valores,
});

// Los 300 traen sus totales leídos, como el PDF real.
// Bimestre 1: generado 1.500.000 − descontable 500.000 = 86 de 1.000.000, pagado completo el día del vencimiento.
// Bimestre 2: 86 de 2.000.000 y sanción (87) de 100.000; se pagó 1.900.000 + 100.000 + intereses, tarde.
const bimestral = (mesCorte = 4) => periodosRevision({
  impuesto: "IVA", periodicidad: "Bimestral", mesCorte, porConfirmar: [], causales: [],
  formularios350: [
    f300(1, 1, "2026-03-12", { 59: 1_500_000, 67: 1_500_000, 72: 500_000, 77: 500_000, 81: 500_000, 82: 1_000_000, 86: 1_000_000, 88: 1_000_000 }),
    f300(2, 2, "2026-05-15", { 59: 2_000_000, 67: 2_000_000, 82: 2_000_000, 86: 2_000_000, 87: 100_000, 88: 2_100_000 }),
  ],
  formularios490: [
    f490(1, 1, "3000000000001", "2026-03-12", { 36: 1_000_000, 34: 0, 35: 0, 980: 1_000_000 }),
    f490(2, 2, "3000000000002", "2026-05-20", { 36: 1_900_000, 34: 100_000, 35: 5_000, 980: 2_005_000 }),
  ],
});

const etq = (p: number) => etiquetaPeriodoRevision("Bimestral", p);
const SIN_BALANCE = { estado: "sin_balance" as const, mensaje: "Sin balance", balance: null, umbral: 501 };

describe("oportunidad de IVA", () => {
  const filas = oportunidadRevision({ impuesto: "IVA", anio: 2026, nit: NIT, periodos: bimestral(), calendario: CALENDARIO_IVA_BIMESTRAL_2026, calendarioAplica: true, marcas: [] });

  it("bimestral: vence por el último dígito del NIT y mide la presentación del 300 y el pago del 490 en una sola columna", () => {
    expect(filas[0]).toMatchObject({ vencimiento: "2026-03-12", presentacion: "2026-03-12", estadoPresentacion: "oportuno", numero350: "3000000000001" });
    expect(pagosDeFila(filas[0], IVA)).toEqual([{ id: "490", pago: { numero: "4900000000001", autoadhesivo: "91001", fecha: "2026-03-12", estado: "oportuno", dias: null } }]);
    expect(filas[0].pago61).toBeUndefined();
    expect(filas[1]).toMatchObject({ vencimiento: "2026-05-14", estadoPresentacion: "extemporaneo", diasPresentacion: 1 });
    expect(pagosDeFila(filas[1], IVA)[0].pago).toMatchObject({ estado: "extemporaneo", dias: 6 });
  });

  it("anual: usa el calendario del año siguiente, que la DIAN agrupa por pares de dígitos; con saldo a favor no hay pago que medir", () => {
    expect(IVA.calendario("Anual", 2025)).toEqual({ formulario: "IVA_ANUAL", anio: 2026 });
    expect(IVA.calendario("Bimestral", 2026)).toEqual({ formulario: "IVA_BIMESTRAL", anio: 2026 });
    const anual = periodosRevision({
      impuesto: "IVA", periodicidad: "Anual", mesCorte: 12, porConfirmar: [], causales: [], formularios490: [],
      formularios350: [f300(3, 1, "2026-02-18", { 59: 1_000_000, 67: 1_000_000, 72: 3_000_000, 77: 3_000_000, 81: 3_000_000, 83: 2_000_000, 89: 2_000_000 })],
    });
    const [fila] = oportunidadRevision({ impuesto: "IVA", anio: 2025, nit: NIT, periodos: anual, calendario: CALENDARIO_IVA_ANUAL_2026, calendarioAplica: true, marcas: [] });
    // Dígitos 3 y 4 → 17 de febrero de 2026: presentado el 18, un día tarde.
    expect(fila).toMatchObject({ vencimiento: "2026-02-17", estadoPresentacion: "extemporaneo", diasPresentacion: 1 });
    expect(pagosDeFila(fila, IVA)[0].pago.estado).toBe("nada_que_pagar");
    expect(pagosRevision({ impuesto: "IVA", anio: 2025, periodos: anual, marcas: [] }).filas[0]).toMatchObject({ retenciones: 0, totalDeclarado: 0, diferencia: 0, requiereMarca: false });
  });

  it("los estados nombran el 300", () => {
    expect(etiquetaOportunidad("falta_350", "300")).toBe("Falta el 300");
    expect(etiquetaOportunidad("falta_350")).toBe("Falta el 350");
    expect(etiquetaPago("falta_350", "300")).toBe("Falta el 300");
  });
});

describe("pagos efectuados de IVA", () => {
  const pagos = pagosRevision({ impuesto: "IVA", anio: 2026, periodos: bimestral(), marcas: [] });

  it("compara el 86 con el impuesto pagado (36) y el 87 con la sanción (34); los intereses van aparte", () => {
    expect(pagos.filas[0]).toMatchObject({ estado: "completo", retenciones: 1_000_000, sanciones: 0, totalDeclarado: 1_000_000, totalPagado: 1_000_000, diferencia: 0, requiereMarca: false });
    expect(pagos.filas[1]).toMatchObject({
      estado: "diferencia", retenciones: 2_000_000, sanciones: 100_000, totalDeclarado: 2_100_000,
      impuestoPagado: 1_900_000, sancionPagada: 100_000, intereses: 5_000, totalPagado: 2_000_000, diferencia: -100_000, requiereMarca: true,
    });
    expect(pagos.filas[1].desglose).toEqual([{ concepto: "05", renglon: 86, declarado: 2_000_000, pagado: 1_900_000, diferencia: -100_000, recibos: 1 }]);
    expect(pagos.total).toMatchObject({ totalDeclarado: 3_100_000, totalPagado: 3_000_000, intereses: 5_000, diferencia: -100_000 });
    expect(alertaRecibosSin350(["4900000000009"], "300")).toBe("Recibo 490 sin 300");
  });
});

describe("cierre en firme de IVA", () => {
  it("lo que falta para cerrar nombra el 300 y el período", () => {
    const periodos = bimestral(6);
    const evaluacion = evaluarCierreRetencion({
      codigo: "300", periodos, cruce: SIN_BALANCE, oportunidad: [], etiquetaPeriodo: etq,
      pagos: pagosRevision({ impuesto: "IVA", anio: 2026, periodos, marcas: [] }),
    });
    expect(evaluacion.pendientes.filter((p) => p.tipo === "formularios").map((p) => p.texto)).toEqual([
      `${etq(3)}: falta el 300 o la causal de que no hubo formulario.`,
    ]);
    expect(evaluacion.pendientes.some((p) => p.tipo === "pagos" && p.texto.startsWith(etq(2)))).toBe(true);
  });

  it("la copia congelada lleva el tipo «iva» y no se lee como una de Retención", () => {
    const periodos = bimestral();
    const copia = construirCopiaRetencion({
      tipo: "iva", tomadaEn: new Date("2026-11-08T00:00:00.000Z"), periodos, cruce: SIN_BALANCE, oportunidad: [],
      pagos: pagosRevision({ impuesto: "IVA", anio: 2026, periodos, marcas: [] }),
    });
    const guardada = JSON.parse(JSON.stringify(copia));
    expect(leerCopiaRetencion(guardada, "iva")?.huella).toBe(copia.huella);
    expect(leerCopiaRetencion(guardada)).toBeNull();
  });

  it("el balance en firme nombra la revisión de IVA", () => {
    expect(referenciaCierre({ moduloCodigo: "IVA", moduloDatoEncabezadoId: 9 })).toEqual({ modulo: "IVA", etiqueta: "revisión #9", ruta: "/impuestos/iva/9" });
  });
});

describe("Excel de oportunidad y pagos de IVA", () => {
  it("una sola columna de pago (490) y los renglones 86, 87 y 88, sin el desglose por concepto de Retención", () => {
    const periodos = bimestral();
    const wb = libroRetencion(
      { impuesto: "IVA", cliente: "Cliente de prueba", nit: NIT, anio: 2026, corte: "abril", periodicidad: "Bimestral" },
      vistasRevision(periodos, "IVA", "Bimestral"),
      [],
      {
        cruce: SIN_BALANCE,
        oportunidad: oportunidadRevision({ impuesto: "IVA", anio: 2026, nit: NIT, periodos, calendario: CALENDARIO_IVA_BIMESTRAL_2026, calendarioAplica: true, marcas: [] }),
        pagos: pagosRevision({ impuesto: "IVA", anio: 2026, periodos, marcas: [] }),
      },
    );
    const encabezados = (hoja: string) => {
      const ws = wb.getWorksheet(hoja)!;
      let fila: string[] = [];
      ws.eachRow((row) => {
        const textos = (row.values as unknown[]).slice(1).map((v) => String(v ?? ""));
        if (textos[0] === "Período") fila = textos;
      });
      return fila;
    };
    expect(encabezados("Oportunidad")).toEqual([
      "Período", "300 (original)", "Autoadhesivo 300", "Recibo 490", "Autoadhesivo 490", "Fecha de vencimiento", "Fecha de presentación",
      "Fecha de pago 490", "Estado presentación", "Estado pago 490", "Marca",
    ]);
    expect(encabezados("Pagos efectuados")).toEqual([
      "Período", "Saldo a pagar por impuesto (86)", "Sanciones (87)", "Total saldo a pagar (88)", "Impuesto pagado (36)", "Sanción pagada (34)",
      "Total pagado antes de intereses", "Diferencia", "Estado", "Alerta", "Intereses pagados (35)", "Marca",
    ]);
  });
});
