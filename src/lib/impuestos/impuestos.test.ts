import { describe, expect, it } from "vitest";
import { CALENDARIO_RETEFUENTE_2026 } from "./__fixtures__/calendario-retefuente-2026";
import { fechaVencimiento, grillaCalendario, ultimoDigitoNit, validarCalendario } from "./calendario";
import { F350 } from "./formularios/f350";
import { renglonDe } from "./formularios/definicion";
import {
  CUENTAS_SIN_RESTA_DIAN_FABRICA,
  MAPEO_F350_FABRICA,
  TERCEROS_DIAN_FABRICA,
  esTerceroDian,
  normalizarCuentaMapeo,
  normalizarNitDian,
  pareceNombreDian,
  renglonesDeFila,
  restaTerceroDian,
} from "./mapeo-dian";
import { opcionesPeriodicidad, periodicidadVigente, periodosEsperados, validarPeriodicidad } from "./periodicidad";

describe("mapeo de fábrica del 350", () => {
  it("tiene los 33 conceptos del levantamiento, en orden y sin repetir", () => {
    expect(MAPEO_F350_FABRICA).toHaveLength(33);
    expect(new Set(MAPEO_F350_FABRICA.map((f) => f.concepto)).size).toBe(33);
    const ordenes = MAPEO_F350_FABRICA.map((f) => f.orden);
    expect([...ordenes].sort((a, b) => a - b)).toEqual(ordenes);
  });

  it("cada renglón mapeado es una retención o un total guardado del 350", () => {
    for (const fila of MAPEO_F350_FABRICA) {
      for (const r of renglonesDeFila(fila)) {
        const def = renglonDe(F350, r);
        expect(def?.guardar, `${fila.concepto} → ${r}`).toBe(true);
        expect(def?.tipo, `${fila.concepto} → ${r}`).toBe("valor");
      }
    }
  });

  it("Honorarios suma 42 y 95 contra 236515; las autorretenciones van a 236575", () => {
    const honorarios = MAPEO_F350_FABRICA.find((f) => f.concepto === "honorarios");
    expect(honorarios).toMatchObject({ renglonPj: 42, renglonPn: 95, cuentaRussell: "236515", signo: "+" });
    expect(MAPEO_F350_FABRICA.filter((f) => f.concepto.startsWith("autorret_")).every((f) => f.cuentaRussell === "236575")).toBe(true);
  });

  it("129 y 133 restan; 129 y 137 no tienen cuenta y 137 no entra al cruce", () => {
    const por = (c: string) => MAPEO_F350_FABRICA.find((f) => f.concepto === c);
    expect(por("menos_renta_exceso")).toMatchObject({ renglonPj: 129, cuentaRussell: null, signo: "-", enCruce: true });
    expect(por("menos_reteiva_exceso")).toMatchObject({ renglonPj: 133, cuentaRussell: "236705", signo: "-" });
    expect(por("sanciones")).toMatchObject({ renglonPj: 137, cuentaRussell: null, enCruce: false });
  });

  it("todos los renglones de retención del 350 tienen concepto en el mapeo", () => {
    const mapeados = new Set(MAPEO_F350_FABRICA.flatMap(renglonesDeFila));
    const retenciones = F350.renglones.filter((r) => r.tipo === "valor").map((r) => r.renglon);
    expect(retenciones.filter((r) => !mapeados.has(r))).toEqual([]);
  });
});

describe("tercero DIAN", () => {
  it("reconoce los dos NIT de fábrica con o sin DV", () => {
    expect(TERCEROS_DIAN_FABRICA.map((t) => t.nit)).toEqual(["800197268", "800197384"]);
    expect(esTerceroDian("800197268", TERCEROS_DIAN_FABRICA)).toBe(true);
    expect(esTerceroDian("8001972684", TERCEROS_DIAN_FABRICA)).toBe(true);
    expect(esTerceroDian("800.197.384-1", TERCEROS_DIAN_FABRICA)).toBe(true);
    expect(esTerceroDian("900123456", TERCEROS_DIAN_FABRICA)).toBe(false);
    expect(esTerceroDian(null, TERCEROS_DIAN_FABRICA)).toBe(false);
  });

  it("propone por nombre solo «Impuestos y Aduanas», nunca por «Diana»", () => {
    expect(pareceNombreDian("U.A.E. DIRECCION DE IMPUESTOS Y ADUANAS NACIONALES")).toBe(true);
    expect(pareceNombreDian("Dirección de Impuestos y Aduanas Nacionales")).toBe(true);
    expect(pareceNombreDian("GOMEZ MONTOYA DIANA CATALINA")).toBe(false);
    expect(pareceNombreDian("DIAN")).toBe(false);
  });

  it("236575 no resta la DIAN; las demás sí", () => {
    const sinResta = new Set(CUENTAS_SIN_RESTA_DIAN_FABRICA);
    expect(restaTerceroDian("236575", sinResta)).toBe(false);
    expect(restaTerceroDian("236515", sinResta)).toBe(true);
  });

  it("valida cuentas y NIT escritos a mano", () => {
    expect(normalizarCuentaMapeo(" 236 545 ")).toEqual({ ok: true, cuenta: "236545" });
    expect(normalizarCuentaMapeo("")).toEqual({ ok: true, cuenta: null });
    expect(normalizarCuentaMapeo("2365").ok).toBe(false);
    expect(normalizarNitDian("800.197.268-4")).toEqual({ ok: true, nit: "800197268" });
    expect(normalizarNitDian("12345").ok).toBe(false);
  });
});

describe("periodicidad", () => {
  it("ofrece opciones por formulario y valida lo que llega de la ficha", () => {
    expect(opcionesPeriodicidad("RETEFUENTE")).toContain("Mensual");
    expect(opcionesPeriodicidad("IVA")).toEqual(["Bimestral", "Cuatrimestral"]);
    expect(opcionesPeriodicidad("ICA")).toEqual([]);
    expect(validarPeriodicidad("IVA", "Cuatrimestral")).toEqual({ ok: true, periodicidad: "Cuatrimestral" });
    expect(validarPeriodicidad("IVA", "Mensual").ok).toBe(false);
    expect(validarPeriodicidad("RETEFUENTE", "")).toEqual({ ok: true, periodicidad: null });
  });

  it("la del cliente manda; si no tiene, rige la del formulario", () => {
    expect(periodicidadVigente("RETEFUENTE", null, "Mensual")).toBe("Mensual");
    expect(periodicidadVigente("RETEFUENTE", "Bimestral", "Mensual")).toBe("Bimestral");
    expect(periodicidadVigente("IVA", "Mensual", "Bimestral")).toBe("Bimestral");
  });

  it("períodos esperados hasta el corte", () => {
    expect(periodosEsperados("Mensual", 9)).toHaveLength(9);
    expect(periodosEsperados("Mensual", 12).at(-1)).toEqual({ periodo: 12, mesFin: 12 });
    expect(periodosEsperados("Bimestral", 9).map((p) => p.mesFin)).toEqual([2, 4, 6, 8]);
    expect(periodosEsperados("Cuatrimestral", 12).map((p) => p.periodo)).toEqual([1, 2, 3]);
    expect(periodosEsperados("Anual", 9)).toEqual([]);
  });
});

describe("calendario tributario", () => {
  it("el último dígito es el del NIT, nunca el DV", () => {
    expect(ultimoDigitoNit("902058973")).toBe(3);
    expect(ultimoDigitoNit("901240097")).toBe(7);
    expect(ultimoDigitoNit("901240097-1")).toBe(7);
    expect(ultimoDigitoNit("")).toBeNull();
  });

  it("la tabla 2026 de Retención es válida y sin avisos", () => {
    expect(CALENDARIO_RETEFUENTE_2026).toHaveLength(120);
    expect(validarCalendario(2026, "RETEFUENTE", CALENDARIO_RETEFUENTE_2026)).toEqual({ errores: [], avisos: [] });
  });

  it("vencimientos del levantamiento y de los casos de prueba", () => {
    expect(fechaVencimiento(CALENDARIO_RETEFUENTE_2026, 1, "902058973")).toBe("2026-02-12");
    expect(fechaVencimiento(CALENDARIO_RETEFUENTE_2026, 1, "901240097")).toBe("2026-02-18"); // INDAER, dígito 7
    expect(fechaVencimiento(CALENDARIO_RETEFUENTE_2026, 4, "901427659")).toBe("2026-05-25"); // dígito 9
    expect(fechaVencimiento(CALENDARIO_RETEFUENTE_2026, 12, "901427659")).toBe("2027-01-25");
  });

  it("detecta casillas faltantes, repetidas y fechas antes del cierre del período", () => {
    const sinUna = CALENDARIO_RETEFUENTE_2026.slice(1);
    expect(validarCalendario(2026, "RETEFUENTE", sinUna).errores).toEqual(["Enero: falta la fecha del dígito 1."]);
    const repetida = [...CALENDARIO_RETEFUENTE_2026, { periodo: 3, ultimoDigito: 5, fecha: "2026-04-20" }];
    expect(validarCalendario(2026, "RETEFUENTE", repetida).errores).toEqual(["Marzo: el dígito 5 está repetido."]);
    const temprana = CALENDARIO_RETEFUENTE_2026.map((f) => (f.periodo === 2 && f.ultimoDigito === 0 ? { ...f, fecha: "2026-02-27" } : f));
    expect(validarCalendario(2026, "RETEFUENTE", temprana).errores).toEqual(["Febrero, dígito 0: vence el 2026-02-27, antes de terminar el período."]);
  });

  it("avisa fechas que no crecen con el dígito", () => {
    const desordenada = CALENDARIO_RETEFUENTE_2026.map((f) => (f.periodo === 6 && f.ultimoDigito === 2 ? { ...f, fecha: "2026-07-08" } : f));
    const { errores, avisos } = validarCalendario(2026, "RETEFUENTE", desordenada);
    expect(errores).toEqual([]);
    expect(avisos).toEqual(["Junio: la fecha del dígito 2 es anterior a la del dígito que lo precede."]);
  });

  it("arma la grilla período × dígito en el orden de la DIAN", () => {
    const grilla = grillaCalendario("RETEFUENTE", CALENDARIO_RETEFUENTE_2026);
    expect(grilla).toHaveLength(12);
    expect(grilla[0]).toEqual({ periodo: 1, etiqueta: "Enero", fechas: ["2026-02-10", "2026-02-11", "2026-02-12", "2026-02-13", "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20", "2026-02-23"] });
  });
});
