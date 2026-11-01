import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { F350_2026, F490_2026 } from "@/lib/impuestos/__fixtures__/retencion-2026";
import { periodosRevision } from "@/lib/impuestos/retencion/periodos-revision";
import { vistasRevision } from "@/lib/impuestos/retencion/vistas";
import { excelRetencion, libroRetencion } from "./retencion";

const vista = vistasRevision(periodosRevision({ periodicidad: "Mensual", mesCorte: 8, formularios350: F350_2026, formularios490: F490_2026, porConfirmar: [], causales: [] }));
const meta = { cliente: "CLIENTE DE PRUEBA S.A.S.", nit: "900123456", anio: 2026, corte: "agosto", periodicidad: "Mensual" };
const formularios = [{ periodo: "Enero", formulario: "350", numero: "3510673781751", estado: "Confirmado", correccionDe: "3510669606483", concepto: null, numeroPagado: null, fecha: "2026-04-07", autoadhesivo: "91900433058007", corregidoAMano: "" }];

/** Valor de la última columna de la fila cuya primera celda es `etiqueta`. */
function totalDe(ws: ExcelJS.Worksheet, etiqueta: string): unknown {
  let valor: unknown;
  ws.eachRow((fila) => { if (fila.getCell(1).value === etiqueta) valor = fila.getCell(fila.cellCount).value; });
  return valor;
}

describe("Excel de una revisión de Retención en la fuente", () => {
  it("tres hojas: por meses, acumulado y formularios", () => {
    expect(libroRetencion(meta, vista, formularios).worksheets.map((w) => w.name)).toEqual(["Por meses", "Acumulado", "Formularios"]);
  });

  it("los totales acumulados son los de la pantalla", () => {
    const wb = libroRetencion(meta, vista, formularios);
    for (const nombre of ["Por meses", "Acumulado"]) {
      const ws = wb.getWorksheet(nombre)!;
      expect(totalDe(ws, "Total retenciones renta y complementario"), nombre).toBe(1_074_373_000);
      expect(totalDe(ws, "Total retenciones IVA"), nombre).toBe(17_817_000);
      expect(totalDe(ws, "Total pagado"), nombre).toBe(1_085_860_000);
    }
  });

  it("se escribe con la marca y se vuelve a leer", async () => {
    const buffer = await excelRetencion(meta, vista, formularios);
    const leido = new ExcelJS.Workbook();
    await leido.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(leido.getWorksheet("Formularios")!.getRow(5).getCell(3).value).toBe("3510673781751");
  });
});
