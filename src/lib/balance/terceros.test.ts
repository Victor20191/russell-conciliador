import { describe, it, expect } from "vitest";
import { esFilaTercero, esFilaGenericoTercero, esBalancePorTercero, colapsarTerceros } from "./terceros";
import { construirVistaBorrador } from "./borrador-vm";
import type { FilaBorrador } from "./borrador";

function fila(filaNum: number, codigo: string, nombre: string, saldoFinal: number, tipo: FilaBorrador["tipoFila"], extra: Partial<FilaBorrador> = {}): FilaBorrador {
  return { filaNum, codigo, codigoCrudo: codigo, nombre, nivel: codigo.length || null, tipoFila: tipo, saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal, ...extra };
}
// Tercero: movimiento cuyo nombre === código (NIT/cédula).
const tercero = (fn: number, nit: string, saldo: number) => fila(fn, nit, nit, saldo, "movimiento");

describe("esFilaTercero", () => {
  it("detecta un movimiento cuyo nombre es su propio código (NIT/cédula) — forma limpia", () => {
    expect(esFilaTercero({ tipoFila: "movimiento", codigo: "901427659", nombre: "901427659", codigoCrudo: "901427659 MELONN S.A.S" })).toBe(true);
    expect(esFilaTercero({ tipoFila: "movimiento", codigo: "22586894", nombre: "22586894", codigoCrudo: "22586894 FLOREZ" })).toBe(true); // cédula 8 díg
  });
  it("detecta el tercero PEGADO (ID junto al nombre) por el crudo — NIT y RFC", () => {
    // NIT colombiano pegado con nombre que trae dígitos → código no numérico.
    expect(esFilaTercero({ tipoFila: "total", codigo: "", nombre: "901114801D2", codigoCrudo: "901114801 D2 WORK SAS" })).toBe(true);
    // RFC mexicano (empieza por letras): empresa y persona.
    expect(esFilaTercero({ tipoFila: "total", codigo: "", nombre: "AME880912189", codigoCrudo: "AME880912189 AEROMEXICO" })).toBe(true);
    expect(esFilaTercero({ tipoFila: "movimiento", codigo: "", nombre: "AAQA9401125U2Adriá", codigoCrudo: "AAQA9401125U2 Adrián Ayala Quintana" })).toBe(true);
  });
  it("NO marca cuentas reales, rótulos de sección (sin dígitos) ni agrupadoras", () => {
    expect(esFilaTercero({ tipoFila: "movimiento", codigo: "11051005", nombre: "CAJA MENOR ENVIGADO", codigoCrudo: "11051005" })).toBe(false);
    expect(esFilaTercero({ tipoFila: "movimiento", codigo: "22359501", nombre: "OTRAS CUENTAS POR PAGAR", codigoCrudo: "22359501" })).toBe(false);
    expect(esFilaTercero({ tipoFila: "agrupadora", codigo: "901427659", nombre: "901427659", codigoCrudo: "901427659" })).toBe(false);
    expect(esFilaTercero({ tipoFila: "total", codigo: "", nombre: "Total general", codigoCrudo: "Total general" })).toBe(false);
    // Rótulo de sección: crudo sin dígitos en el ID → no es un tercero.
    expect(esFilaTercero({ tipoFila: "movimiento", codigo: "", nombre: "NOMINASNOMINAS", codigoCrudo: "NOMINAS NOMINAS" })).toBe(false);
  });
});

describe("esFilaGenericoTercero", () => {
  it("detecta el placeholder «Generico Genérico» (con y sin acento), no una cuenta ni agrupadora", () => {
    expect(esFilaGenericoTercero({ tipoFila: "total", codigoCrudo: "Generico Genérico" })).toBe(true);
    expect(esFilaGenericoTercero({ tipoFila: "movimiento", codigoCrudo: "Generico Generico" })).toBe(true);
    expect(esFilaGenericoTercero({ tipoFila: "agrupadora", codigoCrudo: "Generico Genérico" })).toBe(false);
    expect(esFilaGenericoTercero({ tipoFila: "movimiento", codigoCrudo: "52201001" })).toBe(false); // cuenta real
    expect(esFilaGenericoTercero({ tipoFila: "total", codigoCrudo: "NOMINAS NOMINAS" })).toBe(false);
  });
});

describe("colapsarTerceros con el tercero genérico", () => {
  it("quita también las filas «Generico Genérico» (movimiento y total), deja la cuenta", () => {
    const filas: FilaBorrador[] = [
      fila(1, "5220", "ARRENDAMIENTOS", 100, "agrupadora"),
      { ...fila(2, "", "GenericoGené", 60, "movimiento"), codigoCrudo: "Generico Genérico" },
      { ...fila(3, "", "GenericoGené", 0, "total"), codigoCrudo: "Generico Genérico" },
      tercero(4, "901427659", 40),
    ];
    expect(colapsarTerceros(filas).map((f) => f.codigoCrudo)).toEqual(["5220"]);
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
