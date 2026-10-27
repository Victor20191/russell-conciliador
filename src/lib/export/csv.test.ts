import { describe, expect, it } from "vitest";
import { celdaCsv } from "./csv";

describe("CSV para hojas de cálculo", () => {
  it.each(["=1+1.xlsx", "+SUM(A1)", "-1+1", "@SUM(A1)", "  =1+1", "\uFEFF=1+1", "\t=1+1"])(
    "neutraliza una fórmula en texto: %s", (texto) => expect(celdaCsv(texto)).toBe(`'${texto}`),
  );
  it("escapa comillas, delimitadores y retornos de carro", () => {
    expect(celdaCsv('a;"b"\rc')).toBe('"a;""b""\rc"');
    expect(celdaCsv("\r=1+1")).toBe('"\'\r=1+1"');
  });
  it("conserva montos negativos reales y valores inocuos", () => {
    expect(celdaCsv(-42.5)).toBe("-42.5");
    expect(celdaCsv(0)).toBe("0");
    expect(celdaCsv(null)).toBe("");
    expect(celdaCsv("balance.xlsx")).toBe("balance.xlsx");
  });
});
