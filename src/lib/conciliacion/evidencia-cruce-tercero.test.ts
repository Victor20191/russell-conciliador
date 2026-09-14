import { describe, expect, it } from "vitest";
import { construirCruceTerceroCartera } from "@/lib/modulos/cartera/cruce-tercero-cartera";
import { evidenciaCruceTercero } from "./evidencia-cruce-tercero";

const cruce = (valorDos: number) => construirCruceTerceroCartera({
  contable: [
    { clave: "900000001", cuenta6: "130505", valor: 100, nombre: "UNO" },
    { clave: "900000002", cuenta6: "130505", valor: valorDos, nombre: "DOS" },
  ],
  modulo: [
    { clave: "900000001", saldo: 100, nombre: null, origenCartera: null, cuenta6: null },
    { clave: "900000002", saldo: 50, nombre: null, origenCartera: null, cuenta6: null },
  ],
  cuentasModulo: ["130505"],
});

describe("evidenciaCruceTercero", () => {
  it("resume totales, conteos y marcas, con una huella del cruce clave a clave", () => {
    const evidencia = evidenciaCruceTercero(cruce(80), { conDiferencia: 1, marcadas: 1, pendientes: 0, desactualizadas: 0, montoPendiente: 0, bajoUmbral: 2 });
    expect(evidencia).toMatchObject({
      version: 1,
      terceros: 2,
      totales: { contable: 180, modulo: 150, diferencia: 30 },
      conteo: { cuadra: 1, descuadre: 1, solo_contable: 0, solo_modulo: 0, sin_saldo: 0 },
      marcas: { conDiferencia: 1, marcadas: 1, bajoUmbral: 2 },
    });
    expect(evidencia.huella).toMatch(/^[0-9a-f]{64}$/);
  });

  it("la huella no depende del orden de los terceros y cambia con un centavo", () => {
    const base = cruce(80);
    const invertido = { ...base, filas: [...base.filas].reverse() };
    expect(evidenciaCruceTercero(invertido, null).huella).toBe(evidenciaCruceTercero(base, null).huella);
    expect(evidenciaCruceTercero(cruce(80.01), null).huella).not.toBe(evidenciaCruceTercero(base, null).huella);
  });
});
