import { describe, it, expect } from "vitest";
import { veredictoOrientacion, invertirColumnasMovimiento, fraccionNaturalezaPUC, UMBRAL_NATURALEZA_PUC } from "./verificacion";
import { transformarTabular, type ParamsExtraccion } from "./transformar";
import { esTransformacionAceptable } from "./validacion";
import type { MappingSpec } from "./esquema";
import type { GridHoja } from "./ingesta";
import type { CuentaCruda } from "@/lib/balance/calcular";

describe("veredictoOrientacion", () => {
  it("invertida con mayoría clara (≥80% de ≥5 votos)", () => {
    expect(veredictoOrientacion({ directa: 1, invertida: 9, ambiguas: 3 })).toBe("invertida");
  });

  it("directa con mayoría clara", () => {
    expect(veredictoOrientacion({ directa: 20, invertida: 0, ambiguas: 5 })).toBe("directa");
  });

  it("indeterminada con pocos votantes (las ambiguas no votan)", () => {
    expect(veredictoOrientacion({ directa: 1, invertida: 3, ambiguas: 100 })).toBe("indeterminada");
    expect(veredictoOrientacion(undefined)).toBe("indeterminada");
  });

  it("indeterminada con votación dividida", () => {
    expect(veredictoOrientacion({ directa: 5, invertida: 5, ambiguas: 0 })).toBe("indeterminada");
  });
});

describe("invertirColumnasMovimiento", () => {
  it("intercambia solo débitos↔créditos en el spec", () => {
    const spec = { columnas: { codigo: 1, nombre: 2, saldoInicial: 3, debitos: 4, creditos: 5, saldoFinal: 6, saldoFinalDebito: 0, saldoFinalCredito: 0, tercero: 0 } } as MappingSpec;
    const swap = invertirColumnasMovimiento(spec);
    expect(swap.columnas.debitos).toBe(5);
    expect(swap.columnas.creditos).toBe(4);
    expect(swap.columnas.saldoFinal).toBe(6);
    expect(spec.columnas.debitos).toBe(4); // el original no se muta
  });
});

describe("fraccionNaturalezaPUC", () => {
  const cuenta = (code: string, balance: number): CuentaCruda => ({ code, name: code, prevBalance: 0, balance });

  it("null con convención magnitud (la señal no existe)", () => {
    const hojas = Array.from({ length: 20 }, (_, i) => cuenta(`11050${i}`, 100));
    expect(fraccionNaturalezaPUC(hojas, "magnitud")).toBeNull();
  });

  it("null con muestra insuficiente (<10 hojas con saldo)", () => {
    expect(fraccionNaturalezaPUC([cuenta("110505", 100)], "firmado")).toBeNull();
  });

  it("1.0 cuando todas respetan su naturaleza", () => {
    const hojas = [
      ...Array.from({ length: 6 }, (_, i) => cuenta(`11050${i}`, 100)), // activo +
      ...Array.from({ length: 6 }, (_, i) => cuenta(`21050${i}`, -100)), // pasivo −
    ];
    expect(fraccionNaturalezaPUC(hojas, "firmado")).toBe(1);
  });

  it("baja del umbral cuando los signos van al revés (saldo mal mapeado)", () => {
    const hojas = [
      ...Array.from({ length: 6 }, (_, i) => cuenta(`11050${i}`, -100)), // activo − (mal)
      ...Array.from({ length: 6 }, (_, i) => cuenta(`21050${i}`, 100)), // pasivo + (mal)
    ];
    const fr = fraccionNaturalezaPUC(hojas, "firmado");
    expect(fr).not.toBeNull();
    expect(fr!).toBeLessThan(UMBRAL_NATURALEZA_PUC);
  });

  it("los saldos en cero no cuentan en la muestra", () => {
    const hojas = Array.from({ length: 20 }, (_, i) => cuenta(`11050${i}`, 0));
    expect(fraccionNaturalezaPUC(hojas, "firmado")).toBeNull();
  });
});

// Integración: un archivo con débitos↔créditos intercambiados por el spec debe
// votar «invertida», ser rechazado por esTransformacionAceptable, y cuadrar de
// nuevo al re-transformar con el spec swapeado.
describe("detección de columnas invertidas (integración transformarTabular)", () => {
  const params: ParamsExtraccion = { nit: null, periodoInicial: null, periodoFinal: null, estandar: "NIF" };
  const specBase: MappingSpec = {
    hoja: "B",
    filaEncabezado: 1,
    primeraFilaDatos: 2,
    columnas: { codigo: 1, codigoFragmentos: [], nombre: 2, saldoInicial: 3, debitos: 4, creditos: 5, saldoFinal: 6, saldoFinalDebito: 0, saldoFinalCredito: 0, tercero: 0 },
    signoCredito: "magnitud",
    reglaDetalle: { tipo: "prefijo", columna: null, valor: null },
    agregarPorTercero: false,
    nit: { valor: null, fuente: "NINGUNO" },
    periodoInicial: { valor: null, fuente: "NINGUNO" },
    periodoFinal: { valor: null, fuente: "NINGUNO" },
    estandar: "NIF",
    importable: true,
    motivoNoImportable: null,
    excepciones: [],
    confianza: 0.9,
    notas: null,
  };
  // Filas coherentes: saldo = si + db − cr (movimientos asimétricos para que
  // voten) y partida doble cuadrada (Σdéb = Σcré = 1670).
  const filas = [
    ["CUENTA", "NOMBRE", "SALDO INI", "DEBITOS", "CREDITOS", "SALDO"],
    ["110505", "CAJA", 1000, 500, 200, 1300],
    ["110510", "BANCOS", 2000, 300, 100, 2200],
    ["130505", "CLIENTES", 500, 700, 100, 1100],
    ["220505", "PROVEEDORES", 800, 100, 400, 500],
    ["230505", "CUENTAS POR PAGAR", 300, 50, 250, 100],
    ["240505", "IMPUESTOS", 400, 20, 620, -200],
  ];
  const hojas: GridHoja[] = [{ nombre: "B", filas }];

  it("con el spec correcto vota directa y es aceptable", () => {
    const res = transformarTabular(specBase, hojas, params);
    expect(veredictoOrientacion(res.orientacionControl)).toBe("directa");
    expect(esTransformacionAceptable(res)).toBe(true);
  });

  it("con débitos↔créditos intercambiados vota invertida y NO es aceptable; el swap lo corrige", () => {
    const specMalo = invertirColumnasMovimiento(specBase); // simula el error de la IA
    const resMalo = transformarTabular(specMalo, hojas, params);
    expect(veredictoOrientacion(resMalo.orientacionControl)).toBe("invertida");
    expect(esTransformacionAceptable(resMalo)).toBe(false);

    const resCorregido = transformarTabular(invertirColumnasMovimiento(specMalo), hojas, params);
    expect(veredictoOrientacion(resCorregido.orientacionControl)).toBe("directa");
    expect(esTransformacionAceptable(resCorregido)).toBe(true);
  });
});
