import { describe, expect, it } from "vitest";
import { CONTROLES_QUE_RECHAZAN, controlesLectura, lecturaConErrores, normalizarLectura, normalizarPeriodicidad, type LecturaCruda, type LecturaFormulario } from "../retencion/lectura";
import { etiquetaEstadoPeriodo, etiquetaPeriodoRevision, periodosRevision, type Formulario350, type Formulario490 } from "../retencion/periodos-revision";

/** Un 300 bimestral como lo transcribe la IA (cifras del bimestre 1 del levantamiento). */
function cruda300(cambios: Partial<LecturaCruda> = {}): LecturaCruda {
  return {
    formulario: "300", anio: "2026", periodo: "1", numero: "3006620171766", nit: "9020589733", dv: "", razonSocial: "CLIENTE DE PRUEBA S.A.S.",
    periodicidad: "Bimestral", codigoCorreccion: "", numeroAnterior: "", concepto: "", numeroPagado: "", cuota: "", deCuotas: "", fechaLimitePago: "",
    autoadhesivo: "91000123456789", fechaSello: "2 0 2 6 -0 3 -1 2 / 10:15:00 AM",
    renglones: [
      { renglon: 28, valor: "151,375,000" }, { renglon: 39, valor: "22,639,384,000" }, { renglon: 40, valor: "5,435,250,000" },
      { renglon: 41, valor: "28,226,009,000" }, { renglon: 42, valor: "0" }, { renglon: 43, valor: "28,226,009,000" },
      { renglon: 51, valor: "999,000" }, // compras: no se guardan
      { renglon: 59, valor: "28,761,000" }, { renglon: 67, valor: "28,761,000" }, { renglon: 77, valor: "0" }, { renglon: 81, valor: "0" },
      { renglon: 82, valor: "28,761,000" }, { renglon: 83, valor: "0" }, { renglon: 86, valor: "28,761,000" }, { renglon: 88, valor: "28,761,000" },
      { renglon: 89, valor: "0" }, { renglon: 93, valor: "0" }, { renglon: 980, valor: "0" },
    ],
    exterior: [],
    ...cambios,
  };
}

function cruda490(cambios: Partial<LecturaCruda> = {}): LecturaCruda {
  return {
    formulario: "490", anio: "2026", periodo: "1", numero: "4910000000001", nit: "902058973", dv: "3", razonSocial: "CLIENTE DE PRUEBA S.A.S.",
    codigoCorreccion: "", numeroAnterior: "", concepto: "5", numeroPagado: "3006620171766", cuota: "", deCuotas: "", fechaLimitePago: "2026-03-12",
    autoadhesivo: "", fechaSello: "2026-03-12",
    renglones: [{ renglon: 34, valor: "0" }, { renglon: 35, valor: "0" }, { renglon: 36, valor: "28,761,000" }, { renglon: 980, valor: "28,761,000" }],
    exterior: [],
    ...cambios,
  };
}

const IVA_BIMESTRAL = { nitCliente: "902058973", anio: 2026, mesCorte: 8, impuesto: "IVA" as const, periodicidad: "Bimestral" };
const RETENCION = { nitCliente: "902058973", anio: 2026, mesCorte: 9 };
const fallan = (l: LecturaFormulario, ctx: Parameters<typeof controlesLectura>[1]) => controlesLectura(l, ctx).filter((c) => !c.ok).map((c) => c.clave);

describe("lectura del formulario 300", () => {
  it("reconoce el 300, su periodicidad y descarta las compras", () => {
    const l = normalizarLectura(cruda300());
    expect(l).toMatchObject({ formulario: "300", periodo: 1, periodicidad: "Bimestral", nit: "902058973", dv: "3", fechaSello: "2026-03-12" });
    expect(l.valores[59]).toBe(28_761_000);
    expect(l.valores[51]).toBeUndefined();
    expect(l.valores[88]).toBe(28_761_000);
  });

  it("lee la casilla 24 aunque venga con la X o en minúsculas", () => {
    expect(normalizarPeriodicidad("X Cuatrimestral")).toBe("Cuatrimestral");
    expect(normalizarPeriodicidad("bimestral")).toBe("Bimestral");
    expect(normalizarPeriodicidad("Anual")).toBe("Anual");
    expect(normalizarPeriodicidad("")).toBeNull();
    // Una lectura guardada antes del IVA no trae la periodicidad.
    expect(normalizarLectura({ ...cruda300(), periodicidad: undefined }).periodicidad).toBeNull();
  });

  it("un 300 del bimestre 1 que cuadra no tiene nada por corregir en una revisión de IVA", () => {
    expect(fallan(normalizarLectura(cruda300()), IVA_BIMESTRAL)).toEqual([]);
  });

  it("la periodicidad del formulario tiene que ser la del cliente; si no se leyó, solo avisa", () => {
    const cuatri = controlesLectura(normalizarLectura(cruda300({ periodicidad: "Cuatrimestral" })), IVA_BIMESTRAL);
    expect(cuatri.find((c) => c.clave === "periodicidad")).toMatchObject({ ok: false, bloquea: true });
    const sinLeer = controlesLectura(normalizarLectura(cruda300({ periodicidad: "" })), IVA_BIMESTRAL);
    expect(sinLeer.find((c) => c.clave === "periodicidad")).toMatchObject({ ok: false, bloquea: false });
    expect(lecturaConErrores(sinLeer)).toBe(false);
  });

  it("el período tiene que existir con la periodicidad y el posterior al corte se guarda con aviso", () => {
    expect(fallan(normalizarLectura(cruda300({ periodo: "7" })), IVA_BIMESTRAL)).toContain("periodo");
    const quinto = controlesLectura(normalizarLectura(cruda300({ periodo: "5" })), IVA_BIMESTRAL);
    expect(quinto.find((c) => c.clave === "corte")).toMatchObject({ ok: false, bloquea: false });
  });

  it("un total con piso cero que no cuadra bloquea en el renglón donde ocurre", () => {
    const mal = cruda300();
    mal.renglones = mal.renglones.map((r) => (r.renglon === 86 ? { ...r, valor: "28,000,000" } : r));
    expect(fallan(normalizarLectura(mal), IVA_BIMESTRAL)).toEqual(["total_86"]);
  });

  it("avisa sin bloquear si 90 + 91 + 92 no da el 89", () => {
    const aFavor = cruda300();
    aFavor.renglones = [...aFavor.renglones.filter((r) => r.renglon < 82 || r.renglon > 93), { renglon: 82, valor: "0" }, { renglon: 83, valor: "0" }, { renglon: 84, valor: "5,000,000" },
      { renglon: 86, valor: "0" }, { renglon: 88, valor: "0" }, { renglon: 89, valor: "5,000,000" }, { renglon: 90, valor: "1,000,000" }, { renglon: 93, valor: "4,000,000" }];
    aFavor.renglones = aFavor.renglones.map((r) => (r.renglon === 59 || r.renglon === 67 ? { ...r, valor: "0" } : r));
    const controles = controlesLectura(normalizarLectura(aFavor), IVA_BIMESTRAL);
    expect(controles.find((c) => c.clave === "saldos_89")).toMatchObject({ ok: false, bloquea: false });
    expect(lecturaConErrores(controles)).toBe(false);
  });

  it("es una corrección cuando el renglón 25 es 1 y trae el 26", () => {
    const l = normalizarLectura(cruda300({ numero: "3006620171999", codigoCorreccion: "1", numeroAnterior: "3006620171766" }));
    expect(l).toMatchObject({ codigoCorreccion: 1, numeroAnterior: "3006620171766" });
    expect(fallan(l, IVA_BIMESTRAL)).toEqual([]);
  });
});

describe("cada impuesto rechaza los formularios del otro", () => {
  it("un 350 en una revisión de IVA se rechaza al importar", () => {
    const l = normalizarLectura({ ...cruda300(), formulario: "350", numero: "3510669606483", periodicidad: "" });
    const c = controlesLectura(l, IVA_BIMESTRAL).find((x) => x.clave === "formulario");
    expect(c).toMatchObject({ ok: false, mensaje: "Es un formulario 350: cárgalo en Retención en la fuente." });
    expect(CONTROLES_QUE_RECHAZAN).toContain("formulario");
  });

  it("un 300 en una revisión de Retención se rechaza al importar", () => {
    const c = controlesLectura(normalizarLectura(cruda300()), RETENCION).find((x) => x.clave === "formulario");
    expect(c).toMatchObject({ ok: false, mensaje: "Es un formulario 300: cárgalo en IVA." });
  });

  it("un 490 de Retención en IVA, y uno de IVA en Retención, se rechazan al importar", () => {
    const de61 = controlesLectura(normalizarLectura(cruda490({ concepto: "61", numeroPagado: "3510669606483" })), IVA_BIMESTRAL);
    expect(de61.find((c) => c.clave === "otro_impuesto")).toMatchObject({ ok: false, bloquea: true });
    const de05 = controlesLectura(normalizarLectura(cruda490()), RETENCION);
    expect(de05.find((c) => c.clave === "otro_impuesto")).toMatchObject({ ok: false, mensaje: "El recibo es del concepto 05 (IVA): cárgalo en IVA." });
    expect(CONTROLES_QUE_RECHAZAN).toContain("otro_impuesto");
  });
});

describe("recibo 490 de IVA", () => {
  it("el concepto se lee con dos dígitos y tiene que ser el de la periodicidad", () => {
    const l = normalizarLectura(cruda490());
    expect(l.concepto).toBe("05");
    expect(fallan(l, IVA_BIMESTRAL)).toEqual([]);
    const cuatri = controlesLectura(normalizarLectura(cruda490({ concepto: "57" })), IVA_BIMESTRAL).find((c) => c.clave === "concepto");
    expect(cuatri).toMatchObject({ ok: false, mensaje: "El concepto 57 no corresponde a la periodicidad bimestral (se espera 05)." });
  });

  it("el formulario que paga tiene que ser un 300", () => {
    expect(fallan(normalizarLectura(cruda490({ numeroPagado: "3510669606483" })), IVA_BIMESTRAL)).toEqual(["pagado"]);
  });
});

const f300 = (id: number, periodo: number, valores: Record<number, number>, extra: Partial<Formulario350> = {}): Formulario350 & { periodo: number } => ({
  id, periodo, numero: `30066201717${String(id).padStart(2, "0")}`, codigoCorreccion: null, numeroAnterior: null, fechaPresentacion: "2026-03-12", valores, ...extra,
});
const f490 = (id: number, periodo: number, concepto: string, pagado: string, impuesto: number): Formulario490 & { periodo: number } => ({
  id, periodo, numero: `49100000000${String(id).padStart(2, "0")}`, concepto, numeroPagado: pagado, fechaPago: "2026-03-12", valores: { 36: impuesto, 980: impuesto },
});

describe("períodos de una revisión de IVA", () => {
  const base = { impuesto: "IVA" as const, periodicidad: "Bimestral", mesCorte: 8, porConfirmar: [], causales: [] };

  it("espera un 490 del concepto 05 si el total a pagar (88) es mayor que cero", () => {
    const periodos = periodosRevision({ ...base, formularios350: [f300(1, 1, { 82: 1_000_000, 86: 1_000_000, 88: 1_000_000 })], formularios490: [] });
    expect(periodos.map((p) => p.periodo)).toEqual([1, 2, 3, 4]);
    expect(periodos[0]).toMatchObject({ estado: "faltan_pagos", pagosFaltantes: ["05"] });
    expect(periodos[0].pagos).toEqual([expect.objectContaining({ concepto: "05", renglon: 86, declarado: 1_000_000, esperado: true })]);
    expect(periodos[1].estado).toBe("falta_350");
    expect(etiquetaEstadoPeriodo(periodos[1].estado, "300")).toBe("Falta el 300");
  });

  it("con el recibo queda completo; con saldo a favor (88 en cero) no espera recibo", () => {
    const conPago = periodosRevision({ ...base, formularios350: [f300(1, 1, { 82: 1_000_000, 86: 1_000_000, 88: 1_000_000 })], formularios490: [f490(2, 1, "05", "3006620171701", 1_000_000)] });
    expect(conPago[0]).toMatchObject({ estado: "completo", pagosFaltantes: [] });
    expect(conPago[0].pagos[0]).toMatchObject({ impuesto: 1_000_000 });
    const aFavor = periodosRevision({ ...base, formularios350: [f300(1, 1, { 83: 4_000_000, 89: 4_000_000 })], formularios490: [] });
    expect(aFavor[0]).toMatchObject({ estado: "completo", pagosFaltantes: [] });
    expect(aFavor[0].pagos[0].esperado).toBe(false);
  });

  it("el 88 se recalcula: un impreso que no cuadra no decide si se espera el pago", () => {
    const periodos = periodosRevision({ ...base, formularios350: [f300(1, 1, { 82: 2_000_000, 85: 500_000, 88: 0 })], formularios490: [] });
    expect(periodos[0].pagos[0].esperado).toBe(true);
  });

  it("la corrección rige y el original queda en la cadena", () => {
    const original = f300(1, 2, { 82: 1_000_000, 86: 1_000_000, 88: 1_000_000 }, { numero: "3006620171701", fechaPresentacion: "2026-05-12" });
    const correccion = f300(3, 2, { 82: 1_200_000, 86: 1_200_000, 88: 1_200_000 }, { numero: "3006620171703", codigoCorreccion: 1, numeroAnterior: "3006620171701", fechaPresentacion: "2026-06-01" });
    const [, p2] = periodosRevision({ ...base, formularios350: [original, correccion], formularios490: [f490(4, 2, "05", "3006620171701", 1_000_000)] });
    expect(p2.cadena.vigente?.numero).toBe("3006620171703");
    expect(p2.cadena.original?.numero).toBe("3006620171701");
    expect(p2.recibosDeOtro350).toEqual([]);
  });

  it("un 490 por confirmar con un concepto que no es del impuesto cuenta como recibo sin concepto", () => {
    const periodos = periodosRevision({
      ...base, formularios350: [], formularios490: [],
      porConfirmar: [{ periodo: 1, formulario: "490", concepto: "61" }, { periodo: 1, formulario: "490", concepto: "05" }],
    });
    expect(periodos[0].recibosSinConcepto).toBe(1);
  });

  it("cuatrimestral a agosto espera dos períodos y el anual a diciembre, uno", () => {
    expect(periodosRevision({ ...base, periodicidad: "Cuatrimestral", formularios350: [], formularios490: [] }).map((p) => p.mesFin)).toEqual([4, 8]);
    const anual = periodosRevision({ ...base, periodicidad: "Anual", mesCorte: 12, formularios350: [f300(1, 1, { 88: 1_000 })], formularios490: [] });
    expect(anual).toHaveLength(1);
    expect(anual[0].pagos.map((p) => p.concepto)).toEqual(["58"]);
  });

  it("nombra los períodos con la periodicidad", () => {
    expect(etiquetaPeriodoRevision("Bimestral", 4)).toBe("Bimestre 04 · Julio-Agosto");
    expect(etiquetaPeriodoRevision("Mensual", 9)).toBe("Septiembre");
  });
});
