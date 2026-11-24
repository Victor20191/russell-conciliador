import { describe, expect, test } from "vitest";
import { omitidosDelPeriodo, seccionDeCambio } from "./omitir-novedades";

describe("seccionDeCambio", () => {
  test("separa funcionalidades nuevas, mejoras y correcciones", () => {
    expect(seccionDeCambio("nueva")).toBe("nuevas");
    expect(seccionDeCambio(" Nueva ")).toBe("nuevas");
    expect(seccionDeCambio("mejora")).toBe("mejoras");
    expect(seccionDeCambio("correccion")).toBe("correcciones");
  });

  test("seguridad va con las correcciones y un tipo desconocido con las mejoras", () => {
    expect(seccionDeCambio("seguridad")).toBe("correcciones");
    expect(seccionDeCambio("otro")).toBe("mejoras");
    expect(seccionDeCambio(null)).toBe("mejoras");
  });
});

describe("omitidosDelPeriodo", () => {
  test("solo cuenta los cambios del período, sin repetir y en orden", () => {
    expect(omitidosDelPeriodo([9, 3, 3, 40], [3, 9, 12])).toEqual([3, 9]);
  });

  test("sin pedidos o sin coincidencias no omite nada", () => {
    expect(omitidosDelPeriodo(undefined, [1, 2])).toEqual([]);
    expect(omitidosDelPeriodo([], [1, 2])).toEqual([]);
    expect(omitidosDelPeriodo([7], [1, 2])).toEqual([]);
  });
});
