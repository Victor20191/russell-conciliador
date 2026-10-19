import { describe, expect, it } from "vitest";
import {
  agregarSaldosFinales,
  compararSaldosFinales,
  diferenciasDesde,
  esDiferenciaMaterialCorte,
  resumenDiferenciasCorte,
  snapshotComparacion,
  SnapshotComparacionCorteSchema,
  type FilaSaldoFinal,
} from "./comparacion-corte";

const f = (cuenta8: string, saldoFinal: number, nombreCuenta = `Cuenta ${cuenta8}`): FilaSaldoFinal => ({ cuenta8, nombreCuenta, saldoFinal });

describe("compararSaldosFinales", () => {
  it("coincide cuando los saldos finales son iguales aunque cambien los movimientos", () => {
    // El anual y el mensual traen saldo inicial y movimientos distintos: solo se mira el saldo final.
    const r = compararSaldosFinales([f("110505", 1000), f("130505", -250.5)], [f("110505", 1000), f("130505", -250.5)]);
    expect(r).toEqual({ coincide: true, cuentasComparadas: 2, diferencias: [] });
  });

  it("detecta un centavo de diferencia", () => {
    const r = compararSaldosFinales([f("110505", 1000.01)], [f("110505", 1000)]);
    expect(r.coincide).toBe(false);
    expect(r.diferencias).toEqual([{ cuenta8: "110505", nombre: "Cuenta 110505", saldoA: 1000.01, saldoB: 1000, diferencia: 0.01, estado: "descuadre" }]);
  });

  it("una cuenta ausente vale cero: coincide si el otro la trae en cero", () => {
    expect(compararSaldosFinales([f("110505", 100), f("530520", 0)], [f("110505", 100)]).coincide).toBe(true);
  });

  it("marca las cuentas que solo trae un balance", () => {
    const r = compararSaldosFinales([f("110505", 100), f("220505", -40)], [f("110505", 100), f("233525", 12)]);
    expect(r.diferencias.map((d) => [d.cuenta8, d.estado, d.diferencia])).toEqual([
      ["220505", "solo_a", -40],
      ["233525", "solo_b", -12],
    ]);
  });

  it("suma las filas repetidas de la misma cuenta antes de comparar", () => {
    expect(compararSaldosFinales([f("110505", 60), f("110505", 40)], [f("110505", 100)]).coincide).toBe(true);
    expect(agregarSaldosFinales([f("1", 0.1), f("1", 0.2)]).get("1")!.saldoFinal).toBe(0.3);
  });

  it("compara por código completo: una auxiliar larga no se confunde con su grupo", () => {
    const r = compararSaldosFinales([f("1305050101", 10)], [f("130505", 10)]);
    expect(r.diferencias.map((d) => d.cuenta8)).toEqual(["130505", "1305050101"]);
  });
});

describe("snapshot y orientación", () => {
  it("el snapshot valida contra su esquema", () => {
    const snap = snapshotComparacion(compararSaldosFinales([f("1", 1)], [f("1", 2)]));
    expect(SnapshotComparacionCorteSchema.parse(snap)).toEqual(snap);
  });

  it("diferenciasDesde invierte los lados cuando este balance es el B", () => {
    const { diferencias } = compararSaldosFinales([f("1", 10), f("2", 5)], [f("1", 4)]);
    expect(diferenciasDesde(diferencias, false)).toEqual([
      { cuenta8: "1", nombre: "Cuenta 1", saldoA: 4, saldoB: 10, diferencia: -6, estado: "descuadre" },
      { cuenta8: "2", nombre: "Cuenta 2", saldoA: 0, saldoB: 5, diferencia: -5, estado: "solo_b" },
    ]);
    expect(diferenciasDesde(diferencias, true)).toEqual(diferencias);
  });
});

describe("umbral «Diferencia entre balances del mismo corte»", () => {
  it("vuelve inconsistente desde el monto, inclusive y con cualquier signo", () => {
    expect(esDiferenciaMaterialCorte(-8.6, 1_000)).toBe(false);
    expect(esDiferenciaMaterialCorte(999.99, 1_000)).toBe(false);
    expect(esDiferenciaMaterialCorte(1_000, 1_000)).toBe(true);
    expect(esDiferenciaMaterialCorte(-1_000, 1_000)).toBe(true);
    // Con el umbral en cero cuenta cualquier centavo; cero nunca cuenta.
    expect(esDiferenciaMaterialCorte(0.01, 0)).toBe(true);
    expect(esDiferenciaMaterialCorte(0, 0)).toBe(false);
  });

  it("resume cuántas cuentas impiden cerrar y cuántas solo se muestran", () => {
    const r = compararSaldosFinales([f("53959501", 132_390.9), f("110505", 5_000)], [f("53959501", 132_399.5), f("110505", 3_000)]);
    expect(r.coincide).toBe(false);
    expect(resumenDiferenciasCorte(r.diferencias, 1_000)).toEqual({ inconsistente: true, materiales: 1, menores: 1 });
    expect(resumenDiferenciasCorte(r.diferencias.filter((d) => d.cuenta8 === "53959501"), 1_000)).toEqual({ inconsistente: false, materiales: 0, menores: 1 });
    expect(resumenDiferenciasCorte([], 1_000)).toEqual({ inconsistente: false, materiales: 0, menores: 0 });
  });
});
