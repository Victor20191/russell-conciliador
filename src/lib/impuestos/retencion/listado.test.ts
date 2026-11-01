import { describe, expect, it } from "vitest";
import { contarRevisionesPorEstado, estadoRevision, filtrarRevisiones } from "./listado";

const REVISIONES = [
  { id: 1, nombreCliente: "Inversiones Peñalosa S.A.S.", nitCliente: "900111222", anio: 2026, estado: "en_proceso" },
  { id: 2, nombreCliente: "Inversiones Peñalosa S.A.S.", nitCliente: "900111222", anio: 2025, estado: "en_firme" },
  { id: 3, nombreCliente: "Comercial Andina Ltda", nitCliente: "800333444", anio: 2026, estado: "en_firme" },
];
const ids = (filas: { id: number }[]) => filas.map((f) => f.id);

describe("lista de revisiones de Retención", () => {
  it("busca por razón social sin importar tildes ni mayúsculas", () => {
    expect(ids(filtrarRevisiones(REVISIONES, "  peñalosa ", null))).toEqual([1, 2]);
    expect(ids(filtrarRevisiones(REVISIONES, "ANDINA", null))).toEqual([3]);
  });

  it("busca por NIT con o sin dígito de verificación, y por año", () => {
    expect(ids(filtrarRevisiones(REVISIONES, "800333444", null))).toEqual([3]);
    expect(ids(filtrarRevisiones(REVISIONES, "800.333.444-5", null))).toEqual([3]);
    expect(ids(filtrarRevisiones(REVISIONES, "2025", null))).toEqual([2]);
  });

  it("filtra por estado y lo combina con la búsqueda", () => {
    expect(ids(filtrarRevisiones(REVISIONES, "", "en_firme"))).toEqual([2, 3]);
    expect(ids(filtrarRevisiones(REVISIONES, "", "en_proceso"))).toEqual([1]);
    expect(ids(filtrarRevisiones(REVISIONES, "andina", "en_proceso"))).toEqual([]);
    expect(ids(filtrarRevisiones(REVISIONES, "", null))).toEqual([1, 2, 3]);
  });

  it("cuenta por estado, y lo que no está en firme se trabaja como en proceso", () => {
    expect(contarRevisionesPorEstado(REVISIONES)).toEqual({ en_proceso: 1, en_firme: 2 });
    expect(estadoRevision({ estado: "otro" })).toBe("en_proceso");
  });
});
