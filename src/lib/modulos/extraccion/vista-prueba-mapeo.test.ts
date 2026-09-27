import { describe, expect, it } from "vitest";
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import { descriptorModulo } from "../descriptores";
import type { SpecModulo } from "./esquema";
import type { FilaModulo, ResultadoTransformModulo } from "./transformar";
import {
  columnasPruebaMapeo,
  LIMITE_FILAS_PRUEBA,
  motivoPruebaLegible,
  vistaPruebaMapeo,
} from "./vista-prueba-mapeo";

const INV = descriptorModulo("INV")!;
const CXP = descriptorModulo("CXP")!;
const NOM = descriptorModulo("NOM")!;

const SPEC_INV: SpecModulo = {
  hoja: "Inventario",
  filaEncabezado: 1,
  primeraFilaDatos: 2,
  columnas: { tipo: 1, referencia: 2, cantidad: 3, valorTotal: 4 },
};
const HOJA: GridHoja = { nombre: "Inventario", filas: [[], [], []] };

const fila = (f: Partial<FilaModulo> & { filaNum: number }): FilaModulo => ({
  clasificador: "MP",
  valor: 100,
  datos: {},
  tipoFila: "movimiento",
  ...f,
});
const lecturaDe = (filas: FilaModulo[]): ResultadoTransformModulo => ({
  filas,
  filasLeidas: filas.length,
  filasExcluidas: filas.filter((f) => f.tipoFila !== "movimiento").length,
  excepciones: [],
  filasOmitidasArriba: 0,
  omitidasMuestra: [],
});

const vista = (filas: FilaModulo[], extra: Partial<Parameters<typeof vistaPruebaMapeo>[0]> = {}) =>
  vistaPruebaMapeo({ descriptor: INV, spec: SPEC_INV, hoja: HOJA, lectura: lecturaDe(filas), impedimentos: [], ...extra });

describe("columnasPruebaMapeo", () => {
  it("muestra las columnas mapeadas con su letra de Excel y deja fuera las que no se leen", () => {
    const columnas = columnasPruebaMapeo(INV, SPEC_INV);

    expect(columnas.map((c) => [c.nombre, c.letra])).toEqual([
      ["tipo", "A"],
      ["referencia", "B"],
      ["cantidad", "C"],
      ["valorTotal", "D"],
    ]);
    expect(columnas.find((c) => c.nombre === "valorTotal")?.esValor).toBe(true);
  });

  it("suma el desplazamiento de la hoja: un libro que empieza en la C rotula C, no A", () => {
    expect(columnasPruebaMapeo(INV, SPEC_INV, 2).map((c) => c.letra)).toEqual(["C", "D", "E", "F"]);
  });

  it("el clasificador global y el valor derivado se muestran sin letra, con su nota", () => {
    const global = columnasPruebaMapeo(INV, { ...SPEC_INV, columnas: { referencia: 2, valorTotal: 4 }, clasificadorModo: "global" });
    expect(global.find((c) => c.nombre === "tipo")).toMatchObject({ letra: "—", nota: "global" });

    // Nómina con devengo y deducción: el valor de la fila no sale de una columna.
    const nomina = columnasPruebaMapeo(NOM, {
      hoja: "Detalle",
      filaEncabezado: 1,
      primeraFilaDatos: 2,
      columnas: { concepto: 1, devengo: 2, deduccion: 3 },
    });
    expect(nomina.find((c) => c.nombre === NOM.valor)).toMatchObject({ letra: "—", nota: "se deriva" });
  });

  it("Cartera añade una columna por cada rango de vencimiento del archivo, con su letra", () => {
    const columnas = columnasPruebaMapeo(CXP, {
      hoja: "CxP",
      filaEncabezado: 1,
      primeraFilaDatos: 2,
      columnas: { nit: 1, nombre: 2, documento: 3, total: 4 },
      familias: { edades: [{ columna: 5, etiqueta: "De 1 a 30" }, { columna: 6, etiqueta: "De 31 a 60" }] },
    });

    expect(columnas.filter((c) => c.familia).map((c) => [c.etiqueta, c.letra])).toEqual([
      ["De 1 a 30", "E"],
      ["De 31 a 60", "F"],
    ]);
  });
});

describe("motivoPruebaLegible", () => {
  it("traduce los motivos del motor a lo que el auditor reconoce", () => {
    expect(motivoPruebaLegible("movimiento", undefined)).toBe("suma");
    expect(motivoPruebaLegible("total", "subtotal:rotulo,aritmetica")).toBe("subtotal del archivo · no suma");
    expect(motivoPruebaLegible("total", "gran_total:marca_manual")).toBe("total del archivo · no suma");
    expect(motivoPruebaLegible("agrupadora", "cola_control:cola")).toBe("cuadro de control al pie · no suma");
    expect(motivoPruebaLegible("agrupadora", "fuera_de_periodo")).toBe("fuera del período · no suma");
    expect(motivoPruebaLegible("agrupadora", "seccion_cuenta")).toBe("cuenta del archivo · no suma");
    expect(motivoPruebaLegible("agrupadora", "sin_identificador")).toBe("sin identificación · no suma");
    expect(motivoPruebaLegible("agrupadora", undefined)).toBe("agrupadora · no suma");
  });
});

describe("vistaPruebaMapeo", () => {
  it("devuelve las primeras filas con su número de fila del archivo y sus celdas", () => {
    const v = vista([
      fila({ filaNum: 2, datos: { tipo: "MP", referencia: "A-1", cantidad: 3, valorTotal: 300 }, valor: 300 }),
      fila({ filaNum: 3, tipoFila: "total", motivo: "subtotal:rotulo", valor: 300, datos: { tipo: "MP" } }),
    ]);

    expect(v.filas.map((f) => f.filaNum)).toEqual([2, 3]);
    expect(v.filas[0].celdas).toEqual(["MP", "A-1", 3, 300]);
    expect(v.filas[1].celdas[0]).toBe("MP");
    expect(v.filas[0]).toMatchObject({ imputa: true, motivoTexto: "suma" });
    expect(v.filas[1]).toMatchObject({ imputa: false, motivoTexto: "subtotal del archivo · no suma" });
    expect(v).toMatchObject({ hoja: "Inventario", filasProducidas: 2, movimientos: 1, totalFilasHoja: 3 });
  });

  it("corta en el límite de filas", () => {
    const v = vista(Array.from({ length: 40 }, (_, i) => fila({ filaNum: i + 2 })));

    expect(v.filas).toHaveLength(LIMITE_FILAS_PRUEBA);
    expect(v.filasProducidas).toBe(40);
    expect(v.filas.every((f) => f.salto !== true)).toBe(true);
  });

  it("si las primeras filas no traen ningún movimiento, alcanza el primero que sí lo sea", () => {
    const filas = [
      ...Array.from({ length: 20 }, (_, i) => fila({ filaNum: i + 2, tipoFila: "agrupadora", motivo: "seccion_cuenta" })),
      fila({ filaNum: 40, datos: { referencia: "A-1" } }),
    ];
    const v = vista(filas);

    expect(v.filas).toHaveLength(LIMITE_FILAS_PRUEBA + 1);
    expect(v.filas.at(-1)).toMatchObject({ filaNum: 40, salto: true, imputa: true });
  });

  it("el saldo de un documento de Cartera sale de los rangos, no de la columna en cero", () => {
    const spec: SpecModulo = {
      hoja: "CxP",
      filaEncabezado: 1,
      primeraFilaDatos: 2,
      columnas: { nit: 1, nombre: 2, documento: 3, total: 4 },
      familias: { edades: [{ columna: 5, etiqueta: "De 1 a 30" }] },
    };
    const v = vistaPruebaMapeo({
      descriptor: CXP,
      spec,
      hoja: { nombre: "CxP", filas: [[], []] },
      lectura: lecturaDe([
        fila({
          filaNum: 2,
          clasificador: "220505",
          valor: 500,
          datos: { nit: "900123456", nombre: "ACME", documento: "FV-1", total: 0 },
          familias: { edades: { "De 1 a 30": 500 } },
          origenValor: "familia",
          valorReportado: 0,
        }),
      ]),
      impedimentos: [],
    });

    const iValor = v.columnas.findIndex((c) => c.esValor);
    const iEdad = v.columnas.findIndex((c) => c.familia);
    expect(v.filas[0].celdas[iValor]).toBe(500);
    expect(v.filas[0].celdas[iEdad]).toBe(500);
  });

  it("muestra lo que el motor PROMOVIÓ: el clasificador arrastrado y el valor derivado", () => {
    // El clasificador no está en la celda (viene arrastrado) y el valor de Nómina se deriva de
    // devengo − deducción: si la tabla mostrara las celdas, las dos saldrían vacías.
    const spec: SpecModulo = {
      hoja: "Detalle",
      filaEncabezado: 1,
      primeraFilaDatos: 2,
      columnas: { concepto: 1, devengo: 2, deduccion: 3 },
    };
    const v = vistaPruebaMapeo({
      descriptor: NOM,
      spec,
      hoja: { nombre: "Detalle", filas: [[], []] },
      lectura: lecturaDe([fila({ filaNum: 2, clasificador: "1", valor: 250_000, datos: { devengo: 250_000 } })]),
      impedimentos: [],
    });

    const iClasificador = v.columnas.findIndex((c) => c.nombre === NOM.clasificador);
    const iValor = v.columnas.findIndex((c) => c.esValor);
    expect(v.filas[0].celdas[iClasificador]).toBe("1");
    expect(v.filas[0].celdas[iValor]).toBe(250_000);
  });

  it("avisa de lo que el patrón no fija: el período de Nómina y la divisa sin TRM", () => {
    const nomina = vistaPruebaMapeo({
      descriptor: NOM,
      spec: { hoja: "Detalle", filaEncabezado: 1, primeraFilaDatos: 2, columnas: { concepto: 1, devengo: 2 } },
      hoja: null,
      lectura: null,
      impedimentos: [],
    });
    expect(nomina.avisos[0]).toContain("El patrón no fija el período");

    const divisa = vistaPruebaMapeo({
      descriptor: CXP,
      spec: {
        hoja: "CxP",
        filaEncabezado: 1,
        primeraFilaDatos: 2,
        columnas: { nit: 1, nombre: 2, documento: 3, total: 4 },
        monedaArchivo: "USD",
      },
      hoja: null,
      lectura: null,
      impedimentos: [],
    });
    expect(divisa.avisos[0]).toContain("USD");
    expect(vista([]).avisos).toEqual([]);
  });

  it("recorta los textos largos y sobrevive sin lectura (spec que no valida)", () => {
    const largo = "X".repeat(200);
    const v = vista([fila({ filaNum: 2, datos: { referencia: largo } })]);
    expect(String(v.filas[0].celdas[1])).toHaveLength(61);

    const sinLectura = vistaPruebaMapeo({
      descriptor: INV,
      spec: SPEC_INV,
      hoja: null,
      lectura: null,
      impedimentos: ["Falta la columna obligatoria «Valor total»."],
    });
    expect(sinLectura.filas).toEqual([]);
    expect(sinLectura).toMatchObject({ hoja: "Inventario", filasProducidas: 0, movimientos: 0, totalFilasHoja: 0 });
    expect(sinLectura.impedimentos).toHaveLength(1);
  });
});
