import { describe, expect, it } from "vitest";
import { calcularTotal, controlarTotales, controlarValidaciones, renglonDe, renglonesConImporte, renglonesGuardados } from "./definicion";
import { F300 } from "./f300";
import { F350, RENGLONES_RENTA_F350 } from "./f350";
import { CONCEPTO_490_IVA_POR_PERIODICIDAD, CONCEPTOS_PAGO_IVA, etiquetaConceptoPago, F490 } from "./f490";
import { MAPEO_F350_FABRICA } from "../mapeo-dian";

const BASES_350 = [
  ...Array.from({ length: 13 }, (_, i) => 29 + i), // 29..41
  55, 56,
  ...Array.from({ length: 9 }, (_, i) => 59 + i), // 59..67
  ...Array.from({ length: 16 }, (_, i) => 77 + i), // 77..92
  109, 110,
  ...Array.from({ length: 8 }, (_, i) => 113 + i), // 113..120
];

/** Febrero 2026 de un cliente real (solo cifras): el 130 cuadra con estos renglones. */
const FEBRERO = new Map<number, number>([
  [93, 63_256_000], [42, 717_000], [95, 622_000], [43, 28_000], [44, 8_317_000], [97, 65_000],
  [46, 5_927_000], [49, 2_033_000], [57, 1_134_000], [68, 45_042_000],
  [129, 0], [130, 127_141_000],
  [131, 158_000], [132, 2_398_000], [133, 0], [134, 2_556_000],
  [135, 0], [136, 129_697_000], [137, 0], [138, 129_697_000],
  [150, 1_134_000], [151, 0], [154, 0], [155, 0],
]);

describe("formulario 350 como dato", () => {
  it("no hay renglones repetidos", () => {
    const numeros = F350.renglones.map((r) => r.renglon);
    expect(new Set(numeros).size).toBe(numeros.length);
  });

  it("las bases del levantamiento no se guardan", () => {
    for (const base of BASES_350) {
      const r = renglonDe(F350, base);
      expect(r?.tipo, `renglón ${base}`).toBe("base");
      expect(r?.guardar, `renglón ${base}`).toBe(false);
    }
  });

  it("se guardan los datos que piden la corrección, la oportunidad y el cruce", () => {
    const guardados = renglonesGuardados(F350);
    for (const r of [1, 3, 4, 5, 6, 11, 25, 26, 980, 996, 997]) expect(guardados, `renglón ${r}`).toContain(r);
    for (const r of [7, 8, 9, 10, 12, 27, 28, 139, 140, 981, 982, 983, 994]) expect(guardados, `renglón ${r}`).not.toContain(r);
  });

  it("el pago total (980) se guarda como importe informativo: no lo suma ningún total ni tiene concepto en el mapeo", () => {
    expect(renglonDe(F350, 980)).toMatchObject({ tipo: "informativo", guardar: true });
    expect(renglonesConImporte(F350)).toContain(980);
    expect(F350.renglones.filter((r) => r.terminos?.some(([t]) => t === 980))).toEqual([]);
    expect(MAPEO_F350_FABRICA.some((m) => m.renglonPj === 980 || m.renglonPn === 980)).toBe(false);
  });

  it("guarda todas las retenciones y totales de 42 a 138", () => {
    const conImporte = renglonesConImporte(F350);
    const esperados = [
      ...Array.from({ length: 13 }, (_, i) => 42 + i), 57, 58,
      ...Array.from({ length: 9 }, (_, i) => 68 + i),
      ...Array.from({ length: 16 }, (_, i) => 93 + i), 111, 112,
      ...Array.from({ length: 18 }, (_, i) => 121 + i), // 121..138
    ];
    for (const r of esperados) expect(conImporte, `renglón ${r}`).toContain(r);
  });

  it("el 130 suma las retenciones de renta y resta el 129", () => {
    expect(RENGLONES_RENTA_F350).toHaveLength(50); // 42–54, 57, 58, 68–76, 93–108, 111, 112, 121–128
    const total = renglonDe(F350, 130);
    expect(total?.terminos).toContainEqual([129, -1]);
    expect(total?.terminos?.filter(([, s]) => s === 1)).toHaveLength(50);
  });

  it("el 134 resta el 133 y el 136 incluye el timbre (errores del Programa de Impuestos)", () => {
    expect(renglonDe(F350, 134)?.terminos).toEqual([[131, 1], [132, 1], [133, -1]]);
    expect(renglonDe(F350, 136)?.terminos).toEqual([[130, 1], [134, 1], [135, 1]]);
  });

  it("los totales de febrero cuadran con lo impreso", () => {
    const controles = controlarTotales(F350, FEBRERO);
    expect(controles.every((c) => c.cuadra), JSON.stringify(controles.filter((c) => !c.cuadra))).toBe(true);
    expect(controles.map((c) => c.renglon)).toEqual([130, 134, 136, 138, 150, 151, 154, 155]);
  });

  it("detecta un total que no cuadra en el renglón donde ocurre", () => {
    const mal = new Map(FEBRERO);
    mal.set(133, 100_000); // el 134 impreso ya no cuadra; el 136 sí (usa el 134 impreso)
    const fallan = controlarTotales(F350, mal).filter((c) => !c.cuadra).map((c) => c.renglon);
    expect(fallan).toEqual([134]);
  });

  it("calcula un total acumulado desde sus términos", () => {
    expect(calcularTotal(F350, 134, FEBRERO)).toBe(2_556_000);
    expect(calcularTotal(F350, 135, FEBRERO)).toBe(0);
  });
});

describe("formulario 490 como dato", () => {
  it("guarda concepto, formulario pagado, pagos y fechas; no el deudor solidario", () => {
    const guardados = renglonesGuardados(F490);
    for (const r of [1, 2, 3, 4, 5, 6, 11, 27, 28, 29, 32, 34, 35, 36, 980, 996, 997]) expect(guardados, `renglón ${r}`).toContain(r);
    for (const r of [7, 8, 9, 10, 12, 24, 25, 26, 30, 31, 33, 37, 44, 48, 988]) expect(guardados, `renglón ${r}`).not.toContain(r);
  });

  it("el 980 es la suma de sanción, intereses y pago del impuesto", () => {
    const pago = new Map([[34, 0], [35, 0], [36, 122_704_000], [980, 122_704_000]]);
    expect(controlarTotales(F490, pago)).toEqual([expect.objectContaining({ renglon: 980, cuadra: true })]);
    pago.set(35, 15_000);
    expect(controlarTotales(F490, pago)[0].cuadra).toBe(false);
  });
});

/** Bimestre 01 de la «Vista 1» del levantamiento de IVA (solo cifras). */
const BIMESTRE_1 = new Map<number, number>([
  [28, 151_375_000], [39, 22_639_384_000], [40, 5_435_250_000], [41, 28_226_009_000], [42, 0], [43, 28_226_009_000],
  [59, 28_761_000], [67, 28_761_000], [77, 0], [81, 0],
  [82, 28_761_000], [83, 0], [84, 0], [85, 0], [86, 28_761_000], [87, 0], [88, 28_761_000], [89, 0],
  [90, 0], [91, 0], [92, 0], [93, 0],
]);

describe("formulario 300 como dato", () => {
  it("no hay renglones repetidos", () => {
    const numeros = F300.renglones.map((r) => r.renglon);
    expect(new Set(numeros).size).toBe(numeros.length);
  });

  it("las compras (44 a 57) no se guardan ni se concilian", () => {
    for (let r = 44; r <= 57; r++) expect(renglonDe(F300, r), `renglón ${r}`).toMatchObject({ tipo: "base", guardar: false });
  });

  it("guarda los datos de la corrección, la periodicidad y la oportunidad; no los nombres ni las firmas", () => {
    const guardados = renglonesGuardados(F300);
    for (const r of [1, 3, 4, 5, 6, 11, 24, 25, 26, 980, 996, 997]) expect(guardados, `renglón ${r}`).toContain(r);
    for (const r of [7, 8, 9, 10, 12, 100, 101, 102, 981, 982, 983, 994]) expect(guardados, `renglón ${r}`).not.toContain(r);
  });

  it("guarda con importe los ingresos, el impuesto generado y descontable, la liquidación y el control de saldos", () => {
    const conImporte = renglonesConImporte(F300);
    const esperados = [...Array.from({ length: 17 }, (_, i) => 27 + i), ...Array.from({ length: 36 }, (_, i) => 58 + i), 980];
    expect([...conImporte].sort((a, b) => a - b)).toEqual(esperados);
  });

  it("los totales del bimestre 1 cuadran con lo impreso", () => {
    const controles = controlarTotales(F300, BIMESTRE_1);
    expect(controles.every((c) => c.cuadra), JSON.stringify(controles.filter((c) => !c.cuadra))).toBe(true);
    expect(controles.map((c) => c.renglon)).toEqual([41, 43, 67, 77, 81, 82, 83, 86, 88, 89, 93]);
  });

  it("los saldos 82, 83, 86, 88 y 89 se escriben en cero si dan negativo", () => {
    const aFavor = new Map<number, number>([[67, 10_000_000], [81, 14_000_000], [84, 1_000_000], [85, 500_000], [87, 200_000]]);
    expect(calcularTotal(F300, 82, aFavor)).toBe(0);
    expect(calcularTotal(F300, 83, aFavor)).toBe(4_000_000);
    expect(calcularTotal(F300, 86, new Map([[82, 1_000_000], [84, 3_000_000]]))).toBe(0);
    expect(calcularTotal(F300, 88, new Map([[82, 1_000_000], [84, 3_000_000], [87, 500_000]]))).toBe(0);
    expect(calcularTotal(F300, 89, new Map([[83, 4_000_000], [84, 1_000_000], [85, 500_000], [87, 200_000]]))).toBe(5_300_000);
    expect(calcularTotal(F300, 89, new Map([[87, 200_000]]))).toBe(0);
  });

  it("con saldo a pagar, el 84 y el 85 ya se descontaron en el 88: el 89 resta el 82 y queda en cero", () => {
    // Un 300 real (bimestre 1 de 2026): saldo a pagar con retención de IVA de 502.000.
    const conSaldoAPagar = new Map<number, number>([
      [67, 445_771_000], [81, 156_398_000], [82, 289_373_000], [83, 0], [84, 0], [85, 502_000], [86, 288_871_000], [87, 0], [88, 288_871_000], [89, 0],
    ]);
    const liquidacion = controlarTotales(F300, conSaldoAPagar).filter((c) => c.renglon >= 82 && c.renglon <= 89);
    expect(liquidacion.every((c) => c.cuadra), JSON.stringify(liquidacion.filter((c) => !c.cuadra))).toBe(true);
    expect(renglonDe(F300, 89)?.terminos).toEqual([[83, 1], [84, 1], [85, 1], [82, -1], [87, -1]]);
    // Retenciones mayores que el saldo a pagar: el 88 queda en cero y el excedente pasa al 89.
    const retencionesDeMas = new Map<number, number>([[82, 1_000_000], [85, 1_500_000]]);
    expect(calcularTotal(F300, 88, retencionesDeMas)).toBe(0);
    expect(calcularTotal(F300, 89, retencionesDeMas)).toBe(500_000);
  });

  it("el 81 resta el ajuste (80) y el 43 resta las devoluciones (42)", () => {
    expect(renglonDe(F300, 81)?.terminos).toEqual([[77, 1], [78, 1], [79, 1], [80, -1]]);
    expect(renglonDe(F300, 43)?.terminos).toEqual([[41, 1], [42, -1]]);
  });

  it("un total en cero impreso con piso cero cuadra aunque la resta dé negativa", () => {
    const valores = new Map<number, number>([[67, 1_000_000], [81, 3_000_000], [82, 0], [83, 2_000_000]]);
    const c82 = controlarTotales(F300, valores).find((c) => c.renglon === 82);
    expect(c82).toMatchObject({ calculado: 0, impreso: 0, cuadra: true });
  });

  it("avisa cuando 90 + 91 + 92 no da el total saldo a favor (89)", () => {
    expect(controlarValidaciones(F300, new Map([[89, 5_000_000], [90, 2_000_000], [92, 3_000_000]]))).toEqual([
      expect.objectContaining({ clave: "saldos_89", calculado: 5_000_000, contra: 5_000_000, cuadra: true }),
    ]);
    expect(controlarValidaciones(F300, new Map([[89, 5_000_000], [90, 2_000_000]]))[0].cuadra).toBe(false);
    expect(controlarValidaciones(F350, FEBRERO)).toEqual([]);
  });
});

describe("conceptos de pago del 490", () => {
  it("nombra los de Retención y los de IVA", () => {
    expect(etiquetaConceptoPago("62")).toBe("ReteIVA (Concepto 62)");
    expect(etiquetaConceptoPago("57")).toBe("IVA cuatrimestral (Concepto 57)");
    expect(CONCEPTO_490_IVA_POR_PERIODICIDAD).toEqual({ Bimestral: "05", Cuatrimestral: "57", Anual: "58" });
    expect(CONCEPTOS_PAGO_IVA).toEqual(["05", "57", "58"]);
  });
});
