import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { parseMonto, parseBalanceWorkbook } from "./balance";

describe("parseMonto", () => {
  it("interpreta formato es-CO (miles «.», decimal «,»)", () => {
    expect(parseMonto("1.234.567,89")).toBe(1234567.89);
    expect(parseMonto("1.000,50")).toBe(1000.5);
    expect(parseMonto("440180500")).toBe(440180500);
  });
  it("maneja negativos por signo y por paréntesis", () => {
    expect(parseMonto("-1.234")).toBe(-1234);
    expect(parseMonto("(1.234)")).toBe(-1234);
  });
  it("ignora el símbolo de moneda y espacios", () => {
    expect(parseMonto("$ 1.000")).toBe(1000);
    expect(parseMonto("  2.500  ")).toBe(2500);
  });
  it("trata el vacío como 0 y lo no numérico como null", () => {
    expect(parseMonto("")).toBe(0);
    expect(parseMonto("-")).toBe(0);
    expect(parseMonto("abc")).toBeNull();
    expect(parseMonto("12x3")).toBeNull();
  });
});

async function buildXlsx(rows: (string | number)[][], sheet = "Balance"): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  for (const r of rows) ws.addRow(r);
  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}

function buildXls(hojas: Record<string, (string | number)[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), nombre);
  }
  return XLSX.write(wb, { type: "array", bookType: "biff8" }) as ArrayBuffer;
}

describe("parseBalanceWorkbook", () => {
  it("lee cuentas, salta totales y filas de ejemplo", async () => {
    const buf = await buildXlsx([
      ["Código", "Cuenta", "Saldo anterior", "Saldo final"],
      ["110505", "Caja general", 800, 1000],
      ["111005", "Bancos", 2000, 2500],
      ["EJEMPLO", "fila de ejemplo", 0, 0],
      ["TOTAL", "Total activo", "", 3500], // código no numérico → omitido
      ["", "", "", ""], // vacía
    ]);
    const { filas, errores } = await parseBalanceWorkbook(buf);
    expect(errores).toHaveLength(0);
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({ code: "110505", name: "Caja general", prevBalance: 800, balance: 1000 });
    expect(filas[1]).toMatchObject({ code: "111005", balance: 2500 });
  });

  it("acepta saldo final partido en débito/crédito", async () => {
    const buf = await buildXlsx([
      ["Código", "Cuenta", "Saldo Débito", "Saldo Crédito"],
      ["110505", "Caja", 1000, 0],
      ["220505", "Proveedores", 0, 3000],
    ]);
    const { filas, errores } = await parseBalanceWorkbook(buf);
    expect(errores).toHaveLength(0);
    expect(filas.find((f) => f.code === "110505")?.balance).toBe(1000);
    expect(filas.find((f) => f.code === "220505")?.balance).toBe(-3000);
  });

  it("normaliza el código quitando puntos y espacios", async () => {
    const buf = await buildXlsx([
      ["Código", "Cuenta", "Saldo final"],
      ["1105.05", "Caja", 1000],
    ]);
    const { filas } = await parseBalanceWorkbook(buf);
    expect(filas[0]?.code).toBe("110505");
  });

  it("reporta encabezados faltantes", async () => {
    const buf = await buildXlsx([
      ["Código", "Cuenta"], // falta saldo final
      ["110505", "Caja"],
    ]);
    const { filas, errores } = await parseBalanceWorkbook(buf);
    expect(filas).toHaveLength(0);
    expect(errores[0].mensaje).toMatch(/Saldo final/);
  });

  it("reporta códigos repetidos", async () => {
    const buf = await buildXlsx([
      ["Código", "Cuenta", "Saldo final"],
      ["110505", "Caja", 1000],
      ["110505", "Caja duplicada", 2000],
    ]);
    const { errores } = await parseBalanceWorkbook(buf);
    expect(errores.some((e) => /repetido/i.test(e.mensaje))).toBe(true);
  });

  it("rechaza un archivo ilegible", async () => {
    const { errores } = await parseBalanceWorkbook(Buffer.from("no soy un xlsx"));
    expect(errores).toHaveLength(1);
    expect(errores[0].hoja).toBe("Archivo");
  });

  it("usa el parser de respaldo con un archivo .xls genuino", async () => {
    const data = buildXls({
      Balance: [
        ["Código", "Cuenta", "Saldo anterior", "Saldo final"],
        ["110505", "Caja general", 800, 1000],
        ["220505", "Proveedores", 0, -3000],
      ],
    });
    const { filas, errores } = await parseBalanceWorkbook(data, { archivoNombre: "balance.xls" });
    expect(errores).toHaveLength(0);
    expect(filas).toEqual([
      { fila: 2, code: "110505", name: "Caja general", prevBalance: 800, balance: 1000 },
      { fila: 3, code: "220505", name: "Proveedores", prevBalance: 0, balance: -3000 },
    ]);
  });

  it("respeta la hoja elegida en un .xls multihoja", async () => {
    const data = buildXls({
      Instrucciones: [["Lee la otra hoja"]],
      Marzo: [
        ["Código", "Cuenta", "Saldo final"],
        ["110505", "Caja", 2500],
      ],
    });
    const { filas, errores } = await parseBalanceWorkbook(data, {
      archivoNombre: "balance.xls",
      hoja: "Marzo",
    });
    expect(errores).toHaveLength(0);
    expect(filas[0]).toMatchObject({ code: "110505", name: "Caja", balance: 2500 });
  });
});
