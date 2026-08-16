import { describe, it, expect } from "vitest";
import { coincideFiltroNumerico, filtrarFilasDetalleModulo, hayFiltrosDetalleModulo, type ColumnaFiltro } from "./filtros-detalle-modulo";

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

  it("coincideFiltroNumerico: vacío pasa, null no", () => {
    expect(coincideFiltroNumerico(5, "")).toBe(true);
    expect(coincideFiltroNumerico(null, ">1")).toBe(false);
  });
});
