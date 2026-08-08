import { describe, expect, test } from "vitest";
import { crearCodigoTicket, crearUrlSeguimiento, huellaTokenAcceso } from "./soporte";

describe("credenciales publicas de tickets", () => {
  test("el codigo usa la fecha de Colombia y un sufijo no adivinable", () => {
    const fechaCercaDeMedianocheUTC = new Date("2026-08-08T03:30:00.000Z");
    expect(crearCodigoTicket(fechaCercaDeMedianocheUTC, "a1b2c3d4")).toBe("TKT-20260807-A1B2C3D4");
  });

  test("la huella no persiste el token publico en texto plano", () => {
    const token = "un-token-de-acceso-suficientemente-largo";
    const huella = huellaTokenAcceso(token);
    expect(huella).toMatch(/^[a-f0-9]{64}$/);
    expect(huella).not.toContain(token);
  });

  test("la URL codifica codigo y token", () => {
    expect(crearUrlSeguimiento("TKT 1", "abc/123")).toBe("/soporte/tickets/TKT%201?acceso=abc%2F123");
  });
});
