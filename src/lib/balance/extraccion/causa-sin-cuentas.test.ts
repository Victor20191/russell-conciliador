import { describe, expect, it } from "vitest";
import {
  ACCION_RESPALDO_NO_IMPORTABLE,
  REGLA_ARCHIVO_NO_IMPORTABLE,
  REGLA_HOJA_NO_ENCONTRADA,
  causaSinCuentas,
  columnasFaltantesDelMapa,
  esExcepcionDeRechazo,
  excepcionesSinRechazo,
} from "./causa-sin-cuentas";
import type { Excepcion, ExtraccionDirecta, MappingSpec } from "./esquema";
import type { GridHoja } from "./ingesta";
import { transformarTabular, validarDirecta, type ParamsExtraccion } from "./transformar";

const PARAMS: ParamsExtraccion = { nit: null, periodoInicial: null, periodoFinal: null, estandar: "AUTO" };

// Motivos reales de los modelos para un «Libro Inventario y Balance» que solo trae
// la columna Saldo final (sin nombres de cliente).
const MOTIVO_OPUS =
  "El archivo es un Libro Inventario y Balance que solo trae la columna 'Saldo Final'; no contiene saldo inicial, débitos ni créditos, por lo que no es un balance de comprobación completo ni permite validar el cuadre contra totales.";
const MOTIVO_SONNET =
  "El archivo (Libro Inventario y Balance) solo trae una columna de saldo final; no incluye saldo inicial, débitos ni créditos, por lo que no se puede validar el cuadre del balance de prueba. Además faltan NIT del cliente y período explícito completo (solo 'Septiembre', año gravable 2026).";

// Mapa de columnas que devolvieron AMBOS modelos para ese archivo.
const COLUMNAS_LIBRO = {
  codigo: 2,
  codigoFragmentos: [],
  nombre: 5,
  saldoInicial: 0,
  debitos: 0,
  creditos: 0,
  saldoFinal: 12,
  saldoFinalDebito: 0,
  saldoFinalCredito: 0,
  tercero: 4,
  nombreTercero: 8,
};

function spec(sobre: Partial<MappingSpec> = {}): MappingSpec {
  return {
    hoja: "Sheet1",
    filaEncabezado: 5,
    primeraFilaDatos: 6,
    columnas: COLUMNAS_LIBRO,
    signoCredito: "firmado",
    reglaDetalle: { tipo: "prefijo", columna: null, valor: null },
    agregarPorTercero: false,
    prefijoDocumentoTercero: null,
    subtotalesTercero: "auto",
    nit: { valor: null, fuente: "NINGUNO" },
    periodoInicial: { valor: null, fuente: "NINGUNO" },
    periodoFinal: { valor: null, fuente: "NINGUNO" },
    estandar: "AUTO",
    importable: false,
    motivoNoImportable: MOTIVO_OPUS,
    excepciones: [],
    confianza: 0.6,
    notas: null,
    ...sobre,
  };
}

const HOJA: GridHoja = {
  nombre: "Sheet1",
  filas: [
    [], [], [], [],
    ["", "Cuenta", "", "Tercero", "Nombre", "", "", "Nombre tercero", "", "", "", "Saldo final"],
    ["", "11", "", "", "ACTIVO CORRIENTE", "", "", "", "", "", "", 1000],
  ],
};

function directa(sobre: Partial<ExtraccionDirecta> = {}): ExtraccionDirecta {
  return {
    nit: { valor: null, fuente: "NINGUNO" },
    periodoInicial: { valor: null, fuente: "NINGUNO" },
    periodoFinal: { valor: null, fuente: "NINGUNO" },
    estandar: "AUTO",
    agregarPorTercero: false,
    filas: [],
    importable: false,
    motivoNoImportable: MOTIVO_OPUS,
    excepciones: [],
    notas: null,
    ...sobre,
  };
}

const excepcion = (sobre: Partial<Excepcion>): Excepcion => ({
  hoja: "Sheet1", fila: null, campo: null, valor: null, regla: "Regla", accion: "Acción", ...sobre,
});

describe("causaSinCuentas · rechazo del modelo", () => {
  it("archivo real (Opus): dice qué columnas faltan y conserva el motivo del modelo", () => {
    const res = transformarTabular(spec(), [HOJA], PARAMS);
    expect(res.importReady).toHaveLength(0);

    const causa = causaSinCuentas(res, spec());
    expect(causa.mensaje).toBe("No se cargó el archivo: le faltan las columnas Saldo inicial, Débitos y Créditos.");
    expect(causa.rechazo).toEqual({
      motivo: MOTIVO_OPUS,
      columnasFaltantes: ["Saldo inicial", "Débitos", "Créditos"],
    });
  });

  it("Sonnet con ruido en el motivo: la causa principal no depende del texto del modelo", () => {
    const s = spec({ motivoNoImportable: MOTIVO_SONNET, confianza: 0.55 });
    const causa = causaSinCuentas(transformarTabular(s, [HOJA], PARAMS), s);

    expect(causa.mensaje).toBe("No se cargó el archivo: le faltan las columnas Saldo inicial, Débitos y Créditos.");
    expect(causa.mensaje).not.toMatch(/NIT|período/i);
    // El ruido queda solo como detalle de la lectura.
    expect(causa.rechazo?.motivo).toBe(MOTIVO_SONNET);
  });

  it("PDF sin spec: sin columnas que revisar, el mensaje es el motivo del modelo", () => {
    const res = validarDirecta(directa({ motivoNoImportable: "El PDF es un libro diario de partidas." }), PARAMS);
    expect(res.importReady).toHaveLength(0);

    const causa = causaSinCuentas(res, null);
    expect(causa.mensaje).toBe("No se cargó el archivo: El PDF es un libro diario de partidas.");
    expect(causa.rechazo).toEqual({ motivo: "El PDF es un libro diario de partidas.", columnasFaltantes: [] });
  });

  it("motivo nulo: no presenta el texto de respaldo como si fuera un motivo", () => {
    const res = validarDirecta(directa({ motivoNoImportable: null }), PARAMS);
    // El respaldo sigue en la tabla de excepciones, pero no es una causa.
    expect(res.excepciones.at(-1)?.accion).toBe(ACCION_RESPALDO_NO_IMPORTABLE);

    const causa = causaSinCuentas(res, null);
    expect(causa.mensaje).toBe("No se cargó el archivo: no se pudo tomar como balance de prueba.");
    expect(causa.mensaje).not.toContain(ACCION_RESPALDO_NO_IMPORTABLE);
    expect(causa.rechazo).toEqual({ motivo: null, columnasFaltantes: [] });
  });

  it("motivo nulo con mapa completo (tabular): mismo mensaje, sin columnas faltantes", () => {
    const completo = spec({
      motivoNoImportable: null,
      columnas: { ...COLUMNAS_LIBRO, saldoInicial: 3, debitos: 4, creditos: 5 },
    });
    const causa = causaSinCuentas(transformarTabular(completo, [HOJA], PARAMS), completo);
    expect(causa.mensaje).toBe("No se cargó el archivo: no se pudo tomar como balance de prueba.");
    expect(causa.rechazo).toEqual({ motivo: null, columnasFaltantes: [] });
  });

  it("motivo en blanco cuenta como motivo ausente", () => {
    const res = validarDirecta(directa({ motivoNoImportable: "   " }), PARAMS);
    expect(causaSinCuentas(res, null).rechazo?.motivo).toBeNull();
  });

  it("rechazo con mapa completo y motivo: el mensaje es el motivo", () => {
    const completo = spec({
      motivoNoImportable: "Solo trae movimientos del período.",
      columnas: { ...COLUMNAS_LIBRO, saldoInicial: 3, debitos: 4, creditos: 5 },
    });
    const causa = causaSinCuentas(transformarTabular(completo, [HOJA], PARAMS), completo);
    expect(causa.mensaje).toBe("No se cargó el archivo: Solo trae movimientos del período.");
  });

  it("la excepción del rechazo se identifica por la constante compartida con transformar.ts", () => {
    const res = transformarTabular(spec(), [HOJA], PARAMS);
    const final = res.excepciones.at(-1)!;
    expect(final.regla).toBe(REGLA_ARCHIVO_NO_IMPORTABLE);
    expect(esExcepcionDeRechazo(final)).toBe(true);
  });

  it("una excepción del modelo con esa misma regla pero atada a una fila no es el rechazo", () => {
    expect(esExcepcionDeRechazo(excepcion({ fila: 7, regla: REGLA_ARCHIVO_NO_IMPORTABLE }))).toBe(false);
  });
});

describe("causaSinCuentas · 0 cuentas sin rechazo", () => {
  it("hoja no encontrada: conserva la frase y añade regla y acción", () => {
    const s = spec({ importable: true, motivoNoImportable: null });
    const res = transformarTabular(s, [], PARAMS);
    expect(res.excepciones.at(-1)?.regla).toBe(REGLA_HOJA_NO_ENCONTRADA);

    const causa = causaSinCuentas(res, s);
    expect(causa.mensaje).toBe(
      "No se leyó ninguna cuenta del archivo. Causa: Hoja no encontrada. Revisar el nombre de la hoja.",
    );
    expect(causa.rechazo).toBeNull();
  });

  it("sin excepción de archivo: deja «Revisa las excepciones.»", () => {
    const causa = causaSinCuentas({ excepciones: [] }, spec({ importable: true }));
    expect(causa.mensaje).toBe("No se leyó ninguna cuenta del archivo. Revisa las excepciones.");
    expect(causa.rechazo).toBeNull();
  });

  it("una excepción informativa de archivo no se presenta como la causa", () => {
    const informativa = excepcion({
      campo: "detalle por tercero",
      regla: "Las filas de tercero repiten el saldo de la cuenta; se mapea tercero para colapsar el desglose",
      accion: "Revisar que la fila consolidada de cada cuenta se use y el desglose se omita",
    });
    const porFila = excepcion({ fila: 12, regla: REGLA_HOJA_NO_ENCONTRADA });
    const causa = causaSinCuentas({ excepciones: [informativa, porFila] }, null);
    expect(causa.mensaje).toBe("No se leyó ninguna cuenta del archivo. Revisa las excepciones.");
  });
});

describe("columnasFaltantesDelMapa", () => {
  const completo = { saldoInicial: 3, debitos: 4, creditos: 5, saldoFinal: 6, saldoFinalDebito: 0, saldoFinalCredito: 0 };

  it("mapa completo: nada falta", () => {
    expect(columnasFaltantesDelMapa(completo)).toEqual([]);
  });

  it("sin mapa (PDF): nada que revisar", () => {
    expect(columnasFaltantesDelMapa(null)).toEqual([]);
    expect(columnasFaltantesDelMapa(undefined)).toEqual([]);
  });

  it("el saldo final partido en débito/crédito cuenta como saldo final", () => {
    expect(columnasFaltantesDelMapa({ ...completo, saldoFinal: 0, saldoFinalDebito: 6, saldoFinalCredito: 7 })).toEqual([]);
    expect(columnasFaltantesDelMapa({ ...completo, saldoFinal: 0, saldoFinalDebito: 6 })).toEqual([]);
  });

  it("saldo final, débito y crédito en 0 → falta «Saldo final»", () => {
    expect(columnasFaltantesDelMapa({ ...completo, saldoFinal: 0 })).toEqual(["Saldo final"]);
  });

  it("tolera mapas históricos sin algún campo", () => {
    expect(columnasFaltantesDelMapa({ saldoInicial: 3, debitos: 4, creditos: 5, saldoFinal: 6 })).toEqual([]);
  });

  it("redacta en singular y plural", () => {
    const una = causaSinCuentas(
      { excepciones: [excepcion({ regla: REGLA_ARCHIVO_NO_IMPORTABLE, accion: "x" })] },
      { columnas: { ...completo, debitos: 0 } },
    );
    expect(una.mensaje).toBe("No se cargó el archivo: le falta la columna Débitos.");

    const dos = causaSinCuentas(
      { excepciones: [excepcion({ regla: REGLA_ARCHIVO_NO_IMPORTABLE, accion: "x" })] },
      { columnas: { ...completo, debitos: 0, creditos: 0 } },
    );
    expect(dos.mensaje).toBe("No se cargó el archivo: le faltan las columnas Débitos y Créditos.");

    const todas = causaSinCuentas(
      { excepciones: [excepcion({ regla: REGLA_ARCHIVO_NO_IMPORTABLE, accion: "x" })] },
      { columnas: { saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 0, saldoFinalDebito: 0, saldoFinalCredito: 0 } },
    );
    expect(todas.mensaje).toBe(
      "No se cargó el archivo: le faltan las columnas Saldo inicial, Débitos, Créditos y Saldo final.",
    );
  });
});

describe("excepcionesSinRechazo", () => {
  it("quita solo la excepción del rechazo y conserva el resto en su orden", () => {
    const otras = [excepcion({ fila: 3, regla: "A" }), excepcion({ fila: null, campo: "nit", regla: "B" })];
    const res = transformarTabular(spec({ excepciones: otras }), [HOJA], PARAMS);
    expect(excepcionesSinRechazo(res.excepciones)).toEqual(otras);
  });
});
