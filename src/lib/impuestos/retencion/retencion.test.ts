import { describe, expect, it } from "vitest";
import { dvNit } from "@/lib/nit";
import { F350_2026, F490_2026, NIT_FICTICIO, lecturaCrudaFebrero } from "../__fixtures__/retencion-2026";
import { aPesos, controlesLectura, lecturaConErrores, normalizarFecha, normalizarLectura, renglonesCorregidos, separarNitDv } from "./lectura";
import { cadenaCorrecciones, periodosRevision } from "./periodos-revision";
import { vistasRevision } from "./vistas";

const DV = String(dvNit(NIT_FICTICIO));
const CTX = { nitCliente: NIT_FICTICIO, anio: 2026, mesCorte: 9 };

describe("normalización de lo que lee la IA", () => {
  it("importes con comas, puntos, signo de pesos o decimales", () => {
    expect(aPesos("127,141,000")).toBe(127_141_000);
    expect(aPesos("127.141.000")).toBe(127_141_000);
    expect(aPesos("$ 0")).toBe(0);
    expect(aPesos("2,556,000.00")).toBe(2_556_000);
    expect(aPesos("")).toBeNull();
    expect(aPesos("—")).toBeNull();
  });

  it("fechas como las imprime la DIAN", () => {
    expect(normalizarFecha("2026-03-19 / 03:08:44 PM")).toBe("2026-03-19");
    expect(normalizarFecha("2 0 2 6 -0 3 -1 9 /1 5 :0 8 :4 4")).toBe("2026-03-19");
    expect(normalizarFecha("20260220")).toBe("2026-02-20");
    expect(normalizarFecha("19/03/2026")).toBe("2026-03-19");
    expect(normalizarFecha("2026-02-30")).toBeNull();
    expect(normalizarFecha("")).toBeNull();
  });

  it("separa el DV pegado al NIT", () => {
    expect(separarNitDv("9014276595", "")).toEqual({ nit: "901427659", dv: "5" });
    expect(separarNitDv("901427659", "5")).toEqual({ nit: "901427659", dv: "5" });
    expect(separarNitDv("", "")).toEqual({ nit: null, dv: null });
  });

  it("febrero: descarta las bases y el pago total, conserva retenciones y totales", () => {
    const l = normalizarLectura(lecturaCrudaFebrero(NIT_FICTICIO + DV));
    expect(l).toMatchObject({ formulario: "350", anio: 2026, periodo: 2, numero: "3510673398173", nit: NIT_FICTICIO, dv: DV, fechaSello: "2026-03-19", codigoCorreccion: null });
    for (const base of [77, 29, 79, 30, 31, 81, 33, 36, 55, 59]) expect(l.valores[base], `base ${base}`).toBeUndefined();
    expect(l.valores[980]).toBeUndefined();
    expect(l.valores[93]).toBe(63_256_000);
    expect(l.valores[130]).toBe(127_141_000);
    expect(l.exterior).toEqual([
      { pais: "SIN CONVENIO", tipoPersona: "", valorRetencion: 295_000 },
      { pais: "SIN CONVENIO", tipoPersona: "1", valorRetencion: 839_000 },
    ]);
  });
});

describe("controles de la lectura", () => {
  it("febrero pasa todos los controles", () => {
    const controles = controlesLectura(normalizarLectura(lecturaCrudaFebrero(NIT_FICTICIO + DV)), CTX);
    expect(controles.filter((c) => !c.ok)).toEqual([]);
    expect(lecturaConErrores(controles)).toBe(false);
  });

  it("otro NIT, otro año o un total que no cuadra impiden confirmar", () => {
    const base = normalizarLectura(lecturaCrudaFebrero(NIT_FICTICIO + DV));
    const fallan = (l: typeof base) => controlesLectura(l, CTX).filter((c) => c.bloquea && !c.ok).map((c) => c.clave);
    expect(fallan({ ...base, nit: "800111222" })).toEqual(["nit"]);
    expect(fallan({ ...base, anio: 2025 })).toEqual(["anio"]);
    expect(fallan({ ...base, valores: { ...base.valores, 133: 50_000 } })).toEqual(["total_134"]);
    expect(fallan({ ...base, fechaSello: null })).toEqual(["fecha"]);
  });

  it("un período posterior al corte solo avisa", () => {
    const l = { ...normalizarLectura(lecturaCrudaFebrero(NIT_FICTICIO + DV)), periodo: 10 };
    const corte = controlesLectura(l, CTX).find((c) => c.clave === "corte");
    expect(corte).toMatchObject({ ok: false, bloquea: false });
  });

  it("una corrección sin el formulario que corrige no se confirma", () => {
    const l = { ...normalizarLectura(lecturaCrudaFebrero(NIT_FICTICIO + DV)), codigoCorreccion: 1, numeroAnterior: null };
    expect(controlesLectura(l, CTX).find((c) => c.clave === "correccion")).toMatchObject({ ok: false, bloquea: true });
  });

  it("el 490 exige concepto 61/62/63, el 350 que paga y que 980 cuadre", () => {
    const pago = normalizarLectura({
      ...lecturaCrudaFebrero(NIT_FICTICIO + DV),
      formulario: "490", numero: "4911096214419", concepto: "6 1", numeroPagado: "3510673398173", fechaSello: "2 0 2 6 -0 3 -2 0",
      renglones: [{ renglon: 34, valor: "0" }, { renglon: 35, valor: "0" }, { renglon: 36, valor: "127,141,000" }, { renglon: 980, valor: "127,141,000" }],
    });
    expect(pago).toMatchObject({ formulario: "490", concepto: "61", numeroPagado: "3510673398173", fechaSello: "2026-03-20" });
    expect(controlesLectura(pago, CTX).filter((c) => !c.ok)).toEqual([]);
    const sinConcepto = { ...pago, concepto: "64" };
    expect(controlesLectura(sinConcepto, CTX).find((c) => c.clave === "concepto")?.ok).toBe(false);
  });

  it("deja constancia de los renglones corregidos a mano", () => {
    expect(renglonesCorregidos({ 93: 100, 130: 100 }, { 93: 120, 130: 120, 131: 0 })).toEqual([93, 130]);
  });
});

describe("cadena de correcciones", () => {
  const original = { id: 1, numero: "3510669606483", codigoCorreccion: null, numeroAnterior: null, fechaPresentacion: "2026-02-18", valores: { 130: 122_704_000 } };
  const correccion = F350_2026[0];

  it("original y corrección: los valores de la corrección, la oportunidad del original", () => {
    const c = cadenaCorrecciones([correccion, original]);
    expect(c.vigente?.numero).toBe("3510673781751");
    expect(c.original?.numero).toBe("3510669606483");
    expect(c.cadena.map((f) => f.numero)).toEqual(["3510669606483", "3510673781751"]);
    expect(c.faltaOriginal).toBeNull();
  });

  it("la corrección sola: falta el original", () => {
    const c = cadenaCorrecciones([correccion]);
    expect(c).toMatchObject({ original: null, faltaOriginal: "3510669606483" });
    expect(c.vigente?.numero).toBe("3510673781751");
  });

  it("dos 350 sin corrección entre ellos: rige el presentado más tarde y se avisa el otro", () => {
    const otro = { ...original, id: 2, numero: "3510670000000", fechaPresentacion: "2026-03-01" };
    const c = cadenaCorrecciones([original, otro]);
    expect(c.vigente?.numero).toBe("3510670000000");
    expect(c.fueraDeCadena.map((f) => f.numero)).toEqual(["3510669606483"]);
  });
});

describe("períodos de la revisión (casos de prueba del levantamiento)", () => {
  const entrada = (mesCorte: number, causales: { periodo: number; causal: string }[] = []) =>
    periodosRevision({ periodicidad: "Mensual", mesCorte, formularios350: F350_2026, formularios490: F490_2026, porConfirmar: [], causales });

  it("corte agosto: enero sin original, febrero a julio sin pago de reteIVA, agosto completo", () => {
    const p = entrada(8);
    expect(p.map((x) => x.estado)).toEqual(["falta_original", "faltan_pagos", "faltan_pagos", "faltan_pagos", "faltan_pagos", "faltan_pagos", "faltan_pagos", "completo"]);
    expect(p[1].pagosFaltantes).toEqual(["62"]);
    expect(p[7].pagos.find((x) => x.concepto === "62")).toMatchObject({ declarado: 2_545_000, impuesto: 2_545_000 });
    expect(p[0].avisos).toContain("Falta el formulario original 3510669606483: sin él no se mide la oportunidad de presentación.");
  });

  it("el 490 de enero paga el original que la corrección cita: no es un pago de otro período", () => {
    const enero = entrada(8)[0];
    expect(enero.avisos.some((a) => a.includes("no es un 350 de este período"))).toBe(false);
    const ajeno = periodosRevision({
      periodicidad: "Mensual", mesCorte: 8, formularios350: F350_2026, porConfirmar: [], causales: [],
      formularios490: [{ ...F490_2026[1], numeroPagado: "3510676289861" }], // febrero pagando el 350 de marzo
    })[1];
    expect(ajeno.avisos).toContain("El recibo 4911096214419 paga el formulario 3510676289861, que no es un 350 de este período.");
  });

  it("corte septiembre: septiembre falta, salvo que tenga causal", () => {
    expect(entrada(9)[8].estado).toBe("falta_350");
    const conCausal = entrada(9, [{ periodo: 9, causal: "Sin operaciones sujetas a retención" }])[8];
    expect(conCausal).toMatchObject({ estado: "sin_formulario", causal: "Sin operaciones sujetas a retención" });
  });

  it("un formulario por confirmar del período lo deja pendiente", () => {
    const p = periodosRevision({ periodicidad: "Mensual", mesCorte: 9, formularios350: F350_2026, formularios490: F490_2026, porConfirmar: [{ periodo: 9 }], causales: [] });
    expect(p[8].estado).toBe("por_confirmar");
  });
});

describe("vistas por meses y acumulado (Melonn, corte agosto)", () => {
  const periodos = periodosRevision({ periodicidad: "Mensual", mesCorte: 8, formularios350: F350_2026, formularios490: F490_2026, porConfirmar: [], causales: [] });
  const vista = vistasRevision(periodos);
  const fila = (clave: string) => vista.filas.find((f) => f.clave === clave)!;

  it("un mes por período, con su 350 vigente", () => {
    expect(vista.meses.map((m) => m.etiqueta)).toEqual(["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto"]);
    expect(vista.meses[0].formulario).toMatchObject({ numero: "3510673781751", esCorreccion: true });
    expect(vista.meses[1].formulario).toMatchObject({ numero: "3510673398173", esCorreccion: false });
  });

  it("acumulado: los totales del levantamiento", () => {
    expect(fila("total_renta").total).toBe(1_074_373_000);
    expect(fila("total_reteiva").total).toBe(17_817_000);
    expect(fila("total_retenciones").total).toBe(1_092_190_000);
    expect(fila("timbre").total).toBe(0);
    expect(fila("sanciones").total).toBe(0);
    expect(fila("total_mas_sanciones").total).toBe(1_092_190_000);
  });

  it("los totales de cada mes se recalculan con la definición", () => {
    expect(fila("total_renta").meses[1].valor).toBe(127_141_000);
    expect(fila("total_reteiva").meses[7].valor).toBe(2_545_000);
    expect(fila("rentas_trabajo").meses[1]).toEqual({ pj: null, pn: 127_141_000, valor: 127_141_000 });
    expect(fila("honorarios").meses[1]).toEqual({ pj: 0, pn: 0, valor: 0 });
  });

  it("bloque de pagos del 490 por mes", () => {
    const pago = (clave: string) => vista.pagos.find((p) => p.clave === clave)!;
    expect(pago("pago_61").total).toBe(1_083_315_000);
    expect(pago("pago_62").meses).toEqual([0, 0, 0, 0, 0, 0, 0, 2_545_000]);
    expect(pago("total_pagado").total).toBe(1_085_860_000);
  });

  it("un mes sin 350 queda vacío, no en cero", () => {
    const con9 = vistasRevision(periodosRevision({ periodicidad: "Mensual", mesCorte: 9, formularios350: F350_2026, formularios490: F490_2026, porConfirmar: [], causales: [] }));
    expect(con9.meses[8].formulario).toBeNull();
    expect(con9.filas.find((f) => f.clave === "total_renta")!.meses[8].valor).toBeNull();
    expect(con9.pagos.find((p) => p.clave === "total_pagado")!.meses[8]).toBeNull();
  });
});
