import { describe, it, expect } from "vitest";
import {
  bloqueoAnexoPorVerificacionesCriticasModulo,
  bloqueoCrucePorVerificacionesCriticasModulo,
  bloqueoVerificacionesCriticasModulo,
  MODULOS_IMPORT,
  descriptorModulo,
  modulosSoportados,
} from "./descriptores";

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

  it("solo habilita el cruce por tercero en auxiliares funcionalmente validados", () => {
    expect(MODULOS_IMPORT.CAR.crucePorTercero).toBe(true);
    expect(MODULOS_IMPORT.CXP.crucePorTercero).toBe(true);
    expect(MODULOS_IMPORT.ING.crucePorTercero).not.toBe(true);
  });

  it("ING exige ingreso neto y no sugiere automáticamente el total de factura", () => {
    const valor = MODULOS_IMPORT.ING.columnas.find((columna) => columna.nombre === "valor");
    expect(valor?.etiqueta).toBe("Ingreso neto sin impuestos");
    expect(valor?.sinonimos).toEqual(expect.arrayContaining(["subtotal", "base gravable", "venta neta", "valor sin iva"]));
    expect(valor?.sinonimos).not.toContain("total");
    expect(MODULOS_IMPORT.ING.verificaciones?.some((item) => item.id === "ing_sin_impuestos")).toBe(true);
  });

  it("ING solo se puede promover cuando confirma que el valor es neto de impuestos", () => {
    expect(bloqueoVerificacionesCriticasModulo(MODULOS_IMPORT.ING, {
      ing_sin_impuestos: { respuesta: "si" },
    })).toBeNull();
    for (const respuesta of ["no", "na"] as const) {
      expect(bloqueoVerificacionesCriticasModulo(MODULOS_IMPORT.ING, {
        ing_sin_impuestos: { respuesta },
      })).toContain("debe responderse Sí");
    }
  });

  it("bloquea el cruce de un ING histórico que no acredita el valor neto sin impuestos", () => {
    expect(bloqueoCrucePorVerificacionesCriticasModulo(MODULOS_IMPORT.ING, {})).toContain(
      "cargue histórico",
    );
    expect(bloqueoCrucePorVerificacionesCriticasModulo(MODULOS_IMPORT.ING, {
      ing_sin_impuestos: { respuesta: "no" },
    })).toContain("vuelve a cargarlo");
    expect(bloqueoCrucePorVerificacionesCriticasModulo(MODULOS_IMPORT.ING, {
      ing_sin_impuestos: { respuesta: "si" },
    })).toBeNull();
    expect(bloqueoCrucePorVerificacionesCriticasModulo(MODULOS_IMPORT.INV, {})).toBeNull();
  });

  it("impide anexar filas a un ING vigente que no estaba certificado", () => {
    expect(bloqueoAnexoPorVerificacionesCriticasModulo(MODULOS_IMPORT.ING, {})).toContain(
      "recarga completa",
    );
    expect(bloqueoAnexoPorVerificacionesCriticasModulo(MODULOS_IMPORT.ING, {
      ing_sin_impuestos: { respuesta: "no" },
    })).toContain("no un anexo parcial");
    expect(bloqueoAnexoPorVerificacionesCriticasModulo(MODULOS_IMPORT.ING, {
      ing_sin_impuestos: { respuesta: "si" },
    })).toBeNull();
    expect(bloqueoAnexoPorVerificacionesCriticasModulo(MODULOS_IMPORT.CAR, {})).toBeNull();
  });
});
