import { describe, expect, it } from "vitest";
import { F350_2026, F490_2026 } from "../__fixtures__/retencion-2026";
import { CALENDARIO_RETEFUENTE_2026 } from "../__fixtures__/calendario-retefuente-2026";
import { MAPEO_F350_FABRICA } from "../mapeo-dian";
import { periodosRevision } from "./periodos-revision";
import { cruceRetencion } from "./cruce";
import { oportunidadRevision } from "./oportunidad";
import { alertaSinRecibo, conceptosSinRecibo, pagosRevision } from "./pagos";
import { evaluarCierreRetencion } from "./cierre";

describe("oportunidad, pagos efectuados y cierre (casos del levantamiento, corte agosto)", () => {
  const periodos = periodosRevision({ periodicidad: "Mensual", mesCorte: 8, formularios350: F350_2026, formularios490: F490_2026, porConfirmar: [], causales: [] });
  // El último dígito del NIT del cliente real es 9 (el ficticio de la fixture termina en 6).
  const oportunidad = (extra: Partial<Parameters<typeof oportunidadRevision>[0]> = {}) =>
    oportunidadRevision({ anio: 2026, nit: "900123459", periodos, calendario: CALENDARIO_RETEFUENTE_2026, calendarioAplica: true, marcas: [], ...extra });
  const etq = (p: number) => `Período ${p}`;
  const marcar = (clave: string, diferencia: number) => ({ clave, numero: 1, nota: "Documentado", referenciaAnexo: null, diferencia, marcadoPor: null, marcadoEn: "2026-10-31T00:00:00.000Z" });

  it("enero: corrección sin original → presentación «Falta el original» con marca; pago oportuno el día del vencimiento", () => {
    expect(oportunidad()[0]).toMatchObject({
      vencimiento: "2026-02-20", estadoPresentacion: "falta_original", requiereMarca: true, pago: "2026-02-20", estadoPago: "oportuno", conceptoPago: "61",
    });
  });

  it("febrero a agosto: presentación y pago oportunos (abril se pagó el mismo día del vencimiento)", () => {
    const filas = oportunidad().slice(1);
    expect(filas.every((f) => f.estadoPresentacion === "oportuno" && f.estadoPago === "oportuno")).toBe(true);
    expect(filas[2]).toMatchObject({ periodo: 4, pago: "2026-05-25", vencimiento: "2026-05-25" });
  });

  it("regresión del Programa: dígito 7, enero presentado el 17-feb es oportuno (vence el 18); dos días tarde es extemporáneo", () => {
    const enero = (fecha: string) => periodosRevision({
      periodicidad: "Mensual", mesCorte: 1, porConfirmar: [], causales: [], formularios490: [],
      formularios350: [{ id: 1, periodo: 1, numero: "3500000000001", codigoCorreccion: null, numeroAnterior: null, fechaPresentacion: fecha, valores: { 130: 0, 134: 0, 135: 0 } }],
    });
    const fila = (fecha: string) => oportunidadRevision({ anio: 2026, nit: "901240097", periodos: enero(fecha), calendario: CALENDARIO_RETEFUENTE_2026, calendarioAplica: true, marcas: [] })[0];
    expect(fila("2026-02-17")).toMatchObject({ vencimiento: "2026-02-18", estadoPresentacion: "oportuno", estadoPago: "nada_que_pagar" });
    expect(fila("2026-02-20")).toMatchObject({ estadoPresentacion: "extemporaneo", diasPresentacion: 2 });
  });

  it("sin calendario, con otra periodicidad o sin formulario no sale «Oportuno»", () => {
    expect(oportunidad({ calendario: [] })[1].estadoPresentacion).toBe("sin_calendario");
    expect(oportunidad({ calendarioAplica: false })[1].estadoPago).toBe("sin_calendario");
    const conCausal = periodosRevision({ periodicidad: "Mensual", mesCorte: 9, formularios350: F350_2026, formularios490: F490_2026, porConfirmar: [], causales: [{ periodo: 9, causal: "Sin retenciones" }] });
    expect(oportunidad({ periodos: conCausal })[8]).toMatchObject({ estadoPresentacion: "sin_formulario", estadoPago: "sin_formulario" });
    const sinCausal = periodosRevision({ periodicidad: "Mensual", mesCorte: 9, formularios350: F350_2026, formularios490: F490_2026, porConfirmar: [], causales: [] });
    expect(oportunidad({ periodos: sinCausal })[8].estadoPresentacion).toBe("falta_350");
  });

  it("sin recibo del 61, la fecha de pago es la del primer 490 que haya, y se dice cuál", () => {
    const soloIva = periodosRevision({
      periodicidad: "Mensual", mesCorte: 8, formularios350: F350_2026, porConfirmar: [], causales: [],
      formularios490: F490_2026.filter((f) => f.periodo !== 8 || f.concepto === "62"),
    });
    expect(oportunidad({ periodos: soloIva })[7]).toMatchObject({ pagoSinConcepto61: true, conceptoPago: "62", numeroPago: "4911175045977" });
  });

  it("pagos: enero −6.786.000 (130 vs 61 = −8.942.000; 134 vs 62 = +2.156.000); febrero a julio falta el reteIVA; agosto completo", () => {
    const r = pagosRevision({ anio: 2026, periodos, marcas: [] });
    expect(r.filas[0]).toMatchObject({ retenciones: 115_918_000, impuestoPagado: 122_704_000, diferencia: -6_786_000, estado: "diferencia", requiereMarca: true });
    expect(r.filas[0].desglose.map((d) => [d.concepto, d.diferencia])).toEqual([["61", -8_942_000], ["62", 2_156_000], ["63", 0]]);
    expect(r.filas[1]).toMatchObject({ diferencia: 2_556_000, estado: "diferencia" });
    expect(r.filas[7]).toMatchObject({ diferencia: 0, estado: "completo", requiereMarca: false, totalPagado: 154_801_000 });
    expect(r.pendientesMarca).toBe(7);
    expect(r.total.retenciones).toBe(1_092_190_000);
  });

  it("alerta de recibos: enero a julio falta el 490 del 62; agosto no; un período sin 350 tampoco", () => {
    const { filas } = pagosRevision({ anio: 2026, periodos, marcas: [] });
    expect(filas.slice(0, 7).map((f) => conceptosSinRecibo(f).map(alertaSinRecibo))).toEqual(Array(7).fill(["Falta el 490 concepto 62"]));
    expect(conceptosSinRecibo(filas[7])).toEqual([]);
    // Coincide con la alerta de la lista de formularios.
    expect(filas.map((f) => conceptosSinRecibo(f).map((d) => d.concepto))).toEqual(periodos.map((p) => p.pagosFaltantes));
    const concepto = { concepto: "63" as const, renglon: 135, diferencia: 0, pagado: 0 };
    expect(conceptosSinRecibo({ desglose: [{ ...concepto, declarado: 0, recibos: 0 }] })).toEqual([]);
    expect(conceptosSinRecibo({ desglose: [{ ...concepto, declarado: 500, recibos: 1 }] })).toEqual([]);
    expect(conceptosSinRecibo({ desglose: [] })).toEqual([]);
  });

  it("los intereses de mora van aparte: no generan diferencia ni suman al total pagado", () => {
    const conIntereses = periodosRevision({
      periodicidad: "Mensual", mesCorte: 8, formularios350: F350_2026, porConfirmar: [], causales: [],
      formularios490: F490_2026.map((f) => (f.periodo === 8 && f.concepto === "61" ? { ...f, valores: { ...f.valores, 35: 120_000 } } : f)),
    });
    expect(pagosRevision({ anio: 2026, periodos: conIntereses, marcas: [] }).filas[7]).toMatchObject({ intereses: 120_000, diferencia: 0, estado: "completo", totalPagado: 154_801_000, totalDeclarado: 154_801_000 });
  });

  it("la diferencia es siempre el total declarado menos el total pagado", () => {
    const { filas, total } = pagosRevision({ anio: 2026, periodos, marcas: [] });
    for (const f of filas) expect(f.totalDeclarado - f.totalPagado).toBe(f.diferencia);
    expect(total.totalDeclarado - total.totalPagado).toBe(total.diferencia);
  });

  it("una marca de pago vale mientras la diferencia sea la misma", () => {
    const marca = marcar("pago:2026-02", 2_556_000);
    expect(pagosRevision({ anio: 2026, periodos, marcas: [marca] }).filas[1].marca?.vigente).toBe(true);
    expect(pagosRevision({ anio: 2026, periodos, marcas: [{ ...marca, diferencia: 1 }] }).filas[1].marca?.vigente).toBe(false);
  });

  it("cierre: pide el cruce, las marcas de pagos y la del original de enero; con todo marcado no queda nada", () => {
    const sinBalance = { estado: "sin_balance" as const, mensaje: "No hay un balance cerrado con corte en 2026-08.", balance: null, umbral: 6_000 };
    const pagos = pagosRevision({ anio: 2026, periodos, marcas: [] });
    const ev = evaluarCierreRetencion({ periodos, cruce: sinBalance, pagos, oportunidad: oportunidad(), etiquetaPeriodo: etq });
    expect(ev.pendientes.map((p) => p.tipo)).toEqual(["cruce", ...Array(7).fill("pagos"), "oportunidad"]);
    expect(ev.avisos.some((a) => a.includes("Falta el formulario original"))).toBe(true);

    const marcasPago = pagos.filas.filter((f) => f.requiereMarca).map((f) => marcar(f.clave, f.diferencia));
    const cruceListo = {
      estado: "listo" as const, mensaje: null, umbral: 6_000, inicioEnero: true,
      balance: { id: 1, periodo: "Enero 2026 – Agosto 2026", descripcion: "v1", periodoInicio: "2026-01-01", periodoFin: "2026-08-31" },
      resultado: cruceRetencion({ periodos, mapeo: MAPEO_F350_FABRICA, sinRestaDian: new Set(), tercerosDian: [], nombresRussell: new Map(), filasContables: [], inicioEnero: true, restarSaldoInicial: false, umbral: 1e12, marcas: [] }),
    };
    const listo = evaluarCierreRetencion({
      periodos, cruce: cruceListo, pagos: pagosRevision({ anio: 2026, periodos, marcas: marcasPago }),
      oportunidad: oportunidad({ marcas: [marcar("oportunidad:2026-01", 0)] }), etiquetaPeriodo: etq,
    });
    expect(listo.pendientes).toEqual([]);
    expect(listo.avisos.some((a) => a.includes("saldo inicial"))).toBe(false);
  });

  it("cierre: restar el saldo inicial queda como aviso, no como pendiente, y una copia antigua sin el dato no lo menciona", () => {
    const pagos = pagosRevision({ anio: 2026, periodos, marcas: [] });
    const generico = { cuentaCliente: "23652501", nombreCuenta: "Servicios", cuentaRussell: "236525", nit: "Generico", nombreTercero: "Genérico", saldoInicial: -100_000, saldoFinal: -100_000 };
    const resultado = cruceRetencion({ periodos, mapeo: MAPEO_F350_FABRICA, sinRestaDian: new Set(), tercerosDian: [], nombresRussell: new Map(), filasContables: [generico], inicioEnero: true, restarSaldoInicial: true, umbral: 1e12, marcas: [] });
    const cruce = { estado: "listo" as const, mensaje: null, umbral: 1e12, inicioEnero: true, balance: { id: 1, periodo: "Enero 2026 – Agosto 2026", descripcion: "v1", periodoInicio: "2026-01-01", periodoFin: "2026-08-31" }, resultado };
    const ev = evaluarCierreRetencion({ periodos, cruce, pagos, oportunidad: oportunidad(), etiquetaPeriodo: etq });
    expect(ev.avisos).toContain("Cruce contable: se restó el saldo inicial de 1 tercero en 1 cuenta, por $ 100.000.");
    expect(ev.pendientes.some((p) => p.tipo === "cruce")).toBe(false);
    const evAntigua = evaluarCierreRetencion({ periodos, cruce: { ...cruce, resultado: { ...resultado, saldoInicial: undefined } }, pagos, oportunidad: oportunidad(), etiquetaPeriodo: etq });
    expect(evAntigua.avisos.some((a) => a.includes("saldo inicial"))).toBe(false);
  });

  it("cierre: un período sin 350 ni causal o con formularios por confirmar lo impide", () => {
    const corteSep = periodosRevision({ periodicidad: "Mensual", mesCorte: 9, formularios350: F350_2026, formularios490: F490_2026, porConfirmar: [{ periodo: 3, formulario: "350", concepto: null }], causales: [] });
    const ev = evaluarCierreRetencion({
      periodos: corteSep, cruce: { estado: "bloqueado", mensaje: "x", balance: null, umbral: 0 },
      pagos: pagosRevision({ anio: 2026, periodos: corteSep, marcas: [] }), oportunidad: [], etiquetaPeriodo: etq,
    });
    expect(ev.pendientes.filter((p) => p.tipo === "formularios").map((p) => p.texto)).toEqual([
      "Período 3: 1 formulario por confirmar.",
      "Período 9: falta el 350 o la causal de que no hubo formulario.",
    ]);
  });
});
