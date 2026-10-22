import { describe, expect, it } from "vitest";
import { filtrarFicha, normalizarBusqueda } from "./buscar";
import { FICHA_BALANCE_DETALLE } from "./fichas/balance";

describe("filtrarFicha", () => {
  it("sin texto devuelve la ficha entera", () => {
    expect(filtrarFicha(FICHA_BALANCE_DETALLE, "  ")).toEqual({ ficha: FICHA_BALANCE_DETALLE, coincidencias: -1 });
  });

  it("no distingue tildes ni mayúsculas", () => {
    expect(normalizarBusqueda("  Homologación  ÚNICA ")).toBe("homologacion unica");
    const conTilde = filtrarFicha(FICHA_BALANCE_DETALLE, "HOMOLOGACIÓN").coincidencias;
    expect(conTilde).toBeGreaterThan(0);
    expect(filtrarFicha(FICHA_BALANCE_DETALLE, "homologacion").coincidencias).toBe(conTilde);
  });

  it("busca también en las pestañas, los estados y las preguntas", () => {
    const { ficha, coincidencias } = filtrarFicha(FICHA_BALANCE_DETALLE, "dar ok");
    expect(coincidencias).toBeGreaterThan(0);
    expect(ficha.pestanas?.flatMap((p) => p.etapas).flatMap((e) => e.acciones).map((a) => a.nombre)).toContain("Dar OK");
    expect(ficha.preguntas?.length).toBeGreaterThan(0);
  });

  it("exige todas las palabras y deja fuera lo que no coincide", () => {
    expect(filtrarFicha(FICHA_BALANCE_DETALLE, "cerrar balance").coincidencias).toBeGreaterThan(0);
    const nada = filtrarFicha(FICHA_BALANCE_DETALLE, "cerrar zzzz");
    expect(nada.coincidencias).toBe(0);
    expect(nada.ficha.etapas).toEqual([]);
    expect(nada.ficha.pestanas).toEqual([]);
  });
});
