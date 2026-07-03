import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { construirArbolBorrador, aplanarArbolFiltrado, type FilaBorrador } from "@/lib/balance/borrador";
import { crearExportacionBorrador } from "./borrador";

function fila(filaNum: number, codigo: string, nombre: string, saldoFinal: number, tipo: FilaBorrador["tipoFila"]): FilaBorrador {
  return { filaNum, codigo, codigoCrudo: codigo, nombre, nivel: codigo.length || null, tipoFila: tipo, saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal };
}

const META = { archivo: "prueba.xlsx", generadoEn: new Date(2026, 0, 1), filtro: [] as string[] };

async function abrir(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb.getWorksheet("Borrador")!;
}
const formula = (ws: ExcelJS.Worksheet, row: number, col: string) => {
  const v = ws.getCell(`${col}${row}`).value as { formula?: string } | null;
  return v && typeof v === "object" ? v.formula : undefined;
};

describe("crearExportacionBorrador · columnas con fórmula", () => {
  it("la agrupadora suma por FÓRMULA los 'Saldo actual' (col H) de sus hijos directos", async () => {
    const arbol = construirArbolBorrador([
      fila(1, "11", "DISPONIBLE", 900, "agrupadora"),
      fila(2, "110505", "CAJA", 600, "movimiento"),
      fila(3, "110510", "BANCOS", 300, "movimiento"),
    ]);
    const ws = await abrir(await crearExportacionBorrador(aplanarArbolFiltrado(arbol), META));
    // Header = fila 1; 11 → fila 2, 110505 → 3, 110510 → 4.
    expect(formula(ws, 2, "I")).toBe("SUM(H3,H4)"); // Suma hijos
    expect(formula(ws, 2, "J")).toBe("H2-I2"); // Δ vs hijos = Saldo actual − Suma hijos
    // Los movimientos (hojas) no llevan fórmula.
    expect(formula(ws, 3, "I")).toBeUndefined();
    expect(formula(ws, 4, "J")).toBeUndefined();
  });

  it("conserva el orden de archivo (summary-below): el subtotal referencia hijos de filas ANTERIORES", async () => {
    const mov = (fn: number, cod: string, s: number): FilaBorrador => ({ filaNum: fn, codigo: cod, codigoCrudo: cod, nombre: cod, nivel: cod.length, tipoFila: "movimiento", saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: s });
    const tot = (fn: number, cod: string, s: number): FilaBorrador => ({ filaNum: fn, codigo: cod, codigoCrudo: `TOTAL ${cod}`, nombre: cod, nivel: cod.length, tipoFila: "agrupadora", saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: s });
    const arbol = construirArbolBorrador([mov(1, "11050501", 100), tot(2, "110505", 100), tot(3, "1105", 100)]);
    const ws = await abrir(await crearExportacionBorrador(aplanarArbolFiltrado(arbol), META));
    // Orden de archivo: 11050501→2, 110505→3, 1105→4. El subtotal 110505 (fila 3)
    // suma a su hijo 11050501 (fila 2, ANTERIOR) → referencia hacia arriba.
    expect(formula(ws, 3, "I")).toBe("SUM(H2)");
    expect(formula(ws, 4, "I")).toBe("SUM(H3)"); // 1105 suma a 110505
  });
});
