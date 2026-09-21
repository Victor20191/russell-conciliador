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
