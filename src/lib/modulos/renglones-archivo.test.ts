import { describe, expect, it } from "vitest";
import {
  controlSeccion,
  esEncabezadoTercero,
  esRenglonEstructura,
  etiquetaRenglonNoSuma,
  indiceColumnaValor,
  totalesDeclaradosPorCuenta,
} from "./renglones-archivo";

// Aceros Mapa (SIESA): la fila 35 es el renglón de la cuenta 280510 con el total de sus 239 terceros.
const seccion = { tipoFila: "agrupadora", motivo: "seccion_cuenta", clasificador: "280510", valor: 0, datos: { cuenta: "280510", total: -1_128_628_189.07 } };
const tercero = { tipoFila: "movimiento", motivo: null, clasificador: "280510", valor: -805_407, datos: { nit: "1001161964", total: -805_407 } };
const porcentaje = { tipoFila: "agrupadora", motivo: "sin_identificador", clasificador: null, valor: 0, datos: { total: 1 } };
// Zarzal (SIESA con documentos): el encabezado del tercero declara el saldo de su bloque.
const cabecera = { tipoFila: "agrupadora", motivo: "subtotal_tercero:cabecera", clasificador: "13050500", valor: 0, datos: { nit: "1000414786", total: 429_476, _saldoDeclarado: 429_476 } };

describe("renglones del archivo", () => {
  it("la cuenta de SIESA y las filas sin identificación son estructura; el encabezado del tercero no", () => {
    expect([seccion, tercero, porcentaje, cabecera].map((f) => esRenglonEstructura(f))).toEqual([true, false, true, false]);
    expect(esRenglonEstructura({ ...seccion, tipoFila: "movimiento" })).toBe(false); // incluido a mano
    expect(etiquetaRenglonNoSuma(seccion.motivo)).toBe("cuenta del archivo · no suma");
    expect(etiquetaRenglonNoSuma(cabecera.motivo)).toBe("encabezado del tercero · no suma");
  });

  it("el total que el archivo declara para la cuenta se compara con lo que suman sus terceros", () => {
    const declarados = totalesDeclaradosPorCuenta([seccion, tercero, porcentaje, { ...seccion, datos: { total: 5 } }], "total");
    expect([...declarados]).toEqual([["280510", -1_128_628_189.07]]);
    expect(controlSeccion(-1_128_628_189.07, -1_128_628_189.07)).toEqual({ declarado: -1_128_628_189.07, diferencia: 0, cuadra: true });
    expect(controlSeccion(-1_000, -805.5)).toEqual({ declarado: -1_000, diferencia: 194.5, cuadra: false });
    expect(controlSeccion(1_000, -1_000).cuadra).toBe(true); // convención de signo del reporte
  });

  it("el encabezado del tercero ya cargado se reconoce por su saldo declarado sin valor", () => {
    expect([esEncabezadoTercero(cabecera), esEncabezadoTercero(tercero)]).toEqual([true, false]);
  });

  it("ubica la columna del valor entre las visibles", () => {
    const conValor: { nombre: string; esValor?: boolean }[] = [{ nombre: "cuenta" }, { nombre: "nit" }, { nombre: "total", esValor: true }];
    const sinValor: { nombre: string; esValor?: boolean }[] = [{ nombre: "cuenta" }];
    expect(indiceColumnaValor(conValor)).toBe(2);
    expect(indiceColumnaValor(sinValor)).toBe(-1);
  });
});
