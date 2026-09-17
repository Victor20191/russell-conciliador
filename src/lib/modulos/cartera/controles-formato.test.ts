import { describe, expect, it } from "vitest";
import { controlesFormatoCartera, nivelDeFilas, tipoFormatoDeFilas, type FilaControlFormato } from "./controles-formato";
import { CLAVE_EDADES, CLAVE_SALDO_DECLARADO, CLAVE_SALDO_REPORTADO, CLAVE_SUMA_EDADES } from "./detalle-cartera";

let fila = 0;
const documento = (nit: string, valor: number, extra: Record<string, unknown> = {}): FilaControlFormato => ({
  filaNum: ++fila, valor, imputable: true, nivel: "documento",
  datos: { nit, nombre: `Cliente ${nit}`, documento: `F-${fila}`, ...extra },
});
/** Renglón o «Total» del cliente: no imputa y declara su saldo. */
const totalCliente = (nit: string, saldo: number): FilaControlFormato => ({
  filaNum: ++fila, valor: 0, imputable: false, nivel: "documento",
  datos: { nit, nombre: `Cliente ${nit}`, [CLAVE_SALDO_DECLARADO]: saldo },
});
const conEdades = (total: number, suma: number) => ({ [CLAVE_SALDO_REPORTADO]: total, [CLAVE_SUMA_EDADES]: suma, [CLAVE_EDADES]: { Corriente: suma } });
const formato = (tipo: "documento" | "edades" | "documento_edades", conColumnaTotal = true) => [{ tipo, declarado: true, conColumnaTotal }];

describe("controles por tipo de formato", () => {
  it("por documento: la suma de los documentos de cada cliente contra su total", () => {
    const filas = [
      documento("900123456", 100), documento("900123456", 50), totalCliente("900123456", 150),
      documento("800111222", 70), documento("800111222", 30), totalCliente("800111222", 90),
      documento("700000001", 40),
    ];
    const r = controlesFormatoCartera({ filas, nivelImputable: "documento", formatos: formato("documento"), tipoDeducido: "documento" });
    expect(r.tipos).toEqual(["documento"]);
    expect(r.edadesVsTotal).toBeNull();
    expect(r.documentosVsCliente).toMatchObject({ estado: "descuadre", comparados: 2, sinTotal: 1 });
    expect(r.documentosVsCliente?.diferencias.filas).toEqual([
      expect.objectContaining({ claveTercero: "800111222", declarado: 90, calculado: 100, diferencia: -10, estado: "descuadre" }),
    ]);
    expect(r.alertas).toBe(1);
  });

  it("por documento sin total de cada cliente: no validado, sin alertas", () => {
    const filas = [documento("900123456", 100), documento("800111222", 70)];
    const r = controlesFormatoCartera({ filas, nivelImputable: "documento", formatos: formato("documento"), tipoDeducido: "documento" });
    expect(r.documentosVsCliente).toMatchObject({ estado: "no_validado", comparados: 0 });
    expect(r.documentosVsCliente?.motivo).toContain("no trae el total de cada cliente");
    expect(r.alertas).toBe(0);
    // Un cargue anterior (sin formatos) no afirma lo que no sabe.
    const anterior = controlesFormatoCartera({ filas, nivelImputable: "documento", formatos: null, tipoDeducido: "documento" });
    expect(anterior).toMatchObject({ deducido: true, documentosVsCliente: null });
  });

  it("por edades: la suma de las edades contra el total de cada fila", () => {
    const tercero = (nit: string, total: number, suma: number): FilaControlFormato => ({
      filaNum: ++fila, valor: suma, imputable: true, nivel: "tercero", datos: { nit, nombre: `T ${nit}`, ...conEdades(total, suma) },
    });
    const filas = [tercero("1", 100, 100), tercero("2", 250, 200), tercero("3", 80, 80)];
    const r = controlesFormatoCartera({ filas, nivelImputable: "tercero", formatos: formato("edades"), tipoDeducido: "edades" });
    expect(r.documentosVsCliente).toBeNull();
    expect(r.edadesVsTotal).toMatchObject({ estado: "descuadre", comparadas: 3, diferencias: { cantidad: 1 } });
    expect(r.edadesVsTotal?.diferencias.filas[0]).toMatchObject({ tercero: "T 2", total: 250, sumaEdades: 200, diferencia: 50 });
    // Sin columna de total no hay con qué comparar.
    const sinTotal = controlesFormatoCartera({ filas, nivelImputable: "tercero", formatos: formato("edades", false), tipoDeducido: "edades" });
    expect(sinTotal.edadesVsTotal).toMatchObject({ estado: "no_validado" });
    expect(sinTotal.edadesVsTotal?.motivo).toContain("columna de total");
  });

  it("por documento y edades: los dos controles, y cuadran", () => {
    const filas = [
      documento("900123456", 60, conEdades(60, 60)), documento("900123456", 40, conEdades(40, 40)), totalCliente("900123456", 100),
    ];
    const r = controlesFormatoCartera({ filas, nivelImputable: "documento", formatos: formato("documento_edades"), tipoDeducido: "documento" });
    expect(r.documentosVsCliente?.estado).toBe("cuadra");
    expect(r.edadesVsTotal).toMatchObject({ estado: "cuadra", comparadas: 2 });
    expect(r.alertas).toBe(0);
    // Con total mapeado pero ninguna fila con las dos cifras: no validado.
    const sinCifras = controlesFormatoCartera({
      filas: [documento("900123456", 100), totalCliente("900123456", 100)],
      nivelImputable: "documento", formatos: formato("documento_edades"), tipoDeducido: "documento",
    });
    expect(sinCifras.edadesVsTotal?.estado).toBe("no_validado");
  });

  it("un cargue con dos archivos reúne sus tipos", () => {
    const r = controlesFormatoCartera({
      filas: [],
      nivelImputable: "documento",
      formatos: [
        { tipo: "edades", declarado: false, conColumnaTotal: true },
        { tipo: "documento", declarado: true, conColumnaTotal: true },
      ],
      tipoDeducido: "documento",
    });
    expect(r).toMatchObject({ tipos: ["documento", "edades"], deducido: true });
  });

  it("un cargue anterior se deduce de sus filas", () => {
    const filas = [documento("1", 10, conEdades(10, 10)), totalCliente("1", 10)];
    expect(nivelDeFilas(filas)).toBe("documento");
    expect(tipoFormatoDeFilas(filas, "documento")).toBe("documento_edades");
    expect(tipoFormatoDeFilas([documento("1", 10)], "documento")).toBe("documento");
    expect(nivelDeFilas([{ imputable: true, nivel: null }])).toBe("tercero");
    expect(tipoFormatoDeFilas([], "tercero")).toBe("edades");
  });
});
