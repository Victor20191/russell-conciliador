import { describe, expect, it } from "vitest";
import { esMismoOrigen } from "@/lib/http/origen";

const pedir = (headers: Record<string, string>) =>
  new Request("http://localhost:3001/api/x", { method: "POST", headers });

describe("esMismoOrigen", () => {
  it("acepta el origen que coincide con el host pedido, aunque el proceso escuche en otro", () => {
    // El caso del VPS: el navegador entra por la IP y Next construye su URL con localhost.
    expect(esMismoOrigen(pedir({ origin: "http://85.239.249.103:3001", host: "85.239.249.103:3001" }))).toBe(true);
  });

  it("prefiere x-forwarded-host cuando hay proxy, y tolera TLS terminado en él", () => {
    expect(
      esMismoOrigen(
        pedir({ origin: "https://app.russell.co", host: "127.0.0.1:3001", "x-forwarded-host": "app.russell.co" }),
      ),
    ).toBe(true);
  });

  it("toma solo el primer valor de una cadena de proxies", () => {
    expect(
      esMismoOrigen(pedir({ origin: "https://app.russell.co", "x-forwarded-host": "app.russell.co, interno:3001" })),
    ).toBe(true);
  });

  it("rechaza un sitio distinto", () => {
    expect(esMismoOrigen(pedir({ origin: "https://malicioso.example", host: "85.239.249.103:3001" }))).toBe(false);
  });

  it("rechaza un puerto distinto", () => {
    expect(esMismoOrigen(pedir({ origin: "http://85.239.249.103:9999", host: "85.239.249.103:3001" }))).toBe(false);
  });

  it("rechaza un Origin que no es una URL", () => {
    expect(esMismoOrigen(pedir({ origin: "null", host: "85.239.249.103:3001" }))).toBe(false);
  });

  it("sin cabecera Host cae al host de la propia URL", () => {
    const sinHost = new Request("https://russell.test/api/x", { method: "POST", headers: { origin: "https://russell.test" } });
    expect(esMismoOrigen(sinHost)).toBe(true);
  });

  it("deja pasar lo que no viene de un navegador (sin Origin); la sesión decide", () => {
    expect(esMismoOrigen(pedir({ host: "85.239.249.103:3001" }))).toBe(true);
  });

  it("admite hosts extra declarados por entorno", () => {
    const previo = process.env.ORIGENES_PERMITIDOS;
    process.env.ORIGENES_PERMITIDOS = "https://reportes.russell.co, otra.russell.co";
    try {
      expect(esMismoOrigen(pedir({ origin: "https://reportes.russell.co", host: "interno:3001" }))).toBe(true);
      expect(esMismoOrigen(pedir({ origin: "https://otra.russell.co", host: "interno:3001" }))).toBe(true);
      expect(esMismoOrigen(pedir({ origin: "https://ajena.example", host: "interno:3001" }))).toBe(false);
    } finally {
      if (previo === undefined) delete process.env.ORIGENES_PERMITIDOS;
      else process.env.ORIGENES_PERMITIDOS = previo;
    }
  });
});
