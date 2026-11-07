import { describe, expect, it } from "vitest";
import { F350_2026, F490_2026 } from "../__fixtures__/retencion-2026";
import { CALENDARIO_RETEFUENTE_2026 } from "../__fixtures__/calendario-retefuente-2026";
import { MAPEO_F350_FABRICA } from "../mapeo-dian";
import { avisoRecibosSin350, periodosRevision, recibosSin350 } from "./periodos-revision";
import { CLAVE_MARCA_SALDO_INICIAL, conMarcaSaldoInicial, cruceRetencion, detalleSaldoInicialRestado } from "./cruce";
import { oportunidadRevision } from "./oportunidad";
import { alertaReciboDeOtro350, alertaRecibosSin350, alertaSinRecibo, conceptosSinRecibo, pagosRevision } from "./pagos";
import { evaluarCierreRetencion } from "./cierre";

describe("oportunidad, pagos efectuados y cierre (casos del levantamiento, corte agosto)", () => {
  const periodos = periodosRevision({ periodicidad: "Mensual", mesCorte: 8, formularios350: F350_2026, formularios490: F490_2026, porConfirmar: [], causales: [] });
  // El último dígito del NIT del cliente real es 9 (el ficticio de la fixture termina en 6).
  const oportunidad = (extra: Partial<Parameters<typeof oportunidadRevision>[0]> = {}) =>
    oportunidadRevision({ anio: 2026, nit: "900123459", periodos, calendario: CALENDARIO_RETEFUENTE_2026, calendarioAplica: true, marcas: [], ...extra });
  const etq = (p: number) => `Período ${p}`;
  const marcar = (clave: string, diferencia: number) => ({ clave, numero: 1, nota: "Documentado", referenciaAnexo: null, diferencia, marcadoPor: null, marcadoEn: "2026-10-31T00:00:00.000Z" });

  it("enero: corrección sin original → presentación «Falta el original» con marca; pago del 61 oportuno el día del vencimiento y sin pago del 62", () => {
    expect(oportunidad()[0]).toMatchObject({
      vencimiento: "2026-02-20", estadoPresentacion: "falta_original", admiteMarca: true,
      pago61: { numero: "4911086421291", fecha: "2026-02-20", estado: "oportuno", dias: null },
      pago62: { numero: null, fecha: null, estado: "sin_pago" },
    });
  });

  it("febrero a agosto: presentación y pago del 61 oportunos (abril se pagó el mismo día del vencimiento); el 62 solo se pagó en agosto", () => {
    const filas = oportunidad().slice(1);
    expect(filas.every((f) => f.estadoPresentacion === "oportuno" && f.pago61.estado === "oportuno")).toBe(true);
    expect(filas[2]).toMatchObject({ periodo: 4, vencimiento: "2026-05-25", pago61: { fecha: "2026-05-25" } });
    expect(filas.map((f) => f.pago62.estado)).toEqual([...Array(6).fill("sin_pago"), "oportuno"]);
    expect(filas[6].pago62).toMatchObject({ numero: "4911175045977", fecha: "2026-09-18" });
  });

  it("regresión del Programa: dígito 7, enero presentado el 17-feb es oportuno (vence el 18); dos días tarde es extemporáneo", () => {
    const enero = (fecha: string) => periodosRevision({
      periodicidad: "Mensual", mesCorte: 1, porConfirmar: [], causales: [], formularios490: [],
      formularios350: [{ id: 1, periodo: 1, numero: "3500000000001", codigoCorreccion: null, numeroAnterior: null, fechaPresentacion: fecha, valores: { 130: 0, 134: 0, 135: 0 } }],
    });
    const fila = (fecha: string) => oportunidadRevision({ anio: 2026, nit: "901240097", periodos: enero(fecha), calendario: CALENDARIO_RETEFUENTE_2026, calendarioAplica: true, marcas: [] })[0];
    expect(fila("2026-02-17")).toMatchObject({ vencimiento: "2026-02-18", estadoPresentacion: "oportuno", pago61: { estado: "nada_que_pagar" }, pago62: { estado: "nada_que_pagar" } });
    expect(fila("2026-02-20")).toMatchObject({ estadoPresentacion: "extemporaneo", diasPresentacion: 2 });
  });

  it("sin calendario, con otra periodicidad o sin formulario no sale «Oportuno»", () => {
    expect(oportunidad({ calendario: [] })[1].estadoPresentacion).toBe("sin_calendario");
    expect(oportunidad({ calendarioAplica: false })[1].pago61.estado).toBe("sin_calendario");
    const conCausal = periodosRevision({ periodicidad: "Mensual", mesCorte: 9, formularios350: F350_2026, formularios490: F490_2026, porConfirmar: [], causales: [{ periodo: 9, causal: "Sin retenciones" }] });
    expect(oportunidad({ periodos: conCausal })[8]).toMatchObject({ estadoPresentacion: "sin_formulario", pago61: { estado: "sin_formulario" }, pago62: { estado: "sin_formulario" } });
    const sinCausal = periodosRevision({ periodicidad: "Mensual", mesCorte: 9, formularios350: F350_2026, formularios490: F490_2026, porConfirmar: [], causales: [] });
    expect(oportunidad({ periodos: sinCausal })[8].estadoPresentacion).toBe("falta_350");
  });

  it("cada concepto se mide con sus propios recibos: sin el 61, su columna dice «Sin pago» aunque el 62 esté pagado", () => {
    const soloIva = periodosRevision({
      periodicidad: "Mensual", mesCorte: 8, formularios350: F350_2026, porConfirmar: [], causales: [],
      formularios490: F490_2026.filter((f) => f.periodo !== 8 || f.concepto === "62"),
    });
    expect(oportunidad({ periodos: soloIva })[7]).toMatchObject({
      pago61: { numero: null, estado: "sin_pago" },
      pago62: { numero: "4911175045977", estado: "oportuno" },
    });
  });

  it("con varios recibos del mismo concepto cuenta el último pago", () => {
    const cuota = { ...F490_2026[7], id: 99, numero: "4911999999999", fechaPago: "2026-09-25" };
    const conCuota = periodosRevision({ periodicidad: "Mensual", mesCorte: 8, formularios350: F350_2026, formularios490: [...F490_2026, cuota], porConfirmar: [], causales: [] });
    expect(oportunidad({ periodos: conCuota })[7].pago61).toMatchObject({ numero: "4911999999999", fecha: "2026-09-25", estado: "extemporaneo", dias: 4 });
  });

  it("pagos (pagado − declarado): enero +6.786.000, pagó de más (61 vs 130 = +8.942.000; 62 vs 134 = −2.156.000); febrero a julio falta el reteIVA; agosto completo", () => {
    const r = pagosRevision({ anio: 2026, periodos, marcas: [] });
    expect(r.filas[0]).toMatchObject({ retenciones: 115_918_000, impuestoPagado: 122_704_000, diferencia: 6_786_000, estado: "diferencia", requiereMarca: true });
    expect(r.filas[0].desglose.map((d) => [d.concepto, d.diferencia])).toEqual([["61", 8_942_000], ["62", -2_156_000], ["63", 0]]);
    expect(r.filas[1]).toMatchObject({ diferencia: -2_556_000, estado: "diferencia" });
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

  it("la diferencia es siempre el total pagado menos el total declarado", () => {
    const { filas, total } = pagosRevision({ anio: 2026, periodos, marcas: [] });
    for (const f of filas) expect(f.totalPagado - f.totalDeclarado).toBe(f.diferencia);
    expect(total.totalPagado - total.totalDeclarado).toBe(total.diferencia);
  });

  describe("un recibo que paga un 350 de otro período", () => {
    // Agosto: «Pago completo», con el recibo del 61 citando el 350 de julio.
    const conAjeno = periodosRevision({
      periodicidad: "Mensual", mesCorte: 8, formularios350: F350_2026, porConfirmar: [], causales: [],
      formularios490: F490_2026.map((f) => (f.periodo === 8 && f.concepto === "61" ? { ...f, numeroPagado: "3510692214725" } : f)),
    });
    const numeroRecibo = F490_2026.find((f) => f.periodo === 8 && f.concepto === "61")!.numero;
    const sinBalance = { estado: "sin_balance" as const, mensaje: "Sin balance.", balance: null, umbral: 6_000 };
    const pendientesDeAgosto = (marcas: Parameters<typeof pagosRevision>[0]["marcas"]) =>
      evaluarCierreRetencion({ periodos: conAjeno, cruce: sinBalance, pagos: pagosRevision({ anio: 2026, periodos: conAjeno, marcas }), oportunidad: [], etiquetaPeriodo: etq })
        .pendientes.filter((p) => p.tipo === "pagos" && p.texto.startsWith("Período 8"));

    it("sigue contando como pago, pero exige marca aunque no haya diferencia", () => {
      const agosto = pagosRevision({ anio: 2026, periodos: conAjeno, marcas: [] }).filas[7];
      expect(agosto).toMatchObject({ estado: "completo", diferencia: 0, requiereMarca: true, totalPagado: 154_801_000 });
      expect(agosto.recibosDeOtro350).toEqual([{ numero: numeroRecibo, numeroPagado: "3510692214725" }]);
      expect(alertaReciboDeOtro350(agosto.recibosDeOtro350![0])).toBe("Recibo de otro 350 (3510692214725)");
    });

    it("impide cerrar hasta marcarlo y no queda repetido como aviso", () => {
      expect(pendientesDeAgosto([]).map((p) => p.texto)).toEqual([`Período 8: el recibo ${numeroRecibo} paga el formulario 3510692214725, que no es un 350 de este período sin marca.`]);
      expect(pendientesDeAgosto([marcar("pago:2026-08", 0)])).toEqual([]);
      const { avisos } = evaluarCierreRetencion({ periodos: conAjeno, cruce: sinBalance, pagos: pagosRevision({ anio: 2026, periodos: conAjeno, marcas: [] }), oportunidad: [], etiquetaPeriodo: etq });
      expect(avisos.some((a) => a.includes("no es un 350 de este período"))).toBe(false);
    });

    it("sin un recibo así, el mes completo no pide marca", () => {
      expect(pagosRevision({ anio: 2026, periodos, marcas: [] }).filas[7].requiereMarca).toBe(false);
    });
  });

  describe("recibos 490 de un mes sin 350", () => {
    // Marzo sin su 350, con el recibo del 61 confirmado.
    const sinMarzo = (causales: { periodo: number; causal: string }[]) => periodosRevision({
      periodicidad: "Mensual", mesCorte: 8, formularios350: F350_2026.filter((f) => f.periodo !== 3), formularios490: F490_2026, porConfirmar: [], causales,
    });
    const reciboMarzo = F490_2026.find((f) => f.periodo === 3)!.numero;
    const sinBalance = { estado: "sin_balance" as const, mensaje: "Sin balance.", balance: null, umbral: 6_000 };
    const pendientesDeMarzo = (causales: { periodo: number; causal: string }[], marcas: Parameters<typeof pagosRevision>[0]["marcas"]) => {
      const periodos3 = sinMarzo(causales);
      return evaluarCierreRetencion({ periodos: periodos3, cruce: sinBalance, pagos: pagosRevision({ anio: 2026, periodos: periodos3, marcas }), oportunidad: [], etiquetaPeriodo: etq })
        .pendientes.filter((p) => p.texto.startsWith("Período 3"));
    };

    it("lo pagado se muestra, es toda la diferencia y exige marca", () => {
      const marzo = pagosRevision({ anio: 2026, periodos: sinMarzo([]), marcas: [] }).filas[2];
      expect(marzo).toMatchObject({
        estado: "falta_350", totalDeclarado: 0, impuestoPagado: 129_528_000, totalPagado: 129_528_000, diferencia: 129_528_000, recibosSin350: [reciboMarzo], requiereMarca: true,
      });
      expect(alertaRecibosSin350(marzo.recibosSin350!)).toBe("Recibo 490 sin 350");
      expect(avisoRecibosSin350(recibosSin350(sinMarzo([])[2]).map((f) => f.numero))).toBe(`El mes no tiene 350 y tiene el recibo 490 ${reciboMarzo}.`);
    });

    it("con la causal de que no hubo formulario también impide cerrar hasta marcarlo", () => {
      const causal = [{ periodo: 3, causal: "No hubo retenciones en marzo" }];
      expect(pagosRevision({ anio: 2026, periodos: sinMarzo(causal), marcas: [] }).filas[2]).toMatchObject({ estado: "sin_formulario", requiereMarca: true });
      const pendientes = pendientesDeMarzo(causal, []);
      expect(pendientes).toHaveLength(1);
      expect(pendientes[0]).toMatchObject({ tipo: "pagos" });
      expect(pendientes[0].texto).toMatch(/^Período 3: el mes no tiene 350 y tiene un recibo 490 por \$ 129.528.000 sin marca\.$/);
      expect(pendientesDeMarzo(causal, [marcar("pago:2026-03", 129_528_000)])).toEqual([]);
      // Si cambian los recibos, la marca queda desactualizada.
      expect(pendientesDeMarzo(causal, [marcar("pago:2026-03", 1)])[0].texto).toMatch(/con la marca desactualizada\.$/);
    });

    it("un mes sin 350 y sin recibos no pide marca", () => {
      expect(pagosRevision({ anio: 2026, periodos: sinMarzo([]), marcas: [] }).filas.filter((f) => f.periodo !== 3).every((f) => !f.recibosSin350?.length)).toBe(true);
      const sinRecibos = periodosRevision({
        periodicidad: "Mensual", mesCorte: 8, formularios350: F350_2026.filter((f) => f.periodo !== 3), formularios490: F490_2026.filter((f) => f.periodo !== 3), porConfirmar: [], causales: [],
      });
      expect(pagosRevision({ anio: 2026, periodos: sinRecibos, marcas: [] }).filas[2]).toMatchObject({ estado: "falta_350", requiereMarca: false, totalPagado: 0, recibosSin350: [] });
    });
  });

  it("una marca de pago vale mientras la diferencia sea la misma", () => {
    const marca = marcar("pago:2026-02", -2_556_000);
    expect(pagosRevision({ anio: 2026, periodos, marcas: [marca] }).filas[1].marca?.vigente).toBe(true);
    expect(pagosRevision({ anio: 2026, periodos, marcas: [{ ...marca, diferencia: 1 }] }).filas[1].marca?.vigente).toBe(false);
  });

  it("cierre: pide el 350 original de enero, el cruce y las marcas de pagos; la marca de oportunidad no reemplaza el original", () => {
    const sinBalance = { estado: "sin_balance" as const, mensaje: "No hay un balance cerrado con corte en 2026-08.", balance: null, umbral: 6_000 };
    const pagos = pagosRevision({ anio: 2026, periodos, marcas: [] });
    const ev = evaluarCierreRetencion({ periodos, cruce: sinBalance, pagos, oportunidad: oportunidad(), etiquetaPeriodo: etq });
    expect(ev.pendientes.map((p) => p.tipo)).toEqual(["formularios", "cruce", ...Array(7).fill("pagos")]);
    expect(ev.pendientes[0].texto).toBe("Período 1: falta el 350 original 3510669606483; hay que cargarlo para cerrar en firme.");
    expect(ev.avisos.some((a) => a.includes("Falta el formulario original"))).toBe(false);

    const marcasPago = pagos.filas.filter((f) => f.requiereMarca).map((f) => marcar(f.clave, f.diferencia));
    const cruceListo = {
      estado: "listo" as const, mensaje: null, umbral: 6_000, inicioEnero: true,
      balance: { id: 1, periodo: "Enero 2026 – Agosto 2026", descripcion: "v1", periodoInicio: "2026-01-01", periodoFin: "2026-08-31" },
      resultado: cruceRetencion({ periodos, mapeo: MAPEO_F350_FABRICA, sinRestaDian: new Set(), tercerosDian: [], nombresRussell: new Map(), filasContables: [], inicioEnero: true, restarSaldoInicial: false, umbral: 1e12, marcas: [] }),
    };
    const conMarcas = evaluarCierreRetencion({
      periodos, cruce: cruceListo, pagos: pagosRevision({ anio: 2026, periodos, marcas: marcasPago }),
      oportunidad: oportunidad({ marcas: [marcar("oportunidad:2026-01", 0)] }), etiquetaPeriodo: etq,
    });
    expect(conMarcas.pendientes.map((p) => p.texto)).toEqual(["Período 1: falta el 350 original 3510669606483; hay que cargarlo para cerrar en firme."]);
    expect(conMarcas.avisos.some((a) => a.includes("saldo inicial"))).toBe(false);

    // Con el original cargado ya no queda nada, y la marca de oportunidad deja de hacer falta.
    const original = { id: 99, periodo: 1, numero: "3510669606483", codigoCorreccion: null, numeroAnterior: null, fechaPresentacion: "2026-02-18", valores: { 130: 122_704_000, 134: 0, 135: 0 } };
    const conOriginal = periodosRevision({ periodicidad: "Mensual", mesCorte: 8, formularios350: [...F350_2026, original], formularios490: F490_2026, porConfirmar: [], causales: [] });
    const listo = evaluarCierreRetencion({
      periodos: conOriginal, cruce: cruceListo, pagos: pagosRevision({ anio: 2026, periodos: conOriginal, marcas: marcasPago }),
      oportunidad: oportunidad({ periodos: conOriginal, marcas: [marcar("oportunidad:2026-01", 0)] }), etiquetaPeriodo: etq,
    });
    expect(listo.pendientes).toEqual([]);
    expect(oportunidad({ periodos: conOriginal, marcas: [marcar("oportunidad:2026-01", 0)] })[0]).toMatchObject({ admiteMarca: false, marca: { vigente: false } });
  });

  it("cierre: lo restado como saldo inicial exige una marca que guarda el total; con ella queda como aviso, y una copia antigua sin el dato no lo menciona", () => {
    const pagos = pagosRevision({ anio: 2026, periodos, marcas: [] });
    const generico = { cuentaCliente: "23652501", nombreCuenta: "Servicios", cuentaRussell: "236525", nit: "Generico", nombreTercero: "Genérico", saldoInicial: -100_000, saldoFinal: -100_000 };
    const resultado = cruceRetencion({ periodos, mapeo: MAPEO_F350_FABRICA, sinRestaDian: new Set(), tercerosDian: [], nombresRussell: new Map(), filasContables: [generico], inicioEnero: true, restarSaldoInicial: true, umbral: 1e12, marcas: [] });
    const cruce = { estado: "listo" as const, mensaje: null, umbral: 1e12, inicioEnero: true, balance: { id: 1, periodo: "Enero 2026 – Agosto 2026", descripcion: "v1", periodoInicio: "2026-01-01", periodoFin: "2026-08-31" }, resultado };
    const evaluar = (c: typeof cruce | ReturnType<typeof conMarcaSaldoInicial>) => evaluarCierreRetencion({ periodos, cruce: c, pagos, oportunidad: oportunidad(), etiquetaPeriodo: etq });

    const sinMarca = evaluar(cruce);
    expect(sinMarca.pendientes.filter((p) => p.tipo === "saldo_inicial").map((p) => p.texto)).toEqual([
      "Saldos restados de NITs con saldo inicial a enero (1 tercero en 1 cuenta): se resta el saldo inicial del saldo final, por $ 100.000, sin marca.",
    ]);
    expect(sinMarca.avisos.some((a) => a.includes("saldo inicial"))).toBe(false);

    const conMarca = evaluar(conMarcaSaldoInicial(cruce, [marcar(CLAVE_MARCA_SALDO_INICIAL, 100_000)]));
    expect(conMarca.pendientes.some((p) => p.tipo === "saldo_inicial")).toBe(false);
    expect(conMarca.avisos).toContain("Cruce contable: saldos restados de NITs con saldo inicial a enero (1 tercero en 1 cuenta): se resta el saldo inicial del saldo final, por $ 100.000 (marca 1).");

    const desactualizada = evaluar(conMarcaSaldoInicial(cruce, [marcar(CLAVE_MARCA_SALDO_INICIAL, 90_000)]));
    expect(desactualizada.pendientes.find((p) => p.tipo === "saldo_inicial")?.texto).toMatch(/con la marca desactualizada\.$/);

    const evAntigua = evaluar({ ...cruce, resultado: { ...resultado, saldoInicial: undefined } });
    expect(evAntigua.avisos.some((a) => a.includes("saldo inicial"))).toBe(false);
    expect(evAntigua.pendientes.some((p) => p.tipo === "saldo_inicial")).toBe(false);
  });

  it("detalle del saldo inicial restado: tercero por tercero y cuenta por cuenta, con la marca; nada si no se resta", () => {
    const filasContables = [
      { cuentaCliente: "23652501", nombreCuenta: "Servicios", cuentaRussell: "236525", nit: "900000001", nombreTercero: "Zeta S.A.S.", saldoInicial: -50_000, saldoFinal: -80_000 },
      { cuentaCliente: "23651501", nombreCuenta: "Honorarios", cuentaRussell: "236515", nit: "900000002", nombreTercero: "Alfa S.A.S.", saldoInicial: -20_000, saldoFinal: -20_000 },
      { cuentaCliente: "23652501", nombreCuenta: "Servicios", cuentaRussell: "236525", nit: "900000003", nombreTercero: "Beta Ltda.", saldoInicial: 0, saldoFinal: -10_000 },
    ];
    const cruceCon = (restar: boolean) => ({
      estado: "listo" as const, mensaje: null, umbral: 1e12, inicioEnero: true,
      balance: { id: 1, periodo: "Enero 2026 – Agosto 2026", descripcion: "v1", periodoInicio: "2026-01-01", periodoFin: "2026-08-31" },

      resultado: cruceRetencion({ periodos, mapeo: MAPEO_F350_FABRICA, sinRestaDian: new Set(), tercerosDian: [], nombresRussell: new Map(), filasContables, inicioEnero: true, restarSaldoInicial: restar, umbral: 1e12, marcas: [] }),
    });
    const detalle = detalleSaldoInicialRestado(conMarcaSaldoInicial(cruceCon(true), [marcar(CLAVE_MARCA_SALDO_INICIAL, 70_000)]));
    expect(detalle).toMatchObject({ terceros: 2, cuentas: 2, total: 70_000, marca: { numero: 1, vigente: true } });
    // Ordenado por tercero; el que no trae saldo inicial no aparece.
    expect(detalle!.filas.map((f) => [f.nombre, f.cuentaCliente, f.cuentaRussell, f.saldoInicial, f.saldoFinal, f.restado])).toEqual([
      ["Alfa S.A.S.", "23651501", "236515", 20_000, 20_000, 20_000],
      ["Zeta S.A.S.", "23652501", "236525", 50_000, 80_000, 50_000],
    ]);
    expect(detalleSaldoInicialRestado(cruceCon(false))).toBeNull();
  });

  it("cierre: un período sin 350 ni causal o con formularios por confirmar lo impide", () => {
    const corteSep = periodosRevision({ periodicidad: "Mensual", mesCorte: 9, formularios350: F350_2026, formularios490: F490_2026, porConfirmar: [{ periodo: 3, formulario: "350", concepto: null }], causales: [] });
    const ev = evaluarCierreRetencion({
      periodos: corteSep, cruce: { estado: "bloqueado", mensaje: "x", balance: null, umbral: 0 },
      pagos: pagosRevision({ anio: 2026, periodos: corteSep, marcas: [] }), oportunidad: [], etiquetaPeriodo: etq,
    });
    expect(ev.pendientes.filter((p) => p.tipo === "formularios").map((p) => p.texto)).toEqual([
      "Período 1: falta el 350 original 3510669606483; hay que cargarlo para cerrar en firme.",
      "Período 3: 1 formulario por confirmar.",
      "Período 9: falta el 350 o la causal de que no hubo formulario.",
    ]);
  });
});
