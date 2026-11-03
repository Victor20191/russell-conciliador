import { describe, expect, it } from "vitest";
import { dvNit } from "@/lib/nit";
import { F350_2026, F490_2026, NIT_FICTICIO, lecturaCrudaFebrero } from "../__fixtures__/retencion-2026";
import { aPesos, controlesLectura, lecturaConErrores, normalizarFecha, normalizarLectura, renglonesCorregidos, separarNitDv, resumenConfirmacion } from "./lectura";
import { cadenaCorrecciones, periodosRevision } from "./periodos-revision";
import { vistasRevision } from "./vistas";
import { aporteTercero, cruceParaPantalla, cruceRetencion, etiquetaFilaCruce, filaCruceConValores, gruposCruceConValores, MAX_TERCEROS_PANTALLA, renglonesFilaCruce, resumenCuentaCruce, terceroTachado, totalAlCambiarResta, cuentasFueraDeRetencion } from "./cruce";
import { CUENTAS_SIN_RESTA_DIAN_FABRICA, MAPEO_F350_FABRICA, TERCEROS_DIAN_FABRICA } from "../mapeo-dian";

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
    const p = periodosRevision({ periodicidad: "Mensual", mesCorte: 9, formularios350: F350_2026, formularios490: F490_2026, porConfirmar: [{ periodo: 9, formulario: "350", concepto: null }], causales: [] });
    expect(p[8]).toMatchObject({ estado: "por_confirmar", porConfirmar: 1, porConfirmar350: 1 });
  });

  describe("lo que está por confirmar se ve en la columna de su formulario", () => {
    const conPendientes = (porConfirmar: Parameters<typeof periodosRevision>[0]["porConfirmar"], formularios490 = F490_2026) =>
      periodosRevision({ periodicidad: "Mensual", mesCorte: 9, formularios350: F350_2026, formularios490, porConfirmar, causales: [] });
    const reteIva = { formulario: "490", concepto: "62" };

    it("un recibo cargado sin confirmar deja de ser «falta el recibo», pero no suma como pagado", () => {
      const febrero = conPendientes([{ periodo: 2, ...reteIva }])[1];
      expect(febrero).toMatchObject({ estado: "por_confirmar", pagosFaltantes: [], porConfirmar350: 0, recibosSinConcepto: 0 });
      expect(febrero.pagos.find((x) => x.concepto === "62")).toMatchObject({ porConfirmar: 1, formularios: [], impuesto: 0 });
    });

    it("si falta otro concepto, el período sigue en «Faltan pagos» y solo ese concepto falta", () => {
      const sinPagos = F490_2026.filter((f) => f.periodo !== 2);
      const febrero = conPendientes([{ periodo: 2, ...reteIva }], sinPagos)[1];
      expect(febrero).toMatchObject({ estado: "faltan_pagos", pagosFaltantes: ["61"] });
    });

    it("solo un recibo por confirmar, sin 350: falta el 350 y la columna del 350 no lo cuenta", () => {
      const septiembre = conPendientes([{ periodo: 9, formulario: "490", concepto: "61" }])[8];
      expect(septiembre).toMatchObject({ estado: "falta_350", porConfirmar: 1, porConfirmar350: 0 });
      expect(septiembre.pagos.find((x) => x.concepto === "61")?.porConfirmar).toBe(1);
    });

    it("un recibo sin concepto se cuenta aparte; el que no se reconoció se queda del lado del 350", () => {
      const septiembre = conPendientes([{ periodo: 9, formulario: "490", concepto: null }, { periodo: 9, formulario: null, concepto: null }])[8];
      expect(septiembre).toMatchObject({ estado: "por_confirmar", porConfirmar: 2, porConfirmar350: 1, recibosSinConcepto: 1 });
      expect(septiembre.pagos.every((x) => x.porConfirmar === 0)).toBe(true);
    });

    it("un pendiente sin período no se cuenta en ningún mes", () => {
      expect(conPendientes([{ periodo: null, formulario: "490", concepto: "61" }]).every((p) => p.porConfirmar === 0)).toBe(true);
    });
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

describe("cruce contable (casos construidos sobre los datos de Melonn)", () => {
  const periodos = periodosRevision({ periodicidad: "Mensual", mesCorte: 8, formularios350: F350_2026, formularios490: F490_2026, porConfirmar: [], causales: [] });
  const t = (cuentaCliente: string, cuentaRussell: string, nit: string | null, nombre: string, saldoFinal: number, saldoInicial = 0) => ({ cuentaCliente, nombreCuenta: `Cuenta ${cuentaCliente}`, cuentaRussell, nit, nombreTercero: nombre, saldoInicial, saldoFinal });
  const filasContables = [
    // 236505: dos proveedores (crédito) y los pagos a la DIAN (débito, se tachan).
    t("23650501", "236505", "800111222", "PROVEEDOR A", -1_000_000_000, -50_000),
    t("23650502", "236505", "900333444", "PROVEEDOR B", -74_373_500),
    t("23650501", "236505", "800197268", "U.A.E. DIRECCION DE IMPUESTOS Y ADUANAS NACIONALES", 900_000_000),
    t("23650501", "236505", null, "DIRECCION DE IMPUESTOS Y ADUANAS NACIONALES", 1_000),
    // 236705: reteIVA, $17.000 menos que lo declarado.
    t("23670501", "236705", "800555666", "PROVEEDOR C", -17_800_000),
    // 236575: la autorretención se causa a nombre de la DIAN y NO se tacha.
    t("23657501", "236575", "800197268", "DIAN", -45_000_000),
    // 236599: pagos llevados aparte, fuera del mapeo.
    t("23659901", "236599", "800197268", "DIAN", 5_000),
  ];
  const entrada = (umbral = 6_000, marcas: Parameters<typeof cruceRetencion>[0]["marcas"] = []) => cruceRetencion({
    periodos, mapeo: MAPEO_F350_FABRICA, sinRestaDian: new Set(CUENTAS_SIN_RESTA_DIAN_FABRICA), tercerosDian: TERCEROS_DIAN_FABRICA,
    nombresRussell: new Map([["236505", "Retención en la fuente por salarios y pagos laborales"]]), filasContables, inicioEnero: true, restarSaldoInicial: false, umbral, marcas,
  });
  const fila = (r: ReturnType<typeof cruceRetencion>, clave: string) => r.grupos.flatMap((g) => g.filas).find((f) => f.clave === clave)!;

  it("lo declarado sale de los 350 vigentes: 236505 suma el 130 de cada mes y 236705 el 131", () => {
    const r = entrada();
    expect(fila(r, "236505").declarado).toBe(1_074_373_000);
    expect(fila(r, "236505").conceptos.map((c) => c.concepto)).toEqual(["rentas_trabajo", "rentas_pensiones"]);
    expect(fila(r, "236705").declarado).toBe(17_817_000);
    expect(fila(r, "236705").conceptos.find((c) => c.concepto === "menos_reteiva_exceso")?.signo).toBe("-");
  });

  it("tacha la DIAN en 236505, no en 236575, y avisa la DIAN sin NIT", () => {
    const r = entrada();
    const f = fila(r, "236505");
    expect(f.dianRestado).toBe(-900_000_000);
    expect(f.contable).toBe(1_074_372_500); // 1.000.000.000 + 74.373.500 − 1.000 (la DIAN sin NIT suma)
    expect(f.posiblesDian).toEqual(["DIRECCION DE IMPUESTOS Y ADUANAS NACIONALES"]);
    expect(fila(r, "236575")).toMatchObject({ restaDian: false, contable: 45_000_000, dianRestado: 0 });
  });

  it("diferencias con el umbral propio: informativa por debajo, marca desde el umbral", () => {
    const r = entrada();
    expect(fila(r, "236505")).toMatchObject({ diferencia: 500, nivel: "informativa", requiereMarca: false });
    expect(fila(r, "236705")).toMatchObject({ diferencia: 17_000, nivel: "alerta", requiereMarca: true });
    expect(fila(r, "236575")).toMatchObject({ diferencia: -45_000_000, requiereMarca: true });
    expect(entrada(20_000).grupos.flatMap((g) => g.filas).filter((x) => x.requiereMarca).map((x) => x.clave)).toEqual(["236575"]);
  });

  it("el 129 va en su propia fila sin cuenta y las sanciones no entran", () => {
    const r = entrada();
    expect(fila(r, "sin_cuenta:menos_renta_exceso")).toMatchObject({ grupo: "renta", cuentaRussell: null, contable: 0 });
    expect(r.grupos.flatMap((g) => g.filas).some((f) => f.conceptos.some((c) => c.concepto === "sanciones"))).toBe(false);
  });

  it("ocultar los renglones en cero: deja las filas con valor y quita el grupo que queda vacío", () => {
    const r = entrada();
    const visibles = gruposCruceConValores(r.grupos);
    // Honorarios no tiene nada en este caso; timbre (135) se queda sin filas y sale entero.
    expect(r.grupos.flatMap((g) => g.filas).some((f) => f.clave === "236515")).toBe(true);
    expect(visibles.flatMap((g) => g.filas).map((f) => f.clave)).toEqual(expect.arrayContaining(["236505", "236575", "236705"]));
    expect(visibles.flatMap((g) => g.filas).every((f) => f.declarado !== 0 || f.contable !== 0)).toBe(true);
    expect(visibles.map((g) => g.grupo)).toEqual(["renta", "iva"]);
    // Lo que queda sigue sumando lo mismo: solo se quitaron ceros.
    expect(visibles.find((g) => g.grupo === "renta")?.subtotal).toEqual(r.grupos[0].subtotal);
  });

  it("una fila en cero con marca o con aviso no se oculta", () => {
    const cero = { declarado: 0, contable: 0, dianRestado: 0, marca: null, saldoInicial: null, posiblesDian: [] };
    expect(filaCruceConValores(cero)).toBe(false);
    expect(filaCruceConValores({ ...cero, declarado: 1 })).toBe(true);
    expect(filaCruceConValores({ ...cero, contable: -1 })).toBe(true);
    expect(filaCruceConValores({ ...cero, dianRestado: -5 })).toBe(true);
    expect(filaCruceConValores({ ...cero, saldoInicial: { terceros: 1, monto: 10 } })).toBe(true);
    expect(filaCruceConValores({ ...cero, posiblesDian: ["DIAN"] })).toBe(true);
    expect(filaCruceConValores({ ...cero, marca: { numero: 1, nota: "Revisada", referenciaAnexo: null, diferencia: 5, marcadoPor: null, marcadoEn: "2026-11-01", vigente: false } })).toBe(true);
  });

  it("el resumen de una cuenta contraída cuenta sus terceros y sus avisos, sin el saldo inicial de la DIAN", () => {
    const [conDian, sinDian] = fila(entrada(), "236505").cuentasCliente;
    expect(resumenCuentaCruce(conDian)).toEqual({ terceros: 3, saldoInicial: 50_000, saldoInicialRestado: 0, dianRestado: -900_000_000, posibleDian: true });
    expect(resumenCuentaCruce(sinDian)).toEqual({ terceros: 1, saldoInicial: 0, saldoInicialRestado: 0, dianRestado: 0, posibleDian: false });
    // Los que no viajaron a la pantalla también cuentan.
    expect(resumenCuentaCruce(conDian, { cantidad: 2, saldoInicial: 100 })).toMatchObject({ terceros: 5, saldoInicial: 50_100 });
    const dian = { nit: "800197268", nombre: "DIAN", saldo: 0, saldoInicial: 700, esDian: true, restado: true, posibleDian: false };
    expect(resumenCuentaCruce({ cuenta: "23659701", nombre: "Pagos", saldo: 0, terceros: [dian] }).saldoInicial).toBe(0);
  });

  describe("cuentas del cliente en 2365 o 2367 homologadas fuera de retención", () => {
    const f = (cuentaCliente: string, cuentaRussell: string | null, saldoFinal: number) => ({ cuentaCliente, nombreCuenta: `Cuenta ${cuentaCliente}`, cuentaRussell, saldoFinal });

    it("avisa solo las del cliente en 2365 o 2367 que quedaron en otro grupo o sin homologar", () => {
      const r = cuentasFueraDeRetencion([
        f("23670106", "240805", -64_000_000),
        f("23659901", null, -1_000),
        f("23650501", "236505", -5_000), // homologada a retención: entra al cruce
        f("23659902", "236599", 5_000), // la cubre la alerta de cuentas fuera del mapeo
        f("24360502", "236525", -9_000), // no es 2365 ni 2367 del cliente
        f("24080501", "240805", -7_000),
      ], new Map([["240805", "IVA por pagar"]]));
      expect(r).toEqual([
        { cuenta: "23659901", nombre: "Cuenta 23659901", cuentaRussell: null, nombreRussell: null, saldo: 1_000 },
        { cuenta: "23670106", nombre: "Cuenta 23670106", cuentaRussell: "240805", nombreRussell: "IVA por pagar", saldo: 64_000_000 },
      ]);
    });

    it("suma los terceros de la cuenta y no avisa la que queda en cero", () => {
      expect(cuentasFueraDeRetencion([f("23670106", "240805", -100), f("23670106", "240805", -50), f("23658005", "249505", -30), f("23658005", "249505", 30)])).toEqual([
        { cuenta: "23670106", nombre: "Cuenta 23670106", cuentaRussell: "240805", nombreRussell: null, saldo: 150 },
      ]);
    });

    it("viaja en el resultado del cruce, no cambia las cifras y no impide cerrar", () => {
      const base = { periodos, mapeo: MAPEO_F350_FABRICA, sinRestaDian: new Set(CUENTAS_SIN_RESTA_DIAN_FABRICA), tercerosDian: TERCEROS_DIAN_FABRICA, nombresRussell: new Map<string, string>(), filasContables, inicioEnero: true, restarSaldoInicial: false, umbral: 6_000, marcas: [] };
      const sin = cruceRetencion(base);
      const con = cruceRetencion({ ...base, filasFueraDeRetencion: [f("23670106", "240805", -64_000_000)] });
      expect(sin.fueraDeRetencion).toEqual([]);
      expect(con.fueraDeRetencion).toHaveLength(1);
      expect(con.total).toEqual(sin.total);
      expect(con.pendientesMarca).toBe(sin.pendientesMarca);
    });
  });

  it("subtotales 130 y 134, total 136 y cuentas fuera del mapeo", () => {
    const r = entrada();
    expect(r.grupos.map((g) => g.grupo)).toEqual(["renta", "iva", "timbre"]);
    expect(r.grupos[0].subtotal.declarado).toBe(1_074_373_000);
    expect(r.grupos[1].subtotal).toEqual({ declarado: 17_817_000, contable: 17_800_000, diferencia: 17_000 });
    expect(r.total.declarado).toBe(1_092_190_000);
    expect(r.fueraDelMapeo).toEqual([{ cuentaRussell: "236599", cuentas: ["23659901"], saldo: -5_000 }]);
  });

  it("aviso de saldo inicial solo con balance desde el 1 de enero", () => {
    expect(fila(entrada(), "236505").saldoInicial).toEqual({ terceros: 1, monto: 50_000, restado: false });
    const sinEnero = cruceRetencion({ ...{ periodos, mapeo: MAPEO_F350_FABRICA, sinRestaDian: new Set(CUENTAS_SIN_RESTA_DIAN_FABRICA), tercerosDian: TERCEROS_DIAN_FABRICA, nombresRussell: new Map(), filasContables, umbral: 6_000, marcas: [] }, inicioEnero: false, restarSaldoInicial: false });
    expect(fila(sinEnero, "236505").saldoInicial).toBeNull();
  });

  describe("restar terceros con saldo inicial", () => {
    const cruce = (filasContables: Parameters<typeof cruceRetencion>[0]["filasContables"], restarSaldoInicial: boolean, inicioEnero = true, marcas: Parameters<typeof cruceRetencion>[0]["marcas"] = []) => cruceRetencion({
      periodos, mapeo: MAPEO_F350_FABRICA, sinRestaDian: new Set(CUENTAS_SIN_RESTA_DIAN_FABRICA), tercerosDian: TERCEROS_DIAN_FABRICA, nombresRussell: new Map(), filasContables, inicioEnero, restarSaldoInicial, umbral: 6_000, marcas,
    });
    const generico = t("23652501", "236525", "Generico", "Genérico", -100_000, -100_000);
    const conMovimiento = t("23652501", "236525", "800111222", "PROVEEDOR A", -150_000, -100_000);
    const sinInicial = t("23652501", "236525", "900333444", "PROVEEDOR B", -30_000);

    it("sin activarla las cifras no cambian y el aviso sigue", () => {
      const f = fila(cruce([generico, conMovimiento, sinInicial], false), "236525");
      expect(f.contable).toBe(280_000);
      expect(f.saldoInicial).toEqual({ terceros: 2, monto: 200_000, restado: false });
      expect(f.cuentasCliente[0].terceros.every((x) => !x.saldoInicialRestado && !terceroTachado(x))).toBe(true);
    });

    it("un tercero sin movimiento queda en cero y tachado; uno con movimiento suma solo lo del año", () => {
      const r = cruce([generico, conMovimiento, sinInicial], true);
      const f = fila(r, "236525");
      const de = (nit: string) => f.cuentasCliente[0].terceros.find((x) => x.nit === nit)!;
      expect(aporteTercero(de("Generico"))).toBe(0);
      expect(terceroTachado(de("Generico"))).toBe(true);
      expect(aporteTercero(de("800111222"))).toBe(50_000);
      expect(terceroTachado(de("800111222"))).toBe(false);
      expect(de("900333444")).toMatchObject({ saldo: 30_000, saldoInicialRestado: 0 });
      expect(f.contable).toBe(80_000);
      expect(f.diferencia).toBe(f.declarado - 80_000);
      expect(f.saldoInicial).toEqual({ terceros: 2, monto: 200_000, restado: true });
      expect(r.saldoInicial).toEqual({ terceros: 2, cuentas: 1, monto: 200_000, restado: true });
    });

    it("con un balance que no empieza en enero no resta nada aunque la revisión lo tenga pedido", () => {
      const pedida = cruce([generico, conMovimiento, sinInicial], true, false);
      const sinPedir = cruce([generico, conMovimiento, sinInicial], false, false);
      expect(pedida).toEqual(sinPedir);
      expect(fila(pedida, "236525").contable).toBe(280_000);
      expect(pedida.saldoInicial).toBeNull();
    });

    it("la DIAN no cambia: ni donde se resta ni en 236575, y su saldo inicial no cuenta", () => {
      const filas = [
        generico,
        t("23652501", "236525", "800197268", "DIAN", 40_000, 7_000),
        t("23657501", "236575", "800197268", "DIAN", -45_000_000, -9_000),
      ];
      const r = cruce(filas, true);
      const dian = fila(r, "236525").cuentasCliente[0].terceros.find((x) => x.esDian)!;
      expect(dian).toMatchObject({ restado: true, saldoInicialRestado: 0 });
      expect(fila(r, "236525")).toMatchObject({ contable: 0, dianRestado: -40_000 });
      expect(fila(r, "236575")).toMatchObject({ contable: 45_000_000, saldoInicial: null });
      expect(r.saldoInicial).toEqual({ terceros: 1, cuentas: 1, monto: 100_000, restado: true });
    });

    it("el mismo tercero en varias cuentas cuenta una vez como tercero y una por cuenta", () => {
      const r = cruce([generico, t("23651511", "236515", "Generico", "Genérico", -25_000, -25_000)], false);
      expect(r.saldoInicial).toEqual({ terceros: 1, cuentas: 2, monto: 125_000, restado: false });
    });

    it("una marca escrita sobre la diferencia anterior queda desactualizada", () => {
      const filas = [generico, sinInicial];
      const antes = fila(cruce(filas, false), "236525").diferencia;
      const marca = { clave: "236525", numero: 1, nota: "Diferencia por saldo inicial", referenciaAnexo: null, diferencia: antes, marcadoPor: "Senior", marcadoEn: "2026-11-01T00:00:00.000Z" };
      expect(fila(cruce(filas, false, true, [marca]), "236525").marca?.vigente).toBe(true);
      expect(fila(cruce(filas, true, true, [marca]), "236525").marca?.vigente).toBe(false);
    });

    it("el total que confirma el modal es el que da el cruce al cambiar la resta", () => {
      const sin = cruce([generico, conMovimiento, sinInicial], false);
      const con = cruce([generico, conMovimiento, sinInicial], true);
      expect(totalAlCambiarResta(sin.total, sin.saldoInicial!)).toEqual(con.total);
      expect(totalAlCambiarResta(con.total, con.saldoInicial!)).toEqual(sin.total);
    });

    it("los terceros que no viajan a la pantalla también restan", () => {
      const muchos = Array.from({ length: 150 }, (_, i) => t("23652501", "236525", String(800_000_000 + i), `PROVEEDOR ${i}`, -(i + 11), -10));
      const r = cruce(muchos, true);
      const pantalla = cruceParaPantalla(r);
      const f = fila(pantalla, "236525");
      expect(pantalla.tercerosOcultos["236525|23652501"]).toEqual({ cantidad: 50, saldo: 1_275, saldoInicial: 500, saldoInicialRestado: 500 });
      expect(resumenCuentaCruce(f.cuentasCliente[0], pantalla.tercerosOcultos["236525|23652501"]).saldoInicialRestado).toBe(1_500);
      expect(f.cuentasCliente[0].saldo).toBe(11_325);
    });

    it("un tercero de una copia congelada antigua, sin el campo, suma su saldo y no se tacha", () => {
      const antiguo = { saldo: 500, restado: false };
      expect(aporteTercero(antiguo)).toBe(500);
      expect(terceroTachado(antiguo)).toBe(false);
    });

    it("con las cuentas que usa el Programa de Impuestos de Melonn: de $1.746.872.028 de diferencia a los $235.009 del programa", () => {
      // [cuenta Russell, saldo inicial, saldo final] de enero a agosto; todo el saldo inicial está en el
      // Genérico. Sin las cuentas de pagos ni las que el balance homologa además a 236505 y 236705.
      const cuentas: [string, number, number][] = [
        ["236505", -998_051_762, -1_564_656_174],
        ["236515", -25_097_383, -33_934_578],
        ["236520", -575_429, -790_656],
        ["236525", -116_319_681, -185_535_696],
        ["236530", -69_196_088, -120_892_455],
        ["236540", -26_316_654, -44_240_910],
        ["236550", -5_038_679, -8_784_523],
        ["236575", -464_521_000, -820_889_000],
        ["236705", -41_520_343, -59_338_036],
      ];
      const filas = cuentas.flatMap(([russell, inicial, final]) => [
        t(`${russell}01`, russell, "Generico", "Genérico", inicial, inicial),
        t(`${russell}01`, russell, "800111222", "TERCEROS DEL AÑO", final - inicial),
      ]);
      const sin = cruce(filas, false);
      expect(sin.total).toEqual({ declarado: 1_092_190_000, contable: 2_839_062_028, diferencia: -1_746_872_028 });
      const con = cruce(filas, true);
      expect(con.total).toEqual({ declarado: 1_092_190_000, contable: 1_092_425_009, diferencia: -235_009 });
      expect(con.saldoInicial).toEqual({ terceros: 1, cuentas: 9, monto: 1_746_637_019, restado: true });
    });
  });

  it("las marcas se cruzan por clave y se desactualizan si cambia la diferencia", () => {
    const marca = { clave: "236705", numero: 1, nota: "Retención de diciembre 2025 pagada en enero", referenciaAnexo: null, diferencia: 17_000, marcadoPor: "Senior", marcadoEn: "2026-10-31T00:00:00.000Z" };
    expect(fila(entrada(6_000, [marca]), "236705").marca?.vigente).toBe(true);
    expect(entrada(6_000, [marca]).pendientesMarca).toBe(1); // queda 236575
    expect(fila(entrada(6_000, [{ ...marca, diferencia: 10_000 }]), "236705").marca?.vigente).toBe(false);
  });

  it("nombre y renglones de cada fila: la cuenta cuando agrupa conceptos, «−» en los que restan", () => {
    const r = entrada();
    expect(etiquetaFilaCruce(fila(r, "236505"))).toBe("Retención en la fuente por salarios y pagos laborales");
    expect(etiquetaFilaCruce(fila(r, "236515"))).toBe("Honorarios");
    expect(renglonesFilaCruce(fila(r, "236705"))).toBe("131 · 132 · −133");
    expect(renglonesFilaCruce(fila(r, "236515"))).toBe("42 · 95");
  });

  it("la pantalla lleva a lo sumo 100 terceros por cuenta, con la DIAN, y resume el resto", () => {
    const muchos = Array.from({ length: 150 }, (_, i) => t("23652501", "236525", String(800_000_000 + i), `PROVEEDOR ${i}`, -(i + 1)));
    const r = cruceRetencion({
      periodos, mapeo: MAPEO_F350_FABRICA, sinRestaDian: new Set(CUENTAS_SIN_RESTA_DIAN_FABRICA), tercerosDian: TERCEROS_DIAN_FABRICA,
      nombresRussell: new Map(), filasContables: [...muchos, t("23652501", "236525", "800197268", "DIAN", 500)], inicioEnero: true, restarSaldoInicial: false, umbral: 6_000, marcas: [],
    });
    const pantalla = cruceParaPantalla(r);
    const cuenta = fila(pantalla, "236525").cuentasCliente[0];
    expect(cuenta.terceros).toHaveLength(MAX_TERCEROS_PANTALLA);
    expect(cuenta.terceros[0]).toMatchObject({ nit: "800197268", restado: true });
    // Quedan fuera los 51 de menor saldo (1 a 51 pesos) y la cifra de la cuenta no cambia.
    expect(pantalla.tercerosOcultos["236525|23652501"]).toEqual({ cantidad: 51, saldo: 1_326, saldoInicial: 0, saldoInicialRestado: 0 });
    expect(cuenta.saldo).toBe(fila(r, "236525").cuentasCliente[0].saldo);
    expect(fila(r, "236525").cuentasCliente[0].terceros).toHaveLength(151);
  });
});

describe("resumen de confirmar varios formularios", () => {
  it("es éxito solo si quedaron confirmados todos los pedidos", () => {
    expect(resumenConfirmacion({ pedidos: 14, confirmados: 14, fallos: [] })).toEqual({ ok: true, message: "14 formularios confirmados." });
    expect(resumenConfirmacion({ pedidos: 1, confirmados: 1, fallos: [] })).toEqual({ ok: true, message: "1 formulario confirmado." });
  });

  it("dice cuántos quedaron y por qué faltaron los demás", () => {
    expect(resumenConfirmacion({ pedidos: 3, confirmados: 2, fallos: ["F350 Enero: Falta el período (renglón 3)."] })).toEqual({
      ok: false,
      message: "Se confirmaron 2 de 3. F350 Enero: Falta el período (renglón 3).",
    });
    const muchos = resumenConfirmacion({ pedidos: 5, confirmados: 0, fallos: ["a", "b", "c", "d", "e"] });
    expect(muchos.message).toBe("No se confirmó ninguno. a · b · c · y 2 más");
  });

  it("un formulario que otro ya confirmó o descartó no se cuenta como fallo", () => {
    expect(resumenConfirmacion({ pedidos: 2, confirmados: 1, fallos: [] }).message).toBe("Se confirmaron 1 de 2. 1 ya no estaba por confirmar");
    expect(resumenConfirmacion({ pedidos: 2, confirmados: 0, fallos: [] })).toEqual({ ok: false, message: "No se confirmó ninguno. 2 ya no estaban por confirmar" });
  });
});
