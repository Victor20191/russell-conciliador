import { describe, expect, it } from "vitest";
import {
  agregarContenidoArchivo,
  avisosContenido,
  clasificadorNotaCredito,
  contarSignos,
  detalleAuditoriaContenido,
  esContenidoArchivo,
  invertirNotasCredito,
  leerContenidoArchivos,
  leerContenidoDeLote,
  nombraNotaCredito,
  ofertaAnexo,
  type ContenidoArchivoCargue,
  type VigentePeriodoModulo,
} from "./contenido-archivo";

describe("signo de un archivo de solo notas crédito", () => {
  it("cuenta positivos y negativos sin vacíos ni ceros", () => {
    expect(contarSignos([100, -20, null, 0, undefined, 30, Number.NaN])).toEqual({ positivos: 2, negativos: 1, suma: 110 });
  });

  it("invierte cuando la mayoría viene en positivo y no cuando ya viene en negativo", () => {
    expect(invertirNotasCredito({ positivos: 120, negativos: 2, suma: 5_000 })).toBe(true);
    expect(invertirNotasCredito({ positivos: 2, negativos: 120, suma: -5_000 })).toBe(false);
  });

  it("en un empate decide la suma, y sin valores no invierte", () => {
    expect(invertirNotasCredito({ positivos: 1, negativos: 1, suma: 80 })).toBe(true);
    expect(invertirNotasCredito({ positivos: 1, negativos: 1, suma: -80 })).toBe(false);
    expect(invertirNotasCredito({ positivos: 0, negativos: 0, suma: 0 })).toBe(false);
  });
});

describe("renglón propio de las notas crédito", () => {
  it("antepone «Notas crédito» al concepto, o lo usa solo si la fila no trae concepto", () => {
    expect(clasificadorNotaCredito("Ventas nacionales")).toBe("Notas crédito · Ventas nacionales");
    expect(clasificadorNotaCredito("  Ventas   nacionales ")).toBe("Notas crédito · Ventas nacionales");
    expect(clasificadorNotaCredito(null)).toBe("Notas crédito");
    expect(clasificadorNotaCredito("   ")).toBe("Notas crédito");
  });

  it("es idempotente y respeta un concepto que ya nombra una nota crédito", () => {
    const una = clasificadorNotaCredito("Ventas");
    expect(clasificadorNotaCredito(una)).toBe(una);
    expect(clasificadorNotaCredito("Nota Crédito")).toBe("Nota Crédito");
    expect(clasificadorNotaCredito("NOTAS DE CREDITO VENTAS")).toBe("NOTAS DE CREDITO VENTAS");
    expect(clasificadorNotaCredito("NC ventas")).toBe("NC ventas");
    expect(nombraNotaCredito("Factura de Venta")).toBe(false);
    expect(nombraNotaCredito("Crédito comercial")).toBe(false);
  });
});

describe("lectores tolerantes", () => {
  it("valida el contenido declarado", () => {
    expect(esContenidoArchivo("notas_credito")).toBe(true);
    expect(esContenidoArchivo("devoluciones")).toBe(false);
    expect(esContenidoArchivo(null)).toBe(false);
  });

  it("lee lo que la lectura dejó en el spec del lote", () => {
    expect(leerContenidoDeLote({ signoContenido: { contenido: "notas_credito", invertido: true, positivos: 3, negativos: 1 } }))
      .toEqual({ contenido: "notas_credito", invertido: true, positivos: 3, negativos: 1 });
    expect(leerContenidoDeLote({ signoContenido: { contenido: "otra" } })).toBeNull();
    expect(leerContenidoDeLote({})).toBeNull();
    expect(leerContenidoDeLote(null)).toBeNull();
  });

  it("lee la lista por archivo del cargue; null = cargue anterior", () => {
    expect(leerContenidoArchivos(null)).toBeNull();
    expect(leerContenidoArchivos({})).toBeNull();
    expect(leerContenidoArchivos([])).toBeNull();
    expect(leerContenidoArchivos([
      { loteId: "a", archivo: "facturas.xlsx", contenido: "facturas", signoInvertido: false, filas: 10, total: 1_200 },
      { archivo: 5 },
      { loteId: null, archivo: "viejo.xlsx", contenido: "raro", filas: -1, total: "x", previo: true },
    ])).toEqual([
      { loteId: "a", archivo: "facturas.xlsx", contenido: "facturas", signoInvertido: false, filas: 10, total: 1_200 },
      { loteId: null, archivo: "viejo.xlsx", contenido: null, signoInvertido: false, filas: 0, total: 0, previo: true },
    ]);
  });
});

describe("lista por archivo del cargue", () => {
  const nuevo: ContenidoArchivoCargue = { loteId: "nc", archivo: "notas.xlsx", contenido: "notas_credito", signoInvertido: true, filas: 4, total: -80 };

  it("suma el archivo a la lista existente", () => {
    const actual: ContenidoArchivoCargue[] = [{ loteId: "f", archivo: "facturas.xlsx", contenido: "facturas", signoInvertido: false, filas: 10, total: 1_200 }];
    expect(agregarContenidoArchivo(actual, { loteId: "f", archivo: "facturas.xlsx", filas: 10, total: 1_200 }, nuevo)).toEqual([...actual, nuevo]);
  });

  it("sobre un cargue anterior, arranca con lo que ya tenía como entrada «previo»", () => {
    expect(agregarContenidoArchivo(null, { loteId: "v1", archivo: null, filas: 10, total: 1_200 }, nuevo)).toEqual([
      { loteId: "v1", archivo: "Archivos anteriores", contenido: null, signoInvertido: false, filas: 10, total: 1_200, previo: true },
      nuevo,
    ]);
  });
});

describe("oferta de agregar al cargue vigente", () => {
  const vigente: VigentePeriodoModulo = {
    encabezadoId: 7,
    version: 1,
    periodo: "2025-12",
    total: 1_200,
    filas: 10,
    congelado: false,
    enFirme: false,
    contenidos: ["facturas"],
  };

  it("ofrece agregar notas crédito a un cargue vigente", () => {
    expect(ofertaAnexo("notas_credito", vigente)).toEqual({ ofrecer: true, aviso: null });
  });

  it("no ofrece nada para facturas o un archivo mixto sobre un cargue de facturas", () => {
    expect(ofertaAnexo("facturas", vigente)).toEqual({ ofrecer: false, aviso: null });
    expect(ofertaAnexo("mixto", vigente)).toEqual({ ofrecer: false, aviso: null });
  });

  it("ofrece agregar facturas a un cargue que solo tiene notas crédito", () => {
    expect(ofertaAnexo("facturas", { ...vigente, contenidos: ["notas_credito"] }).ofrecer).toBe(true);
    // Un cargue anterior (sin lista) no dice qué tenía: no se ofrece.
    expect(ofertaAnexo("facturas", { ...vigente, contenidos: null }).ofrecer).toBe(false);
  });

  it("sin cargue vigente o sin respuesta no hay oferta", () => {
    expect(ofertaAnexo("notas_credito", null)).toEqual({ ofrecer: false, aviso: null });
    expect(ofertaAnexo(null, vigente)).toEqual({ ofrecer: false, aviso: null });
  });

  it("con el cargue congelado o la conciliación en firme no se ofrece y se explica", () => {
    const congelado = ofertaAnexo("notas_credito", { ...vigente, congelado: true });
    expect(congelado.ofrecer).toBe(false);
    expect(congelado.aviso).toMatch(/congelada/);
    const enFirme = ofertaAnexo("notas_credito", { ...vigente, enFirme: true });
    expect(enFirme.ofrecer).toBe(false);
    expect(enFirme.aviso).toMatch(/en firme/);
  });
});

describe("lo que cuenta el borrador y la bitácora", () => {
  it("notas crédito invertidas: lo informa y avisa las filas que quedaron sumando", () => {
    const avisos = avisosContenido({ contenido: "notas_credito", invertido: true, positivos: 40, negativos: 2 });
    expect(avisos.map((a) => a.tono)).toEqual(["info", "aviso"]);
    expect(avisos[0].texto).toMatch(/se cambiaron a negativo/);
    expect(avisos[1].texto).toMatch(/2 filas venían en negativo/);
  });

  it("notas crédito ya negativas: se dejan igual", () => {
    const avisos = avisosContenido({ contenido: "notas_credito", invertido: false, positivos: 0, negativos: 12 });
    expect(avisos).toHaveLength(1);
    expect(avisos[0].texto).toMatch(/ya venían en negativo/);
  });

  it("solo facturas con la mayoría en negativo: pregunta si no eran notas crédito", () => {
    expect(avisosContenido({ contenido: "facturas", invertido: false, positivos: 1, negativos: 9 })[0].tono).toBe("aviso");
    expect(avisosContenido({ contenido: "facturas", invertido: false, positivos: 9, negativos: 1 })).toEqual([]);
    expect(avisosContenido({ contenido: "mixto", invertido: false, positivos: 1, negativos: 9 })).toEqual([]);
  });

  it("detalle de auditoría", () => {
    expect(detalleAuditoriaContenido(null)).toBe("");
    expect(detalleAuditoriaContenido({ contenido: "facturas", invertido: false, positivos: 3, negativos: 0 })).toBe(" · contenido: Facturas");
    expect(detalleAuditoriaContenido({ contenido: "notas_credito", invertido: true, positivos: 3, negativos: 1 }))
      .toBe(" · contenido: Notas crédito (signo invertido: 3 valores en positivo, 1 en negativo)");
  });
});
