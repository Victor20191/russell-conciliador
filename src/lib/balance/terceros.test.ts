import { describe, it, expect } from "vitest";
import { esFilaTercero, esBalancePorTercero, colapsarTerceros } from "./terceros";
import { construirVistaBorrador } from "./borrador-vm";
import type { FilaBorrador } from "./borrador";

function fila(filaNum: number, codigo: string, nombre: string, saldoFinal: number, tipo: FilaBorrador["tipoFila"], extra: Partial<FilaBorrador> = {}): FilaBorrador {
  return { filaNum, codigo, codigoCrudo: codigo, nombre, nivel: codigo.length || null, tipoFila: tipo, saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal, ...extra };
}
// Tercero: movimiento cuyo nombre === código (NIT/cédula).
const tercero = (fn: number, nit: string, saldo: number) => fila(fn, nit, nit, saldo, "movimiento");

describe("esFilaTercero", () => {
  it("detecta un movimiento cuyo nombre es su propio código (NIT/cédula)", () => {
    expect(esFilaTercero({ tipoFila: "movimiento", codigo: "901427659", nombre: "901427659" })).toBe(true);
    expect(esFilaTercero({ tipoFila: "movimiento", codigo: "22586894", nombre: "22586894" })).toBe(true); // cédula 8 díg
  });
  it("NO marca una cuenta real (nombre descriptivo) ni una agrupadora ni código vacío", () => {
    expect(esFilaTercero({ tipoFila: "movimiento", codigo: "11051005", nombre: "CAJA MENOR ENVIGADO" })).toBe(false);
    expect(esFilaTercero({ tipoFila: "agrupadora", codigo: "901427659", nombre: "901427659" })).toBe(false);
    expect(esFilaTercero({ tipoFila: "movimiento", codigo: "", nombre: "" })).toBe(false);
  });
});

describe("esBalancePorTercero", () => {
  it("true cuando la mayoría de movimientos son terceros; false en un informe normal", () => {
    const conTercero = [
      fila(1, "1105", "CAJA", 0, "agrupadora"),
      ...Array.from({ length: 25 }, (_, i) => tercero(i + 2, `9014276${i}`, 1)),
    ];
    expect(esBalancePorTercero(conTercero)).toBe(true);
    const normal = Array.from({ length: 25 }, (_, i) => fila(i + 1, `1105050${i}`, `CUENTA ${i}`, 1, "movimiento"));
    expect(esBalancePorTercero(normal)).toBe(false);
  });
});

describe("colapsarTerceros + construirVistaBorrador (balance por tercero)", () => {
  it("colapsarTerceros quita solo las filas de tercero", () => {
    const filas = [fila(1, "110505", "CAJA", 100, "agrupadora"), tercero(2, "901427659", 60), tercero(3, "1015412825", 40)];
    expect(colapsarTerceros(filas).map((f) => f.codigo)).toEqual(["110505"]);
  });

  it("colapsa el detalle de tercero y concilia por CUENTA (la cuenta queda imputable)", () => {
    // 12 cuentas de caja (agrupadora) cada una con 2 terceros que suman su saldo.
    const filas: FilaBorrador[] = [
      fila(1, "1", "ACTIVO", 1200, "agrupadora"),
      fila(2, "11", "DISPONIBLE", 1200, "agrupadora"),
      fila(3, "1105", "CAJA", 1200, "agrupadora"),
    ];
    let fn = 4;
    for (let i = 0; i < 12; i++) {
      const cta = `1105${String(5 + i * 5).padStart(2, "0")}`; // 110505, 110510, … (6 díg)
      filas.push(fila(fn++, cta, `CAJA ${i}`, 100, "agrupadora")); // cuenta = 60 + 40
      filas.push(tercero(fn++, `9014276${i}`, 60));
      filas.push(tercero(fn++, `1015412${i}`, 40));
    }
    // Sin colapsar, los terceros (código NIT) se contarían en clase 9 y romperían todo.
    const vista = construirVistaBorrador(filas);
    expect(vista.porTercero).toBe(true);
    // El árbol NO contiene filas de tercero (se colapsaron).
    const codigos = new Set<string>();
    const rec = (n: { codigo: string; hijos: { codigo: string; hijos: unknown[] }[] }) => { codigos.add(n.codigo); n.hijos.forEach((h) => rec(h as never)); };
    vista.arbol.forEach((r) => rec(r as never));
    expect([...codigos].some((c) => c.startsWith("9014276"))).toBe(false); // ningún NIT
    expect(codigos.has("110505")).toBe(true); // sí las cuentas
    // El Activo calculado = Σ cuentas (12 × 100 = 1200), NO clase 9.
    expect(Math.round(vista.validacion.activo)).toBe(1200);
  });
});
