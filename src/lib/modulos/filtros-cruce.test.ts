import { describe, expect, it } from "vitest";
import { coincideFilaCruce, filtrarFilasCruce, hayFiltrosCruce, type ColumnasCruce } from "./filtros-cruce";

type Fila = { cuenta: string; nombre: string; contable: number; modulo: number; diferencia: number; estado: string };

const COLUMNAS: ColumnasCruce<Fila> = {
  cuenta: { texto: (f) => `${f.cuenta} ${f.nombre}` },
  contable: { numero: (f) => f.contable },
  modulo: { numero: (f) => f.modulo },
  diferencia: { numero: (f) => f.diferencia },
  estado: { texto: (f) => f.estado },
};

const FILAS: Fila[] = [
  { cuenta: "510506", nombre: "Sueldos y salarios", contable: 9_157_302_157, modulo: 9_154_767_210, diferencia: 2_534_947, estado: "Diferencia" },
  { cuenta: "510530", nombre: "Cesantías", contable: 643_750_865, modulo: 857_432_261, diferencia: -213_681_395, estado: "Diferencia" },
  { cuenta: "251010", nombre: "Cesantías consolidadas", contable: 719_704_550, modulo: 845_798_514, diferencia: -126_093_964, estado: "Sin nómina" },
  { cuenta: "520518", nombre: "Comisiones", contable: 388_335_745, modulo: 388_335_745, diferencia: 0, estado: "Cuadra" },
];

const visibles = (filtros: Record<string, string>) => filtrarFilasCruce(FILAS, COLUMNAS, filtros).map((f) => f.cuenta);

describe("filtros de las tablas del cruce", () => {
  it("sin filtros no recorta nada", () => {
    expect(hayFiltrosCruce({})).toBe(false);
    expect(hayFiltrosCruce({ cuenta: "   " })).toBe(false);
    expect(visibles({})).toEqual(["510506", "510530", "251010", "520518"]);
  });

  it("el texto busca en el código y en el nombre, sin tildes", () => {
    expect(visibles({ cuenta: "cesantias" })).toEqual(["510530", "251010"]);
    expect(visibles({ cuenta: "5105" })).toEqual(["510506", "510530"]);
    expect(visibles({ estado: "cuadra" })).toEqual(["520518"]);
  });

  it("el comodín de posición también sirve en estas tablas", () => {
    expect(visibles({ cuenta: "**10" })).toEqual(["251010"]);
  });

  it("las cifras admiten los operadores de siempre y se combinan con Y", () => {
    expect(visibles({ diferencia: "0" })).toEqual(["520518"]);
    expect(visibles({ diferencia: "< 0" })).toEqual(["510530", "251010"]);
    expect(visibles({ contable: "> 700.000.000" })).toEqual(["510506", "251010"]);
    expect(visibles({ contable: "> 700.000.000", estado: "diferencia" })).toEqual(["510506"]);
  });

  it("una columna sin acceso definido no filtra", () => {
    expect(coincideFilaCruce(FILAS[0], COLUMNAS, { marca: "lo que sea" })).toBe(true);
  });
});
