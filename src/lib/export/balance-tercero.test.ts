import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { crearExportacionBalanceTercero } from "./balance-tercero";
import { construirArbolTercero, resumirArbolTercero } from "@/lib/balance/arbol-tercero";
import type { FilaBalanceTercero } from "@/lib/balance/tercero-vista";

let seq = 0;
function fila(p: Partial<FilaBalanceTercero> & { cuenta8: string }): FilaBalanceTercero {
  seq += 1;
  return {
    id: seq, cuenta2: p.cuenta8.slice(0, 2), cuenta4: p.cuenta8.slice(0, 4), cuenta6: p.cuenta8.slice(0, 6),
    nombreCuenta: `Cuenta ${p.cuenta8}`, cuenta6Russell: null, nitTercero: null, nombreTercero: null,
    saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 0, ...p,
  };
}

const META = { cliente: "ACME", nit: "900111", periodo: "Ene 2026", version: "v1", archivo: "b.xlsx", generadoEn: new Date(2026, 0, 1) };

async function abrir(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

describe("crearExportacionBalanceTercero", () => {
  it("escribe el árbol con outline, los terceros bajo su cuenta y el detalle plano", async () => {
    const arbol = construirArbolTercero([
      fila({ cuenta8: "1305", nombreCuenta: "CLIENTES", saldoFinal: 120 }),
      fila({ cuenta8: "130505", nombreCuenta: "NACIONALES", saldoFinal: 100 }),
      fila({ cuenta8: "13050501", nombreCuenta: "Nacionales", cuenta6Russell: "130505", saldoFinal: 100 }),
      fila({ cuenta8: "13050501", nombreCuenta: "Nacionales", nitTercero: "1", nombreTercero: "A", saldoFinal: 60 }),
      fila({ cuenta8: "13050501", nombreCuenta: "Nacionales", nitTercero: "2", nombreTercero: "B", saldoFinal: 40 }),
    ]);
    const resumen = resumirArbolTercero(arbol);
    const wb = await abrir(await crearExportacionBalanceTercero({ arbol, resumen, filasArchivo: 5, meta: META }));

    const ws = wb.getWorksheet("Balance por tercero")!;
    // Fila 4 = encabezados; 5 = grupo 13 (derivado), 6 = 1305, 7 = 130505, 8 = 13050501, 9-10 = terceros.
    expect(ws.getCell("C5").value).toBe("13");
    expect(ws.getCell("D5").value).toBe("Deudores");
    expect(ws.getRow(5).outlineLevel).toBe(0);
    expect(ws.getCell("C6").value).toBe("1305");
    expect(ws.getCell("L6").value).toBe(120);
    expect(ws.getCell("M6").value).toBe(20); // Δ declarado (120) − desglose (100)
    expect(ws.getRow(6).font?.bold).toBe(true);
    expect(ws.getCell("C8").value).toBe("13050501");
    expect(ws.getCell("B8").value).toBe("Movimiento");
    expect(ws.getCell("E8").value).toBe("130505");
    expect(ws.getCell("H8").value).toBe(2);
    expect(ws.getRow(8).outlineLevel).toBe(3);
    expect(ws.getCell("A9").value).toBe("Tercero");
    expect(ws.getCell("F9").value).toBe("1");
    expect(ws.getCell("G9").value).toBe("A");
    expect(ws.getCell("L9").value).toBe(60);
    expect(ws.getRow(9).outlineLevel).toBe(4);
    expect(ws.getCell("G10").value).toBe("B");

    const det = wb.getWorksheet("Detalle")!;
    expect(det.getCell("A5").value).toBe("13050501");
    expect(det.getCell("D5").value).toBe("1");
    expect(det.getCell("I6").value).toBe(40);
    expect(det.getCell("A7").value).toBeNull();

    const res = wb.getWorksheet("Resumen")!;
    expect(res.getCell("A5").value).toBe("Cuentas imputables");
    expect(res.getCell("B5").value).toBe(1);
    expect(res.getCell("B15").value).toBe(120); // saldo actual
  });

  it("marca los terceros sin NIT y las cuentas sin homologar", async () => {
    const arbol = construirArbolTercero([
      fila({ cuenta8: "22050501", nombreCuenta: "Proveedores", nitTercero: null, nombreTercero: "FMI220315FX3", saldoFinal: -10 }),
    ]);
    const wb = await abrir(await crearExportacionBalanceTercero({ arbol, resumen: resumirArbolTercero(arbol), filasArchivo: 1, meta: { ...META, nit: null } }));
    const ws = wb.getWorksheet("Balance por tercero")!;
    // 5 = 22, 6 = 2205, 7 = 220505, 8 = imputable, 9 = tercero
    expect(ws.getCell("E8").value).toBe("Sin homologar");
    expect(ws.getCell("F9").value).toBe("Sin NIT");
    expect(ws.getCell("G9").value).toBe("FMI220315FX3");
    expect(String(ws.getCell("A1").value)).not.toContain("NIT");
  });
});
