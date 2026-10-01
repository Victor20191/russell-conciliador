import { describe, expect, it } from "vitest";
import { mismasCuentas, renglonesSinGuardar } from "./consolidado-sin-guardar";

describe("renglones del Consolidado sin grabar", () => {
  const clasificadores = ["13050505", "28050501", "13100501"];

  it("la cuenta propuesta al abrir y no tocada es una propuesta sin grabar", () => {
    const r = renglonesSinGuardar({
      clasificadores,
      valores: { "13050505": ["130505"], "28050501": ["280505"], "13100501": ["130510"] },
      guardados: { "13050505": [], "28050501": [], "13100501": ["130510"] },
      tocados: new Set(),
    });
    expect(r).toEqual([
      { clasificador: "13050505", cuentas: ["130505"], origen: "propuesta" },
      { clasificador: "28050501", cuentas: ["280505"], origen: "propuesta" },
    ]);
  });

  it("lo que el usuario tocó y no se ha grabado es una edición pendiente, aunque quede vacío", () => {
    const r = renglonesSinGuardar({
      clasificadores,
      valores: { "13050505": ["130505", "130510"], "28050501": [] },
      guardados: { "13050505": ["130505"], "28050501": ["280505"] },
      tocados: new Set(["13050505", "28050501"]),
    });
    expect(r.map((x) => `${x.clasificador}:${x.origen}:${x.cuentas.join("+")}`)).toEqual([
      "13050505:edicion:130505+130510",
      "28050501:edicion:",
    ]);
  });

  it("sin diferencias no hay nada pendiente; el orden de las cuentas no cuenta", () => {
    expect(renglonesSinGuardar({ clasificadores, valores: { "13050505": ["2", "1"] }, guardados: { "13050505": ["1", "2"] }, tocados: new Set() })).toEqual([]);
    expect(mismasCuentas(["130505", "130505"], ["130505"])).toBe(true);
    expect(mismasCuentas(undefined, [])).toBe(true);
    expect(mismasCuentas(["130505"], [])).toBe(false);
  });
});

describe("renglones resueltos por la cuenta contable del archivo (Nómina)", () => {
  const claves = ["1 # 51050601", "23"];
  it("lo que ya resolvió el archivo no es una propuesta pendiente", () => {
    const r = renglonesSinGuardar({
      clasificadores: claves,
      valores: { "1 # 51050601": ["510506"], "23": ["510595"] },
      guardados: {},
      tocados: new Set(),
      resueltos: { "1 # 51050601": ["510506"] },
    });
    // «23» sigue siendo propuesta (la sugirió el nombre, no el archivo).
    expect(r.map((x) => `${x.clasificador}:${x.origen}`)).toEqual(["23:propuesta"]);
  });

  it("si el usuario lo toca, pasa a edición aunque deje la misma cuenta", () => {
    const r = renglonesSinGuardar({
      clasificadores: claves,
      valores: { "1 # 51050601": ["510506"] },
      guardados: {},
      tocados: new Set(["1 # 51050601"]),
      resueltos: { "1 # 51050601": ["510506"] },
    });
    expect(r.map((x) => `${x.clasificador}:${x.origen}`)).toEqual(["1 # 51050601:edicion"]);
  });

  it("si en pantalla hay otra cuenta que la del archivo, queda pendiente", () => {
    const r = renglonesSinGuardar({
      clasificadores: claves,
      valores: { "1 # 51050601": ["510530"] },
      guardados: {},
      tocados: new Set(),
      resueltos: { "1 # 51050601": ["510506"] },
    });
    expect(r.map((x) => `${x.clasificador}:${x.origen}`)).toEqual(["1 # 51050601:propuesta"]);
  });
});
