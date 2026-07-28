import { describe, expect, it } from "vitest";
import { acotarRevelado, revelarHastaIndice, siguienteRevelado } from "./revelado-progresivo";

describe("acotarRevelado", () => {
  it("sin filas (total 0) siempre da 0", () => {
    expect(acotarRevelado(200, 0)).toBe(0);
    expect(acotarRevelado(0, 0)).toBe(0);
  });

  it("nunca queda negativa", () => {
    expect(acotarRevelado(-50, 100)).toBe(0);
  });

  it("nunca supera el total (el filtro pudo reducir la lista)", () => {
    expect(acotarRevelado(500, 30)).toBe(30);
  });

  it("pasa igual cuando está dentro de rango", () => {
    expect(acotarRevelado(120, 500)).toBe(120);
  });
});

describe("siguienteRevelado", () => {
  it("crece un bloque completo", () => {
    expect(siguienteRevelado(200, 10_000, 200)).toBe(400);
  });

  it("se detiene en el total aunque sobre bloque", () => {
    expect(siguienteRevelado(950, 1000, 200)).toBe(1000);
  });

  it("no crece más allá del total ya alcanzado", () => {
    expect(siguienteRevelado(1000, 1000, 200)).toBe(1000);
  });
});

describe("revelarHastaIndice", () => {
  it("si el índice ya está revelado, no cambia nada", () => {
    expect(revelarHastaIndice(50, 200, 10_000, 200)).toBe(200);
  });

  it("crece en bloques completos hasta cubrir el índice objetivo", () => {
    // índice 450 (0-based) necesita al menos 451 filas → 3 bloques de 200 = 600
    expect(revelarHastaIndice(450, 200, 10_000, 200)).toBe(600);
  });

  it("el índice justo en el borde de un bloque exige el bloque siguiente", () => {
    // índice 199 (fila 200, 0-based) cabe en el primer bloque de 200
    expect(revelarHastaIndice(199, 0, 10_000, 200)).toBe(200);
    // índice 200 (fila 201) ya necesita el segundo bloque
    expect(revelarHastaIndice(200, 0, 10_000, 200)).toBe(400);
  });

  it("índice inválido (negativo o fuera de rango) no cambia la cantidad actual", () => {
    expect(revelarHastaIndice(-1, 200, 10_000, 200)).toBe(200);
    expect(revelarHastaIndice(10_000, 200, 10_000, 200)).toBe(200);
  });

  it("acota al total cuando el bloque calculado lo supera", () => {
    expect(revelarHastaIndice(950, 200, 1000, 200)).toBe(1000);
  });

  it("con total reducido por un filtro, acota la cantidad actual también", () => {
    expect(revelarHastaIndice(5, 800, 10, 200)).toBe(10);
  });
});
