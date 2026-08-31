import { test, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseClientesWorkbook } from "./clientes";

const HEADERS = [
  "Razón social *",
  "NIT *",
  "Tipo de cliente *",
  "ERP *",
  "Sector *",
  "Socio (firma) *",
  "Gerente (valida) *",
  "Senior (revisa) *",
  "Staff (ejecuta) * — uno o varios, separar con ;",
  "Activos fijos",
  "Cartera",
  "Cuentas por pagar",
  "Ingresos",
  "Inventarios",
  "Nómina",
  "DIAN · IVA (F-300)",
  "DIAN · Retención en la fuente (F-350)",
  "DIAN · ICA (F-CHIP)",
];

async function construir(filas: (string | null)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Clientes");
  HEADERS.forEach((h, i) => (ws.getRow(1).getCell(i + 1).value = h));
  filas.forEach((fila, fi) => fila.forEach((v, ci) => (ws.getRow(2 + fi).getCell(ci + 1).value = v)));
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

test("parsea cliente con responsables, módulos y DIAN", async () => {
  const buf = await construir([
    [
      "Inversiones del Pacífico", "900.451.227-3", "A", "SIESA", "Comercio",
      "Demo Socio", "Demo Gerente", "Demo Senior", "Demo Staff Uno; Demo Staff Dos",
      "No", "Sí", "Sí", "Sí", "No", "No",
      "Sí", "Sí", "No",
    ],
  ]);
  const { filas, errores } = await parseClientesWorkbook(buf);
  expect(errores).toEqual([]);
  expect(filas).toHaveLength(1);
  const f = filas[0];
  expect(f.tipo).toBe("A");
  expect(f.staff).toEqual(["Demo Staff Uno", "Demo Staff Dos"]);
  expect(f.modulos.sort()).toEqual(["Cartera", "Cuentas por pagar", "Ingresos"]);
  expect(f.dianCodes).toEqual(["F-300", "F-350"]);
  // La fila marca Sí/No, así que los bloques NO están en blanco.
  expect(f.modulosEnBlanco).toBe(false);
  expect(f.dianEnBlanco).toBe(false);
});

test("distingue ERP contable, de nómina e inventarios por encabezado", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Clientes");
  const headers = [
    "Razón social *", "NIT *", "Tipo de cliente *",
    "ERP CONTABLE", "ERP NÓMINA", "ERP INVENTARIOS", "Sector *",
    "Socio (firma) *", "Gerente (valida) *", "Senior (revisa) *", "Staff (ejecuta) *",
  ];
  headers.forEach((header, index) => { ws.getRow(1).getCell(index + 1).value = header; });
  [
    "Cliente multiproceso", "900123", "A", "SIIGO", "BUK", "NEWSTOCK", "Comercio",
    "Demo Socio", "Demo Gerente", "Demo Senior", "Demo Staff Uno",
  ].forEach((valor, index) => { ws.getRow(2).getCell(index + 1).value = valor; });

  const { filas, errores } = await parseClientesWorkbook((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  expect(errores).toEqual([]);
  expect(filas[0].erps).toEqual({ CONT: "SIIGO", NOM: "BUK", INV: "NEWSTOCK" });
  expect(filas[0].erp).toBe("SIIGO");
});

test("rechaza dos columnas ERP para el mismo proceso", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Clientes");
  [
    "Razón social *", "NIT *", "Tipo de cliente *", "ERP", "ERP CONTABLE", "Sector *",
    "Socio *", "Gerente *", "Senior *", "Staff *",
  ].forEach((header, index) => { ws.getRow(1).getCell(index + 1).value = header; });
  const { filas, errores } = await parseClientesWorkbook((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  expect(filas).toEqual([]);
  expect(errores.some((error) => /más de una columna ERP.*CONT/.test(error.mensaje))).toBe(true);
});

test("bloque de módulos/DIAN en blanco activa las banderas (→ todos por defecto)", async () => {
  const buf = await construir([
    // Solo datos + responsables; módulos y DIAN en blanco.
    ["Acme", "800", "C", "SAP", "Industria", "Demo Socio", "Demo Gerente", "Demo Senior", "Demo Staff Uno"],
  ]);
  const { filas, errores } = await parseClientesWorkbook(buf);
  expect(errores).toEqual([]);
  expect(filas[0].modulos).toEqual([]);
  expect(filas[0].dianCodes).toEqual([]);
  expect(filas[0].modulosEnBlanco).toBe(true);
  expect(filas[0].dianEnBlanco).toBe(true);
});

test("«No» explícito NO deja el bloque en blanco (excluye, no activa todos)", async () => {
  const buf = await construir([
    [
      "Beta", "801", "A", "SAP", "Industria", "Demo Socio", "Demo Gerente", "Demo Senior", "Demo Staff Uno",
      "No", "No", "No", "No", "No", "No", "No", "No", "No",
    ],
  ]);
  const { filas } = await parseClientesWorkbook(buf);
  expect(filas[0].modulos).toEqual([]);
  expect(filas[0].modulosEnBlanco).toBe(false);
  expect(filas[0].dianEnBlanco).toBe(false);
});

test("omite filas de ejemplo y vacías", async () => {
  const buf = await construir([
    ["Ej", "1", "A", "SAP", "X", "S", "G", "Sr", "St", "", "", "", "", "", "", "", "", "", "← EJEMPLO (borrar)" as unknown as string],
    [null, null, null, null, null, null, null, null, null],
    ["Real", "999", "B", "SIIGO", "Salud", "Demo Socio", "Demo Gerente", "Demo Senior", "Demo Staff Uno"],
  ]);
  const { filas, errores } = await parseClientesWorkbook(buf);
  expect(errores).toEqual([]);
  expect(filas).toHaveLength(1);
  expect(filas[0].name).toBe("Real");
});

test("reporta campos faltantes y tipo inválido", async () => {
  const buf = await construir([
    ["", "100", "D", "", "Comercio", "Demo Socio", "Demo Gerente", "Demo Senior", ""],
  ]);
  const { errores } = await parseClientesWorkbook(buf);
  const msgs = errores.map((e) => e.mensaje).join(" | ");
  expect(msgs).toMatch(/Falta la razón social/);
  expect(msgs).toMatch(/Tipo inválido/);
  expect(msgs).toMatch(/Falta al menos un staff/);
  // El ERP ya NO es obligatorio al cargar: su ausencia no genera error.
  expect(msgs).not.toMatch(/Falta el ERP/);
});

test("error si falta la hoja Clientes", async () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Otra");
  const { errores } = await parseClientesWorkbook((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  expect(errores.some((e) => /No se encontró la hoja «Clientes»/.test(e.mensaje))).toBe(true);
});
