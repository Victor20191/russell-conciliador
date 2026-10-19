import { describe, expect, it } from "vitest";
import {
  alcancesEliminacionModuloPermitidos,
  motivoEliminacionPorCierre,
  parseAlcanceEliminacionModulo,
  resolverAlcanceEliminacionModulo,
} from "./alcance-eliminacion";

const REF = { id: 42, clienteId: 7, moduloCodigo: "INV", periodo: "2026-03" };

describe("alcancesEliminacionModuloPermitidos", () => {
  it("quien administra los perfiles de carga elige los tres alcances", () => {
    expect(alcancesEliminacionModuloPermitidos(true)).toEqual(["version", "periodo", "cliente_perfiles"]);
  });

  it("el senior elimina una versión o un período, nunca el historial con perfiles", () => {
    expect(alcancesEliminacionModuloPermitidos(false)).toEqual(["version", "periodo"]);
  });
});

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

describe("motivoEliminacionPorCierre", () => {
  const cierre = (periodo: string) => ({ moduloCodigo: "NOM", periodo, cerradoPor: "Camila", moduloDatoEncabezadoId: 74 });

  it("sin cierres en firme se puede eliminar", () => {
    expect(motivoEliminacionPorCierre("version", [])).toBeNull();
  });

  it("con la conciliación en firme no se elimina ningún alcance que la incluya", () => {
    expect(motivoEliminacionPorCierre("version", [cierre("2025-12")])).toBe(
      "No se puede eliminar esta versión: la conciliación de NOM está en firme en 2025-12 (cargue #74, cerró Camila). Pide al senior o gerente del cliente que la desbloquee primero.",
    );
    expect(motivoEliminacionPorCierre("periodo", [cierre("2025-12")])).toContain("los cargues de este período");
    expect(motivoEliminacionPorCierre("cliente_perfiles", [cierre("2025-12"), cierre("2025-11")])).toContain("en 2025-11 (cargue #74, cerró Camila); 2025-12");
  });
});
