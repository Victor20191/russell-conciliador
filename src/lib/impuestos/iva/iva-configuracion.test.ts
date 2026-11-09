import { describe, expect, it } from "vitest";
import { CALENDARIO_IVA_ANUAL_2026, CALENDARIO_IVA_BIMESTRAL_2026, CALENDARIO_IVA_CUATRIMESTRAL_2026 } from "../__fixtures__/calendario-iva-2026";
import { completarPares, fechaVencimiento, grillaCalendario, validarCalendario } from "../calendario";
import { calcularTotal, renglonDe } from "../formularios/definicion";
import { CONCEPTO_490_IVA_POR_PERIODICIDAD } from "../formularios/f490";
import { conceptosPagoDe, impuestoPorClave, impuestoPorDeclaracion, impuestoPorSlug, IVA, RETENCION } from "../impuestos-dian";
import { etiquetaPeriodo, mesesCorteValidos, periodosEsperados } from "../periodicidad";
import { F300 } from "../formularios/f300";
import { claveCuentasMapeo, cuentasDeMapeo, normalizarCuentaMapeo } from "../mapeo-dian";
import { MAPEO_F300_FABRICA } from "./mapeo-f300";

describe("periodicidad de IVA", () => {
  it("el corte solo puede cerrar un período", () => {
    expect(mesesCorteValidos("Mensual")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(mesesCorteValidos("Bimestral")).toEqual([2, 4, 6, 8, 10, 12]);
    expect(mesesCorteValidos("Cuatrimestral")).toEqual([4, 8, 12]);
    expect(mesesCorteValidos("Anual")).toEqual([12]);
  });

  it("nombra los períodos como el levantamiento", () => {
    expect(etiquetaPeriodo("Mensual", 3)).toBe("Marzo");
    expect(etiquetaPeriodo("Bimestral", 1)).toBe("Bimestre 01 · Enero-Febrero");
    expect(etiquetaPeriodo("Bimestral", 6)).toBe("Bimestre 06 · Noviembre-Diciembre");
    expect(etiquetaPeriodo("Cuatrimestral", 2)).toBe("Cuatrimestre 02 · Mayo-Agosto");
    expect(etiquetaPeriodo("Anual", 1)).toBe("Año");
  });

  it("a agosto, un bimestral espera 4 períodos y un cuatrimestral 2", () => {
    expect(periodosEsperados("Bimestral", 8).map((p) => p.periodo)).toEqual([1, 2, 3, 4]);
    expect(periodosEsperados("Cuatrimestral", 8).map((p) => p.periodo)).toEqual([1, 2]);
    expect(periodosEsperados("Anual", 12)).toEqual([{ periodo: 1, mesFin: 12 }]);
  });
});

describe("calendario de IVA 2026", () => {
  it("las tres tablas del PDF son válidas y sin avisos", () => {
    expect(validarCalendario(2026, "IVA_BIMESTRAL", CALENDARIO_IVA_BIMESTRAL_2026)).toEqual({ errores: [], avisos: [] });
    expect(validarCalendario(2026, "IVA_CUATRIMESTRAL", CALENDARIO_IVA_CUATRIMESTRAL_2026)).toEqual({ errores: [], avisos: [] });
    expect(validarCalendario(2026, "IVA_ANUAL", CALENDARIO_IVA_ANUAL_2026)).toEqual({ errores: [], avisos: [] });
  });

  it("el caso del levantamiento: NIT terminado en 3, bimestral, 1.er bimestre vence el 12 de marzo", () => {
    expect(fechaVencimiento(CALENDARIO_IVA_BIMESTRAL_2026, 1, "902058973")).toBe("2026-03-12");
    expect(fechaVencimiento(CALENDARIO_IVA_BIMESTRAL_2026, 6, "902058973")).toBe("2027-01-15");
    expect(fechaVencimiento(CALENDARIO_IVA_CUATRIMESTRAL_2026, 2, "901240097")).toBe("2026-09-17");
  });

  it("el anual del calendario 2026 es el año gravable 2025 y vence en febrero", () => {
    expect(fechaVencimiento(CALENDARIO_IVA_ANUAL_2026, 1, "901427659")).toBe("2026-02-20");
    expect(grillaCalendario("IVA_ANUAL", CALENDARIO_IVA_ANUAL_2026, 2026)[0].etiqueta).toBe("Año gravable 2025");
    // En el calendario de un año, el anual no puede vencer antes de terminar el año gravable anterior.
    const temprana = CALENDARIO_IVA_ANUAL_2026.map((f) => (f.ultimoDigito === 1 ? { ...f, fecha: "2025-12-15" } : f));
    expect(validarCalendario(2026, "IVA_ANUAL", temprana).errores).toEqual(["Año gravable 2025, dígito 1: vence el 2025-12-15, antes de terminar el período."]);
  });

  it("completa el otro dígito del par y avisa un par con fechas distintas", () => {
    const impares = CALENDARIO_IVA_ANUAL_2026.filter((f) => f.ultimoDigito % 2 === 1);
    expect(impares).toHaveLength(5);
    const completo = completarPares("IVA_ANUAL", impares);
    expect(validarCalendario(2026, "IVA_ANUAL", completo).errores).toEqual([]);
    expect(fechaVencimiento(completo, 1, "900000000")).toBe("2026-02-20");
    expect(completarPares("IVA_BIMESTRAL", impares)).toHaveLength(5);
    const distinto = CALENDARIO_IVA_ANUAL_2026.map((f) => (f.ultimoDigito === 4 ? { ...f, fecha: "2026-02-18" } : f));
    expect(validarCalendario(2026, "IVA_ANUAL", distinto).avisos).toContain("Año gravable 2025: los dígitos 3 y 4 vencen el mismo día en la DIAN y aquí tienen fechas distintas.");
  });

  it("las grillas de IVA tienen 6, 3 y 1 filas", () => {
    expect(grillaCalendario("IVA_BIMESTRAL", CALENDARIO_IVA_BIMESTRAL_2026).map((g) => g.etiqueta)[0]).toBe("Bimestre 01 · Enero-Febrero");
    expect(grillaCalendario("IVA_BIMESTRAL", [])).toHaveLength(6);
    expect(grillaCalendario("IVA_CUATRIMESTRAL", [])).toHaveLength(3);
    expect(grillaCalendario("IVA_ANUAL", [])).toHaveLength(1);
  });
});

describe("descriptores de impuestos", () => {
  it("se encuentran por clave, ruta y formulario de declaración", () => {
    expect(impuestoPorClave("IVA")).toBe(IVA);
    expect(impuestoPorSlug("retencion")).toBe(RETENCION);
    expect(impuestoPorDeclaracion("300")).toBe(IVA);
    expect(impuestoPorDeclaracion("350")).toBe(RETENCION);
    expect(impuestoPorClave("ICA")).toBeNull();
  });

  it("cada concepto de pago y cada renglón de Pagos efectuados existe en su declaración", () => {
    for (const imp of [RETENCION, IVA]) {
      for (const c of imp.conceptosPago) expect(renglonDe(imp.declaracion, c.renglonPagado)?.guardar, `${imp.clave} ${c.concepto}`).toBe(true);
      for (const r of Object.values(imp.renglones)) expect(renglonDe(imp.declaracion, r)?.guardar, `${imp.clave} ${r}`).toBe(true);
      for (const g of imp.cruce.grupos) if (g.renglonTotal) expect(renglonDe(imp.declaracion, g.renglonTotal), `${imp.clave} ${g.grupo}`).toBeDefined();
    }
  });

  it("los conceptos del 490 de IVA siguen la periodicidad del 300", () => {
    for (const c of IVA.conceptosPago) expect(CONCEPTO_490_IVA_POR_PERIODICIDAD[c.periodicidad as string]).toBe(c.concepto);
    expect(conceptosPagoDe(IVA, "Cuatrimestral").map((c) => c.concepto)).toEqual(["57"]);
    expect(conceptosPagoDe(RETENCION, "Mensual").map((c) => c.concepto)).toEqual(["61", "62", "63"]);
  });

  it("el total a pagar del IVA es el 88 recalculado", () => {
    expect(calcularTotal(IVA.declaracion, IVA.renglones.total, new Map([[82, 5_000_000], [85, 1_000_000], [87, 300_000]]))).toBe(4_300_000);
  });

  it("el calendario del IVA anual es el del año siguiente; Retención solo mensual", () => {
    expect(IVA.calendario("Bimestral", 2026)).toEqual({ formulario: "IVA_BIMESTRAL", anio: 2026 });
    expect(IVA.calendario("Anual", 2025)).toEqual({ formulario: "IVA_ANUAL", anio: 2026 });
    expect(RETENCION.calendario("Mensual", 2026)).toEqual({ formulario: "RETEFUENTE", anio: 2026 });
    expect(RETENCION.calendario("Bimestral", 2026)).toBeNull();
  });
});

describe("mapeo de fábrica del 300", () => {
  const por = (renglon: number) => MAPEO_F300_FABRICA.find((f) => f.renglonPj === renglon);

  it("cada renglón con valor del 300 que se concilia tiene concepto, con su sección del cruce", () => {
    const mapeados = new Set(MAPEO_F300_FABRICA.map((f) => f.renglonPj));
    const valores = F300.renglones.filter((r) => r.tipo === "valor" && r.seccion !== "Control de saldos").map((r) => r.renglon);
    expect(valores.filter((r) => !mapeados.has(r))).toEqual([]);
    expect(new Set(MAPEO_F300_FABRICA.map((f) => f.concepto)).size).toBe(MAPEO_F300_FABRICA.length);
    const secciones = new Set(IVA.cruce.grupos.flatMap((g) => g.secciones));
    for (const f of MAPEO_F300_FABRICA.filter((x) => x.enCruce)) expect(secciones.has(f.seccion), f.concepto).toBe(true);
  });

  it("el 40 va contra las once cuentas de ingresos no operacionales", () => {
    expect(cuentasDeMapeo(por(40)!)).toEqual(["420505", "421005", "421020", "421095", "421505", "422005", "423005", "423505", "424515", "425005", "429595"]);
  });

  it("42 y 80 restan; 84 y 87 no tienen cuenta ni entran al cruce; 85 va a 135517", () => {
    expect(por(42)).toMatchObject({ cuentaRussell: "417505", signo: "-" });
    expect(por(80)).toMatchObject({ cuentaRussell: "240850", signo: "-" });
    expect(por(84)).toMatchObject({ cuentaRussell: null, enCruce: false });
    expect(por(87)).toMatchObject({ cuentaRussell: null, enCruce: false });
    expect(por(85)).toMatchObject({ cuentaRussell: "135517", seccion: "Retención de IVA" });
  });

  it("el IVA generado va a 2408 de 240807 a 240837 según el levantamiento", () => {
    expect([58, 59, 60, 61, 62, 63, 64, 65, 66].map((r) => por(r)?.cuentaRussell)).toEqual(["240807", "240830", "240808", "240834", "240835", "240836", "240837", "240809", "240815"]);
  });
});

describe("cuentas de una fila del mapeo", () => {
  it("acepta una o varias cuentas y las guarda ordenadas con «+»", () => {
    expect(normalizarCuentaMapeo("")).toEqual({ ok: true, cuenta: null });
    expect(normalizarCuentaMapeo(" 236515 ")).toEqual({ ok: true, cuenta: "236515" });
    expect(normalizarCuentaMapeo("421005 + 420505, 421005")).toEqual({ ok: true, cuenta: "420505+421005" });
    expect(normalizarCuentaMapeo("42050").ok).toBe(false);
    expect(cuentasDeMapeo({ cuentaRussell: null })).toEqual([]);
    expect(claveCuentasMapeo(["421005", "420505"])).toBe("420505+421005");
  });
});
