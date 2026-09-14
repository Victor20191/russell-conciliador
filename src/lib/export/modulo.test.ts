import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { crearExportacionModulo, type ColumnaExportModulo } from "./modulo";
import { construirCruceTerceroCartera } from "@/lib/modulos/cartera/cruce-tercero-cartera";

const COLUMNAS: ColumnaExportModulo[] = [
  { nombre: "tipo", etiqueta: "Tipo de inventario", tipo: "texto" },
  { nombre: "referencia", etiqueta: "Referencia", tipo: "texto" },
  { nombre: "cantidad", etiqueta: "Cantidad", tipo: "numero" },
  { nombre: "valorTotal", etiqueta: "Valor total", tipo: "moneda" },
];
const META = { modulo: "Inventarios", cliente: "ACME", periodo: "2026-03", version: 1, archivo: "inv.xlsx", generadoEn: new Date(2026, 0, 1) };

const formula = (ws: ExcelJS.Worksheet, ref: string) => {
  const v = ws.getCell(ref).value as { formula?: string } | null;
  return v && typeof v === "object" ? v.formula : undefined;
};

async function abrir(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

describe("crearExportacionModulo", () => {
  it("agrupa el detalle por clasificador con subtotal y total por FÓRMULA", async () => {
    const wb = await abrir(await crearExportacionModulo({
      columnas: COLUMNAS,
      clasificadorEtiqueta: "Tipo de inventario",
      detalle: [
        { filaNum: 1, clasificador: "MP", valor: 100, datos: { tipo: "MP", referencia: "A", cantidad: 2, valorTotal: 100 } },
        { filaNum: 2, clasificador: "MP", valor: 50, datos: { tipo: "MP", referencia: "B", cantidad: 1, valorTotal: 50 } },
        { filaNum: 3, clasificador: null, valor: 7, datos: { tipo: "", referencia: "C", cantidad: 1, valorTotal: 7 } },
      ],
      consolidado: [
        { clasificador: "MP", total: 150, filas: 2, cuentas4: [{ codigo: "1405", nombre: "Materias primas" }] },
        { clasificador: "(sin clasificar)", total: 7, filas: 1, cuentas4: [] },
      ],
      meta: META,
    }));
    const det = wb.getWorksheet("Detalle")!;
    // Encabezado en fila 4; columnas: A=#, B..E=descriptor, F=Valor consolidado.
    expect(det.getCell("A4").value).toBe("#");
    expect(det.getCell("F4").value).toBe("Valor consolidado");
    // Grupo MP en fila 5, sus ítems en 6-7 → subtotal SUM(F6:F7).
    expect(det.getCell("A5").value).toBe("Tipo de inventario: MP");
    expect(formula(det, "F5")).toBe("SUM(F6:F7)");
    expect(det.getCell("D6").value).toBe(2);
    expect(det.getCell("E6").value).toBe(100);
    // Grupo sin clasificar en fila 8, ítem en 9; total en 10 suma los subtotales.
    expect(det.getCell("A8").value).toBe("Tipo de inventario: (sin clasificar)");
    expect(formula(det, "F8")).toBe("SUM(F9:F9)");
    expect(det.getCell("A10").value).toBe("TOTAL");
    expect(formula(det, "F10")).toBe("SUM(F5,F8)");

    const con = wb.getWorksheet("Consolidado")!;
    expect(con.getCell("A5").value).toBe("MP");
    expect(con.getCell("E5").value).toBe("1405 Materias primas");
    expect(con.getCell("E6").value).toBe("Sin asignar");
    expect(formula(con, "D7")).toBe("SUM(D5:D6)");
  });

  it("sin filas exporta hojas vacías con total 0", async () => {
    const wb = await abrir(await crearExportacionModulo({ columnas: COLUMNAS, clasificadorEtiqueta: "Tipo", detalle: [], consolidado: [], meta: META }));
    expect(wb.getWorksheet("Detalle")!.getCell("F5").value).toBe(0);
    expect(wb.getWorksheet("Consolidado")!.getCell("D5").value).toBe(0);
  });
});

describe("crearExportacionModulo · borrador con estado", () => {
  it("agrega la columna Estado cuando alguna fila la trae y corre el valor una columna", async () => {
    const wb = await abrir(await crearExportacionModulo({
      columnas: COLUMNAS,
      clasificadorEtiqueta: "Tipo",
      detalle: [
        { filaNum: 1, clasificador: "MP", valor: 0, datos: { tipo: "MP" }, estado: "Agrupadora" },
        { filaNum: 2, clasificador: "MP", valor: 100, datos: { tipo: "MP", valorTotal: 100 }, estado: "Movimiento" },
        { filaNum: 3, clasificador: "MP", valor: 0, datos: { tipo: "MP", valorTotal: 9 }, estado: "Movimiento · OMITIDA" },
      ],
      consolidado: [{ clasificador: "MP", total: 100, filas: 1, cuentas4: [] }],
      meta: META,
    }));
    const det = wb.getWorksheet("Detalle")!;
    expect(det.getCell("F4").value).toBe("Estado");
    expect(det.getCell("G4").value).toBe("Valor consolidado");
    expect(det.getCell("F8").value).toBe("Movimiento · OMITIDA");
    expect(det.getCell("G8").value).toBe(0);
    expect(formula(det, "G5")).toBe("SUM(G6:G8)");
  });

  it("exporta literalmente SÍ COINCIDE, NO COINCIDE y NO VALIDADO", async () => {
    const wb = await abrir(await crearExportacionModulo({
      columnas: COLUMNAS,
      clasificadorEtiqueta: "Tipo",
      detalle: [],
      consolidado: [],
      control: [
        { clasificador: "A", filaSubtotal: 3, items: 2, sumaMovimientos: 100, subtotalArchivo: 100, diferencia: 0, estado: "cuadra" },
        { clasificador: "B", filaSubtotal: 6, items: 2, sumaMovimientos: 90, subtotalArchivo: 100, diferencia: 10, estado: "descuadre" },
        { clasificador: "C", filaSubtotal: 8, items: 1, sumaMovimientos: 50, subtotalArchivo: 50, diferencia: null, estado: "no_validado" },
      ],
      meta: META,
    }));
    const control = wb.getWorksheet("Control totales")!;
    expect(control.getCell("G5").value).toBe("SÍ COINCIDE");
    expect(control.getCell("G6").value).toBe("NO COINCIDE");
    expect(control.getCell("G7").value).toBe("NO VALIDADO");
    expect(control.getCell("F7").value).toBeNull();
  });
});

describe("crearExportacionModulo · cruce por tercero", () => {
  it("agrega la hoja con un renglón por tercero, las cuentas en columnas y los totales", async () => {
    const resumen = construirCruceTerceroCartera({
      contable: [
        { clave: "900123456", cuenta6: "130505", valor: 1_000, nombre: "CLIENTE UNO" },
        { clave: "900123456", cuenta6: "280505", valor: -200, nombre: null },
        { clave: "~CONSUMIDOR FINAL", cuenta6: "130505", valor: 50, nombre: "Consumidor final" },
      ],
      modulo: [
        { clave: "900123456", saldo: 700, nombre: null, origenCartera: "nacional", cuenta6: null },
        { clave: "~CONSUMIDOR FINAL", saldo: 50, nombre: null, origenCartera: null, cuenta6: null },
      ],
      cuentasModulo: ["130505", "130510", "280505"],
    });
    const wb = await abrir(await crearExportacionModulo({
      columnas: COLUMNAS,
      clasificadorEtiqueta: "Cuenta",
      detalle: [],
      consolidado: [],
      meta: { ...META, modulo: "Cartera" },
      cruceTercero: { resumen, etiquetaClave: "NIT", etiquetaNombre: "Nombre", fuente: "Balance v1 al 2026-03-31" },
    }));
    const ws = wb.getWorksheet("Cruce por tercero")!;
    // Solo las cuentas con saldo: 130510 no aparece.
    expect(["A4", "B4", "C4", "D4", "E4", "F4", "G4", "H4", "I4", "J4", "K4"].map((ref) => ws.getCell(ref).value)).toEqual([
      "NIT", "Nombre", "130505", "280505", "Contabilidad", "Módulo nacional", "Módulo exterior", "Módulo", "Diferencia", "Estado", "Observación",
    ]);
    expect([ws.getCell("A5").value, ws.getCell("C5").value, ws.getCell("D5").value, ws.getCell("E5").value, ws.getCell("H5").value, ws.getCell("I5").value, ws.getCell("J5").value])
      .toEqual(["900123456", 1_000, -200, 800, 700, 100, "Diferencia"]);
    expect([ws.getCell("B6").value, ws.getCell("J6").value, ws.getCell("K6").value]).toEqual(["Consumidor final", "Cuadra", "Sin NIT"]);
    expect([ws.getCell("A7").value, ws.getCell("E7").value, ws.getCell("H7").value, ws.getCell("I7").value]).toEqual(["Totales", 850, 750, 100]);
  });
});
