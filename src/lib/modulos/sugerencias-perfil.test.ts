import { describe, expect, it } from "vitest";
import { seleccionarSugerenciasPerfil, type PerfilCandidato } from "./sugerencias-perfil";

const specValido = (col: number) => ({
  hoja: "Inventario",
  filaEncabezado: 1,
  primeraFilaDatos: 2,
  columnas: { referencia: col },
});

const candidato = (extra: Partial<PerfilCandidato>): PerfilCandidato => ({
  clienteId: 1,
  clienteNombre: "Cliente 1",
  huella: "aaa",
  spec: specValido(1),
  archivoEjemplo: "archivo.xlsx",
  vecesUsado: 1,
  ...extra,
});

describe("seleccionarSugerenciasPerfil", () => {
  it("sin perfiles ni huellas: todo vacío", () => {
    expect(seleccionarSugerenciasPerfil([], [])).toEqual({ exacto: null, lista: [] });
  });

  it("elige como exacto el de mayor vecesUsado entre los de huella coincidente", () => {
    const perfiles = [
      candidato({ clienteId: 1, huella: "h1", vecesUsado: 3 }),
      candidato({ clienteId: 2, huella: "h1", vecesUsado: 7 }),
      candidato({ clienteId: 3, huella: "h1", vecesUsado: 5 }),
      candidato({ clienteId: 4, huella: "h2", vecesUsado: 99 }), // huella no candidata: no compite
    ];
    const r = seleccionarSugerenciasPerfil(perfiles, ["h1"]);
    expect(r.exacto?.clienteId).toBe(2);
    // el resto (sin el exacto) queda en la lista, ordenado por vecesUsado desc
    expect(r.lista.map((p) => p.clienteId)).toEqual([4, 3, 1]);
  });

  it("desempata por clienteId mayor cuando el vecesUsado es igual", () => {
    const perfiles = [
      candidato({ clienteId: 5, huella: "h1", vecesUsado: 2 }),
      candidato({ clienteId: 9, huella: "h1", vecesUsado: 2 }),
    ];
    const r = seleccionarSugerenciasPerfil(perfiles, ["h1"]);
    expect(r.exacto?.clienteId).toBe(9);
    expect(r.lista.map((p) => p.clienteId)).toEqual([5]);
  });

  it("sin huella coincidente: no hay exacto y todos van a la lista, ordenados", () => {
    const perfiles = [
      candidato({ clienteId: 1, huella: "hx", vecesUsado: 2 }),
      candidato({ clienteId: 2, huella: "hy", vecesUsado: 10 }),
      candidato({ clienteId: 3, huella: "hz", vecesUsado: 6 }),
    ];
    const r = seleccionarSugerenciasPerfil(perfiles, ["no-coincide"]);
    expect(r.exacto).toBeNull();
    expect(r.lista.map((p) => p.clienteId)).toEqual([2, 3, 1]);
  });

  it("descarta specs que ya no validan contra el esquema actual", () => {
    const perfiles = [
      candidato({ clienteId: 1, huella: "h1", spec: { hoja: "x" } }), // inválido: faltan campos
      candidato({ clienteId: 2, huella: "h1", spec: "no es un objeto" }),
      candidato({ clienteId: 3, huella: "h2", vecesUsado: 4 }),
    ];
    const r = seleccionarSugerenciasPerfil(perfiles, ["h1"]);
    expect(r.exacto).toBeNull();
    expect(r.lista.map((p) => p.clienteId)).toEqual([3]);
  });

  it("deduplica por (clienteId, huella)", () => {
    const perfiles = [
      candidato({ clienteId: 1, huella: "h1", vecesUsado: 2 }),
      candidato({ clienteId: 1, huella: "h1", vecesUsado: 2 }),
      candidato({ clienteId: 1, huella: "h2", vecesUsado: 9 }),
    ];
    const r = seleccionarSugerenciasPerfil(perfiles, []);
    expect(r.lista).toHaveLength(2);
  });
});
