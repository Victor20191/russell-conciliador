import { describe, expect, it } from "vitest";
import { descriptorModulo } from "../descriptores";
import type { SpecModulo } from "../extraccion/esquema";
import type { CeldaCruda } from "@/lib/balance/extraccion/ingesta";
import { transformarModulo } from "../extraccion/transformar";
import { consolidarPorClasificador } from "../promocion";
import { aplicarAgrupadorDeCarga, aplicarClasificadorDeCarga, aplicarPatronASpec, aplicarTotalDeCarga, CLASIFICADOR_GLOBAL_CARGA } from "./aplicar";
import { coincidenciaPatron } from "./coincidencia";
import type { UbicacionPatron, VersionCandidata } from "./mejor-version";

const CXP = descriptorModulo("CXP")!;
const columnas = (mapa: Record<string, number>) => Object.fromEntries(CXP.columnas.map((rol) => [rol.nombre, mapa[rol.nombre] ?? 0]));

const ENCABEZADO = ["Código", "Nombre", "Corriente", "De 1 a 30", "Deuda dudosa", "Total", "Ciudad"];
const SPEC: SpecModulo = {
  hoja: "Hoja 1",
  filaEncabezado: 4,
  primeraFilaDatos: 6,
  columnas: columnas({ nit: 1, nombre: 2, total: 6 }),
  familias: {
    edades: [
      { columna: 3, etiqueta: "Corriente", clase: "corriente" },
      { columna: 4, etiqueta: "De 1 a 30", clase: "vencido" },
      // El administrador retiró «Deuda dudosa» del mapeo: no debe volver.
    ],
  },
  subtotales: "manual",
  subtotalesColumna: 7,
  subtotalesTexto: "TOTAL CIUDAD",
};

const version = (spec: SpecModulo = SPEC, encabezado: readonly unknown[] = ENCABEZADO): VersionCandidata => ({
  id: 1, version: 1, estado: "aprobada", clienteOrigenId: null, hoja: spec.hoja,
  filaEncabezado: spec.filaEncabezado, primeraFilaDatos: spec.primeraFilaDatos, encabezado, spec,
});

const ubicar = (fila: readonly (string | null)[], filaEncabezado = 2, v = version()): UbicacionPatron => ({
  version: v,
  hoja: "Proveedores",
  filaEncabezado,
  encabezadoArchivo: fila,
  coincidencia: coincidenciaPatron(CXP, { encabezado: v.encabezado, spec: v.spec }, fila),
});

describe("aplicarPatronASpec", () => {
  it("traslada roles, rangos y la marca de totales a las columnas del archivo", () => {
    const archivo = [null, "Ciudad", "CODIGO", "Nombre", "Corriente", "De 1 a 30", "Deuda dudosa", "De 31 a 60", "Total"];
    const { spec, advertencias } = aplicarPatronASpec(CXP, ubicar(archivo));
    expect(advertencias).toEqual([]);
    expect(spec).toMatchObject({
      hoja: "Proveedores",
      filaEncabezado: 2,
      primeraFilaDatos: 4, // conserva la distancia de la muestra (6 − 4)
      subtotales: "manual",
      subtotalesColumna: 2,
      subtotalesTexto: "TOTAL CIUDAD",
    });
    expect(spec.columnas).toMatchObject({ nit: 3, nombre: 4, total: 9 });
    // Los rangos los pone el archivo (incluido uno nuevo), sin el que el administrador retiró.
    expect(spec.familias?.edades).toEqual([
      { columna: 5, etiqueta: "Corriente", clase: "corriente" },
      { columna: 6, etiqueta: "De 1 a 30", clase: "vencido" },
      { columna: 8, etiqueta: "De 31 a 60", clase: "vencido" },
    ]);
  });

  it("avisa y deja fuera lo que no encontró; sin la marca de totales vuelve a la detección automática", () => {
    const archivo = ["Código", "Corriente", "De 1 a 30", "Total"];
    const { spec, advertencias } = aplicarPatronASpec(CXP, ubicar(archivo, 1));
    expect(spec.columnas.nombre).toBe(0);
    expect(spec.subtotales).toBeUndefined(); // «auto» no se escribe
    expect(spec.subtotalesColumna).toBeUndefined();
    expect(advertencias).toEqual([
      "No se encontró la columna de «Nombre / razón social» («Nombre»): no se leerá.",
      "No se encontró la columna que marca los totales: se detectarán automáticamente.",
    ]);
  });

  it("hereda la clase que el patrón le dio a un rango y conserva los modos del formato", () => {
    const conModos: SpecModulo = {
      ...SPEC,
      subtotales: "rotulo",
      clasificadorModo: "seccion",
      seccionColumnaVaciaRol: "nombre",
      invertirSigno: true,
      familias: { edades: [{ columna: 3, etiqueta: "Corriente", clase: "excluir" }] },
    };
    const { spec } = aplicarPatronASpec(CXP, ubicar(["Nombre", "Código", "Corriente", "Total"], 1, version(conModos)));
    expect(spec).toMatchObject({ subtotales: "rotulo", clasificadorModo: "seccion", seccionColumnaVaciaRol: "nombre", invertirSigno: true });
    expect(spec.familias?.edades).toEqual([{ columna: 3, etiqueta: "Corriente", clase: "excluir" }]);
  });
});

describe("aplicarPatronASpec con el identificador compartido de SIESA", () => {
  // La muestra trae el NIT (cabecera) y el documento (filas de abajo) en la MISMA columna.
  const SPEC_SIESA: SpecModulo = {
    hoja: "Hoja 1",
    filaEncabezado: 1,
    primeraFilaDatos: 2,
    columnas: columnas({ nit: 2, documento: 2, fecha: 3, vencimiento: 4, marcaSeccion: 5, total: 8 }),
    familias: {
      edades: [
        { columna: 6, etiqueta: "Corriente", clase: "corriente" },
        { columna: 7, etiqueta: "De 1 a 30", clase: "vencido" },
      ],
    },
    edadesModo: "ancho",
    terceroModo: "cabecera",
    arrastrarRoles: ["nit"],
    nivel: "documento",
    tipoFormato: "documento_edades",
  };
  const ENCABEZADO_SIESA = ["", "Documento", "Fecha", "F.Vcto.", "#Ter.", "Corriente", "De 1 a 30", "Total"];
  const vSiesa = version(SPEC_SIESA, ENCABEZADO_SIESA);
  const ubicarSiesa = (filas: CeldaCruda[][]) => {
    const hoja = { nombre: "Hoja 1", filas };
    const ubicacion: UbicacionPatron = {
      version: vSiesa,
      hoja: "Hoja 1",
      filaEncabezado: 1,
      encabezadoArchivo: filas[0],
      coincidencia: coincidenciaPatron(CXP, { encabezado: vSiesa.encabezado, spec: vSiesa.spec }, filas[0]),
    };
    return { hoja, ubicacion };
  };

  it("NIT repetido en cada fila, nombre bajo «Documento» y el documento al lado: los reubica y lee los documentos", () => {
    const filas: CeldaCruda[][] = [
      [null, "Documento", "Documento", "Fecha", "F.Vcto.", "#Ter.", "Corriente", "De 1 a 30", "Total"],
      ["900123456", "PROVEEDOR UNO", "PROVEEDOR UNO", null, null, null, 100, 50, 150],
      ["900123456", "PROVEEDOR UNO", "001-FC-1", "2025-12-01", "2025-12-31", null, 100, 0, 0],
      ["900123456", "PROVEEDOR UNO", "001-FC-2", "2025-11-01", "2025-11-30", null, 0, 50, 0],
      ["800555111", "PROVEEDOR DOS", "PROVEEDOR DOS", null, null, null, 0, 70, 70],
      ["800555111", "PROVEEDOR DOS", "001-FC-3", "2025-10-01", "2025-10-31", null, 0, 70, 0],
    ];
    const { hoja, ubicacion } = ubicarSiesa(filas);
    expect(ubicacion.coincidencia.porcentaje).toBe(100);
    // Sin la grilla, el patrón deja NIT y documento en la columna del nombre.
    expect(aplicarPatronASpec(CXP, ubicacion).spec.columnas).toMatchObject({ nit: 2, documento: 2 });

    const { spec, advertencias } = aplicarPatronASpec(CXP, ubicacion, hoja);
    expect(spec.columnas).toMatchObject({ nit: 1, nombre: 2, documento: 3 });
    expect(advertencias).toEqual([expect.stringContaining("NIT en A, documento en C, nombre en B")]);

    const resultado = transformarModulo(CXP, spec, hoja);
    const movimientos = resultado.filas.filter((f) => f.tipoFila === "movimiento");
    expect(movimientos.map((f) => f.datos.documento)).toEqual(["001-FC-1", "001-FC-2", "001-FC-3"]);
    expect(movimientos.map((f) => f.datos.nit)).toEqual(["900123456", "900123456", "800555111"]);
    // La cabecera del tercero (su nombre repetido bajo «Documento») no imputa: declara el saldo.
    const cabeceras = resultado.filas.filter((f) => f.motivo === "subtotal_tercero:cabecera");
    expect(cabeceras).toHaveLength(2);
    expect(Math.abs(movimientos.reduce((a, f) => a + f.valor, 0))).toBe(220);
  });

  it("el documento en la columna de al lado sin rótulo: solo mueve el documento", () => {
    const filas: CeldaCruda[][] = [
      ["Documento", null, "Fecha", "F.Vcto.", "#Ter.", "Corriente", "De 1 a 30", "Total"],
      ["900123456", "PROVEEDOR UNO", null, null, null, 100, 50, 150],
      [null, "001-FC-1", "2025-12-01", "2025-12-31", null, 100, 0, 0],
      [null, "001-FC-2", "2025-11-01", "2025-11-30", null, 0, 50, 0],
    ];
    const { hoja, ubicacion } = ubicarSiesa(filas);
    const { spec } = aplicarPatronASpec(CXP, ubicacion, hoja);
    expect(spec.columnas).toMatchObject({ nit: 1, documento: 2, nombre: 0 });
    const movimientos = transformarModulo(CXP, spec, hoja).filas.filter((f) => f.tipoFila === "movimiento");
    expect(movimientos.map((f) => f.datos.documento)).toEqual(["001-FC-1", "001-FC-2"]);
  });

  it("el archivo con el mismo formato de la muestra queda igual", () => {
    const filas: CeldaCruda[][] = [
      [null, "Documento", "Fecha", "F.Vcto.", "#Ter.", "Corriente", "De 1 a 30", "Total"],
      [null, "900123456", null, null, null, 100, 50, 150],
      [null, "001-FC-1", "2025-12-01", "2025-12-31", null, 100, 0, 0],
      [null, "001-FC-2", "2025-11-01", "2025-11-30", null, 0, 50, 0],
    ];
    const { hoja, ubicacion } = ubicarSiesa(filas);
    const { spec, advertencias } = aplicarPatronASpec(CXP, ubicacion, hoja);
    expect(spec.columnas).toMatchObject({ nit: 2, documento: 2 });
    expect(advertencias).toEqual([]);
  });
});

describe("aplicarClasificadorDeCarga (tipo de inventario confirmado en el cargue)", () => {
  const INV = descriptorModulo("INV")!;
  const SPEC_INV: SpecModulo = {
    hoja: "Kardex",
    filaEncabezado: 1,
    primeraFilaDatos: 2,
    columnas: { tipo: 1, referencia: 2, descripcion: 3, cantidad: 4, valorUnitario: 5, valorTotal: 6 },
    clasificadorModo: "columna",
  };

  it("el descriptor de Inventarios pide la confirmación y los demás no", () => {
    expect(INV.confirmarClasificadorEnCarga).toBe(true);
    expect(CXP.confirmarClasificadorEnCarga).toBeFalsy();
  });

  it("la misma columna no es un cambio", () => {
    const r = aplicarClasificadorDeCarga(INV, SPEC_INV, { columna: 1 }, 6);
    expect(r).toMatchObject({ ok: true, cambio: false });
  });

  it("otra columna cambia solo el clasificador y conserva el modo", () => {
    const arrastrar = { ...SPEC_INV, clasificadorModo: "arrastrar" as const };
    const r = aplicarClasificadorDeCarga(INV, arrastrar, { columna: 3 }, 6);
    expect(r.ok && r.cambio).toBe(true);
    if (!r.ok) return;
    expect(r.spec.columnas).toMatchObject({ tipo: 3, referencia: 2, valorTotal: 6 });
    expect(r.spec.clasificadorModo).toBe("arrastrar");
    // El spec de entrada (el de la versión) no se toca.
    expect(arrastrar.columnas.tipo).toBe(1);
  });

  it("el analista puede pedir otro modo al elegir la columna", () => {
    const r = aplicarClasificadorDeCarga(INV, SPEC_INV, { columna: 1, modo: "arrastrar" }, 6);
    expect(r).toMatchObject({ ok: true, cambio: true, spec: { clasificadorModo: "arrastrar" } });
  });

  it("global y de vuelta a una columna", () => {
    const global = aplicarClasificadorDeCarga(INV, SPEC_INV, { columna: CLASIFICADOR_GLOBAL_CARGA }, 6);
    expect(global).toMatchObject({ ok: true, cambio: true, spec: { clasificadorModo: "global" } });
    if (!global.ok) return;
    const columna = aplicarClasificadorDeCarga(INV, global.spec, { columna: 2 }, 6);
    expect(columna).toMatchObject({ ok: true, cambio: true, spec: { clasificadorModo: "columna", columnas: { tipo: 2 } } });
  });

  it("sección solo se conserva si el patrón ya la usaba", () => {
    const r = aplicarClasificadorDeCarga(INV, SPEC_INV, { columna: 1, modo: "seccion" }, 6);
    expect(r).toMatchObject({ ok: true, cambio: false, spec: { clasificadorModo: "columna" } });
  });

  it("rechaza columnas fuera del archivo o sin elegir", () => {
    for (const columna of [0, 7, 1.5, Number.NaN, -2]) {
      expect(aplicarClasificadorDeCarga(INV, SPEC_INV, { columna }, 6)).toEqual({
        ok: false,
        message: "Confirma la columna de «Tipo de inventario» de este archivo.",
      });
    }
  });

  it("conserva los datos del cargue ya puestos (fila del total)", () => {
    const manual: SpecModulo = { ...SPEC_INV, subtotales: "manual", subtotalesColumna: 6, subtotalesFila: 40 };
    const r = aplicarClasificadorDeCarga(INV, manual, { columna: 2 }, 6);
    expect(r).toMatchObject({ ok: true, spec: { subtotalesFila: 40, subtotalesColumna: 6 } });
  });
});

describe("aplicarTotalDeCarga («¿El archivo trae el valor total?» en el cargue)", () => {
  const INV = descriptorModulo("INV")!;
  const SPEC_INV: SpecModulo = {
    hoja: "Kardex",
    filaEncabezado: 1,
    primeraFilaDatos: 2,
    columnas: { tipo: 1, referencia: 2, descripcion: 3, cantidad: 4, valorUnitario: 5, valorTotal: 6 },
    clasificadorModo: "columna",
  };
  const MANUAL: SpecModulo = { ...SPEC_INV, subtotales: "manual", subtotalesColumna: 6, subtotalesTexto: "2653737498.78" };

  it("solo Inventarios hace la pregunta", () => {
    expect(INV.confirmarTotalEnCarga).toBe(true);
    expect(CXP.confirmarTotalEnCarga).toBeFalsy();
  });

  it("sin respuesta no se crea el borrador", () => {
    expect(aplicarTotalDeCarga(INV, SPEC_INV, { trae: null }, 6)).toEqual({ ok: false, message: "Indica si el archivo trae el valor total." });
  });

  it("Sí fija la celda del total y conserva el modo de detección del patrón", () => {
    const r = aplicarTotalDeCarga(INV, SPEC_INV, { trae: true, columna: 6, fila: 91 }, 6);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.spec).toMatchObject({ subtotalesColumna: 6, subtotalesFila: 91 });
    expect(r.spec.subtotales).toBeUndefined();
  });

  it("Sí sobre un patrón manual cambia la celda de este archivo y sigue en manual", () => {
    const r = aplicarTotalDeCarga(INV, MANUAL, { trae: true, columna: 3, fila: 1347 }, 6);
    expect(r.ok && r.spec).toMatchObject({ subtotales: "manual", subtotalesColumna: 3, subtotalesFila: 1347 });
  });

  it("Sí exige una columna de la hoja y una fila válida", () => {
    expect(aplicarTotalDeCarga(INV, SPEC_INV, { trae: true, columna: 0, fila: 5 }, 6)).toEqual({ ok: false, message: "Elige la columna donde está el valor total." });
    expect(aplicarTotalDeCarga(INV, SPEC_INV, { trae: true, columna: 7, fila: 5 }, 6)).toEqual({ ok: false, message: "Elige la columna donde está el valor total." });
    expect(aplicarTotalDeCarga(INV, SPEC_INV, { trae: true, columna: 6, fila: 0 }, 6)).toEqual({ ok: false, message: "Ubica la fila del valor total en este archivo." });
    expect(aplicarTotalDeCarga(INV, SPEC_INV, { trae: true, columna: 6, fila: Number.NaN }, 6).ok).toBe(false);
  });

  it("No deja el spec sin coordenada y un patrón manual se lee por rótulo", () => {
    const auto = aplicarTotalDeCarga(INV, { ...SPEC_INV, subtotalesFila: 12 }, { trae: false }, 6);
    expect(auto.ok && auto.spec.subtotalesFila).toBeUndefined();
    const manual = aplicarTotalDeCarga(INV, { ...MANUAL, subtotalesFila: 12 }, { trae: false, columna: 6, fila: 12 }, 6);
    expect(manual.ok).toBe(true);
    if (!manual.ok) return;
    expect(manual.spec.subtotales).toBe("rotulo");
    expect(manual.spec.subtotalesColumna).toBeUndefined();
    expect(manual.spec.subtotalesFila).toBeUndefined();
    expect(manual.spec.subtotalesTexto).toBeUndefined();
  });
});

describe("aplicarAgrupadorDeCarga («¿Separar por centro de costo?» en el cargue)", () => {
  const NOM = descriptorModulo("NOM")!;
  const SPEC_NOM: SpecModulo = {
    hoja: "ACUMULADOS DE NOMINA",
    filaEncabezado: 1,
    primeraFilaDatos: 2,
    columnas: { codigo: 1, concepto: 2, cedula: 3, empleado: 4, agrupador: 5, valor: 6 },
  };
  const ENCABEZADO: CeldaCruda[] = ["Código", "Concepto", "Cédula", "Empleado", "Centro de costo", "Valor"];
  const FILAS: CeldaCruda[][] = [
    ENCABEZADO,
    ["8", "Bonificación", "1144", "Ana Ruiz", "GYA", 100],
    ["8", "Bonificación", "2255", "Luis Gil", "MOD", 50],
    ["1", "Sueldo", "1144", "Ana Ruiz", "GYA", 1000],
  ];

  it("solo Nómina hace la pregunta", () => {
    expect(NOM.confirmarAgrupadorEnCarga).toBe(true);
    expect(CXP.confirmarAgrupadorEnCarga).toBeFalsy();
    expect(descriptorModulo("INV")!.confirmarAgrupadorEnCarga).toBeFalsy();
  });

  it("si el patrón no lee el centro no pregunta ni cambia el spec", () => {
    const sinCentro: SpecModulo = { ...SPEC_NOM, columnas: { ...SPEC_NOM.columnas, agrupador: 0 } };
    expect(aplicarAgrupadorDeCarga(NOM, sinCentro, null)).toEqual({ ok: true, spec: sinCentro, separado: false });
    // Otro módulo nunca pregunta, aunque su spec tenga una columna con ese nombre.
    expect(aplicarAgrupadorDeCarga(CXP, SPEC_NOM, null)).toEqual({ ok: true, spec: SPEC_NOM, separado: false });
  });

  it("sin respuesta no se crea el borrador", () => {
    expect(aplicarAgrupadorDeCarga(NOM, SPEC_NOM, null)).toEqual({ ok: false, message: "Indica si este cargue se separa por centro de costo." });
  });

  it("Sí conserva el centro: un renglón por concepto y centro", () => {
    const r = aplicarAgrupadorDeCarga(NOM, SPEC_NOM, true);
    expect(r).toEqual({ ok: true, spec: SPEC_NOM, separado: true });
  });

  it("No deja de leer el centro: el Consolidado queda por concepto", () => {
    const r = aplicarAgrupadorDeCarga(NOM, SPEC_NOM, false);
    expect(r.ok && r.separado).toBe(false);
    if (!r.ok) return;
    expect(r.spec.columnas.agrupador ?? 0).toBe(0);
    expect(r.spec.columnas).toMatchObject({ codigo: 1, concepto: 2, valor: 6 });

    const leer = (spec: SpecModulo) => {
      const { filas } = transformarModulo(NOM, spec, { nombre: "ACUMULADOS DE NOMINA", filas: FILAS });
      return consolidarPorClasificador(
        filas.map((f) => ({ clasificador: f.clasificador, valor: f.valor, tipoFila: f.tipoFila, agrupador: String(f.datos.agrupador ?? "") })),
        { porAgrupador: true },
      ).map((c) => [c.clasificador, c.total]);
    };
    expect(leer(SPEC_NOM)).toEqual(expect.arrayContaining([["8 ∥ GYA", 100], ["8 ∥ MOD", 50], ["1 ∥ GYA", 1000]]));
    expect(leer(r.spec)).toEqual(expect.arrayContaining([["8", 150], ["1", 1000]]));
    expect(leer(r.spec)).toHaveLength(2);
  });
});
