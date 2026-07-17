import { describe, it, expect } from "vitest";
import { esTransformacionAceptable, debeEscalarExtraccion } from "./validacion";
import { CUADRE_NO_APLICA } from "./esquema";
import type { CuadreTotales, MappingSpec } from "./esquema";
import type { ResultadoTransform } from "./transformar";

const CUENTA = { code: "110505", name: "Caja", prevBalance: 0, balance: 0, debitos: 100, creditos: 100 };

function resultado(cuentas: number, cuadre: Partial<CuadreTotales>, filasDescuadre = 0): ResultadoTransform {
  return {
    importReady: Array.from({ length: cuentas }, () => ({ ...CUENTA })),
    filasCrudas: [],
    excepciones: [],
    resumen: { filasImportables: cuentas, filasDescuadre, convencionCredito: "magnitud" } as ResultadoTransform["resumen"],
    cabecera: {} as ResultadoTransform["cabecera"],
    cuadre: { ...CUADRE_NO_APLICA, ...cuadre },
  };
}

function spec(sobre: Partial<MappingSpec>): MappingSpec {
  return {
    hoja: "Balance",
    filaEncabezado: 1,
    primeraFilaDatos: 2,
    columnas: { codigo: 1, nombre: 2, saldoInicial: 3, debitos: 4, creditos: 5, saldoFinal: 6, saldoFinalDebito: 0, saldoFinalCredito: 0, tercero: 0 },
    signoCredito: "magnitud",
    reglaDetalle: { tipo: "prefijo", columna: null, valor: null },
    agregarPorTercero: false,
    nit: { valor: null, fuente: "NINGUNO" },
    periodoInicial: { valor: null, fuente: "NINGUNO" },
    periodoFinal: { valor: null, fuente: "NINGUNO" },
    estandar: "AUTO",
    importable: true,
    motivoNoImportable: null,
    excepciones: [],
    confianza: 0.9,
    notas: null,
    ...sobre,
  };
}

describe("esTransformacionAceptable", () => {
  it("sin cuentas de movimiento ⇒ inaceptable", () => {
    expect(esTransformacionAceptable(resultado(0, { partidaDobleCuadra: true }))).toBe(false);
  });

  it("con fila TOTALES detectada manda el cuadre contra el archivo", () => {
    expect(esTransformacionAceptable(resultado(5, { detectado: true, cuadra: true, partidaDobleCuadra: false }))).toBe(true);
    expect(esTransformacionAceptable(resultado(5, { detectado: true, cuadra: false, partidaDobleCuadra: true }))).toBe(false);
  });

  it("sin fila TOTALES basta la partida doble", () => {
    expect(esTransformacionAceptable(resultado(5, { detectado: false, partidaDobleCuadra: true }))).toBe(true);
    expect(esTransformacionAceptable(resultado(5, { detectado: false, partidaDobleCuadra: false }))).toBe(false);
  });

  it("más del 10% de filas en descuadre ⇒ inaceptable aunque cuadre", () => {
    // 8 importables + 2 en descuadre = 20% > 10% → mapeo sospechoso.
    expect(esTransformacionAceptable(resultado(8, { detectado: true, cuadra: true }, 2))).toBe(false);
    // 99 importables + 1 en descuadre = 1% → tolerable.
    expect(esTransformacionAceptable(resultado(99, { detectado: true, cuadra: true }, 1))).toBe(true);
  });

  it("votación de orientación invertida ⇒ inaceptable aunque cuadre", () => {
    const res = resultado(20, { detectado: true, cuadra: true });
    res.orientacionControl = { directa: 0, invertida: 15, ambiguas: 5 };
    expect(esTransformacionAceptable(res)).toBe(false);
    res.orientacionControl = { directa: 15, invertida: 0, ambiguas: 5 };
    expect(esTransformacionAceptable(res)).toBe(true);
  });

  it("naturaleza PUC violada en masa (firmado) ⇒ inaceptable", () => {
    const res = resultado(0, { detectado: true, cuadra: true });
    // 12 hojas de activo con saldo NEGATIVO (naturaleza al revés) — firmado.
    res.importReady = Array.from({ length: 12 }, (_, i) => ({ code: `11050${i}`, name: "x", prevBalance: 0, balance: -100 }));
    res.resumen = { filasImportables: 12, filasDescuadre: 0, convencionCredito: "firmado" } as ResultadoTransform["resumen"];
    expect(esTransformacionAceptable(res)).toBe(false);
    // En magnitud la señal no aplica: el mismo resultado es aceptable.
    res.resumen = { filasImportables: 12, filasDescuadre: 0, convencionCredito: "magnitud" } as ResultadoTransform["resumen"];
    expect(esTransformacionAceptable(res)).toBe(true);
  });
});

describe("debeEscalarExtraccion", () => {
  const ok = resultado(5, { detectado: true, cuadra: true });

  it("spec null (parse falló) ⇒ escalar", () => {
    expect(debeEscalarExtraccion(null, ok, 0.75)).toBe(true);
  });

  it("no importable ⇒ escalar", () => {
    expect(debeEscalarExtraccion(spec({ importable: false }), ok, 0.75)).toBe(true);
  });

  it("confianza bajo el umbral ⇒ escalar", () => {
    expect(debeEscalarExtraccion(spec({ confianza: 0.6 }), ok, 0.75)).toBe(true);
    expect(debeEscalarExtraccion(spec({ confianza: 0.8 }), ok, 0.75)).toBe(false);
  });

  it("resultado inaceptable ⇒ escalar aunque la confianza sea alta", () => {
    expect(debeEscalarExtraccion(spec({ confianza: 0.99 }), resultado(0, {}), 0.75)).toBe(true);
    expect(debeEscalarExtraccion(spec({ confianza: 0.99 }), null, 0.75)).toBe(true);
  });
});
