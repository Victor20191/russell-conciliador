import { describe, expect, it } from "vitest";
import { totalesPorTercero } from "./total-tercero";

const doc = (nit: string | null, nombre: string | null, extra: Record<string, unknown> = {}) => ({ datos: { nit, nombre, ...extra } });
const subtotal = (indice: number, indices: number[]) => ({ indice, clase: "subtotal" as const, bloque: { indices } });

describe("totalesPorTercero", () => {
  it("toma el subtotal de un bloque de un solo tercero y completa su identificación", () => {
    const filas = [doc("900123456", "ACME"), doc("900123456", "ACME"), doc(null, "Total ACME")];
    expect([...totalesPorTercero(filas, [subtotal(2, [0, 1])])]).toEqual([[2, { nit: "900123456", dv: undefined, sucursal: undefined }]]);
  });

  it("un bloque con varios terceros no es el total de un cliente", () => {
    const filas = [doc("900123456", "ACME"), doc("800111222", "BETA"), doc(null, "Total cuenta 130505")];
    expect(totalesPorTercero(filas, [subtotal(2, [0, 1])]).size).toBe(0);
  });

  it("no duplica el saldo que el archivo ya declara por otra vía", () => {
    const filas = [
      { ...doc("900123456", "ACME"), saldoDeclarado: 150 },
      doc("900123456", "ACME"),
      doc(null, "Total ACME"),
    ];
    expect(totalesPorTercero(filas, [subtotal(2, [0, 1])]).size).toBe(0);
  });

  it("descarta la fila con otra identificación o con un rótulo en la columna del identificador", () => {
    const filas = [doc("900123456", "ACME"), doc("900123456", "ACME"), doc("800111222", "Total"), doc("TOTAL", null)];
    expect(totalesPorTercero(filas, [subtotal(2, [0, 1]), subtotal(3, [0, 1])]).size).toBe(0);
  });

  it("un tercero sin NIT solo se toma si el nombre de la fila está libre", () => {
    const filas = [doc(null, "CONSUMIDOR FINAL"), doc(null, "CONSUMIDOR FINAL"), doc(null, "Total"), doc(null, null)];
    const r = totalesPorTercero(filas, [subtotal(2, [0, 1]), subtotal(3, [0, 1])]);
    expect([...r.keys()]).toEqual([3]);
    expect(r.get(3)?.nombre).toBe("CONSUMIDOR FINAL");
  });

  it("ignora el gran total, la cola de control y los subtotales sin bloque", () => {
    const filas = [doc("900123456", "ACME"), doc(null, "Total")];
    expect(totalesPorTercero(filas, [
      { indice: 1, clase: "gran_total", bloque: null },
      { indice: 1, clase: "cola_control", bloque: { indices: [0] } },
      { indice: 1, clase: "subtotal", bloque: null },
    ]).size).toBe(0);
  });
});
