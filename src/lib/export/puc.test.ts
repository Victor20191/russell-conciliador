import { test, expect } from "vitest";
import ExcelJS from "exceljs";
import { crearExportacionPuc, etiquetaNaturaleza, type DatosExportacionPuc } from "./puc";

const DATOS: DatosExportacionPuc = {
  estandar: [
    {
      code: "110505",
      name: "Caja general",
      level: 6,
      nature: "D",
      parent: "1105",
      critical: true,
      russellAccount: "1105",
      categoryType: "Efectivo",
      includes: "Billetes y monedas",
      excludes: "Cheques posfechados",
      possibleAccounts: "1105xx",
      supportingDocuments: "Arqueo de caja",
      controlSupports: "Acta de arqueo",
      mappingNotes: null,
    },
    {
      code: "413550",
      name: "Comercio al por mayor",
      level: 6,
      nature: "C",
      parent: "4135",
      critical: false,
      russellAccount: null,
      categoryType: null,
      includes: null,
      excludes: null,
      possibleAccounts: null,
      supportingDocuments: null,
      controlSupports: null,
      mappingNotes: "Revisar devoluciones",
    },
  ],
};

const ENCABEZADOS = [
  "Código",
  "Nombre",
  "Nivel",
  "Naturaleza",
  "Cuenta padre",
  "Crítica",
  "Cuenta Russell",
  "Tipo de categoría",
  "Incluye",
  "Excluye",
  "Cuentas posibles",
  "Documentos soporte",
  "Soportes de control",
  "Notas de mapeo",
];

async function abrir(datos: DatosExportacionPuc): Promise<ExcelJS.Workbook> {
  const buffer = await crearExportacionPuc(datos, new Date("2026-08-30T12:00:00.000Z"));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

test("el libro trae UNA sola hoja con el plan estándar Russell", async () => {
  const wb = await abrir(DATOS);
  expect(wb.worksheets.map((w) => w.name)).toEqual(["Plan estándar Russell"]);
});

test("la hoja lista TODAS las cuentas bajo su encabezado", async () => {
  const wb = await abrir(DATOS);
  const std = wb.getWorksheet("Plan estándar Russell")!;
  expect(ENCABEZADOS.map((_, i) => std.getRow(1).getCell(i + 1).value)).toEqual(ENCABEZADOS);
  expect(std.getRow(2).getCell(1).value).toBe("110505");
  expect(std.getRow(2).getCell(2).value).toBe("Caja general");
  expect(std.getRow(2).getCell(4).value).toBe("Débito");
  expect(std.getRow(2).getCell(6).value).toBe("Sí");
  expect(std.getRow(3).getCell(1).value).toBe("413550");
  expect(std.getRow(3).getCell(4).value).toBe("Crédito");
  expect(std.getRow(3).getCell(6).value).toBe("No");
  expect(std.rowCount).toBe(1 + DATOS.estandar.length);
});

test("los vacíos salen como «—»", async () => {
  const wb = await abrir(DATOS);
  const std = wb.getWorksheet("Plan estándar Russell")!;
  // Fila 3: cuenta de ingresos con varios campos nulos.
  expect(std.getRow(3).getCell(7).value).toBe("—"); // cuenta Russell
  expect(std.getRow(3).getCell(8).value).toBe("—"); // tipo
  expect(std.getRow(3).getCell(9).value).toBe("—"); // incluye
  expect(std.getRow(3).getCell(14).value).toBe("Revisar devoluciones");
  expect(std.getRow(2).getCell(14).value).toBe("—"); // notas nulas
});

test("sin cuentas el libro conserva la hoja y explica por qué está vacía", async () => {
  const wb = await abrir({ estandar: [] });
  expect(wb.worksheets).toHaveLength(1);
  const std = wb.getWorksheet("Plan estándar Russell")!;
  expect(std.rowCount).toBe(2); // encabezado + nota
  expect(String(std.getRow(2).getCell(1).value)).toContain("no tiene cuentas cargadas");
});

test("no incluye hojas de mapeo, PUC cliente ni subgrupos", async () => {
  const wb = await abrir(DATOS);
  expect(wb.getWorksheet("Resumen")).toBeUndefined();
  expect(wb.getWorksheet("PUC cliente")).toBeUndefined();
  expect(wb.getWorksheet("Mapeo cliente")).toBeUndefined();
  expect(wb.getWorksheet("Subgrupos")).toBeUndefined();
  expect(wb.getWorksheet("Plan estándar")).toBeUndefined();
});

test("etiquetaNaturaleza traduce D/C y deja el resto intacto", () => {
  expect(etiquetaNaturaleza("D")).toBe("Débito");
  expect(etiquetaNaturaleza("C")).toBe("Crédito");
  expect(etiquetaNaturaleza("Débito")).toBe("Débito");
});
