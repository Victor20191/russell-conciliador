import { describe, expect, it } from "vitest";
import { descriptorModulo } from "../descriptores";
import type { SpecModulo } from "../extraccion/esquema";
import { aplicarClasificadorDeCarga, aplicarPatronASpec, aplicarTotalDeCarga, CLASIFICADOR_GLOBAL_CARGA } from "./aplicar";
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
