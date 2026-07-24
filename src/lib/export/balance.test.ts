import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { agruparJerarquia, agruparPorRussell, type CuentaEstandar } from "@/lib/balance/calcular";
import { crearExportacionBalance } from "./balance";

const STD: CuentaEstandar[] = [
  { code: "110505", nature: "D", critical: false, name: "Caja general" },
  { code: "220505", nature: "C", critical: false, name: "Proveedores nacionales" },
];
const NOMBRES = new Map(STD.map((s) => [s.code, s.name ?? s.code]));
const FILAS = [
  { cuenta8: "11050501", nombreCuenta: "Caja sede A", cuenta6Russell: "110505", coincidencia: 100, saldoInicial: 100, debitos: 0, creditos: 0, saldoFinal: 100 },
  { cuenta8: "11050502", nombreCuenta: "Caja sede B", cuenta6Russell: "110505", coincidencia: 100, saldoInicial: 50, debitos: 0, creditos: 0, saldoFinal: 50 },
  { cuenta8: "22050501", nombreCuenta: "Prov X", cuenta6Russell: "220505", coincidencia: 90, saldoInicial: 0, debitos: 0, creditos: 200, saldoFinal: -200 },
];
const META = { cliente: "ACEROS", periodo: "Ene 2026", version: "v1", generadoEn: new Date(2026, 0, 1) };

describe("crearExportacionBalance", () => {
  const arbol = agruparJerarquia(FILAS, STD, NOMBRES);
  const grupos = agruparPorRussell(FILAS, STD, NOMBRES);

  it("genera un .xlsx no vacío en la vista HOMOLOGADO (con jerarquía)", async () => {
    const buf = await crearExportacionBalance({ arbol, grupos }, META, "homologado");
    expect(buf.length).toBeGreaterThan(0);
    // Firma OOXML (zip): PK\x03\x04
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("genera un .xlsx no vacío en la vista COMPARATIVO", async () => {
    const buf = await crearExportacionBalance({ arbol, grupos }, META, "comparativo");
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("HOMOLOGADO: separa el número y la descripción del nivel PUC", async () => {
    const buf = await crearExportacionBalance({ arbol, grupos }, META, "homologado");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Balance homologado")!;
    // Encabezados (fila 3): número, descripción, cuenta y los montos.
    expect(ws.getCell("A3").value).toBe("Número de nivel");
    expect(ws.getCell("B3").value).toBe("Descripción del nivel");
    expect(ws.getCell("C3").value).toBe("Cuenta");
    expect(ws.getCell("G3").value).toBe("Saldo actual");
    // Primera fila de datos (4): CLASE «1 - Activo», nivel 1 y descripción «Clase».
    expect(ws.getCell("A4").value).toBe(1);
    expect(ws.getCell("B4").value).toBe("Clase");
    expect(String(ws.getCell("C4").value)).toBe("1 - Activo");
    // Alguna fila de SUBCUENTA (6 díg) trae nivel 4, «Subcuenta» y «110505 - …».
    const niveles: number[] = [];
    const descripciones: string[] = [];
    const cuentas: string[] = [];
    ws.eachRow((r) => {
      if (typeof r.getCell(1).value === "number") niveles.push(r.getCell(1).value);
      descripciones.push(String(r.getCell(2).value ?? ""));
      cuentas.push(String(r.getCell(3).value ?? ""));
    });
    expect(niveles).toEqual(expect.arrayContaining([1, 2, 3, 4]));
    expect(descripciones).toContain("Subcuenta");
    expect(cuentas.some((c) => /^110505 - /.test(c))).toBe(true);
  });

  it("HOMOLOGADO trae una pestaña «Validación» con fórmulas vivas sobre «Balance homologado»", async () => {
    const buf = await crearExportacionBalance({ arbol, grupos }, META, "homologado");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Validación");
    expect(ws).toBeTruthy();
    // Alguna celda de la col B debe ser una fórmula que referencia la hoja homologada.
    const formulas: string[] = [];
    ws!.eachRow((row) => { const v = row.getCell(2).value as { formula?: string } | null; if (v && typeof v === "object" && v.formula) formulas.push(v.formula); });
    expect(formulas.length).toBeGreaterThan(0);
    expect(formulas.some((f) => f.includes("Balance homologado"))).toBe(true);
    // Los saldos se desplazaron una columna: actual G, anterior D, débito E y crédito F.
    expect(formulas.some((f) => f.includes("'Balance homologado'!$G$"))).toBe(true);
    expect(formulas.some((f) => f.includes("'Balance homologado'!$D$"))).toBe(true);
    expect(formulas.some((f) => f.includes("'Balance homologado'!$E$"))).toBe(true);
    expect(formulas.some((f) => f.includes("'Balance homologado'!$F$"))).toBe(true);
    // Debe existir el chequeo de partida doble (IF … CUADRA/DESCUADRE).
    expect(formulas.some((f) => f.includes("CUADRA"))).toBe(true);
  });

  it("COMPARATIVO no agrega la pestaña de validación", async () => {
    const buf = await crearExportacionBalance({ arbol, grupos }, META, "comparativo");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.getWorksheet("Validación")).toBeFalsy();
  });
});
