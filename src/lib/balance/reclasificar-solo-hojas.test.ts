import { describe, it, expect } from "vitest";
import { reclasificarSoloHojas, construirArbolBorrador, type FilaBorrador } from "@/lib/balance/borrador";

// Constructor mínimo de filas del borrador (por orden de `filaNum`).
let seq = 0;
function fila(codigo: string, tipoFila: FilaBorrador["tipoFila"], saldoFinal: number): FilaBorrador {
  seq += 1;
  return { filaNum: seq, codigo, codigoCrudo: codigo, nombre: codigo, nivel: codigo.length, tipoFila, saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal };
}
const tipoDe = (filas: FilaBorrador[], codigo: string) => filas.find((f) => f.codigo === codigo)!.tipoFila;

describe("reclasificarSoloHojas", () => {
  it("promueve subtotales SIESA (subcuenta + auxiliares, sin prefijo común) y el árbol cuadra", () => {
    seq = 0;
    // Patrón LASALLISTA: 110501 CAJA GENERAL (subtotal) con auxiliares 1105·05··· que
    // NO comparten prefijo con 110501, y 110502/110503 igual. 1105 ya es agrupadora.
    const filas: FilaBorrador[] = [
      fila("1105", "agrupadora", 6445960.4),
      fila("110501", "movimiento", 3938700),
      fila("11050501", "movimiento", 600500),
      fila("11050505", "movimiento", 100000),
      fila("11050510", "movimiento", 3238200),
      fila("110502", "movimiento", 2311107),
      fila("11051005", "movimiento", 988734),
      fila("11051015", "movimiento", 1322373),
      fila("110503", "movimiento", 196153.4),
      fila("11051501", "movimiento", 153514.4),
      fila("11051510", "movimiento", 42639),
    ];

    const cambiadas = reclasificarSoloHojas(filas);
    // Los 3 subtotales de 6 díg se vuelven agrupadora; los auxiliares de 8 díg siguen hoja.
    expect(cambiadas.map((f) => f.codigo).sort()).toEqual(["110501", "110502", "110503"]);
    expect(tipoDe(filas, "110501")).toBe("agrupadora");
    expect(tipoDe(filas, "110503")).toBe("agrupadora");
    expect(tipoDe(filas, "11050501")).toBe("movimiento");
    expect(tipoDe(filas, "11051510")).toBe("movimiento");

    // El árbol anida los auxiliares por ORDEN bajo su subtotal y 1105 cuadra (Δ=0).
    const arbol = construirArbolBorrador(filas);
    const n1105 = arbol.find((n) => n.codigo === "1105")!;
    expect(n1105.hijos.map((h) => h.codigo)).toEqual(["110501", "110502", "110503"]);
    expect(n1105.descuadre).toBe(0);
    const n110501 = n1105.hijos.find((h) => h.codigo === "110501")!;
    expect(n110501.hijos.map((h) => h.codigo)).toEqual(["11050501", "11050505", "11050510"]);
    expect(n110501.descuadre).toBe(0);
  });

  it("promueve TODOS los niveles no-hoja (multi-nivel 6→8→10)", () => {
    seq = 0;
    const filas: FilaBorrador[] = [
      fila("110505", "movimiento", 300),
      fila("11050501", "movimiento", 300),
      fila("1105050101", "movimiento", 100),
      fila("1105050102", "movimiento", 200),
      fila("110510", "movimiento", 50), // hoja: siguiente es más corto
      fila("1110", "agrupadora", 0),
    ];
    reclasificarSoloHojas(filas);
    expect(tipoDe(filas, "110505")).toBe("agrupadora"); // tiene 11050501 debajo
    expect(tipoDe(filas, "11050501")).toBe("agrupadora"); // tiene 10 díg debajo
    expect(tipoDe(filas, "1105050101")).toBe("movimiento"); // hoja
    expect(tipoDe(filas, "1105050102")).toBe("movimiento"); // hoja (siguiente más corto)
    expect(tipoDe(filas, "110510")).toBe("movimiento"); // hoja
  });

  it("no toca hojas planas del mismo nivel (no promueve nada)", () => {
    seq = 0;
    const filas: FilaBorrador[] = [
      fila("11050501", "movimiento", 100),
      fila("11050505", "movimiento", 200),
      fila("11050510", "movimiento", 300),
    ];
    const cambiadas = reclasificarSoloHojas(filas);
    expect(cambiadas).toHaveLength(0);
    expect(filas.every((f) => f.tipoFila === "movimiento")).toBe(true);
  });
});
