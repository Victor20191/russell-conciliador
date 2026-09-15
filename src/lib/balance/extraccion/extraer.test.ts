import { describe, it, expect } from "vitest";
import { bloqueIndicacionesTerceros, forzarContextoTercerosEnSpec, type ContextoUsuarioTerceros } from "./extraer";
import type { MappingSpec } from "./esquema";

function spec(over: Partial<MappingSpec> = {}): MappingSpec {
  return {
    hoja: "Balance",
    filaEncabezado: 1,
    primeraFilaDatos: 2,
    columnas: { codigo: 1, codigoFragmentos: [], nombre: 2, saldoInicial: 3, debitos: 4, creditos: 5, saldoFinal: 6, saldoFinalDebito: 0, saldoFinalCredito: 0, tercero: 7 },
    signoCredito: "firmado",
    reglaDetalle: { tipo: "prefijo", columna: null, valor: null },
    agregarPorTercero: false,
    prefijoDocumentoTercero: null,
    subtotalesTercero: "auto",
    nit: { valor: null, fuente: "NINGUNO" },
    periodoInicial: { valor: null, fuente: "NINGUNO" },
    periodoFinal: { valor: null, fuente: "NINGUNO" },
    estandar: "AUTO",
    importable: true,
    motivoNoImportable: null,
    excepciones: [],
    confianza: 0.9,
    notas: null,
    ...over,
  };
}

describe("bloqueIndicacionesTerceros", () => {
  it("sin contexto no arma bloque", () => {
    expect(bloqueIndicacionesTerceros(undefined)).toBeNull();
  });

  it("sin nada declarado dentro del contexto tampoco arma bloque", () => {
    expect(bloqueIndicacionesTerceros({})).toBeNull();
  });

  it("incluye las indicaciones libres, el prefijo y el modo de subtotales en el mensaje", () => {
    const ctx: ContextoUsuarioTerceros = {
      indicaciones: "El documento a veces viene sin ceros a la izquierda.",
      prefijoDocumento: "C",
      subtotales: "total_mas_detalle",
    };
    const bloque = bloqueIndicacionesTerceros(ctx);
    expect(bloque).not.toBeNull();
    expect(bloque).toContain("INDICACIONES DEL USUARIO SOBRE TERCEROS");
    expect(bloque).toContain("El documento a veces viene sin ceros a la izquierda.");
    expect(bloque).toContain('prefijo de letras "C"');
    expect(bloque).toContain("renglón de TOTAL");
  });

  it("subtotales=tercero_totalizado arma su propia frase", () => {
    const bloque = bloqueIndicacionesTerceros({ subtotales: "tercero_totalizado" });
    expect(bloque).toContain("UN solo renglón");
  });
});

describe("forzarContextoTercerosEnSpec", () => {
  it("sin contexto neutraliza prefijo/subtotales a los valores por defecto (nunca confía en lo que adivinó la IA)", () => {
    const specIA = spec({ prefijoDocumentoTercero: "X", subtotalesTercero: "total_mas_detalle" });
    const forzado = forzarContextoTercerosEnSpec(specIA, undefined);
    expect(forzado.prefijoDocumentoTercero).toBeNull();
    expect(forzado.subtotalesTercero).toBe("auto");
    // Las columnas de identidad no declaradas por el usuario no se tocan.
    expect(forzado.columnas.tercero).toBe(specIA.columnas.tercero);
  });

  it("con contexto explícito, fuerza columnas, prefijo y subtotales sobre lo que trajo la IA", () => {
    const specIA = spec({ prefijoDocumentoTercero: null, subtotalesTercero: "auto", columnas: { ...spec().columnas, tercero: 3 } });
    const ctx: ContextoUsuarioTerceros = {
      colDocumento: 9,
      colNombre: 10,
      prefijoDocumento: "C",
      subtotales: "total_mas_detalle",
    };
    const forzado = forzarContextoTercerosEnSpec(specIA, ctx);
    expect(forzado.columnas.tercero).toBe(9);
    expect(forzado.columnas.nombreTercero).toBe(10);
    expect(forzado.prefijoDocumentoTercero).toBe("C");
    expect(forzado.subtotalesTercero).toBe("total_mas_detalle");
  });
});
