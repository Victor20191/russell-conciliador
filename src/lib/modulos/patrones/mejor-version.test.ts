import { describe, expect, it } from "vitest";
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import { descriptorModulo } from "../descriptores";
import { mejorVersion, versionesAplicables, type VersionCandidata } from "./mejor-version";

const INV = descriptorModulo("INV")!;
const columnas = (mapa: Record<string, number>) => Object.fromEntries(INV.columnas.map((rol) => [rol.nombre, mapa[rol.nombre] ?? 0]));

const version = (datos: Partial<VersionCandidata> & { id: number }): VersionCandidata => ({
  version: 1,
  estado: "aprobada",
  clienteOrigenId: null,
  hoja: "Inventario",
  filaEncabezado: 1,
  primeraFilaDatos: 2,
  encabezado: ["Tipo", "Referencia", "Cantidad", "Valor total"],
  spec: { hoja: "Inventario", filaEncabezado: 1, primeraFilaDatos: 2, columnas: columnas({ tipo: 1, referencia: 2, cantidad: 3, valorTotal: 4 }) },
  ...datos,
});

const hoja = (nombre: string, filas: (string | number | null)[][], extra: Partial<GridHoja> = {}): GridHoja => ({ nombre, filas, ...extra });

describe("mejorVersion", () => {
  it("encuentra el encabezado debajo de las filas de título y metadatos", () => {
    const libro = [
      hoja("Hoja1", [
        ["COMERCIALIZADORA S.A.S."],
        ["Fecha de corte:", "31/12/2025"],
        ["Tipo", "Referencia", "Cantidad", "Valor total"],
        ["MP", "A-1", 3, 300],
      ]),
    ];
    const r = mejorVersion(INV, libro, [version({ id: 1 })]);
    expect(r).toMatchObject({ hoja: "Hoja1", filaEncabezado: 3 });
    expect(r?.coincidencia.porcentaje).toBe(100);
  });

  it("no busca en hojas ocultas salvo que el usuario la elija", () => {
    const libro = [
      hoja("Resumen", [["Cliente", "Total"], ["X", 1]]),
      hoja("Auxiliar", [["Tipo", "Referencia", "Cantidad", "Valor total"]], { oculta: true }),
    ];
    expect(mejorVersion(INV, libro, [version({ id: 1 })])?.coincidencia.elegible).toBe(false);
    expect(mejorVersion(INV, libro, [version({ id: 1 })], { hojaElegida: "Auxiliar" })).toMatchObject({ hoja: "Auxiliar", filaEncabezado: 1 });
  });

  it("en empate prefiere la aprobada y luego la versión más nueva", () => {
    const libro = [hoja("Inventario", [["Tipo", "Referencia", "Cantidad", "Valor total"]])];
    const pendienteNueva = version({ id: 2, version: 3, estado: "pendiente", clienteOrigenId: 5 });
    const aprobadaVieja = version({ id: 1, version: 1 });
    const aprobadaNueva = version({ id: 3, version: 2 });
    expect(mejorVersion(INV, libro, [pendienteNueva, aprobadaVieja])?.version.id).toBe(1);
    expect(mejorVersion(INV, libro, [aprobadaVieja, aprobadaNueva])?.version.id).toBe(3);
  });

  it("devuelve la mejor aunque no alcance el umbral, para explicar la parada", () => {
    const libro = [hoja("Hoja1", [["Nit", "Nombre", "Saldo"]])];
    const r = mejorVersion(INV, libro, [version({ id: 1 })]);
    expect(r?.coincidencia.elegible).toBe(false);
    expect(r?.coincidencia.faltantesRequeridos).toEqual(["Tipo de inventario", "Valor total"]);
  });

  it("una versión que sirve gana a otra con más % a la que le falta una columna obligatoria", () => {
    const extras = ["Bodega", "Lote", "Ubicación", "Marca", "Línea", "Grupo", "Color", "Talla", "Unidad", "Proveedor", "Estado", "Fecha"];
    // v1: el archivo trae todo menos «Valor total» → 90 % (18 de 20) pero no elegible.
    const sinTotal = version({
      id: 1,
      version: 1,
      encabezado: ["Tipo", "Referencia", "Cantidad", ...extras, "Valor total"],
      spec: { hoja: "Inventario", filaEncabezado: 1, primeraFilaDatos: 2, columnas: columnas({ tipo: 1, referencia: 2, cantidad: 3, valorTotal: 16 }) },
    });
    // v2: lee «Costo» como valor y el archivo lo trae → 86 % (6 de 7), elegible.
    const conCosto = version({
      id: 2,
      version: 2,
      encabezado: ["Tipo", "Referencia", "Costo", "Serie"],
      spec: { hoja: "Inventario", filaEncabezado: 1, primeraFilaDatos: 2, columnas: columnas({ tipo: 1, referencia: 2, valorTotal: 3 }) },
    });
    const libro = [hoja("Inventario", [["Tipo", "Referencia", "Cantidad", ...extras, "Costo"]])];
    expect(mejorVersion(INV, libro, [sinTotal])?.coincidencia).toMatchObject({ porcentaje: 90, elegible: false });
    const r = mejorVersion(INV, libro, [sinTotal, conCosto]);
    expect(r?.version.id).toBe(2);
    expect(r?.coincidencia).toMatchObject({ porcentaje: 86, elegible: true });
  });

  it("sin versiones no hay candidata", () => {
    expect(mejorVersion(INV, [hoja("H", [["Tipo", "Valor total"]])], [])).toBeNull();
  });
});

describe("mejorVersion · Cartera con un formato por edades y otro por documento", () => {
  const CAR = descriptorModulo("CAR")!;
  const columnasCar = (mapa: Record<string, number>) => Object.fromEntries(CAR.columnas.map((rol) => [rol.nombre, mapa[rol.nombre] ?? 0]));
  const edades = (desde: number) => [
    { columna: desde, etiqueta: "Corriente", clase: "corriente" as const },
    { columna: desde + 1, etiqueta: "De 1 a 30", clase: "vencido" as const },
    { columna: desde + 2, etiqueta: "De 31 a 60", clase: "vencido" as const },
  ];
  const ENC_EDADES = ["NIT", "Nombre", "Corriente", "De 1 a 30", "De 31 a 60", "Total"];
  const ENC_DOCUMENTO = ["NIT", "Nombre", "Documento", "Fecha", "Vencimiento", "Corriente", "De 1 a 30", "De 31 a 60", "Total"];
  const porEdades: VersionCandidata = {
    id: 20, version: 2, estado: "aprobada", clienteOrigenId: null, hoja: "Cartera", filaEncabezado: 1, primeraFilaDatos: 2,
    encabezado: ENC_EDADES,
    spec: {
      hoja: "Cartera", filaEncabezado: 1, primeraFilaDatos: 2, tipoFormato: "edades",
      columnas: columnasCar({ nit: 1, nombre: 2, total: 6 }), familias: { edades: edades(3) },
    },
  };
  const porDocumento: VersionCandidata = {
    id: 10, version: 1, estado: "aprobada", clienteOrigenId: null, hoja: "Cartera", filaEncabezado: 1, primeraFilaDatos: 2,
    encabezado: ENC_DOCUMENTO,
    spec: {
      hoja: "Cartera", filaEncabezado: 1, primeraFilaDatos: 2, tipoFormato: "documento_edades",
      columnas: columnasCar({ nit: 1, nombre: 2, documento: 3, fecha: 4, vencimiento: 5, total: 9 }), familias: { edades: edades(6) },
    },
  };

  it("un archivo por documento se lee con la versión por documento aunque la de edades sea más nueva", () => {
    const libro = [hoja("Cartera", [ENC_DOCUMENTO, ["900", "ACME", "F-1", "2025-11-01", "2025-12-01", 0, 10, 0, 10]])];
    // Las dos coinciden al 100 %: los rótulos del formato por edades están todos en el detallado.
    expect(mejorVersion(CAR, libro, [porEdades])?.coincidencia).toMatchObject({ porcentaje: 100, elegible: true });
    expect(mejorVersion(CAR, libro, [porEdades, porDocumento])?.version.id).toBe(10);
    expect(mejorVersion(CAR, libro, [porDocumento, porEdades])?.version.id).toBe(10);
  });

  it("un archivo por edades no se lee con la versión por documento", () => {
    const libro = [hoja("Cartera", [ENC_EDADES, ["900", "ACME", 0, 10, 0, 10]])];
    const soloDocumento = mejorVersion(CAR, libro, [porDocumento]);
    expect(soloDocumento?.coincidencia.elegible).toBe(false);
    expect(soloDocumento?.coincidencia.faltantesRequeridos).toContain("Documento / factura");
    expect(mejorVersion(CAR, libro, [porDocumento, porEdades])?.version.id).toBe(20);
  });
});

describe("versionesAplicables", () => {
  it("las pendientes solo sirven al cliente del que salieron", () => {
    const todas = [
      { id: 1, estado: "aprobada", clienteOrigenId: null },
      { id: 2, estado: "pendiente", clienteOrigenId: 7 },
      { id: 3, estado: "pendiente", clienteOrigenId: null },
      { id: 4, estado: "inactiva", clienteOrigenId: 7 },
    ];
    expect(versionesAplicables(todas, 7).map((v) => v.id)).toEqual([1, 2]);
    expect(versionesAplicables(todas, 8).map((v) => v.id)).toEqual([1]);
  });
});
