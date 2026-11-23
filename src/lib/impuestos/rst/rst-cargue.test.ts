import { describe, expect, it } from "vitest";
import { CalendarioDianSchema, ConfirmarFormularioDianSchema, RevisionImpuestoSchema } from "@/lib/definitions";
import { fechaVencimiento, validarCalendario } from "../calendario";
import { CALENDARIO_RST_ANTICIPO_2026 } from "../__fixtures__/calendario-rst-2026";
import { calcularTotal, controlarTotales, controlarValidaciones, renglonesConImporte, rotuloRenglon } from "../formularios/definicion";
import { F2593, RENGLON_TOTAL_F2593 } from "../formularios/f2593";
import {
  conceptosPagoDe,
  descripcionCorte,
  fechaCorteTexto,
  impuestoPorDeclaracion,
  impuestoPorSlug,
  IVA,
  midePresentacion,
  nombreCorte,
  renglonSanciones,
  RETENCION,
  RST,
  tipoCorte,
} from "../impuestos-dian";
import { CONTROLES_QUE_RECHAZAN, controlesLectura, lecturaConErrores, mapaValores, normalizarLectura, type LecturaCruda, type LecturaFormulario } from "../retencion/lectura";
import { pagosRevision } from "../retencion/pagos";
import { periodosRevision, valoresAPagar, type Formulario350, type Formulario490 } from "../retencion/periodos-revision";

/**
 * Anticipos bimestrales del Régimen Simple (RST): recibo 2593 y 490 concepto 27. Las cifras son las del
 * bimestre 1 de 2026 de un recibo real; el NIT y el nombre son ficticios, con el mismo último dígito (8).
 */

const NIT = "900000008";
const NUMERO_2593 = "25936612172158";
const NUMERO_490 = "4911122439291";

/** Un 2593 del bimestre 1 como lo transcribe la IA. */
function cruda2593(cambios: Partial<LecturaCruda> = {}): LecturaCruda {
  return {
    formulario: "2593", anio: "2026", periodo: "1", numero: NUMERO_2593, nit: NIT, dv: "", razonSocial: "CLIENTE SIMPLE DE PRUEBA S.A.S.",
    periodicidad: "", codigoCorreccion: "", numeroAnterior: "", concepto: "", numeroPagado: "", cuota: "", deCuotas: "", fechaLimitePago: "",
    // El 2593 no tiene sello: si la IA copia la fecha del 490 asociado (casilla 81), no cuenta.
    autoadhesivo: "", fechaSello: "2 0 2 6 0 5 2 0",
    renglones: [
      { renglon: 26, valor: "0" }, { renglon: 27, valor: "0" }, { renglon: 28, valor: "870,016,000" }, { renglon: 29, valor: "0" },
      { renglon: 36, valor: "4.5" }, // tarifa: es un porcentaje y no se guarda
      { renglon: 39, valor: "870,016,000" }, { renglon: 40, valor: "0" }, { renglon: 41, valor: "870,016,000" }, { renglon: 42, valor: "39,151,000" },
      { renglon: 43, valor: "10,005,000" }, { renglon: 44, valor: "29,146,000" }, { renglon: 45, valor: "1,113,000" }, { renglon: 46, valor: "0" },
      { renglon: 47, valor: "1,113,000" }, { renglon: 48, valor: "0" }, { renglon: 49, valor: "28,033,000" }, { renglon: 50, valor: "0" },
      { renglon: 51, valor: "0" }, { renglon: 52, valor: "0" }, { renglon: 53, valor: "28,033,000" }, { renglon: 54, valor: "0" },
      { renglon: 55, valor: "0" }, { renglon: 56, valor: "28,033,000" }, { renglon: 57, valor: "0" }, { renglon: 59, valor: "0" },
      { renglon: 61, valor: "0" }, { renglon: 64, valor: "0" }, { renglon: 65, valor: "0" }, { renglon: 66, valor: "165,303,000" },
      { renglon: 67, valor: "306,000" }, { renglon: 68, valor: "0" }, { renglon: 69, valor: "0" }, { renglon: 70, valor: "24,795,000" },
      { renglon: 71, valor: "140,202,000" }, { renglon: 72, valor: "0" }, { renglon: 73, valor: "0" }, { renglon: 74, valor: "140,202,000" },
      { renglon: 75, valor: "0" }, { renglon: 76, valor: "10,005,000" }, { renglon: 77, valor: "28,033,000" }, { renglon: 78, valor: "0" },
      { renglon: 79, valor: "140,202,000" },
      { renglon: 90, valor: "870,016,000" }, // de la hoja 2: entre los renglones de la hoja 1 no se guarda
    ],
    exterior: [],
    // La hoja 2 del mismo recibo: un municipio, con el ICA del 43 y el 76.
    ica: [{
      pagina: "1", departamento: "ANTIOQUIA", codigoDepartamento: "05", municipio: "MEDELLIN", codigoMunicipio: "001",
      renglones: [84, 90].map((renglon) => ({ renglon, valor: "870,016,000" })).concat([95, 97, 99, 101, 104].map((renglon) => ({ renglon, valor: "10,005,000" }))),
      actividades: [{ ciiu: "4659", ingresosGravados: "870,016,000", tarifaPorMil: "11,5", impuesto: "10,005,000" }],
      tarifaDelMunicipio: "X", tarifaDelContribuyente: "",
    }],
    ...cambios,
  };
}

/** Su 490 concepto 27. */
function cruda490(cambios: Partial<LecturaCruda> = {}): LecturaCruda {
  return {
    formulario: "490", anio: "2026", periodo: "1", numero: NUMERO_490, nit: NIT, dv: "", razonSocial: "CLIENTE SIMPLE DE PRUEBA S.A.S.",
    codigoCorreccion: "", numeroAnterior: "", concepto: "27", numeroPagado: NUMERO_2593, cuota: "1", deCuotas: "1", fechaLimitePago: "2026-05-20",
    autoadhesivo: "7996603079438", fechaSello: "2 0 2 6 -0 5 -2 0 /1 0 :0 6 :1 4",
    renglones: [{ renglon: 34, valor: "0" }, { renglon: 35, valor: "0" }, { renglon: 36, valor: "178,240,000" }, { renglon: 980, valor: "178,240,000" }],
    exterior: [],
    ...cambios,
  };
}

const CTX_RST = { nitCliente: NIT, anio: 2026, mesCorte: 8, impuesto: "RST" as const, periodicidad: "Bimestral" };
const CTX_IVA = { nitCliente: NIT, anio: 2026, mesCorte: 8, impuesto: "IVA" as const, periodicidad: "Bimestral" };
const CTX_RET = { nitCliente: NIT, anio: 2026, mesCorte: 9 };
const fallan = (l: LecturaFormulario, ctx: Parameters<typeof controlesLectura>[1]) => controlesLectura(l, ctx).filter((c) => !c.ok).map((c) => c.clave);

describe("formulario 2593", () => {
  it("guarda los valores de la hoja 1 (no la tarifa, ni la hoja 2, ni una fecha) y calcula 76 + 77 + 78 + 79", () => {
    const l = normalizarLectura(cruda2593());
    expect(l).toMatchObject({ formulario: "2593", periodo: 1, nit: NIT, fechaSello: null, codigoCorreccion: null });
    expect(l.valores[28]).toBe(870_016_000);
    expect(l.valores[36]).toBeUndefined();
    expect(l.valores[90]).toBeUndefined();
    expect(calcularTotal(F2593, RENGLON_TOTAL_F2593, mapaValores(l.valores))).toBe(178_240_000);
    expect(rotuloRenglon(F2593, RENGLON_TOTAL_F2593)).toBe("76 a 79");
    // El total calculado no se lee ni se guarda, y no es un total impreso con control.
    expect(renglonesConImporte(F2593)).not.toContain(RENGLON_TOTAL_F2593);
    expect(controlarTotales(F2593, mapaValores(l.valores))).toEqual([]);
  });

  it("un recibo real del bimestre 1 no tiene nada por corregir ni avisos en una revisión de RST", () => {
    const l = normalizarLectura(cruda2593());
    expect(fallan(l, CTX_RST)).toEqual([]);
    expect(controlarValidaciones(F2593, mapaValores(l.valores)).filter((v) => !v.cuadra)).toEqual([]);
  });

  it("el número tiene 14 dígitos y empieza por 2593", () => {
    expect(fallan(normalizarLectura(cruda2593({ numero: "2593661217215" })), CTX_RST)).toEqual(["numero"]);
    expect(fallan(normalizarLectura(cruda2593({ numero: "25946612172158" })), CTX_RST)).toEqual(["numero"]);
    expect(CONTROLES_QUE_RECHAZAN).toContain("numero");
  });

  it("no pide la fecha del sello", () => {
    const controles = controlesLectura(normalizarLectura(cruda2593({ fechaSello: "" })), CTX_RST);
    expect(controles.find((c) => c.clave === "fecha")).toBeUndefined();
  });

  it("las fórmulas del recibo solo avisan si no cuadran", () => {
    const mal = cruda2593();
    mal.renglones = mal.renglones.map((r) => (r.renglon === 77 ? { ...r, valor: "28,000,000" } : r));
    const controles = controlesLectura(normalizarLectura(mal), CTX_RST);
    expect(controles.find((c) => c.clave === "cuadre_77")).toMatchObject({ ok: false, bloquea: false });
    expect(lecturaConErrores(controles)).toBe(false);
  });

  it("el saldo con «resultado positivo» se toma en cero si da negativo", () => {
    // Retenciones previas mayores que el anticipo neto: 53 = 49 − 50 da negativo y el formulario dice 0.
    const aFavor = cruda2593();
    aFavor.renglones = aFavor.renglones.map((r) => (r.renglon === 50 ? { ...r, valor: "30,000,000" } : r.renglon === 53 ? { ...r, valor: "0" } : r));
    const v = controlarValidaciones(F2593, mapaValores(normalizarLectura(aFavor).valores)).find((x) => x.clave === "cuadre_53");
    expect(v).toMatchObject({ calculado: 0, cuadra: true });
  });

  it("la 59 debe ser el 8 % de la 58, con hasta $1.000 de redondeo a miles; si no, avisa sin bloquear", () => {
    const consumo = (c58: string, c59: string) => {
      const cruda = cruda2593();
      cruda.renglones = [...cruda.renglones.filter((r) => r.renglon !== 58 && r.renglon !== 59), { renglon: 58, valor: c58 }, { renglon: 59, valor: c59 }];
      return normalizarLectura(cruda);
    };
    // 50.016.000 × 8 % = 4.001.280, que el recibo aproxima a 4.001.000.
    const redondeado = controlarValidaciones(F2593, mapaValores(consumo("50,016,000", "4,001,000").valores)).find((v) => v.clave === "cuadre_59");
    expect(redondeado).toMatchObject({ calculado: 4_001_280, contra: 4_001_000, cuadra: true, factor: 0.08 });
    const mal = consumo("50,016,000", "4,500,000");
    expect(controlarValidaciones(F2593, mapaValores(mal.valores)).find((v) => v.clave === "cuadre_59")?.cuadra).toBe(false);
    expect(controlesLectura(mal, CTX_RST).find((c) => c.clave === "cuadre_59")).toMatchObject({
      ok: false,
      bloquea: false,
      mensaje: "Impuesto al consumo: el 8 % de la 58 debe ser igual al 59: da $4.001.280 y el 59 dice $4.500.000.",
    });
  });

  it("el ajuste se lee de la casilla 24 (1 o X) y pide el recibo que ajusta, de 14 dígitos", () => {
    const ajuste = normalizarLectura(cruda2593({ numero: "25936612179999", codigoCorreccion: "X", numeroAnterior: NUMERO_2593 }));
    expect(ajuste).toMatchObject({ codigoCorreccion: 1, numeroAnterior: NUMERO_2593 });
    expect(fallan(ajuste, CTX_RST)).toEqual([]);
    const sinAnterior = controlesLectura(normalizarLectura(cruda2593({ codigoCorreccion: "1", numeroAnterior: "" })), CTX_RST).find((c) => c.clave === "correccion");
    expect(sinAnterior).toMatchObject({ ok: false, mensaje: "Es un ajuste (renglón 24) pero falta el recibo que ajusta (renglón 25)." });
  });
});

describe("RST y los demás impuestos rechazan los formularios del otro", () => {
  it("un 350 o un 300 en una revisión de RST se rechazan", () => {
    const de350 = controlesLectura(normalizarLectura({ ...cruda2593(), formulario: "350", numero: "3510669606483" }), CTX_RST).find((c) => c.clave === "formulario");
    expect(de350).toMatchObject({ ok: false, mensaje: "Es un formulario 350: cárgalo en Retención en la fuente." });
    const de300 = controlesLectura(normalizarLectura({ ...cruda2593(), formulario: "300", numero: "3006620171766" }), CTX_RST).find((c) => c.clave === "formulario");
    expect(de300).toMatchObject({ ok: false, mensaje: "Es un formulario 300: cárgalo en IVA." });
  });

  it("un 2593 en una revisión de IVA o de Retención se rechaza", () => {
    for (const ctx of [CTX_IVA, CTX_RET]) {
      const c = controlesLectura(normalizarLectura(cruda2593()), ctx).find((x) => x.clave === "formulario");
      expect(c).toMatchObject({ ok: false, mensaje: "Es un formulario 2593: cárgalo en Anticipos bimestrales (RST)." });
    }
  });

  it("un 490 concepto 27 en IVA o en Retención, y uno de IVA en RST, se rechazan", () => {
    const de27 = controlesLectura(normalizarLectura(cruda490()), CTX_IVA).find((c) => c.clave === "otro_impuesto");
    expect(de27).toMatchObject({ ok: false, mensaje: "El recibo es del concepto 27 (Anticipos bimestrales (RST)): cárgalo en Anticipos bimestrales (RST)." });
    expect(fallan(normalizarLectura(cruda490()), CTX_RET)).toContain("otro_impuesto");
    expect(fallan(normalizarLectura(cruda490({ concepto: "05" })), CTX_RST)).toContain("otro_impuesto");
  });
});

describe("recibo 490 concepto 27", () => {
  it("el recibo real del bimestre 1 no tiene nada por corregir", () => {
    const l = normalizarLectura(cruda490());
    expect(l).toMatchObject({ concepto: "27", numeroPagado: NUMERO_2593, fechaSello: "2026-05-20" });
    expect(fallan(l, CTX_RST)).toEqual([]);
  });

  it("el formulario que paga tiene que ser un 2593 de 14 dígitos", () => {
    expect(fallan(normalizarLectura(cruda490({ numeroPagado: "3006620171766" })), CTX_RST)).toEqual(["pagado"]);
  });
});

const f2593 = (id: number, periodo: number, valores: Record<number, number>, extra: Partial<Formulario350> = {}): Formulario350 & { periodo: number } => ({
  id, periodo, numero: `259366121721${String(id).padStart(2, "0")}`, codigoCorreccion: null, numeroAnterior: null, fechaPresentacion: null, valores, ...extra,
});
const f490 = (id: number, periodo: number, pagado: string, impuesto: number, extra: { sancion?: number; intereses?: number; fecha?: string } = {}): Formulario490 & { periodo: number } => {
  const sancion = extra.sancion ?? 0;
  const intereses = extra.intereses ?? 0;
  return {
    id, periodo, numero: `49111224392${String(id).padStart(2, "0")}`, concepto: "27", numeroPagado: pagado, fechaPago: extra.fecha ?? "2026-05-20",
    valores: { 34: sancion, 35: intereses, 36: impuesto, 980: sancion + intereses + impuesto },
  };
};
/** Valores a pagar del bimestre 1: ICA, anticipo SIMPLE, consumo e IVA (suman 178.240.000). */
const PAGAR_B1 = { 76: 10_005_000, 77: 28_033_000, 78: 0, 79: 140_202_000 };

describe("períodos y pagos de una revisión de RST", () => {
  const base = { impuesto: "RST" as const, periodicidad: "Bimestral", mesCorte: 4, porConfirmar: [], causales: [] };

  it("espera un 490 concepto 27 si 76 a 79 suman más de cero y con él queda completo", () => {
    const recibo = f2593(1, 1, PAGAR_B1);
    const sinPago = periodosRevision({ ...base, formularios350: [recibo], formularios490: [] });
    expect(sinPago.map((p) => p.periodo)).toEqual([1, 2]);
    expect(sinPago[0]).toMatchObject({ estado: "faltan_pagos", pagosFaltantes: ["27"] });
    expect(sinPago[0].pagos).toEqual([expect.objectContaining({ concepto: "27", renglon: RENGLON_TOTAL_F2593, declarado: 178_240_000, esperado: true })]);
    const conPago = periodosRevision({ ...base, formularios350: [recibo], formularios490: [f490(2, 1, recibo.numero, 178_240_000)] });
    expect(conPago[0]).toMatchObject({ estado: "completo", pagosFaltantes: [], recibosDeOtro350: [] });
  });

  it("con los valores a pagar en cero no espera recibo", () => {
    const periodos = periodosRevision({ ...base, formularios350: [f2593(1, 1, { 76: 0, 77: 0, 78: 0, 79: 0, 57: 5_000_000 })], formularios490: [] });
    expect(periodos[0]).toMatchObject({ estado: "completo" });
    expect(periodos[0].pagos[0].esperado).toBe(false);
  });

  it("Pagos efectuados: 76 a 79 contra la casilla 36; la sanción y los intereses van aparte", () => {
    const recibo = f2593(1, 1, PAGAR_B1);
    const pagar = (recibos: (Formulario490 & { periodo: number })[]) =>
      pagosRevision({ impuesto: "RST", anio: 2026, periodos: periodosRevision({ ...base, formularios350: [recibo], formularios490: recibos }), marcas: [] }).filas[0];
    expect(pagar([f490(2, 1, recibo.numero, 178_240_000)])).toMatchObject({ estado: "completo", retenciones: 178_240_000, totalDeclarado: 178_240_000, diferencia: 0, requiereMarca: false });
    const conSancion = pagar([f490(2, 1, recibo.numero, 178_240_000, { sancion: 500_000, intereses: 120_000 })]);
    expect(conSancion).toMatchObject({ diferencia: 0, sancionPagada: 500_000, intereses: 120_000, totalPagado: 178_240_000, sanciones: 0 });
    expect(pagar([f490(2, 1, recibo.numero, 178_000_000)])).toMatchObject({ estado: "diferencia", diferencia: -240_000, requiereMarca: true });
    const sinRecibo = pagar([]);
    expect(sinRecibo).toMatchObject({ estado: "diferencia", diferencia: -178_240_000, requiereMarca: true });
  });

  it("un ajuste suma los valores a pagar del recibo ajustado que ya se pagó", () => {
    const inicial = f2593(1, 1, PAGAR_B1);
    // El ajuste descuenta lo ya pagado (casilla 55): su anticipo a pagar trae solo lo adicional.
    const ajuste = f2593(3, 1, { 76: 0, 77: 1_000_000, 78: 0, 79: 0 }, { codigoCorreccion: 1, numeroAnterior: inicial.numero });
    const recibos = [f490(2, 1, inicial.numero, 178_240_000), f490(4, 1, ajuste.numero, 1_000_000, { fecha: "2026-06-30" })];
    const [p1] = periodosRevision({ ...base, formularios350: [inicial, ajuste], formularios490: recibos });
    expect(p1.cadena.vigente?.numero).toBe(ajuste.numero);
    expect(p1.pagos[0].declarado).toBe(179_240_000);
    const fila = pagosRevision({ impuesto: "RST", anio: 2026, periodos: [p1], marcas: [] }).filas[0];
    expect(fila).toMatchObject({ diferencia: 0, retenciones: 179_240_000, impuestoPagado: 179_240_000 });
  });

  it("un ajuste de un recibo que no se pagó lo reemplaza entero", () => {
    const inicial = f2593(1, 1, PAGAR_B1);
    const ajuste = f2593(3, 1, { ...PAGAR_B1, 77: 28_500_000 }, { codigoCorreccion: 1, numeroAnterior: inicial.numero });
    const valores = valoresAPagar(RST, { vigente: ajuste, cadena: [inicial, ajuste] }, [{ numeroPagado: ajuste.numero }]);
    expect(calcularTotal(F2593, RENGLON_TOTAL_F2593, valores!)).toBe(178_707_000);
  });

  it("Retención e IVA miden solo la declaración vigente", () => {
    const inicial = f2593(1, 1, { 86: 1_000 });
    const correccion = f2593(3, 1, { 86: 1_500 }, { codigoCorreccion: 1, numeroAnterior: inicial.numero });
    const valores = valoresAPagar(IVA, { vigente: correccion, cadena: [inicial, correccion] }, [{ numeroPagado: inicial.numero }]);
    expect(valores?.get(86)).toBe(1_500);
  });
});

describe("calendario «RST – Anticipo bimestral» 2026", () => {
  it("se guarda sin errores ni avisos (el primer bimestre vence en mayo)", () => {
    expect(validarCalendario(2026, "RST_ANTICIPO", CALENDARIO_RST_ANTICIPO_2026)).toEqual({ errores: [], avisos: [] });
  });

  it("vence por el último dígito del NIT sin el DV", () => {
    const vence = (periodo: number) => fechaVencimiento(CALENDARIO_RST_ANTICIPO_2026, periodo, NIT);
    expect([1, 2, 3, 4, 5, 6].map(vence)).toEqual(["2026-05-22", "2026-06-22", "2026-07-22", "2026-09-18", "2026-11-23", "2027-01-22"]);
    expect(fechaVencimiento(CALENDARIO_RST_ANTICIPO_2026, 1, "901522418-3")).toBe("2026-05-22");
  });
});

describe("descriptor de RST", () => {
  it("es el tercer impuesto: 2593, bimestral, concepto 27, sin presentación, con cruce y cierre en firme", () => {
    expect(impuestoPorSlug("rst")).toBe(RST);
    expect(impuestoPorDeclaracion("2593")).toBe(RST);
    expect(RST.periodicidades).toEqual(["Bimestral"]);
    expect(conceptosPagoDe(RST, "Bimestral").map((c) => c.concepto)).toEqual(["27"]);
    expect(RST.calendario("Bimestral", 2026)).toEqual({ formulario: "RST_ANTICIPO", anio: 2026 });
    expect(midePresentacion(RST)).toBe(false);
    expect(midePresentacion(IVA)).toBe(true);
    expect(RST.requiereRegimenSimple && RST.claveFormularioCliente === null).toBe(true);
    expect(RST.cruce.disponible && RST.cierreEnFirme).toBe(true);
  });

  it("el corte se nombra por su fecha: el último día de la información revisada", () => {
    expect(nombreCorte(2026, 4)).toBe("Precierre · 30 de abril de 2026");
    expect(nombreCorte(2026, 8, { conAnio: false })).toBe("Precierre · 31 de agosto");
    expect(nombreCorte(2026, 12)).toBe("Cierre · 31 de diciembre de 2026");
    expect(fechaCorteTexto(2028, 2)).toBe("29 de febrero de 2028");
    expect(fechaCorteTexto(2026, 2)).toBe("28 de febrero de 2026");
    expect(descripcionCorte(2026, 8)).toBe("precierre con fecha de corte al 31 de agosto de 2026");
    expect(tipoCorte(11)).toBe("Precierre");
    expect(tipoCorte(12)).toBe("Cierre");
  });

  it("solo RST no tiene renglón de sanciones", () => {
    expect(renglonSanciones(RST)).toBeNull();
    expect(renglonSanciones(RETENCION)).toBe(137);
    expect(renglonSanciones(IVA)).toBe(87);
  });

  it("un impuesto que se cierra en firme tiene cruce", () => {
    for (const imp of [RETENCION, IVA, RST]) if (imp.cierreEnFirme) expect(imp.cruce.disponible, imp.clave).toBe(true);
  });
});

describe("esquemas de RST", () => {
  it("la revisión admite RST y la confirmación del Régimen Simple", () => {
    const r = RevisionImpuestoSchema.safeParse({ impuesto: "RST", clienteId: "5", anio: "2026", mesCorte: "4", confirmaRegimenSimple: "1" });
    expect(r.success && r.data.confirmaRegimenSimple).toBe("1");
    expect(RevisionImpuestoSchema.safeParse({ impuesto: "RST", clienteId: "5", anio: "2026", mesCorte: "4" }).data?.confirmaRegimenSimple).toBe("");
  });

  it("la confirmación admite el concepto 27, números de 14 dígitos y el 2593 sin fecha", () => {
    const ok = ConfirmarFormularioDianSchema.safeParse({ id: "1", revisionId: "1", fechaSello: "", concepto: "27", numeroPagado: NUMERO_2593, numeroAnterior: "", valores: "{}" });
    expect(ok.success).toBe(true);
    expect(ConfirmarFormularioDianSchema.safeParse({ id: "1", revisionId: "1", fechaSello: "2026-13", valores: "{}" }).success).toBe(false);
  });

  it("el calendario admite la sección RST · Anticipo bimestral", () => {
    expect(CalendarioDianSchema.safeParse({ anio: "2026", formulario: "RST_ANTICIPO", filas: "[]" }).success).toBe(true);
  });
});
