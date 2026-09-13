import { describe, expect, it } from "vitest";
import type { CeldaCruda, GridHoja } from "@/lib/balance/extraccion/ingesta";
import { descriptorModulo } from "../descriptores";
import { avisoSeleccionHoja, seleccionarHojaModulo } from "./seleccion-hoja";
import encabezados from "../cxp/__fixtures__/encabezados-cxp.json";

/**
 * Selección de la hoja del auxiliar en libros armados como los libros de conciliación reales:
 * los auxiliares llevan los encabezados del fixture de CxP; el balance por terceros, las tablas
 * dinámicas y las hojas de trabajo copian la forma de las hojas que los acompañan, sin datos
 * de terceros reales.
 */
const CXP = descriptorModulo("CXP")!;
const fixture = encabezados as Record<string, { encabezado: (string | null)[] }>;

const hoja = (nombre: string, filas: CeldaCruda[][]): GridHoja => ({ nombre, filas });

/** Fila a partir de celdas 1-based: `fila({ 8: "COMPROBACION DE SALDOS" })`. */
const fila = (celdas: Record<number, CeldaCruda>): CeldaCruda[] => {
  const ancho = Math.max(...Object.keys(celdas).map(Number));
  return Array.from({ length: ancho }, (_, i) => celdas[i + 1] ?? null);
};

const auxiliar = (nombre: string, slug: string, ...datos: CeldaCruda[][]): GridHoja =>
  hoja(nombre, [fixture[slug].encabezado, ...datos]);

/** Balance por terceros de muchas filas: la hoja más grande del libro. */
const balancePorTerceros = (nombre = "ANEXO BALANCE TERC"): GridHoja => hoja(nombre, [
  ["Nivel", "Código", "Cuenta", "ID Tercero", "Nombre Tercero", "Saldo Inicial", "Débito", "Crédito", "Saldo Final"],
  ...Array.from({ length: 800 }, (_, i) => [8, "22050501", "PROVEEDORES NACIONALES", String(800000000 + i), `TERCERO ${i}`, 0, 100, 250, -150]),
]);

const papelDeTrabajo = hoja("EO - D&I", [
  ["RUSSELL BEDFORD GCT S.A.S."],
  ["NOMBRE DEL CLIENTE", "EMPRESA DE PRUEBA S.A.S."],
  ["TIPO DE TRABAJO:", "REVISORÍA FISCAL"],
  ["NIT", "NOMBRE", "SALDO"],
  ["800000001", "TERCERO", 100],
]);

const trm = hoja("TRM HISTÓRICO", [["Fecha", "Tasa Representativa del Mercado"], ["2025-12-31", 3800.5]]);

const tablaDinamica = hoja("HT", [
  ["Suma de Saldo_Final", null, "Etiquetas de columna"],
  ["Etiquetas de fila", "Nombre_Tercero", "22050101", "23359501", "Total general"],
  ["800000001", "TERCERO", -100, -50, -150],
]);

describe("seleccionarHojaModulo", () => {
  it("propone el auxiliar aunque el balance del libro sea la primera hoja y la más grande", () => {
    const seleccion = seleccionarHojaModulo(CXP, [balancePorTerceros(), papelDeTrabajo, auxiliar("ANEXO CXP NACIONALES", "laminaire-nal"), trm]);
    expect(seleccion.propuesta).toBe("ANEXO CXP NACIONALES");
    expect(seleccion.soloBalances).toBe(false);
    expect(Object.fromEntries(seleccion.puntajes.map((p) => [p.nombre, p.clase]))).toEqual({
      "ANEXO BALANCE TERC": "balance",
      "EO - D&I": "hoja_trabajo",
      "ANEXO CXP NACIONALES": "auxiliar",
      "TRM HISTÓRICO": "hoja_trabajo",
    });
  });

  it("descarta tablas dinámicas y hojas con columna de diferencia aunque reconozcan más roles", () => {
    const conDiferencia = hoja("CXP (2)", [[...fixture["plasmar-usd-eur"].encabezado, "Diferencia"]]);
    const seleccion = seleccionarHojaModulo(CXP, [tablaDinamica, conDiferencia, auxiliar("CXP", "siesa-plasmar-nal")]);
    expect(seleccion.propuesta).toBe("CXP");
    const clases = Object.fromEntries(seleccion.puntajes.map((p) => [p.nombre, p.clase]));
    expect(clases).toMatchObject({ HT: "hoja_trabajo", "CXP (2)": "hoja_trabajo", CXP: "auxiliar" });
    const puntaje = Object.fromEntries(seleccion.puntajes.map((p) => [p.nombre, p.puntaje]));
    expect(puntaje["CXP (2)"]).toBeGreaterThan(puntaje.CXP);
  });

  it("entre dos auxiliares manda el orden del libro, no la hoja que reconoce más roles", () => {
    const seleccion = seleccionarHojaModulo(CXP, [auxiliar("COP", "laminaire-nal"), auxiliar("USD", "laminaire-ext")]);
    const puntaje = Object.fromEntries(seleccion.puntajes.map((p) => [p.nombre, p.puntaje]));
    expect(puntaje.USD).toBeGreaterThan(puntaje.COP);
    expect(seleccion.propuesta).toBe("COP");
  });

  it("sin auxiliar prefiere la hoja de trabajo al balance", () => {
    const seleccion = seleccionarHojaModulo(CXP, [balancePorTerceros(), tablaDinamica]);
    expect(seleccion).toMatchObject({ propuesta: "HT", soloBalances: false });
  });

  it("no toma por hoja de trabajo el auxiliar con un proveedor llamado como la firma", () => {
    const seleccion = seleccionarHojaModulo(CXP, [
      auxiliar("CXP", "laminaire-nal", ["FV-1", "900000001", "RUSSELL BEDFORD GCT S.A.S.", "2025-11-30", "2025-12-30", 1, 5000000]),
    ]);
    expect(seleccion.puntajes[0].clase).toBe("auxiliar");
  });

  it("un reporte con saldo anterior, débitos, créditos y saldo actual que trae edades no es un balance", () => {
    const seleccion = seleccionarHojaModulo(CXP, [hoja("Estado", [
      ["NIT", "NOMBRE", "Saldo anterior", "Débitos", "Créditos", "Saldo actual", "SIN VENCER", "1 A 30", "31 A 60", "61 A 90"],
    ])]);
    expect(seleccion.puntajes[0].clase).toBe("auxiliar");
    expect(seleccion.soloBalances).toBe(false);
  });

  it("marca como solo balances la comprobación de saldos por tercero (encabezado partido en dos filas)", () => {
    const comprobacion = hoja("Hoja 1", [
      fila({ 8: "COMPROBACION DE SALDOS" }),
      fila({ 8: "ANEXO" }),
      fila({ 1: "EMPRESA DE PRUEBA S.A." }),
      fila({ 1: "Libro:", 2: "NIIF" }),
      fila({ 1: "Cifras en PESOS" }),
      fila({ 8: "Saldo inicial a", 14: "Saldo final a" }),
      fila({ 1: "Cuentas", 8: "2025/01", 10: "Débitos", 12: "Créditos", 14: "2025/12" }),
      fila({ 1: "2205", 2: "PROVEEDORES", 8: -100, 10: 50, 12: 80, 14: -130 }),
    ]);
    expect(seleccionarHojaModulo(CXP, [comprobacion])).toMatchObject({ propuesta: "Hoja 1", soloBalances: true });
    expect(seleccionarHojaModulo(CXP, [balancePorTerceros(), hoja("Hoja2", [])]).soloBalances).toBe(true);
    expect(seleccionarHojaModulo(CXP, [hoja("Hoja1", [])])).toMatchObject({ propuesta: null, soloBalances: false });
  });
});

describe("avisoSeleccionHoja", () => {
  it("nombra lo descartado y las otras hojas que también parecen un auxiliar", () => {
    const { puntajes } = seleccionarHojaModulo(CXP, [
      balancePorTerceros(), papelDeTrabajo, auxiliar("ANEXO CXP NACIONALES", "laminaire-nal"), auxiliar("ANEXO CXP EXTERIOR", "laminaire-ext"), trm,
    ]);
    expect(avisoSeleccionHoja(puntajes, "ANEXO CXP NACIONALES")).toBe(
      "Se lee «ANEXO CXP NACIONALES»; no se tomaron «ANEXO BALANCE TERC» (balance) ni «EO - D&I» y «TRM HISTÓRICO» (hojas de trabajo). "
      + "La hoja «ANEXO CXP EXTERIOR» también parece un auxiliar: si corresponde, cárgala por separado.",
    );
  });

  it("no avisa en un libro de una sola hoja con datos", () => {
    const { puntajes } = seleccionarHojaModulo(CXP, [auxiliar("Hoja1", "siigo-kakaraka"), hoja("Hoja2", [])]);
    expect(avisoSeleccionHoja(puntajes, "Hoja1")).toBeNull();
  });

  it("advierte cuando la hoja elegida es un balance o una hoja de trabajo", () => {
    const { puntajes } = seleccionarHojaModulo(CXP, [auxiliar("CXP", "siesa-plasmar-nal"), balancePorTerceros("BLC TCROS"), tablaDinamica]);
    expect(avisoSeleccionHoja(puntajes, "BLC TCROS")).toMatch(/^La hoja «BLC TCROS» tiene la firma de un balance/);
    expect(avisoSeleccionHoja(puntajes, "HT")).toMatch(/^La hoja «HT» parece una hoja de trabajo .* no se tomaron «BLC TCROS» \(balance\)\. La hoja «CXP» también parece un auxiliar/);
  });
});

describe("libros de nómina del auditor", () => {
  const NOM = descriptorModulo("NOM")!;
  const nominaBuk = (nombre: string, oculta = false): GridHoja => ({
    nombre,
    ...(oculta ? { oculta: true } : {}),
    filas: [
      ["Tipo de Documento", "Mes", "Número de Documento", "Nombre", "Fecha de paga", "Centro de Costo", "Concepto", "Clasificación", "Suma de Valor"],
      ["Cédula de Ciudadanía", "2025-09-01", "1.000.396.862", "Silva Arias Richard", "2025-09-15", "MODPR04", "Salario Ordinario", "Ganancias", 754455],
      ["Cédula de Ciudadanía", "2025-09-01", "1.000.396.862", "Silva Arias Richard", "2025-09-15", "MODPR04", "Auxilio De Transporte", "Ganancias", 100000],
    ],
  });
  const conciliacionModulo = hoja("Conciliación del módulo", [
    ["RUSSELL BEDFORD GCT S.A.S."],
    ["NOMBRE DEL CLIENTE:", "PLASMAR S.A.S"],
    ["NOMBRE DEL PAPEL DE TRABAJO:", "CONCILIACION CONCEPTOS NOMINA"],
    ["Concepto", "Valor nomina", "Cuenta", "Valor según contabilidad", "Diferencia"],
    ["Salario Ordinario", 2041458658, 72050601, 10601829, 0],
  ]);
  const balanceOculto: GridHoja = {
    nombre: "Balance a Julio", oculta: true,
    filas: [["Cuenta", "Nombre", "Saldo inicial", "Débitos", "Créditos", "Saldo final"], ["510506", "SUELDOS", 1, 2, 3, 4]],
  };
  const provisiones = hoja("PROVISIONES", [["Identificación", "Nombre", "Cesantías", "Prima", "Vacaciones", "Total Provisiones"], [4909298, "ALFONSO", 1, 2, 3, 6]]);

  it("propone la hoja del módulo y descarta la conciliación del auditor, las provisiones y el balance oculto", () => {
    const seleccion = seleccionarHojaModulo(NOM, [conciliacionModulo, provisiones, nominaBuk("Nomina"), balanceOculto]);
    expect(seleccion.propuesta).toBe("Nomina");
    expect(seleccion.sinAuxiliar).toBe(false);
    const clases = Object.fromEntries(seleccion.puntajes.map((p) => [p.nombre, p.clase]));
    expect(clases).toMatchObject({ "Conciliación del módulo": "hoja_trabajo", PROVISIONES: "hoja_trabajo", Nomina: "auxiliar", "Balance a Julio": "balance" });
    expect(avisoSeleccionHoja(seleccion.puntajes, "Nomina")).toContain("«Balance a Julio» (oculta)");
  });

  it("nunca propone una hoja oculta aunque sea el mejor auxiliar; solo si el usuario la nombra", () => {
    const seleccion = seleccionarHojaModulo(NOM, [nominaBuk("Nomina (oculta)", true), provisiones]);
    expect(seleccion.propuesta).toBe("PROVISIONES");
    expect(seleccion.sinAuxiliar).toBe(true);
    expect(avisoSeleccionHoja(seleccion.puntajes, "Nomina (oculta)")).toContain("está oculta en el libro");
  });

  it("un libro auxiliar de todas las cuentas (World Office) o un catálogo de conceptos no es el módulo", () => {
    const auxiliarContable = hoja("ExportarAExcel", [
      ["SAVIOS S.A.S"],
      ["Cuenta", "Tercero", "Fecha", "Nota", "Cheque", "Doc Num", "Debitos", "Creditos", "Saldo"],
      ["11100501 BANCOLOMBIA", null, "2024-12-31", "SALDO INICIAL", null, null, 170581044.99, 0, 170581044.99],
    ]);
    expect(seleccionarHojaModulo(NOM, [auxiliarContable]).sinAuxiliar).toBe(true);
    const catalogo = hoja("CONCEPTOS DE NOMINA", [
      ["TIPO CONCEPTO", "CODIGO SIIGO", "NOMBRE", "CUENTA"],
      ["INGRESO", "01", "SALARIO BASICO", "0005060000"],
    ]);
    expect(seleccionarHojaModulo(NOM, [catalogo]).sinAuxiliar).toBe(true);
  });

  it("un reporte de nómina con devengo y deducción, sin columna de valor, sí es el auxiliar", () => {
    const siesa = hoja("Modulo", [
      ["Tercero", "Descripción", "Nit", "Concepto", "Descripción Concepto", "Horas Movto.", "Devengo", "Deducción"],
      [1052392543, "MONTAÑEZ SUAREZ", 1052392543, "601", "PRESTAMO EMPRESA", 0, 0, 166667],
      [1052392543, "MONTAÑEZ SUAREZ", 1052392543, "104", "VACACIONES", 112, 1819350, 0],
    ]);
    const seleccion = seleccionarHojaModulo(NOM, [siesa]);
    expect(seleccion.puntajes[0].clase).toBe("auxiliar");
    expect(seleccion.sinAuxiliar).toBe(false);
  });
});
