import { describe, it, expect } from "vitest";
import { contarFormasCodigo, contarCodigosRepetidos, contarDescuadres } from "./diagnostico-lectura";
import { construirVistaBorrador } from "./borrador-vm";
import type { FilaBorrador, NodoBorrador } from "./borrador";

function fila(filaNum: number, codigo: string, nombre: string, saldoFinal: number, tipo: FilaBorrador["tipoFila"], extra: Partial<FilaBorrador> = {}): FilaBorrador {
  return { filaNum, codigo, codigoCrudo: codigo, nombre, nivel: codigo.length || null, tipoFila: tipo, saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal, ...extra };
}

describe("contarFormasCodigo", () => {
  it("clasifica dígitos puros, con guiones y con letras", () => {
    const r = contarFormasCodigo([
      { codigoCrudo: "11050504" },
      { codigoCrudo: "1105-05-04" },
      { codigoCrudo: "901751552 CLEAN LAB SAS" },
      { codigoCrudo: "  " },
    ]);
    expect(r).toEqual({ digitos: 1, guiones: 1, letras: 1 });
  });
});

describe("contarCodigosRepetidos", () => {
  it("cuenta los códigos numéricos que aparecen en más de una fila", () => {
    expect(contarCodigosRepetidos([
      { codigo: "1105" }, { codigo: "1105" }, // repetido → 1
      { codigo: "110505" }, // único
      { codigo: "" }, { codigo: "" }, // no numérico → no cuenta
    ])).toBe(1);
  });
});

describe("contarDescuadres", () => {
  it("cuenta nodos con descuadre ≠ 0 y ≠ null en todo el árbol", () => {
    const arbol: NodoBorrador[] = [
      { ...fila(1, "1", "A", 0, "agrupadora"), descuadre: 10, subtotalDuplicado: false, hijos: [
        { ...fila(2, "11", "B", 0, "agrupadora"), descuadre: 0, subtotalDuplicado: false, hijos: [] },
        { ...fila(3, "12", "C", 0, "agrupadora"), descuadre: -5, subtotalDuplicado: false, hijos: [] },
      ] },
      { ...fila(4, "2", "D", 0, "movimiento"), descuadre: null, subtotalDuplicado: false, hijos: [] },
    ];
    expect(contarDescuadres(arbol)).toBe(2);
  });
});

describe("construirVistaBorrador → diagnostico", () => {
  it("arma la huella del re-listado con guiones: cuenta las guiones y el balance cuadra", () => {
    const filas: FilaBorrador[] = [
      fila(1, "1", "ACTIVO", 100, "agrupadora"),
      fila(2, "11", "DISPONIBLE", 100, "agrupadora"),
      fila(3, "1105", "CAJA", 100, "agrupadora"),
      fila(4, "110505", "CAJA", 100, "agrupadora"),
      fila(5, "11050501", "CAJA GENERAL", 0, "movimiento"),
      fila(6, "11050504", "DOLARES EN CAJA", 60, "movimiento"),
      fila(7, "11050508", "CAJA ECOMMERCE", 40, "movimiento"),
      { ...fila(8, "1105", "DOLARES EN CAJA", 60, "agrupadora"), codigoCrudo: "1105-05-04" },
      { ...fila(9, "1105", "*SIN NOMBRE*", -30, "movimiento"), codigoCrudo: "1105-05-04" },
    ];
    const { diagnostico: d } = construirVistaBorrador(filas);
    expect(d.relistadoGuiones).toBe(2);
    expect(d.codigoGuiones).toBe(2);
    expect(d.porTercero).toBe(false);
    expect(d.terceros).toBe(0);
    expect(d.cuadrado).toBe(true);
    expect(d.descuadres).toBe(0);
    expect(d.filas).toBe(9);
  });
});
