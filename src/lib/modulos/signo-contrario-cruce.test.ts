import { describe, expect, it } from "vitest";
import { resumenSignoContrario, signoContrarioFila } from "./signo-contrario-cruce";

const fila = (contable: number, inventario: number, extra: { noModular?: number; noModularModulo?: number; cuenta4?: string } = {}) => {
  const noModular = extra.noModular ?? 0;
  const noModularModulo = extra.noModularModulo ?? 0;
  return {
    cuenta4: extra.cuenta4 ?? "410505",
    contable,
    inventario,
    noModular,
    noModularModulo,
    diferencia: Math.round((contable - noModular - (inventario - noModularModulo)) * 100) / 100,
  };
};

describe("signoContrarioFila", () => {
  it("Kakaraka ING dic-2025: el módulo es la contabilidad con el signo contrario", () => {
    const r = signoContrarioFila(fila(71_488_944_207.09, -71_338_100_736.09, { cuenta4: "410505+417505" }), 2_000);
    expect(r).toEqual({
      clave: "410505+417505",
      contable: 71_488_944_207.09,
      modulo: -71_338_100_736.09,
      diferencia: 142_827_044_943.18,
      diferenciaInvertida: 150_843_471,
    });
  });

  it("también al revés: contabilidad negativa y módulo positivo (devoluciones)", () => {
    const r = signoContrarioFila(fila(-20_172_163_662.2, 20_282_658_951.53), 2_000);
    expect(r?.diferenciaInvertida).toBe(110_495_289.33);
  });

  it("no avisa con el mismo signo, con un lado en cero ni con magnitudes lejanas", () => {
    expect(signoContrarioFila(fila(1_000_000, 900_000), 2_000)).toBeNull();
    expect(signoContrarioFila(fila(1_000_000, 0), 2_000)).toBeNull();
    expect(signoContrarioFila(fila(0, -1_000_000), 2_000)).toBeNull();
    // −500.000 contra 1.000.000: el módulo es la mitad, no el mismo saldo invertido.
    expect(signoContrarioFila(fila(1_000_000, -500_000), 2_000)).toBeNull();
  });

  it("el borde del 10 % de la mayor magnitud entra; pasarlo, no", () => {
    expect(signoContrarioFila(fila(1_000_000, -900_000), 2_000)?.diferenciaInvertida).toBe(100_000);
    expect(signoContrarioFila(fila(1_000_000, -899_999), 2_000)).toBeNull();
  });

  it("una diferencia por debajo de la tolerancia de la cédula no avisa", () => {
    expect(signoContrarioFila(fila(500, -500), 2_000)).toBeNull();
    expect(signoContrarioFila(fila(500, -500), 0)?.diferenciaInvertida).toBe(0);
  });

  it("mira los lados ajustados: lo no modular de cada lado se descuenta antes", () => {
    // Contabilidad 1.300.000 con 300.000 no modulares → 1.000.000 contra −1.000.000 del módulo.
    expect(signoContrarioFila(fila(1_300_000, -1_000_000, { noModular: 300_000 }), 2_000)?.diferenciaInvertida).toBe(0);
    // El módulo trae −1.400.000 con −400.000 no contabilizados → −1.000.000.
    expect(signoContrarioFila(fila(1_000_000, -1_400_000, { noModularModulo: -400_000 }), 2_000)?.modulo).toBe(-1_000_000);
  });
});

describe("resumenSignoContrario", () => {
  it("suma las diferencias de hoy y las invertidas de los renglones que avisan", () => {
    const r = resumenSignoContrario([
      fila(91_337_841_904.29, -91_620_759_687.62, { cuenta4: "410505" }),
      fila(-20_172_163_662.2, 20_282_658_951.53, { cuenta4: "417505" }),
      fila(320_135_956, 0, { cuenta4: "420505" }),
    ], 2_000);
    expect(r?.filas.map((f) => f.clave)).toEqual(["410505", "417505"]);
    expect(r?.diferenciaInvertida).toBe(-172_422_494);
    // 182.958.601.591,91 (410505) − 40.454.822.613,73 (417505).
    expect(r?.diferencia).toBe(142_503_778_978.18);
  });

  it("sin ningún renglón en el signo contrario devuelve null", () => {
    expect(resumenSignoContrario([fila(100_000, 100_000), fila(0, 0)], 2_000)).toBeNull();
  });
});
