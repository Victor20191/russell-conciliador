import { describe, expect, it } from "vitest";
import { controlesFormatoCartera, nivelDeFilas, tipoFormatoDeFilas, type FilaControlFormato } from "./controles-formato";
import { CLAVE_EDADES, CLAVE_SALDO_DECLARADO, CLAVE_SALDO_DIVISA, CLAVE_SALDO_REPORTADO, CLAVE_SUMA_EDADES, CLAVE_TRM } from "./detalle-cartera";

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
    // Un renglón por tercero sin edades es el formato por cuenta y NIT.
    expect(tipoFormatoDeFilas([], "tercero")).toBe("cuenta_tercero");
    const porTercero = (datos: Record<string, unknown>): FilaControlFormato => ({ filaNum: ++fila, valor: 10, imputable: true, nivel: "tercero", datos });
    expect(tipoFormatoDeFilas([porTercero({ nit: "1" })], "tercero")).toBe("cuenta_tercero");
    expect(tipoFormatoDeFilas([porTercero({ nit: "1", ...conEdades(10, 10) })], "tercero")).toBe("edades");
  });
});

// Por cuenta y NIT (SIESA «Reporte de estado de cuentas»): la cuenta encabeza el bloque con su
// total y debajo cuelga un renglón por tercero.
const cuenta = (codigo: string, total: number, nombre: string | null = null): FilaControlFormato => ({
  filaNum: ++fila, valor: 0, imputable: false, nivel: "tercero",
  datos: { cuenta: codigo, nombre, total },
});
const terceroDeCuenta = (codigo: string, nit: string, valor: number, extra: Record<string, unknown> = {}): FilaControlFormato => ({
  filaNum: ++fila, valor, imputable: true, nivel: "tercero",
  datos: { cuenta: codigo, nit, nombre: `T ${nit}`, total: valor, ...extra },
});
const porCuenta = (conColumnaTotal = true) => [{ tipo: "cuenta_tercero" as const, declarado: true, conColumnaTotal }];

describe("control del formato por cuenta y NIT", () => {
  it("la suma de los terceros de cada cuenta contra el total de la cuenta", () => {
    const filas = [
      cuenta("241205", 320648000, "INDUSTRIA Y COMERCIO"),
      terceroDeCuenta("241205", "890399011", 49249000),
      terceroDeCuenta("241205", "890980093", 231649000),
      terceroDeCuenta("241205", "899999061", 39750000),
      cuenta("233545", 1000000, "TRANSPORTE"),
      terceroDeCuenta("233545", "900111222", 900000),
      terceroDeCuenta("235505", "17114775", 1621579), // cuenta sin total impreso: solo se informa
    ];
    const r = controlesFormatoCartera({ filas, nivelImputable: "tercero", formatos: porCuenta(), tipoDeducido: "cuenta_tercero" });
    expect(r.tipos).toEqual(["cuenta_tercero"]);
    expect(r.documentosVsCliente).toBeNull();
    expect(r.edadesVsTotal).toBeNull();
    expect(r.tercerosVsCuenta).toMatchObject({ estado: "descuadre", comparadas: 2, sinTotal: 1 });
    expect(r.tercerosVsCuenta?.diferencias.filas).toEqual([
      expect.objectContaining({ cuenta: "233545", nombre: "TRANSPORTE", declarado: 1000000, calculado: 900000, diferencia: 100000 }),
    ]);
    expect(r.alertas).toBe(1);
  });

  it("el total repetido en la cabecera y en el pie del bloque cuenta una sola vez", () => {
    const filas = [
      cuenta("241205", 320648000),
      terceroDeCuenta("241205", "890399011", 49249000),
      terceroDeCuenta("241205", "890980093", 231649000),
      terceroDeCuenta("241205", "899999061", 39750000),
      cuenta("241205", 320648000), // «Total 241205» al pie del bloque
    ];
    const r = controlesFormatoCartera({ filas, nivelImputable: "tercero", formatos: porCuenta(), tipoDeducido: "cuenta_tercero" });
    expect(r.tercerosVsCuenta).toMatchObject({ estado: "cuadra", comparadas: 1, sinTotal: 0 });
    expect(r.tercerosVsCuenta?.totales).toEqual({ declarado: 320648000, calculado: 320648000, diferencia: 0 });
  });

  it("los niveles de agregación no se comparan: solo la cuenta con terceros debajo", () => {
    // Jerarquía de SIESA: clase, grupo y hasta dos cabeceras de cuenta seguidas antes del detalle.
    const filas = [
      cuenta("2", 8000000), cuenta("22", 8000000), cuenta("221005", 8000000), cuenta("221006", 8000000),
      terceroDeCuenta("221006", "900111222", 5000000),
      terceroDeCuenta("221006", "900333444", 3000000),
    ];
    const r = controlesFormatoCartera({ filas, nivelImputable: "tercero", formatos: porCuenta(), tipoDeducido: "cuenta_tercero" });
    expect(r.tercerosVsCuenta).toMatchObject({ estado: "cuadra", comparadas: 1, sinTotal: 0 });
    expect(r.tercerosVsCuenta?.totales).toEqual({ declarado: 8000000, calculado: 8000000, diferencia: 0 });

    // Una cuenta con terceros propios Y subcuentas debajo tampoco se compara contra su total.
    const conSubcuentas = controlesFormatoCartera({
      filas: [cuenta("2205", 300), terceroDeCuenta("2205", "1", 100), cuenta("220505", 200), terceroDeCuenta("220505", "2", 200)],
      nivelImputable: "tercero", formatos: porCuenta(), tipoDeducido: "cuenta_tercero",
    });
    expect(conSubcuentas.tercerosVsCuenta).toMatchObject({ estado: "cuadra", comparadas: 1 });
  });

  it("sin ningún total con que comparar, no validado", () => {
    const sinTotales = controlesFormatoCartera({
      filas: [terceroDeCuenta("241205", "890399011", 49249000)],
      nivelImputable: "tercero", formatos: porCuenta(false), tipoDeducido: "cuenta_tercero",
    });
    expect(sinTotales.tercerosVsCuenta).toMatchObject({ estado: "no_validado", comparadas: 0, sinTotal: 1 });
    expect(sinTotales.tercerosVsCuenta?.motivo).toContain("no trae el total de cada cuenta");
    expect(sinTotales.alertas).toBe(0);
  });

  it("en una hoja en divisa el total de la cuenta se compara con la misma TRM de sus terceros", () => {
    const filas = [
      cuenta("221005", 10000),
      terceroDeCuenta("221005", "900999888", 24000000, { [CLAVE_TRM]: 4000, [CLAVE_SALDO_DIVISA]: 6000 }),
      terceroDeCuenta("221005", "900777666", 16000000, { [CLAVE_TRM]: 4000, [CLAVE_SALDO_DIVISA]: 4000 }),
    ];
    const r = controlesFormatoCartera({ filas, nivelImputable: "tercero", formatos: porCuenta(), tipoDeducido: "cuenta_tercero" });
    expect(r.tercerosVsCuenta).toMatchObject({ estado: "cuadra", comparadas: 1 });
    expect(r.tercerosVsCuenta?.totales.declarado).toBe(40000000);
  });
});
