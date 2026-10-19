import { describe, expect, it } from "vitest";
import { porcentajeCompletitud } from "./completitud";

describe("porcentajeCompletitud", () => {
  it("marca 100 solo cuando no falta ninguna cuenta", () => {
    expect(porcentajeCompletitud(421, 0)).toBe(100);
    expect(porcentajeCompletitud(0, 0)).toBe(100); // sin filas: nada por mapear
  });

  it("nunca redondea hacia arriba: una cuenta sin mapear deja el balance por debajo de 100", () => {
    expect(porcentajeCompletitud(341, 1)).toBe(99); // 99,7 %
    expect(porcentajeCompletitud(9_999, 1)).toBe(99); // 99,99 %
    expect(porcentajeCompletitud(419, 1)).toBe(99);
  });

  it("trunca el resto de los casos", () => {
    expect(porcentajeCompletitud(1, 2)).toBe(33);
    expect(porcentajeCompletitud(2, 1)).toBe(66);
    expect(porcentajeCompletitud(0, 10)).toBe(0);
  });
});
