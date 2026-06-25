import { test, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  crearExportacionClientes,
  type FilaClienteExport,
  type CatalogoExportClientes,
} from "./clientes";

const CATALOGO: CatalogoExportClientes = {
  modulos: [
    { id: 1, name: "Inventarios" },
    { id: 2, name: "Cartera" },
  ],
  dianForms: [
    { id: 11, name: "Retención en la fuente", code: "F-350" },
    { id: 10, name: "IVA", code: "F-300" },
  ],
};

const CLIENTES: FilaClienteExport[] = [
  {
    code: "C-1001",
    name: "Inversiones del Pacífico S.A.S.",
    nit: "900451227-3",
    tipo: "A",
    erpName: "SIESA",
    sectorName: "Comercio",
    socio: "Socio Uno",
    gerente: "Gerente Uno",
    senior: "Senior Uno",
    staff: ["Staff Dos", "Staff Uno"],
    modules: [{ moduleId: 1, status: "configured" }], // módulo 2 ausente
    dianFormIds: [10], // solo IVA
  },
  {
    code: "C-1002",
    name: "Comercializadora Andina Ltda.",
    nit: "800123456-7",
    tipo: "B",
    erpName: null, // Sin ERP
    sectorName: null,
    socio: null,
    gerente: "Gerente Uno",
    senior: "Senior Uno",
    staff: [],
    modules: [{ moduleId: 2, status: "pending" }],
    dianFormIds: [],
  },
];

function indicePorHeader(ws: ExcelJS.Worksheet): Map<string, number> {
  const m = new Map<string, number>();
  ws.getRow(1).eachCell((cell, c) => {
    const v = cell.value;
    if (typeof v === "string") m.set(v, c);
  });
  return m;
}

test("exporta una hoja Clientes con encabezados, estado de módulos y DIAN", async () => {
  const buffer = await crearExportacionClientes(CLIENTES, CATALOGO, new Date("2026-06-25"));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);

  const ws = wb.getWorksheet("Clientes");
  expect(ws).toBeTruthy();

  const idx = indicePorHeader(ws!);
  // Columnas fijas + una por módulo + una por DIAN (ordenadas por código).
  for (const h of [
    "Código",
    "Razón social",
    "NIT",
    "Tipo",
    "ERP",
    "Socio (firma)",
    "Staff (ejecuta)",
    "Inventarios",
    "Cartera",
    "DIAN · IVA (F-300)",
    "DIAN · Retención en la fuente (F-350)",
  ]) {
    expect(idx.has(h), `falta el encabezado «${h}»`).toBe(true);
  }
  // El orden DIAN se normaliza por código: F-300 antes que F-350.
  expect(idx.get("DIAN · IVA (F-300)")!).toBeLessThan(
    idx.get("DIAN · Retención en la fuente (F-350)")!,
  );

  const cel = (fila: number, header: string) => ws!.getCell(fila, idx.get(header)!).value;

  // Cliente A (fila 2): módulo configurado, módulo ausente, IVA activo, retención no.
  expect(cel(2, "Código")).toBe("C-1001");
  expect(cel(2, "Inventarios")).toBe("Parametrizado");
  expect(cel(2, "Cartera")).toBe("No activo");
  expect(cel(2, "DIAN · IVA (F-300)")).toBe("Sí");
  expect(cel(2, "DIAN · Retención en la fuente (F-350)")).toBe("No");
  expect(cel(2, "Staff (ejecuta)")).toBe("Staff Dos; Staff Uno");

  // Cliente B (fila 3): sin ERP, módulo pendiente, sin socio.
  expect(cel(3, "ERP")).toBe("Sin ERP");
  expect(cel(3, "Cartera")).toBe("Pendiente");
  expect(cel(3, "Inventarios")).toBe("No activo");
  expect(cel(3, "Socio (firma)")).toBe("—");
});

test("incluye una hoja Resumen con el total de clientes", async () => {
  const buffer = await crearExportacionClientes(CLIENTES, CATALOGO, new Date("2026-06-25"));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);

  const ws = wb.getWorksheet("Resumen");
  expect(ws).toBeTruthy();
  const texto = JSON.stringify(ws!.getSheetValues());
  expect(texto).toContain("Total de clientes");
  expect(texto).toContain("Clientes de la plataforma");
});

test("genera un archivo válido aun sin clientes", async () => {
  const buffer = await crearExportacionClientes([], CATALOGO, new Date("2026-06-25"));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.getWorksheet("Clientes");
  expect(ws).toBeTruthy();
  const idx = indicePorHeader(ws!);
  expect(idx.has("Código")).toBe(true);
  expect(ws!.rowCount).toBe(1); // solo el encabezado
});
