import { describe, expect, it } from "vitest";
import type { FilaBorrador } from "./borrador";
import type { ValidacionContable } from "./calcular";
import {
  evaluarCuadreBorrador,
  leerResumenCuadre,
  MAX_AGRUPADORAS_RESUMEN,
  resumenCuadreDeFilas,
  resumirCuadreBorrador,
  VERSION_RESUMEN_CUADRE,
  veredictoBorradorLista,
  type ResumenCuadreBorrador,
} from "./cuadre-borrador";
import { UMBRALES_ALERTAS_DEFECTO, type UmbralesAlertas } from "./umbrales-alertas";

const U = UMBRALES_ALERTAS_DEFECTO; // cuadre_contable $1.000 · descuadre $2.000
const conUmbrales = (cambios: Partial<UmbralesAlertas>): UmbralesAlertas => ({ ...U, ...cambios });

function fila(
  filaNum: number,
  codigo: string,
  saldoFinal: number,
  tipoFila: FilaBorrador["tipoFila"] = "agrupadora",
  extra: Partial<FilaBorrador> = {},
): FilaBorrador {
  return {
    filaNum,
    codigo,
    codigoCrudo: codigo,
    nombre: `Cuenta ${codigo}`,
    nivel: codigo.length,
    tipoFila,
    saldoInicial: saldoFinal,
    debitos: 0,
    creditos: 0,
    saldoFinal,
    ...extra,
  };
}

/** Balance que cuadra en todo: A 1.000 = P 600 + Pat 400, con su estructura completa. */
function balanceCuadrado(): FilaBorrador[] {
  return [
    fila(1, "1", 1_000),
    fila(2, "1105", 1_000),
    fila(3, "110505", 1_000, "movimiento"),
    fila(4, "2", -600),
    fila(5, "2205", -600),
    fila(6, "220505", -600, "movimiento"),
    fila(7, "3", -400),
    fila(8, "3105", -400),
    fila(9, "310505", -400, "movimiento"),
  ];
}

function resumen(cambios: Partial<ResumenCuadreBorrador> = {}): ResumenCuadreBorrador {
  return {
    v: VERSION_RESUMEN_CUADRE,
    revision: 0,
    ecuacionDiff: 0,
    partidaDobleDiff: 0,
    clases: [],
    agrupadoras: [],
    agrupadorasTotal: 0,
    ...cambios,
  };
}

describe("resumenCuadreDeFilas + evaluarCuadreBorrador", () => {
  it("un balance que cuadra en las cuatro condiciones queda «cuadrado»", () => {
    const r = resumenCuadreDeFilas(balanceCuadrado(), new Set(), 3);
    expect(r).toMatchObject({ revision: 3, ecuacionDiff: 0, partidaDobleDiff: 0, clases: [], agrupadoras: [] });
    expect(evaluarCuadreBorrador(r, U)).toEqual({ estado: "cuadrado", motivos: [] });
  });

  it("no muta las filas que recibe", () => {
    const filas = balanceCuadrado();
    const copia = structuredClone(filas);
    resumenCuadreDeFilas(filas, new Set(), 0);
    expect(filas).toEqual(copia);
  });

  it("una agrupadora que no cuadra con su desglose descuadra aunque la ecuación y la partida doble cuadren", () => {
    // 1105 dice 5.000 y su única subcuenta suma 1.000: el total del archivo (5.000) tampoco
    // cruza con el detalle de Activo (1.000). La ecuación sobre el detalle sigue en cero.
    const filas = balanceCuadrado();
    filas[0] = fila(1, "1", 5_000);
    filas[1] = fila(2, "1105", 5_000);
    const r = resumenCuadreDeFilas(filas, new Set(), 0);
    expect(r.ecuacionDiff).toBe(0);
    expect(r.agrupadoras).toEqual([{ codigo: "1105", diff: 4_000 }]);
    expect(r.clases).toEqual([{ clase: "Activo", diff: 4_000 }]);

    const v = evaluarCuadreBorrador(r, U);
    expect(v.estado).toBe("descuadrado");
    expect(v.motivos.map((m) => m.tipo)).toEqual(["clases", "agrupadoras"]);
  });

  it("las clases y las agrupadoras se juzgan con el umbral «descuadre» VIGENTE al leer", () => {
    const filas = balanceCuadrado();
    filas[0] = fila(1, "1", 5_000);
    filas[1] = fila(2, "1105", 5_000);
    const r = resumenCuadreDeFilas(filas, new Set(), 0);
    expect(evaluarCuadreBorrador(r, conUmbrales({ descuadre: 4_000 })).estado).toBe("descuadrado"); // inclusive
    expect(evaluarCuadreBorrador(r, conUmbrales({ descuadre: 4_001 }))).toEqual({ estado: "cuadrado", motivos: [] });
  });
});

describe("evaluarCuadreBorrador · ecuación y partida doble", () => {
  it("descuadran por ENCIMA de «cuadre_contable» (hasta el monto, inclusive, cuadran)", () => {
    expect(evaluarCuadreBorrador(resumen({ ecuacionDiff: 1_000, partidaDobleDiff: -1_000 }), U).estado).toBe("cuadrado");
    const v = evaluarCuadreBorrador(resumen({ ecuacionDiff: 1_000.01, partidaDobleDiff: -1_500 }), U);
    expect(v).toEqual({
      estado: "descuadrado",
      motivos: [{ tipo: "ecuacion", monto: 1_000.01 }, { tipo: "partida_doble", monto: -1_500 }],
    });
  });

  it("siguen el parámetro configurado, no el de fábrica", () => {
    const r = resumen({ partidaDobleDiff: 700 });
    expect(evaluarCuadreBorrador(r, U).estado).toBe("cuadrado");
    expect(evaluarCuadreBorrador(r, conUmbrales({ cuadre_contable: 500 })).motivos).toEqual([
      { tipo: "partida_doble", monto: 700 },
    ]);
  });

  it("basta UNA condición para descuadrar", () => {
    expect(evaluarCuadreBorrador(resumen({ clases: [{ clase: "Gastos", diff: -2_000 }] }), U).motivos)
      .toEqual([{ tipo: "clases", clases: [{ clase: "Gastos", diff: -2_000 }] }]);
    expect(evaluarCuadreBorrador(resumen({ agrupadoras: [{ codigo: "13", diff: 2_000 }], agrupadorasTotal: 1 }), U).motivos)
      .toEqual([{ tipo: "agrupadoras", cantidad: 1, masDe: false, codigos: ["13"] }]);
  });

  it("avisa «más de» cuando el resumen se recortó y todas las guardadas alcanzan el umbral", () => {
    const agrupadoras = Array.from({ length: MAX_AGRUPADORAS_RESUMEN }, (_, i) => ({ codigo: `1${i}`, diff: 9_000 }));
    const v = evaluarCuadreBorrador(resumen({ agrupadoras, agrupadorasTotal: MAX_AGRUPADORAS_RESUMEN + 50 }), U);
    expect(v.motivos[0]).toMatchObject({ tipo: "agrupadoras", cantidad: MAX_AGRUPADORAS_RESUMEN, masDe: true });
  });
});

describe("resumirCuadreBorrador · reubicaciones aprobadas", () => {
  // 415005 (ingreso) quedó colgada de 5105 (gasto): el archivo cierra Ingresos sin ella.
  const filas = [
    fila(10, "415005", 5_000, "movimiento", { padreManual: 20 }),
    fila(20, "5105", 0),
  ];
  const vista = {
    validacion: {
      ecuacionDiff: 0,
      activoDiff: null, activoCuadra: null,
      pasivoDiff: null, pasivoCuadra: null,
      patrimonioDiff: null, patrimonioCuadra: null,
      ingresosDiff: 5_000, ingresosCuadra: false,
      gastosDiff: null, gastosCuadra: null,
      costosDiff: null, costosCuadra: null,
    } as unknown as ValidacionContable,
    partidaDoble: { debitos: 0, creditos: 0, diff: 0, cuadra: true },
    arbol: [],
    filasContabilizadas: [10],
  };

  it("la clase que explica una reubicación aprobada no cuenta", () => {
    expect(resumirCuadreBorrador(vista, filas, new Set([10]), 0).clases).toEqual([]);
  });

  it("sin aprobar, la clase sigue contando", () => {
    expect(resumirCuadreBorrador(vista, filas, new Set(), 0).clases).toEqual([{ clase: "Ingresos", diff: 5_000 }]);
  });
});

describe("leerResumenCuadre", () => {
  it("lee un resumen válido y rechaza otra versión o un JSON mal formado", () => {
    const r = resumen({ clases: [{ clase: "Activo", diff: 3_000 }], agrupadoras: [{ codigo: "11", diff: 1 }], agrupadorasTotal: 1 });
    expect(leerResumenCuadre(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(leerResumenCuadre(null)).toBeNull();
    expect(leerResumenCuadre({ ...r, v: 99 })).toBeNull();
    expect(leerResumenCuadre({ ...r, clases: [{ clase: "Resultado", diff: 1 }] })).toBeNull();
    expect(leerResumenCuadre({ ...r, agrupadoras: "x" })).toBeNull();
  });
});

describe("veredictoBorradorLista", () => {
  const descuadrado = resumen({ revision: 4, agrupadoras: [{ codigo: "13", diff: 9_000 }], agrupadorasTotal: 1 });

  it("con resumen de la MISMA revisión del lote evalúa las cuatro condiciones", () => {
    expect(veredictoBorradorLista({ resumen: descuadrado, revisionLote: 4, ecuacionDiff: 0, partidaDobleDiff: 0 }, U).estado)
      .toBe("descuadrado");
  });

  it("con resumen de otra revisión (o sin resumen) solo afirma el descuadre de la ecuación o la partida doble", () => {
    expect(veredictoBorradorLista({ resumen: descuadrado, revisionLote: 5, ecuacionDiff: 0, partidaDobleDiff: 0 }, U))
      .toEqual({ estado: "sin_verificar", motivos: [] });
    expect(veredictoBorradorLista({ resumen: null, revisionLote: 5, ecuacionDiff: 1_200, partidaDobleDiff: 0 }, U))
      .toEqual({ estado: "descuadrado", motivos: [{ tipo: "ecuacion", monto: 1_200 }] });
  });

  it("un lote sin encabezado usa la partida doble del staging con el mismo umbral", () => {
    expect(veredictoBorradorLista({ resumen: null, revisionLote: null, ecuacionDiff: null, partidaDobleDiff: 900 }, U))
      .toEqual({ estado: "sin_verificar", motivos: [] });
    expect(veredictoBorradorLista({ resumen: null, revisionLote: null, ecuacionDiff: null, partidaDobleDiff: 1_001 }, U))
      .toEqual({ estado: "descuadrado", motivos: [{ tipo: "partida_doble", monto: 1_001 }] });
  });
});
