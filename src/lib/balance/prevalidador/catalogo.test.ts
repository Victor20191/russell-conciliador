import { describe, expect, it } from "vitest";
import {
  baseCalculoPorDefecto,
  catalogoPrevalidadorDeFabrica,
  esBaseCalculo,
  normalizarPrefijo,
  ordenModulo,
  PREVALIDADOR_CATALOGO_FABRICA,
  PREVALIDADOR_MODULOS_ORDEN,
} from "./catalogo";

describe("catálogo de fábrica del prevalidador", () => {
  it("trae las 11 filas que definió Russell, sin duplicados", () => {
    expect(PREVALIDADOR_CATALOGO_FABRICA).toHaveLength(11);
    const claves = PREVALIDADOR_CATALOGO_FABRICA.map((f) => `${f.moduloCodigo}|${f.cuentaRussell}`);
    expect(new Set(claves).size).toBe(11);
  });

  it("solo usa módulos conocidos y cubre los seis del ERP", () => {
    const usados = new Set(PREVALIDADOR_CATALOGO_FABRICA.map((f) => f.moduloCodigo));
    for (const codigo of usados) expect(PREVALIDADOR_MODULOS_ORDEN).toContain(codigo);
    expect([...usados].sort()).toEqual(["AFI", "CAR", "CXP", "ING", "INV", "NOM"]);
  });

  it("cada fila de fábrica lleva la base de cálculo que le toca por su clase", () => {
    // Cazaría una siembra incoherente (p. ej. la 7205 marcada como "saldo").
    for (const f of PREVALIDADOR_CATALOGO_FABRICA) {
      expect(f.baseCalculo, `fila ${f.cuentaRussell}`).toBe(baseCalculoPorDefecto(f.cuentaRussell));
    }
  });

  it("las cuentas de balance van por saldo y las de resultado por movimiento", () => {
    expect(baseCalculoPorDefecto("13")).toBe("saldo");
    expect(baseCalculoPorDefecto("22")).toBe("saldo");
    expect(baseCalculoPorDefecto("3105")).toBe("saldo");
    expect(baseCalculoPorDefecto("41")).toBe("movimiento");
    expect(baseCalculoPorDefecto("5105")).toBe("movimiento");
    expect(baseCalculoPorDefecto("7205")).toBe("movimiento");
    expect(baseCalculoPorDefecto("")).toBe("saldo");
  });

  it("reconoce las bases de cálculo válidas", () => {
    expect(esBaseCalculo("saldo")).toBe(true);
    expect(esBaseCalculo("movimiento")).toBe(true);
    expect(esBaseCalculo("promedio")).toBe(false);
    expect(esBaseCalculo(null)).toBe(false);
  });

  it("normaliza prefijos con espacios y puntos de miles", () => {
    expect(normalizarPrefijo(" 41 ")).toBe("41");
    expect(normalizarPrefijo("13.30")).toBe("1330");
    expect(normalizarPrefijo(null)).toBe("");
    expect(normalizarPrefijo(undefined)).toBe("");
  });

  it("ordena los módulos como los listó Russell y manda los desconocidos al final", () => {
    expect(ordenModulo("ING")).toBe(0);
    expect(ordenModulo("NOM")).toBe(5);
    expect(ordenModulo("XXX")).toBe(999);
  });

  it("el fixture de fábrica usa id 0 y resuelve el nombre del módulo", () => {
    const fabrica = catalogoPrevalidadorDeFabrica();
    expect(fabrica).toHaveLength(11);
    expect(fabrica.every((f) => f.id === 0 && f.activa)).toBe(true);
    expect(fabrica.find((f) => f.cuentaRussell === "15")?.moduloNombre).toBe("Activos fijos");
  });
});
