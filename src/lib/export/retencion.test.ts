import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { F350_2026, F490_2026 } from "@/lib/impuestos/__fixtures__/retencion-2026";
import { periodosRevision } from "@/lib/impuestos/retencion/periodos-revision";
import { vistasRevision } from "@/lib/impuestos/retencion/vistas";
import { cruceRetencion, type CruceRetencionVista } from "@/lib/impuestos/retencion/cruce";
import { CUENTAS_SIN_RESTA_DIAN_FABRICA, MAPEO_F350_FABRICA, TERCEROS_DIAN_FABRICA } from "@/lib/impuestos/mapeo-dian";
import { excelRetencion, libroRetencion } from "./retencion";

const periodos = periodosRevision({ periodicidad: "Mensual", mesCorte: 8, formularios350: F350_2026, formularios490: F490_2026, porConfirmar: [], causales: [] });
const vista = vistasRevision(periodos);
const tercero = (nit: string | null, nombre: string, saldoFinal: number) => ({ cuentaCliente: "23650501", nombreCuenta: "Retención salarios", cuentaRussell: "236505", nit, nombreTercero: nombre, saldoInicial: 0, saldoFinal });
const cruce: CruceRetencionVista = {
  estado: "listo", mensaje: null, umbral: 6_000, inicioEnero: true,
  balance: { id: 1, descripcion: "Balance agosto 2026 · v1", periodoInicio: "2026-01-01", periodoFin: "2026-08-31" },
  resultado: cruceRetencion({
    periodos, mapeo: MAPEO_F350_FABRICA, sinRestaDian: new Set(CUENTAS_SIN_RESTA_DIAN_FABRICA), tercerosDian: TERCEROS_DIAN_FABRICA, nombresRussell: new Map(),
    filasContables: [tercero("800111222", "PROVEEDOR A", -1_074_373_000), tercero("800197268", "DIAN", 900_000_000)], inicioEnero: true, umbral: 6_000,
    marcas: [{ clave: "236705", numero: 1, nota: "Falta la contabilidad del reteIVA", referenciaAnexo: "PT-RET-02", diferencia: 17_817_000, marcadoPor: "Senior", marcadoEn: "2026-10-31T15:00:00.000Z" }],
  }),
};
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

  it("con el cruce: hoja «Cruce contable» con el total 136, todos los terceros (la DIAN tachada) y las marcas", () => {
    const wb = libroRetencion(meta, vista, formularios, cruce);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Por meses", "Acumulado", "Formularios", "Cruce contable"]);
    const ws = wb.getWorksheet("Cruce contable")!;
    const filas: ExcelJS.Row[] = [];
    ws.eachRow((f) => filas.push(f));
    const total = filas.find((f) => f.getCell(1).value === "Total retenciones (136)")!;
    expect([total.getCell(4).value, total.getCell(5).value]).toEqual([1_092_190_000, 1_074_373_000]);
    const dian = filas.find((f) => f.getCell(4).value === "800197268")!;
    expect(dian.getCell(8).value).toBe("DIAN · se resta");
    expect(dian.font?.strike).toBe(true);
    const marca = filas.find((f) => f.getCell(3).value === "Falta la contabilidad del reteIVA")!;
    expect([marca.getCell(1).value, marca.getCell(4).value]).toEqual([1, "PT-RET-02"]);
  });

  it("sin balance para el cruce, la hoja lo explica", () => {
    const ws = libroRetencion(meta, vista, formularios, { estado: "sin_balance", mensaje: "No hay un balance cerrado con corte en 2026-08.", balance: null, umbral: 6_000 }).getWorksheet("Cruce contable")!;
    expect(ws.getRow(4).getCell(1).value).toBe("No hay un balance cerrado con corte en 2026-08.");
  });

  it("se escribe con la marca y se vuelve a leer", async () => {
    const buffer = await excelRetencion(meta, vista, formularios);
    const leido = new ExcelJS.Workbook();
    await leido.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(leido.getWorksheet("Formularios")!.getRow(5).getCell(3).value).toBe("3510673781751");
  });
});
