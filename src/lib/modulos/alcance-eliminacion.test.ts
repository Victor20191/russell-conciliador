import { describe, expect, it } from "vitest";
import {
  parseAlcanceEliminacionModulo,
  resolverAlcanceEliminacionModulo,
} from "./alcance-eliminacion";

const REF = { id: 42, clienteId: 7, moduloCodigo: "INV", periodo: "2026-03" };

describe("parseAlcanceEliminacionModulo", () => {
  it("acepta los tres alcances conocidos", () => {
    expect(parseAlcanceEliminacionModulo("version")).toBe("version");
    expect(parseAlcanceEliminacionModulo("periodo")).toBe("periodo");
    expect(parseAlcanceEliminacionModulo("cliente_perfiles")).toBe("cliente_perfiles");
  });

  it("rechaza cualquier otro valor (fail-closed)", () => {
    expect(parseAlcanceEliminacionModulo("todo")).toBeNull();
    expect(parseAlcanceEliminacionModulo("")).toBeNull();
    expect(parseAlcanceEliminacionModulo(undefined)).toBeNull();
    expect(parseAlcanceEliminacionModulo({ alcance: "version" })).toBeNull();
  });
});

describe("resolverAlcanceEliminacionModulo", () => {
  it("versión: solo ese cargue, sin tocar marcas ni perfiles", () => {
    expect(resolverAlcanceEliminacionModulo("version", REF)).toEqual({
      filtroEncabezado: { id: 42 },
      filtroMarcas: null,
      eliminaPerfiles: false,
    });
  });

  it("período: todas las versiones del período y sus marcas de cruce", () => {
    expect(resolverAlcanceEliminacionModulo("periodo", REF)).toEqual({
      filtroEncabezado: { clienteId: 7, moduloCodigo: "INV", periodo: "2026-03" },
      filtroMarcas: { clienteId: 7, moduloCodigo: "INV", periodo: "2026-03" },
      eliminaPerfiles: false,
    });
  });

  it("cliente: todo el historial del módulo más los perfiles de formato", () => {
    expect(resolverAlcanceEliminacionModulo("cliente_perfiles", REF)).toEqual({
      filtroEncabezado: { clienteId: 7, moduloCodigo: "INV" },
      filtroMarcas: { clienteId: 7, moduloCodigo: "INV" },
      eliminaPerfiles: true,
    });
  });

  it("ningún alcance se sale del cliente ni del módulo de la referencia", () => {
    for (const alcance of ["periodo", "cliente_perfiles"] as const) {
      const plan = resolverAlcanceEliminacionModulo(alcance, REF);
      expect(plan.filtroEncabezado).toMatchObject({ clienteId: 7, moduloCodigo: "INV" });
    }
  });
});
