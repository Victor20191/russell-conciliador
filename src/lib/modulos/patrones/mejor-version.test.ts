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

  it("sin versiones no hay candidata", () => {
    expect(mejorVersion(INV, [hoja("H", [["Tipo", "Valor total"]])], [])).toBeNull();
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
