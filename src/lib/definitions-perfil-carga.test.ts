import { describe, expect, it } from "vitest";
import { EditarPerfilCargaSchema } from "./definitions";
import type { SpecCarga } from "./balance/extraccion/esquema";

const BASE: SpecCarga = {
  hoja: "Balance",
  filaEncabezado: 3,
  primeraFilaDatos: 4,
  columnas: {
    codigo: 1,
    codigoFragmentos: [],
    nombre: 2,
    saldoInicial: 3,
    debitos: 4,
    creditos: 5,
    saldoFinal: 6,
    saldoFinalDebito: 0,
    saldoFinalCredito: 0,
    tercero: 0,
  },
  signoCredito: "magnitud",
  reglaDetalle: { tipo: "prefijo", columna: null, valor: null },
  agregarPorTercero: false,
};

const entrada = (estructura: SpecCarga) => ({
  id: 7,
  actualizadoEn: "2026-07-29T15:00:00.000Z",
  estructura,
});

describe("EditarPerfilCargaSchema", () => {
  it("acepta un mapa completo con código en una columna", () => {
    expect(EditarPerfilCargaSchema.safeParse(entrada(BASE)).success).toBe(true);
  });

  it("acepta códigos fragmentados en orden y la regla de solo movimientos", () => {
    const estructura: SpecCarga = {
      ...BASE,
      columnas: { ...BASE.columnas, codigo: 0, codigoFragmentos: [1, 2, 3, 4] },
      reglaDetalle: { tipo: "movimiento", columna: null, valor: null },
    };
    expect(EditarPerfilCargaSchema.safeParse(entrada(estructura)).success).toBe(true);
  });

  it("rechaza filas imposibles e índices de columna negativos", () => {
    const estructura: SpecCarga = {
      ...BASE,
      filaEncabezado: 0,
      primeraFilaDatos: 0,
      columnas: { ...BASE.columnas, debitos: -4 },
    };
    const resultado = EditarPerfilCargaSchema.safeParse(entrada(estructura));
    expect(resultado.success).toBe(false);
  });

  it("rechaza dos fuentes simultáneas o fragmentos repetidos para el código", () => {
    const dosFuentes: SpecCarga = {
      ...BASE,
      columnas: { ...BASE.columnas, codigo: 1, codigoFragmentos: [2, 3] },
    };
    const repetidos: SpecCarga = {
      ...BASE,
      columnas: { ...BASE.columnas, codigo: 0, codigoFragmentos: [1, 2, 2] },
    };
    expect(EditarPerfilCargaSchema.safeParse(entrada(dosFuentes)).success).toBe(false);
    expect(EditarPerfilCargaSchema.safeParse(entrada(repetidos)).success).toBe(false);
  });

  it("exige columna y valor cuando el detalle usa una marca del archivo", () => {
    const estructura: SpecCarga = {
      ...BASE,
      reglaDetalle: { tipo: "columna", columna: 0, valor: "" },
    };
    const resultado = EditarPerfilCargaSchema.safeParse(entrada(estructura));
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.message).toContain("columna");
    }
  });
});
