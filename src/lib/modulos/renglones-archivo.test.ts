import { describe, expect, it } from "vitest";
import {
  conservaSaldoDeclarado,
  controlSeccion,
  esEncabezadoTercero,
  esRenglonEstructura,
  etiquetaRenglonNoSuma,
  etiquetaSinItems,
  explicacionSinItems,
  indiceColumnaValor,
  totalesDeclaradosPorCuenta,
  valorAlIncluir,
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

describe("incluir a mano una fila apartada", () => {
  it("recupera el importe que calculó el lector, antes que cualquier otra cifra", () => {
    const fila = { valor: 0, datos: { _valorApartado: -500, _saldoDeclarado: 700, total: 900 } };
    expect(valorAlIncluir(fila, "total")).toBe(-500);
  });

  it("en un borrador anterior usa el saldo declarado y, si no hay, la cifra de la columna", () => {
    expect(valorAlIncluir(cabecera, "total")).toBe(429_476);
    expect(valorAlIncluir(seccion, "total")).toBe(-1_128_628_189.07);
    expect(valorAlIncluir({ valor: 0, datos: { total: "1500.5" } }, "total")).toBe(1_500.5);
  });

  it("deja igual la fila que ya tiene valor, y en cero la que no trae ninguna cifra", () => {
    expect(valorAlIncluir(tercero, "total")).toBe(-805_407);
    expect(valorAlIncluir({ valor: 0, datos: { total: null } }, "total")).toBe(0);
    expect(valorAlIncluir({ valor: 0, datos: { total: "sin dato" } }, "total")).toBe(0);
    expect(valorAlIncluir({ valor: 0, datos: { total: 900 } }, null)).toBe(0);
  });

  it("una cabecera incluida ya no se guarda además como renglón de control", () => {
    const totalCliente = { tipoFila: "total", motivo: "subtotal:rotulo", datos: { _saldoDeclarado: 150 } };
    expect(conservaSaldoDeclarado(cabecera)).toBe(true);
    expect(conservaSaldoDeclarado(totalCliente)).toBe(true);
    expect(conservaSaldoDeclarado({ ...cabecera, tipoFila: "movimiento" })).toBe(false);
    expect(conservaSaldoDeclarado({ ...totalCliente, datos: {} })).toBe(false);
  });
});

describe("por qué una fila o un grupo no suma", () => {
  it("el rótulo de la fila nombra el motivo de nómina en vez de decir agrupadora", () => {
    expect(etiquetaRenglonNoSuma("neto")).toBe("neto del empleado · no suma");
    expect(etiquetaRenglonNoSuma("fuera_de_periodo")).toBe("fuera del período del cargue · no suma");
    expect(etiquetaRenglonNoSuma("subtotal:rotulo")).toBe("subtotal del archivo · no suma");
    expect(etiquetaRenglonNoSuma("seccion_cuenta")).toBe("cuenta del archivo · no suma");
    expect(etiquetaRenglonNoSuma(null)).toBe("agrupadora · no suma");
  });

  it("el grupo en cero se rotula y se explica sin abrirlo", () => {

    expect(etiquetaSinItems("neto")).toBe("todo en cero · neto del empleado");
    expect(etiquetaSinItems("omitidas")).toBe("todo en cero · omitido a mano");
    expect(etiquetaSinItems("en_cero")).toBe("todo en cero");
    expect(etiquetaSinItems("desconocido")).toBe("todo en cero · no suma");
    expect(explicacionSinItems("neto")).toMatch(/dos veces/);
    expect(explicacionSinItems("subtotal:rotulo")).toMatch(/subtotal del archivo/);
  });
});
