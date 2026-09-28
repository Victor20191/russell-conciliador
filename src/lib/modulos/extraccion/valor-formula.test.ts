import { describe, expect, it } from "vitest";
import { letraColumnaModulo } from "../perfil-modulo";
import {
  claveTerminoFormula,
  evaluarValorFormula,
  sanearValorFormula,
  textoValorFormula,
  tieneValorFormula,
  validarValorFormula,
  type TerminoFormula,
} from "./valor-formula";

// SAP Business One: M «Total sin Descuento» + N, O, P (los tres «Total Fletes»).
const SAP: TerminoFormula[] = [
  { columna: 13, signo: "+" },
  { columna: 14, signo: "+" },
  { columna: 15, signo: "+" },
  { columna: 16, signo: "+" },
];
const ENCABEZADO: unknown[] = [];
ENCABEZADO[12] = "Total sin Descuento";
ENCABEZADO[13] = "Total Fletes";
ENCABEZADO[14] = "Total Fletes No Gravados";
ENCABEZADO[15] = "Total Fletes Exentos";

describe("valor por fórmula", () => {
  it("solo hay fórmula con dos o más términos", () => {
    expect(tieneValorFormula({})).toBe(false);
    expect(tieneValorFormula({ valorFormula: [{ columna: 3, signo: "+" }] })).toBe(false);
    expect(tieneValorFormula({ valorFormula: SAP })).toBe(true);
  });

  it("sanea lo guardado: columnas válidas, signo válido y sin repetidas", () => {
    expect(sanearValorFormula(undefined)).toBeUndefined();
    expect(sanearValorFormula("M+N")).toBeUndefined();
    expect(sanearValorFormula([
      { columna: 13, signo: "+" },
      { columna: 0, signo: "+" },
      { columna: 14, signo: "*" },
      { columna: 13, signo: "-" },
      { columna: 17, signo: "-" },
    ])).toEqual([{ columna: 13, signo: "+" }, { columna: 17, signo: "-" }]);
  });

  it("valida cantidad de términos, columnas sin elegir y repetidas", () => {
    expect(validarValorFormula({}, letraColumnaModulo)).toBeNull();
    expect(validarValorFormula({ valorFormula: SAP }, letraColumnaModulo)).toBeNull();
    expect(validarValorFormula({ valorFormula: [{ columna: 13, signo: "+" }] }, letraColumnaModulo)).toMatch(/al menos dos columnas/);
    expect(validarValorFormula({ valorFormula: [{ columna: 13, signo: "+" }, { columna: 0, signo: "+" }] }, letraColumnaModulo)).toMatch(/sin elegir/);
    expect(validarValorFormula({ valorFormula: [{ columna: 13, signo: "+" }, { columna: 13, signo: "-" }] }, letraColumnaModulo)).toBe("La fórmula del valor repite la columna M.");
  });

  it("la escribe con letras o con rótulos, y la resta con «−»", () => {
    expect(textoValorFormula(SAP, letraColumnaModulo)).toBe("M + N + O + P");
    expect(textoValorFormula(SAP, letraColumnaModulo, ENCABEZADO)).toBe("Total sin Descuento + Total Fletes + Total Fletes No Gravados + Total Fletes Exentos");
    expect(textoValorFormula([{ columna: 18, signo: "+" }, { columna: 17, signo: "-" }], letraColumnaModulo)).toBe("R − Q");
    expect(claveTerminoFormula(13, letraColumnaModulo, ENCABEZADO)).toBe("M · Total sin Descuento");
    expect(claveTerminoFormula(20, letraColumnaModulo, ENCABEZADO)).toBe("T");
  });

  it("evalúa la fila de SAP: 2.300.999,60 + 138.060 + vacío + 0 = 2.439.059,60", () => {
    const celdas: Record<number, number | null> = { 13: 2300999.6, 14: 138060, 15: null, 16: 0 };
    const r = evaluarValorFormula(SAP, (c) => celdas[c] ?? null, (c) => claveTerminoFormula(c, letraColumnaModulo, ENCABEZADO));
    expect(r.valor).toBe(2439059.6);
    expect(r.algunDato).toBe(true);
    expect(r.terminos).toEqual({
      "M · Total sin Descuento": 2300999.6,
      "N · Total Fletes": 138060,
      "O · Total Fletes No Gravados": 0,
      "P · Total Fletes Exentos": 0,
    });
  });

  it("una resta guarda su aporte en negativo: la suma de los términos es el valor", () => {
    const r = evaluarValorFormula(
      [{ columna: 18, signo: "+" }, { columna: 17, signo: "-" }],
      (c) => (c === 18 ? 2902481 : 463421.4),
      (c) => letraColumnaModulo(c),
    );
    expect(r.valor).toBe(2439059.6);
    expect(r.terminos).toEqual({ R: 2902481, Q: -463421.4 });
    expect(Object.values(r.terminos).reduce((s, v) => s + v, 0)).toBeCloseTo(r.valor, 2);
  });

  it("sin ningún término con dato, la fila no trae valor", () => {
    const r = evaluarValorFormula(SAP, () => null, (c) => letraColumnaModulo(c));
    expect(r).toMatchObject({ valor: 0, algunDato: false });
  });
});
