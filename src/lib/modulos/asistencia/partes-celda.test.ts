import { describe, expect, it } from "vitest";
import { partesDeCelda, rolDeRotulo } from "./partes-celda";

describe("partes de una celda", () => {
  it("separa la celda SIESA por «|» y propone el campo de cada parte por su rótulo", () => {
    const texto = "Ref: PP-004 | Descripción: Pieza mecanizada de prueba | Tipo: Productos en proceso | Cant: 60 | Unit: 12000 | Total: 720000";
    const partes = partesDeCelda(texto);
    expect(partes.map((p) => [p.rotulo, p.valor, p.rolSugerido])).toEqual([
      ["Ref", "PP-004", "referencia"],
      ["Descripción", "Pieza mecanizada de prueba", "descripcion"],
      ["Tipo", "Productos en proceso", "tipo"],
      ["Cant", "60", "cantidad"],
      ["Unit", "12000", "valorUnitario"],
      ["Total", "720000", "valorTotal"],
    ]);
    // El tramo apunta exactamente al valor dentro de la celda.
    for (const p of partes) expect(texto.slice(p.inicio, p.fin)).toBe(p.valor);
  });

  it("separa por rótulos cuando no hay separador y deja sin propuesta lo que no reconoce", () => {
    const partes = partesDeCelda("Ref: A-1 Bodega: Norte Cant: 2");
    expect(partes.map((p) => [p.rotulo, p.valor, p.rolSugerido])).toEqual([["Ref", "A-1", "referencia"], ["Bodega", "Norte", null], ["Cant", "2", "cantidad"]]);
  });

  it("una celda de un solo dato es una sola parte; sin rótulo no se adivina el campo", () => {
    expect(partesDeCelda("Cantidad: 120")).toEqual([{ inicio: 10, fin: 13, valor: "120", rotulo: "Cantidad", rolSugerido: "cantidad", marcaSugerida: null }]);
    expect(partesDeCelda("A-01|MP|2").map((p) => [p.valor, p.rolSugerido])).toEqual([["A-01", null], ["MP", null], ["2", null]]);
    expect(partesDeCelda("   ")).toEqual([]);
  });

  it("no propone dos veces el mismo campo y distingue unitario de total", () => {
    expect(rolDeRotulo("Costo prom. unit. (ins)")).toBe("valorUnitario");
    expect(rolDeRotulo("Valor total")).toBe("valorTotal");
    expect(partesDeCelda("Total: 1 | Total: 2").map((p) => p.rolSugerido)).toEqual(["valorTotal", null]);
  });

  it("un total del archivo o un título de sección no se proponen como campos del producto", () => {
    expect(partesDeCelda("TOTAL GENERAL: 19140500").map((p) => [p.valor, p.rolSugerido, p.marcaSugerida])).toEqual([["19140500", null, "total"]]);
    expect(partesDeCelda("Subtotal Materias primas: 2700000")[0]).toMatchObject({ rolSugerido: null, marcaSugerida: "subtotal" });
    expect(partesDeCelda("TIPO DE INVENTARIO: Materias primas")[0]).toMatchObject({ valor: "Materias primas", rolSugerido: null, marcaSugerida: "seccion" });
    // Dentro de un producto, «Total:» y «Tipo:» siguen siendo campos.
    expect(partesDeCelda("Unit: 2500 | Total: 300000").map((p) => p.rolSugerido)).toEqual(["valorUnitario", "valorTotal"]);
    expect(partesDeCelda("Tipo: MP | Cant: 2").map((p) => p.rolSugerido)).toEqual(["tipo", "cantidad"]);
  });
});
