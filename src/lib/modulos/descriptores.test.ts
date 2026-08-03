import { describe, it, expect } from "vitest";
import { MODULOS_IMPORT, descriptorModulo, modulosSoportados } from "./descriptores";

describe("descriptores de módulos", () => {
  it("registra los 6 módulos de conciliación", () => {
    expect(modulosSoportados().sort()).toEqual(["AFI", "CAR", "CXP", "ING", "INV", "NOM"]);
  });

  for (const [codigo, d] of Object.entries(MODULOS_IMPORT)) {
    describe(`${codigo} · ${d.label}`, () => {
      const nombres = d.columnas.map((c) => c.nombre);

      it("el código del descriptor coincide con su clave", () => {
        expect(d.codigo).toBe(codigo);
        expect(descriptorModulo(codigo)).toBe(d);
      });

      it("clasificador y valor apuntan a columnas existentes", () => {
        expect(nombres).toContain(d.clasificador);
        expect(nombres).toContain(d.valor);
      });

      it("la columna del valor es numérica (moneda/numero)", () => {
        const col = d.columnas.find((c) => c.nombre === d.valor)!;
        expect(["moneda", "numero"]).toContain(col.tipo);
      });

      it("tiene al menos una columna requerida y nombres únicos", () => {
        expect(d.columnas.some((c) => c.requerido)).toBe(true);
        expect(new Set(nombres).size).toBe(nombres.length);
      });

      it("noNegativos y derivar referencian columnas válidas", () => {
        for (const c of d.noNegativos ?? []) expect(nombres).toContain(c);
        for (const [destino, regla] of Object.entries(d.derivar ?? {})) {
          expect(nombres).toContain(destino);
          const factores = "producto" in regla ? regla.producto : regla.cociente;
          for (const f of factores) expect(nombres).toContain(f);
        }
      });

      it("las verificaciones tienen id único y texto", () => {
        const ids = (d.verificaciones ?? []).map((v) => v.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const v of d.verificaciones ?? []) expect(v.texto.length).toBeGreaterThan(5);
      });
    });
  }
});
