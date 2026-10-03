import { describe, expect, it } from "vitest";
import { coincideFilaConsolidado, filtrarConsolidado, hayFiltrosConsolidado, type FilaConsolidadoFiltrable } from "./filtros-consolidado";

const fila = (
  clasificador: string,
  descripcion: string | null,
  filas: number,
  total: number,
  cuentas: { codigo: string; nombre?: string | null }[] = [],
  agrupador: string | null = null,
): FilaConsolidadoFiltrable => ({ clasificador, descripcion, agrupador, filas, total, cuentas });

const CONSOLIDADO = [
  fila("1", "SUELDO", 289, 4_423_061_011, [{ codigo: "510506", nombre: "Sueldos" }]),
  fila("10", "PROVISION CESANTIAS", 484, 0, [{ codigo: "510530", nombre: "Cesantías" }]),
  fila("11", "PROVISION VACACIONES", 534, 17_129_450, [{ codigo: "510539", nombre: "Vacaciones" }], "MOD"),
  fila("0", "Caja Compensación Familiar", 3_358, -32_907_100, []),
];

const visibles = (filtros: Parameters<typeof filtrarConsolidado>[1]) =>
  filtrarConsolidado(CONSOLIDADO, filtros).map((f) => f.clasificador);

describe("filtros del Consolidado de un cargue", () => {
  it("sin filtros no recorta nada", () => {
    expect(hayFiltrosConsolidado({})).toBe(false);
    expect(hayFiltrosConsolidado({ clasificador: "  " })).toBe(false);
    expect(visibles({})).toEqual(["1", "10", "11", "0"]);
  });

  it("el filtro del clasificador busca en el código, en el nombre y en el centro de costo", () => {
    expect(visibles({ clasificador: "cesantias" })).toEqual(["10"]);
    expect(visibles({ clasificador: "PROVISION" })).toEqual(["10", "11"]);
    expect(visibles({ clasificador: "compensacion" })).toEqual(["0"]);
    expect(visibles({ clasificador: "11" })).toEqual(["11"]);
    expect(visibles({ clasificador: "mod" })).toEqual(["11"]);
  });

  it("el filtro de cuentas busca por código o nombre, y «sin cuenta» encuentra las vacías", () => {
    expect(visibles({ cuentas: "510506" })).toEqual(["1"]);
    expect(visibles({ cuentas: "vacaciones" })).toEqual(["11"]);
    expect(visibles({ cuentas: "5105" })).toEqual(["1", "10", "11"]);
    expect(visibles({ cuentas: "sin cuenta" })).toEqual(["0"]);
  });

  it("filas y total admiten los operadores del detalle", () => {
    expect(visibles({ filas: "> 500" })).toEqual(["11", "0"]);
    expect(visibles({ total: "0" })).toEqual(["10"]);
    expect(visibles({ total: "< 0" })).toEqual(["0"]);
    expect(visibles({ total: ">= 17.129.450" })).toEqual(["1", "11"]);
  });

  it("los filtros se combinan con Y", () => {
    expect(visibles({ clasificador: "provision", total: "> 0" })).toEqual(["11"]);
    expect(visibles({ clasificador: "provision", cuentas: "sueldos" })).toEqual([]);
    expect(coincideFilaConsolidado(CONSOLIDADO[0], { clasificador: "sueldo", cuentas: "510506", filas: "289" })).toBe(true);
  });
});
