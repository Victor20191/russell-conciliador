import { describe, expect, it } from "vitest";
import {
  baseCalculoPorDefecto,
  catalogoPrevalidadorDeFabrica,
  esBaseCalculo,
  mapearCatalogoPrevalidador,
  normalizarPrefijo,
  ordenModulo,
  PREVALIDADOR_CATALOGO_FABRICA,
  PREVALIDADOR_MODULOS_ORDEN,
} from "./catalogo";

describe("catálogo de fábrica del prevalidador", () => {
  it("trae las 11 filas que definió Russell más la 7305 de Nómina, sin duplicados", () => {
    expect(PREVALIDADOR_CATALOGO_FABRICA).toHaveLength(12);
    const claves = PREVALIDADOR_CATALOGO_FABRICA.map((f) => `${f.moduloCodigo}|${f.cuentaRussell}`);
    expect(new Set(claves).size).toBe(12);
    expect(claves).toContain("NOM|7305");
  });

  it("solo usa módulos conocidos y cubre los seis del ERP", () => {
    const usados = new Set(PREVALIDADOR_CATALOGO_FABRICA.map((f) => f.moduloCodigo));
    for (const codigo of usados) expect(PREVALIDADOR_MODULOS_ORDEN).toContain(codigo);
    expect([...usados].sort()).toEqual(["AFI", "CAR", "CXP", "ING", "INV", "NOM"]);
  });

  it("todas las filas de fábrica van por saldo final, también Ingresos y Nómina (28/Sep/2026)", () => {
    for (const f of PREVALIDADOR_CATALOGO_FABRICA) {
      expect(f.baseCalculo, `fila ${f.moduloCodigo} ${f.cuentaRussell}`).toBe("saldo");
      expect(f.baseCalculo).toBe(baseCalculoPorDefecto(f.cuentaRussell));
    }
  });

  it("una fila nueva nace en saldo final sin importar la clase", () => {
    for (const codigo of ["13", "22", "3105", "41", "5105", "7205", "7305", ""]) {
      expect(baseCalculoPorDefecto(codigo), codigo).toBe("saldo");
    }
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

  it("mapea las filas crudas de la consulta (vigente o congelada) con las mismas reglas", () => {
    const cruda = {
      id: 4,
      cuentaRussell: " 51.05 ",
      etiqueta: null,
      baseCalculo: "movimiento",
      orden: 50,
      activa: true,
      module: { code: "NOM", name: "Nómina" },
    };
    expect(mapearCatalogoPrevalidador([cruda])).toEqual([{
      id: 4,
      moduloCodigo: "NOM",
      moduloNombre: "Nómina",
      moduloOrden: 5,
      cuentaRussell: "5105",
      etiqueta: null,
      baseCalculo: "movimiento",
      orden: 50,
      activa: true,
    }]);
    expect(() => mapearCatalogoPrevalidador([{ ...cruda, baseCalculo: "promedio" }])).toThrow(/base de cálculo inválida/);
    expect(() => mapearCatalogoPrevalidador([{ ...cruda, module: { code: "DIAN", name: "DIAN" } }])).toThrow(/alcance aprobado/);
    expect(() => mapearCatalogoPrevalidador([{ ...cruda, cuentaRussell: "510" }])).toThrow(/nivel 2 o 4/);
  });

  it("el fixture de fábrica usa id 0 y resuelve el nombre del módulo", () => {
    const fabrica = catalogoPrevalidadorDeFabrica();
    expect(fabrica).toHaveLength(12);
    expect(fabrica.every((f) => f.id === 0 && f.activa)).toBe(true);
    expect(fabrica.find((f) => f.cuentaRussell === "15")?.moduloNombre).toBe("Activos fijos");
  });
});
