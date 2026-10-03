import { describe, it, expect } from "vitest";
import { coincideFiltroNumerico, coincideGrupoDetalle, filtrarFilasDetalleModulo, hayFiltrosDetalleModulo, type ColumnaFiltro } from "./filtros-detalle-modulo";

const COLS: ColumnaFiltro[] = [
  { nombre: "tipo", tipo: "texto" },
  { nombre: "referencia", tipo: "texto" },
  { nombre: "descripcion", tipo: "texto" },
  { nombre: "cantidad", tipo: "numero" },
  { nombre: "valorTotal", tipo: "moneda" },
];
const fila = (tipo: string, referencia: string, descripcion: string, cantidad: number, valorTotal: number) => ({
  datos: { tipo, referencia, descripcion, cantidad, valorTotal },
});
const DATA = [
  fila("INVREPUEST", "532481", "LIMPIADOR DE CONTACTOS", 4, 252000),
  fila("INVREPUEST", "532237", "HEMBRA CHEVRON", 18, 2034000),
  fila("MATERIA", "0000126", "ADHESIVO PARA CAJA", -3, 596250),
];

describe("filtros de detalle de módulo", () => {
  it("hayFiltros detecta filtros activos", () => {
    expect(hayFiltrosDetalleModulo({ tipo: "" })).toBe(false);
    expect(hayFiltrosDetalleModulo({ tipo: "inv" })).toBe(true);
  });

  it("filtra por texto (subcadena, sin acentos ni mayúsculas)", () => {
    const r = filtrarFilasDetalleModulo(DATA, COLS, { descripcion: "chevron" });
    expect(r).toHaveLength(1);
    expect(r[0].datos.referencia).toBe("532237");
  });

  it("filtra por tipo de inventario", () => {
    expect(filtrarFilasDetalleModulo(DATA, COLS, { tipo: "materia" })).toHaveLength(1);
    expect(filtrarFilasDetalleModulo(DATA, COLS, { tipo: "invrepuest" })).toHaveLength(2);
  });

  it("numérico admite operadores >, >=, <, <=, =", () => {
    expect(filtrarFilasDetalleModulo(DATA, COLS, { cantidad: ">10" })).toHaveLength(1);
    expect(filtrarFilasDetalleModulo(DATA, COLS, { cantidad: "<0" })).toHaveLength(1); // el -3
    expect(filtrarFilasDetalleModulo(DATA, COLS, { valorTotal: ">=596.250" })).toHaveLength(2);
    expect(filtrarFilasDetalleModulo(DATA, COLS, { cantidad: "4" })).toHaveLength(1);
  });

  it("combina filtros (AND) entre columnas", () => {
    const r = filtrarFilasDetalleModulo(DATA, COLS, { tipo: "invrepuest", cantidad: ">10" });
    expect(r).toHaveLength(1);
    expect(r[0].datos.referencia).toBe("532237");
  });

  it("puede filtrar el valor efectivo que pinta un borrador reclasificado", () => {
    const borrador: Array<{
      clasificador: string;
      datos: Record<string, string | number | null>;
    }> = [{ clasificador: "MATERIA PRIMA", datos: { tipo: "ORIGINAL" } }];
    const resultado = filtrarFilasDetalleModulo(
      borrador,
      [{ nombre: "tipo", tipo: "texto" }],
      { tipo: "materia" },
      (fila, columna) => columna.nombre === "tipo" ? fila.clasificador : fila.datos[columna.nombre],
    );

    expect(resultado).toEqual(borrador);
  });

  it("coincideFiltroNumerico: vacío pasa, null no", () => {
    expect(coincideFiltroNumerico(5, "")).toBe(true);
    expect(coincideFiltroNumerico(null, ">1")).toBe(false);
  });
});

describe("coincideGrupoDetalle: qué grupos siguen a la vista con filtros puestos", () => {
  const ROLES = { clasificador: "codigo", descripcion: "concepto" };
  const grupos = [
    { clasificador: "185", descripcion: "CESANTÍAS POR RETIRO" },
    { clasificador: "186", descripcion: "INTERESES DE CESANTÍAS POR RETIRO" },
    { clasificador: "1", descripcion: "SUELDO" },
    { clasificador: "9995", descripcion: "NETO NÓMINA" },
  ];
  const visibles = (filtros: Record<string, string>) =>
    grupos.filter((g) => coincideGrupoDetalle(g, ROLES, filtros)).map((g) => g.clasificador);

  it("el filtro del nombre encuentra sin tildes ni mayúsculas", () => {
    expect(visibles({ concepto: "cesantias" })).toEqual(["185", "186"]);
    expect(visibles({ concepto: "NÓMINA" })).toEqual(["9995"]);
  });

  it("el filtro del código recorta por el clasificador", () => {
    expect(visibles({ codigo: "18" })).toEqual(["185", "186"]);
    expect(visibles({ codigo: "9995", concepto: "neto" })).toEqual(["9995"]);
    expect(visibles({ codigo: "9995", concepto: "sueldo" })).toEqual([]);
  });

  it("los filtros de otras columnas no esconden grupos: deciden dentro de cada uno", () => {
    expect(visibles({ empleado: "perez", valor: "> 100" })).toEqual(["185", "186", "1", "9995"]);
    expect(visibles({})).toEqual(["185", "186", "1", "9995"]);
  });

  it("sin nombre propio manda el clasificador, y un módulo sin esa columna no filtra por ella", () => {
    const sinNombre = { clasificador: "MERCANCÍA" };
    expect(coincideGrupoDetalle(sinNombre, ROLES, { concepto: "mercancia" })).toBe(true);
    expect(coincideGrupoDetalle(sinNombre, ROLES, { concepto: "otra" })).toBe(false);
    expect(coincideGrupoDetalle(sinNombre, { clasificador: "tipo" }, { concepto: "lo que sea" })).toBe(true);
  });
});
