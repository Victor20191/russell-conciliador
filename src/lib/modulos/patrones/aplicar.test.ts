import { describe, expect, it } from "vitest";
import { descriptorModulo } from "../descriptores";
import type { SpecModulo } from "../extraccion/esquema";
import { aplicarPatronASpec } from "./aplicar";
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
