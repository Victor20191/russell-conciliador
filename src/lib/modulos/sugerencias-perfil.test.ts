import { describe, expect, it } from "vitest";
import { seleccionarPerfilExacto, type PerfilCandidato } from "./sugerencias-perfil";

const specValido = (col: number) => ({
  hoja: "Inventario",
  filaEncabezado: 1,
  primeraFilaDatos: 2,
  columnas: { referencia: col },
});

const candidato = (extra: Partial<PerfilCandidato>): PerfilCandidato => ({
  clienteId: 1,
  huella: "aaa",
  spec: specValido(1),
  vecesUsado: 1,
  ...extra,
});

describe("seleccionarPerfilExacto", () => {
  it("sin perfiles ni huellas no reutiliza nada", () => {
    expect(seleccionarPerfilExacto([], [])).toBeNull();
  });

  it("elige como exacto el de mayor vecesUsado entre los de huella coincidente", () => {
    const perfiles = [
      candidato({ clienteId: 1, huella: "h1", vecesUsado: 3 }),
      candidato({ clienteId: 2, huella: "h1", vecesUsado: 7 }),
      candidato({ clienteId: 3, huella: "h1", vecesUsado: 5 }),
      candidato({ clienteId: 4, huella: "h2", vecesUsado: 99 }), // huella no candidata: no compite
    ];
    expect(seleccionarPerfilExacto(perfiles, ["h1"])?.clienteId).toBe(2);
  });

  it("desempata por clienteId mayor cuando el vecesUsado es igual", () => {
    const perfiles = [
      candidato({ clienteId: 5, huella: "h1", vecesUsado: 2 }),
      candidato({ clienteId: 9, huella: "h1", vecesUsado: 2 }),
    ];
    expect(seleccionarPerfilExacto(perfiles, ["h1"])?.clienteId).toBe(9);
  });

  it("sin huella coincidente ignora todos los perfiles", () => {
    const perfiles = [
      candidato({ clienteId: 1, huella: "hx", vecesUsado: 2 }),
      candidato({ clienteId: 2, huella: "hy", vecesUsado: 10 }),
      candidato({ clienteId: 3, huella: "hz", vecesUsado: 6 }),
    ];
    expect(seleccionarPerfilExacto(perfiles, ["no-coincide"])).toBeNull();
  });

  it("descarta specs que ya no validan contra el esquema actual", () => {
    const perfiles = [
      candidato({ clienteId: 1, huella: "h1", spec: { hoja: "x" } }), // inválido: faltan campos
      candidato({ clienteId: 2, huella: "h1", spec: "no es un objeto" }),
      candidato({ clienteId: 3, huella: "h2", vecesUsado: 4 }),
    ];
    expect(seleccionarPerfilExacto(perfiles, ["h1"])).toBeNull();
  });

  it("deduplica por cliente y huella antes de comparar", () => {
    const perfiles = [
      candidato({ clienteId: 1, huella: "h1", vecesUsado: 2, spec: specValido(3) }),
      candidato({ clienteId: 1, huella: "h1", vecesUsado: 99, spec: specValido(7) }),
    ];
    const r = seleccionarPerfilExacto(perfiles, ["h1"]);
    expect(r?.vecesUsado).toBe(2);
    expect(r?.spec).toEqual(specValido(3));
  });
});
