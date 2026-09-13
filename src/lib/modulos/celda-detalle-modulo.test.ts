import { describe, expect, it } from "vitest";
import { fmtContable } from "@/lib/format";
import { filtrarFilasDetalleModulo } from "./filtros-detalle-modulo";
import { columnasVisiblesDetalle, fechaDeCelda, textoCeldaDetalle, tituloCeldaDetalle, valorColumnaDetalle } from "./celda-detalle-modulo";

const SALDO = { nombre: "total", tipo: "moneda", esValor: true };
const edad = (etiqueta: string) => ({ nombre: `_edades:${etiqueta}`, tipo: "moneda", familia: { clave: "_edades", etiqueta } });
const FECHA = { nombre: "fecha", tipo: "fecha" };

// Auxiliar SIESA de Zarzal (CxC), tercero 1000414786: el ERP imprime el total del documento en
// $0 y su saldo en el rango; la cabecera del tercero trae el total del bloque.
const cabecera = { valor: 0, datos: { nit: "1000414786", total: 429476, _edades: { Corriente: -115040, "De 1 a 30": 544516 }, _saldoDeclarado: 429476 } };
const notaCredito = { valor: -25160, datos: { documento: "001-NCM-00492829-000", fecha: "45925", total: 0, _edades: { Corriente: -25160, "De 1 a 30": 0 }, _sumaEdades: -25160, _saldoReportado: 0, _origenValor: "familia" } };
const factura = { valor: 398500, datos: { documento: "001-FVM-00733438-000", fecha: "46008", total: 0, _edades: { Corriente: 0, "De 1 a 30": 398500 }, _sumaEdades: 398500, _saldoReportado: 0, _origenValor: "familia" } };

describe("celda del detalle · saldo", () => {
  it("muestra el saldo que el motor derivó de los rangos, no el $0 del archivo", () => {
    expect(valorColumnaDetalle(notaCredito, SALDO)).toBe(-25160);
    expect(textoCeldaDetalle(valorColumnaDetalle(factura, SALDO), SALDO)).toBe(fmtContable(398500));
    expect(tituloCeldaDetalle(notaCredito, SALDO)).toBe(`Suma de los rangos de vencimiento; el archivo traía ${fmtContable(0)} en esta columna.`);
  });

  it("la cabecera del tercero conserva el total que declara para su bloque", () => {
    expect(valorColumnaDetalle(cabecera, SALDO)).toBe(429476);
    expect(tituloCeldaDetalle(cabecera, SALDO)).toBeUndefined();
  });

  it("sin la marca de columna del valor se lee lo que trae el archivo (Inventarios, Nómina)", () => {
    expect(valorColumnaDetalle(notaCredito, { nombre: "total", tipo: "moneda" })).toBe(0);
  });

  it("un saldo en divisa se explica con la TRM", () => {
    const usd = { valor: 272005415.97, datos: { total: 72398.09, _saldoDivisa: 72398.09, _moneda: "USD", _trm: 3757.08, _origenValor: "columna" } };
    expect(valorColumnaDetalle(usd, SALDO)).toBe(272005415.97);
    expect(tituloCeldaDetalle(usd, SALDO)).toContain("USD");
    expect(tituloCeldaDetalle(usd, SALDO)).toContain("TRM");
  });

  it("el filtro compara contra el mismo saldo que se ve", () => {
    const filas = [cabecera, notaCredito, factura] as unknown as { valor: number; datos: Record<string, string | number | null> }[];
    expect(filtrarFilasDetalleModulo(filas, [SALDO], { total: "< 0" }, valorColumnaDetalle)).toEqual([notaCredito]);
  });
});

describe("celda del detalle · rangos y fechas", () => {
  it("lee el rango del mapa y deja en blanco los que no aplican", () => {
    expect(valorColumnaDetalle(factura, edad("De 1 a 30"))).toBe(398500);
    expect(textoCeldaDetalle(valorColumnaDetalle(factura, edad("Corriente")), edad("Corriente"))).toBe("—");
    expect(valorColumnaDetalle(factura, edad("De 361 o mas"))).toBeNull();
  });

  it("muestra la fecha dd/mm/aaaa aunque llegue como serial de Excel", () => {
    expect(textoCeldaDetalle(notaCredito.datos.fecha, FECHA)).toBe("25/09/2025");
    expect(textoCeldaDetalle("2025-12-27", FECHA)).toBe("27/12/2025");
    expect(textoCeldaDetalle("NACIONALES", FECHA)).toBe("NACIONALES");
    expect(fechaDeCelda("46008")).toBe("2025-12-17");
    expect(fechaDeCelda(new Date(Date.UTC(2025, 11, 31)))).toBe("2025-12-31");
  });
});

describe("columnas visibles del detalle", () => {
  it("oculta lo vacío y los rangos que no suman; nunca el valor ni el clasificador", () => {
    // Aceros Mapa (SIESA): trae NIT y saldo, el cupo de crédito y los posfechados, sin DV ni rangos altos.
    const conCupo = { valor: -79246, datos: { nit: "800161633", total: -79246, _edades: { Cupo: 150_000_000, Posfechados: 0 }, _origenValor: "columna" } };
    const columnas = [
      { nombre: "cuenta", tipo: "texto" },
      { nombre: "nit", tipo: "texto" },
      { nombre: "dv", tipo: "texto" },
      SALDO,
      edad("Corriente"),
      edad("De 1 a 30"),
      edad("De 361 o mas"),
      edad("Cupo"),
      edad("Posfechados"),
    ];
    const { visibles, ocultas } = columnasVisiblesDetalle(columnas, [cabecera, notaCredito, factura, conCupo], ["cuenta"]);
    expect(visibles.map((c) => c.nombre)).toEqual(["cuenta", "nit", "total", "_edades:Corriente", "_edades:De 1 a 30"]);
    expect(ocultas.map((c) => c.nombre)).toEqual(["dv", "_edades:De 361 o mas", "_edades:Cupo", "_edades:Posfechados"]);
  });
});
