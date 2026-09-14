import { describe, expect, it } from "vitest";
import {
  etiquetaRango,
  mesDeFecha,
  parsearAnio,
  parsearFechaCelda,
  parsearPeriodo,
  rangoDeFila,
  rangoDentroDelCargue,
  resumirPeriodos,
} from "./periodo";

describe("parsearFechaCelda", () => {
  it("lee ISO, día/mes/año, año/mes/día y el formato anglosajón de la planilla PILA", () => {
    expect(parsearFechaCelda("2025-03-16")).toBe("2025-03-16");
    expect(parsearFechaCelda("2025-12-31T00:00:00.000Z")).toBe("2025-12-31");
    expect(parsearFechaCelda("31/12/2025")).toBe("2025-12-31");
    expect(parsearFechaCelda("2026/01/19")).toBe("2026-01-19");
    expect(parsearFechaCelda("1/15/2026 12:00:00 AM")).toBe("2026-01-15"); // Pure Nature SS y parafiscales
    expect(parsearFechaCelda("5/3/25")).toBe("2025-03-05"); // ambiguo: día/mes (Colombia)
  });

  it("lee el mes escrito en letras («DIC/30/2025» de Metroplus)", () => {
    expect(parsearFechaCelda("DIC/30/2025")).toBe("2025-12-30");
    expect(parsearFechaCelda("30-dic-2025")).toBe("2025-12-30");
    expect(parsearFechaCelda("Ene 5, 2026")).toBe("2026-01-05");
    expect(parsearFechaCelda("Cancelado en Julio")).toBeNull();
    expect(parsearFechaCelda("FOO/30/2025")).toBeNull();
  });

  it("convierte el serial de Excel cuando el libro perdió los estilos", () => {
    expect(parsearFechaCelda(45687)).toBe("2025-01-30");
    expect(parsearFechaCelda(41386)).toBe("2013-04-22"); // Kakaraka: «Fecha Ing» sin estilo
    expect(parsearFechaCelda(12)).toBeNull(); // un número pequeño es cantidad, no fecha
  });

  it("no inventa fechas a partir de texto o meses imposibles", () => {
    expect(parsearFechaCelda("Liquidación de Nómina")).toBeNull();
    expect(parsearFechaCelda("2025-13-01")).toBeNull();
    expect(parsearFechaCelda(null)).toBeNull();
    expect(mesDeFecha("2025-07-15")).toBe("2025-07");
  });
});

describe("parsearPeriodo", () => {
  it("reconoce AAAAMM, «2025-12», «12/2025» y fechas", () => {
    expect(parsearPeriodo("202512")).toBe("2025-12");
    expect(parsearPeriodo(202501)).toBe("2025-01"); // SIESA lo trae numérico
    expect(parsearPeriodo("2025-12")).toBe("2025-12");
    expect(parsearPeriodo("12/2025")).toBe("2025-12");
    expect(parsearPeriodo("2025-09-01")).toBe("2025-09"); // Buk «Mes» = inicio de la quincena
  });

  it("resuelve el número del mes y «PERIODO n» con el año de contexto (LIBRA)", () => {
    expect(parsearPeriodo(3, 2025)).toBe("2025-03");
    expect(parsearPeriodo("PERIODO 12", 2025)).toBe("2025-12");
    expect(parsearPeriodo("3")).toBeNull(); // sin año no hay mes
  });

  it("entiende nombres de mes en español e inglés, con o sin año", () => {
    expect(parsearPeriodo("january", 2025)).toBe("2025-01");
    expect(parsearPeriodo("Enero 2025")).toBe("2025-01");
    expect(parsearPeriodo("ene-25")).toBe("2025-01");
    expect(parsearPeriodo("Diciembre")).toBeNull();
  });

  it("deja en null lo que no es un mes («Q2», «Mensual», textos)", () => {
    expect(parsearPeriodo("Q2", 2026)).toBeNull();
    expect(parsearPeriodo("Mensual", 2026)).toBeNull();
    expect(parsearPeriodo("Liquidación de Nómina")).toBeNull();
  });

  it("parsearAnio acepta el año en número o al inicio de un texto", () => {
    expect(parsearAnio(2025)).toBe(2025);
    expect(parsearAnio("2026")).toBe(2026);
    expect(parsearAnio("15")).toBeNull();
  });
});

describe("rangoDeFila", () => {
  it("la fecha de liquidación manda sobre el período impreso y sobre el corte (D3)", () => {
    // Novasoft: consignación de cesantías con corte 2024-12-31 liquidada el 2025-02-15.
    expect(rangoDeFila({ fecha: "2025-02-15", fechaCorte: "2024-12-31" })).toEqual({ desde: "2025-02", hasta: "2025-02" });
    // Buk: «Mes» es el inicio de la quincena; «Fecha de paga» decide.
    expect(rangoDeFila({ fecha: "2025-12-31", periodo: "2025-12-16" })).toEqual({ desde: "2025-12", hasta: "2025-12" });
  });

  it("combina mes y año en columnas aparte (Pure Nature) y usa el período SIESA", () => {
    expect(rangoDeFila({ mes: 6, anio: 2026, periodo: "Q2" })).toEqual({ desde: "2026-06", hasta: "2026-06" });
    expect(rangoDeFila({ periodo: 202511 })).toEqual({ desde: "2025-11", hasta: "2025-11" });
    expect(rangoDeFila({ periodo: "january", anio: "2025" })).toEqual({ desde: "2025-01", hasta: "2025-01" });
    expect(rangoDeFila({ periodo: 3 }, 2025)).toEqual({ desde: "2025-03", hasta: "2025-03" });
  });

  it("arma el rango del acumulado SIIGO («De 202501 A 202512»)", () => {
    expect(rangoDeFila({ periodoDesde: 202501, periodoHasta: 202512 })).toEqual({ desde: "2025-01", hasta: "2025-12" });
    expect(rangoDeFila({ periodoDesde: "202512", periodoHasta: "202501" })).toEqual({ desde: "2025-01", hasta: "2025-12" });
  });

  it("cae al corte solo cuando nada más dice el período, y a null sin datos (Mineralin)", () => {
    expect(rangoDeFila({ fechaCorte: "2025-03-31" })).toEqual({ desde: "2025-03", hasta: "2025-03" });
    expect(rangoDeFila({})).toBeNull();
    expect(rangoDeFila({ periodo: "Mensual" }, 2026)).toBeNull();
  });
});

describe("rango del cargue", () => {
  it("una fila entra si su rango toca el del cargue (inclusive)", () => {
    const cargue = { desde: "2025-12", hasta: "2025-12" };
    expect(rangoDentroDelCargue({ desde: "2025-12", hasta: "2025-12" }, cargue)).toBe(true);
    expect(rangoDentroDelCargue({ desde: "2025-01", hasta: "2025-12" }, cargue)).toBe(true); // acumulado anual
    expect(rangoDentroDelCargue({ desde: "2025-11", hasta: "2025-11" }, cargue)).toBe(false);
    expect(rangoDentroDelCargue({ desde: "2023-01", hasta: "2023-12" }, { desde: "2025-01", hasta: "2025-12" })).toBe(false); // hoja 2023 de Motozone
  });

  it("resume los meses del archivo con filas y valor, ignorando lo que no es movimiento", () => {
    const resumen = resumirPeriodos([
      { periodoDesde: "2025-01", periodoHasta: "2025-01", valor: 100 },
      { periodoDesde: "2025-01", periodoHasta: "2025-01", valor: 50 },
      { periodoDesde: "2025-02", periodoHasta: "2025-02", valor: 7, tipoFila: "movimiento" },
      { periodoDesde: "2025-02", periodoHasta: "2025-02", valor: 999, tipoFila: "total" },
      { periodoDesde: "2025-01", periodoHasta: "2025-12", valor: 1 },
      { valor: 3 },
    ]);
    expect(resumen).toEqual([
      { periodo: "(sin período)", filas: 1, valor: 3 },
      { periodo: "2025-01", filas: 2, valor: 150 },
      { periodo: "2025-01 → 2025-12", filas: 1, valor: 1 },
      { periodo: "2025-02", filas: 1, valor: 7 },
    ]);
    expect(etiquetaRango({ desde: "2025-03", hasta: "2025-03" })).toBe("2025-03");
  });
});
