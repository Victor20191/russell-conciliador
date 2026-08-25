import { test, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseConceptosNominaWorkbook, HOJA_CONCEPTOS } from "./conceptos-nomina";

const HEADERS = ["Cliente (NIT o código) *", "Código *", "Concepto *", "Cuenta (4 dígitos) *"];

async function construir(filas: (string | null)[][], hoja = HOJA_CONCEPTOS, headers = HEADERS) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(hoja);
  headers.forEach((h, i) => (ws.getRow(1).getCell(i + 1).value = h));
  filas.forEach((fila, fi) => fila.forEach((v, ci) => (ws.getRow(2 + fi).getCell(ci + 1).value = v)));
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

test("parsea conceptos de varios clientes", async () => {
  const buf = await construir([
    ["900.451.227-3", "001", "Sueldo básico", "5105"],
    ["C-1042", "002", "Auxilio de transporte", "5105"],
  ]);
  const { filas, errores } = await parseConceptosNominaWorkbook(buf);
  expect(errores).toEqual([]);
  expect(filas).toHaveLength(2);
  expect(filas[0]).toMatchObject({
    fila: 2,
    cliente: "900.451.227-3",
    codigo: "001",
    concepto: "Sueldo básico",
    cuentas4: ["5105"],
  });
  expect(filas[1].cliente).toBe("C-1042");
});

test("una fila admite varias cuentas separadas con «;» y las deduplica", async () => {
  const buf = await construir([["900", "010", "Cesantías", "5105 ; 7205; 5105"]]);
  const { filas, errores } = await parseConceptosNominaWorkbook(buf);
  expect(errores).toEqual([]);
  expect(filas[0].cuentas4).toEqual(["5105", "7205"]);
});

test("la cuenta se normaliza a 4 dígitos (acepta separadores y códigos largos)", async () => {
  const buf = await construir([["900", "020", "Prima", "51.05"]]);
  const { filas } = await parseConceptosNominaWorkbook(buf);
  expect(filas[0].cuentas4).toEqual(["5105"]);

  const largo = await construir([["900", "021", "Prima", "510506"]]);
  const r = await parseConceptosNominaWorkbook(largo);
  expect(r.filas[0].cuentas4).toEqual(["5105"]);
});

test("los cuatro campos son requeridos", async () => {
  const buf = await construir([
    [null, "001", "Sueldo", "5105"],
    ["900", null, "Sueldo", "5105"],
    ["900", "002", null, "5105"],
    ["900", "003", "Sueldo", null],
  ]);
  const { filas, errores } = await parseConceptosNominaWorkbook(buf);
  expect(filas).toEqual([]);
  expect(errores.map((e) => e.fila)).toEqual([2, 3, 4, 5]);
  expect(errores[0].mensaje).toMatch(/cliente/i);
  expect(errores[1].mensaje).toMatch(/código/i);
  expect(errores[2].mensaje).toMatch(/nombre del concepto/i);
  expect(errores[3].mensaje).toMatch(/cuenta/i);
});

test("rechaza una cuenta que no llega a 4 dígitos", async () => {
  const buf = await construir([["900", "001", "Sueldo", "51"]]);
  const { filas, errores } = await parseConceptosNominaWorkbook(buf);
  expect(filas).toEqual([]);
  expect(errores[0].mensaje).toMatch(/Cuenta inválida/);
});

test("delata el mismo código repetido para un cliente", async () => {
  const buf = await construir([
    ["900", "001", "Sueldo básico", "5105"],
    ["900", "001", "Sueldo básico", "7205"],
  ]);
  const { filas, errores } = await parseConceptosNominaWorkbook(buf);
  expect(filas).toHaveLength(1);
  expect(errores).toHaveLength(1);
  expect(errores[0].fila).toBe(3);
  expect(errores[0].mensaje).toMatch(/ya venía para este cliente en la fila 2/);
});

test("el mismo código en clientes distintos no es duplicado", async () => {
  const buf = await construir([
    ["900", "001", "Sueldo básico", "5105"],
    ["800", "001", "Sueldo básico", "5105"],
  ]);
  const { filas, errores } = await parseConceptosNominaWorkbook(buf);
  expect(errores).toEqual([]);
  expect(filas).toHaveLength(2);
});

test("salta filas vacías y de EJEMPLO", async () => {
  const buf = await construir([
    ["900", "001", "EJEMPLO — borrar esta fila", "5105"],
    [null, null, null, null],
    ["900", "002", "Sueldo básico", "5105"],
  ]);
  const { filas, errores } = await parseConceptosNominaWorkbook(buf);
  expect(errores).toEqual([]);
  expect(filas).toHaveLength(1);
  expect(filas[0].codigo).toBe("002");
});

test("sin la hoja «Conceptos» devuelve un error de estructura", async () => {
  const buf = await construir([["900", "001", "Sueldo", "5105"]], "Hoja1");
  const { filas, errores } = await parseConceptosNominaWorkbook(buf);
  expect(filas).toEqual([]);
  expect(errores[0].mensaje).toMatch(/No se encontró la hoja/);
});

test("delata encabezados faltantes sin procesar filas", async () => {
  const buf = await construir([["900", "001", "Sueldo"]], HOJA_CONCEPTOS, [
    "Cliente *",
    "Código *",
    "Concepto *",
  ]);
  const { filas, errores } = await parseConceptosNominaWorkbook(buf);
  expect(filas).toEqual([]);
  expect(errores).toHaveLength(1);
  expect(errores[0].mensaje).toMatch(/faltan columnas \(Cuenta/);
});

test("«Código del concepto» no se confunde con la columna del concepto", async () => {
  const buf = await construir([["900", "001", "Sueldo básico", "5105"]], HOJA_CONCEPTOS, [
    "NIT del cliente",
    "Código del concepto",
    "Concepto",
    "Cuenta Russell",
  ]);
  const { filas, errores } = await parseConceptosNominaWorkbook(buf);
  expect(errores).toEqual([]);
  expect(filas[0]).toMatchObject({ codigo: "001", concepto: "Sueldo básico" });
});

test("un archivo que no es .xlsx devuelve el error de archivo", async () => {
  const { filas, errores } = await parseConceptosNominaWorkbook(Buffer.from("no soy un excel"));
  expect(filas).toEqual([]);
  expect(errores[0].hoja).toBe("Archivo");
});
