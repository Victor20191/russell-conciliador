import { describe, expect, it } from "vitest";
import { calcularTotal, controlarTotales, renglonDe, renglonesConImporte, renglonesGuardados } from "./definicion";
import { F350, RENGLONES_RENTA_F350 } from "./f350";
import { F490 } from "./f490";
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
