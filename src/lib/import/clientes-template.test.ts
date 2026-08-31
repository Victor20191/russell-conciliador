import { test, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseClientesWorkbook } from "./clientes";
import { crearPlantillaImportacionClientes } from "./clientes-template";

const CATALOGO = {
  modulos: [{ name: "Inventarios" }, { name: "Cartera" }],
  dianForms: [
    { name: "Retención en la fuente", code: "F-350" },
    { name: "IVA", code: "F-300" },
  ],
  personas: [
    { name: "Socio Uno", role: "Socio" },
    { name: "Gerente Uno", role: "Gerente" },
    { name: "Senior Uno", role: "Senior" },
    { name: "Staff Uno", role: "Staff" },
    { name: "Staff Dos", role: "Staff" },
  ],
  erps: ["SIESA"],
  sectores: ["Comercio"],
};

test("genera una plantilla compatible con el parser de clientes", async () => {
  const buffer = await crearPlantillaImportacionClientes(CATALOGO);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.getWorksheet("Clientes");
  expect(ws).toBeTruthy();

  const headers = (ws!.getRow(1).values as unknown[]).filter(Boolean);
  expect(headers).toContain("Cartera");
  expect(headers).toContain("Inventarios");
  expect(headers).toContain("ERP · CONT · Contabilidad");
  expect(headers).toContain("ERP · NOM · Nómina");
  expect(headers).toContain("DIAN · IVA (F-300)");
  expect(headers).toContain("DIAN · Retención en la fuente (F-350)");

  ws!.addRow([
    "Cliente Real S.A.S.",
    "900100200-3",
    "A",
    "SIESA",
    "",
    "",
    "",
    "",
    "",
    "",
    "Comercio",
    "Socio Uno",
    "Gerente Uno",
    "Senior Uno",
    "Staff Uno; Staff Dos",
    "Sí",
    "No",
    "Sí",
    "No",
  ]);

  const actualizado = await wb.xlsx.writeBuffer();
  const { filas, errores } = await parseClientesWorkbook(actualizado as ArrayBuffer);
  expect(errores).toEqual([]);
  expect(filas).toHaveLength(1);
  expect(filas[0].modulos).toEqual(["Cartera"]);
  expect(filas[0].dianCodes).toEqual(["F-300"]);
});
