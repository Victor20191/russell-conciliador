import ExcelJS from "exceljs";
import { CODIGOS_ERP_BASE, type CodigoProcesoErp } from "@/lib/erp-procesos";
import { celdaTexto, normalizar } from "./xlsx";

export type FilaErpsClienteExcel = {
  fila: number;
  nombre: string;
  nit: string;
  erps: Record<(typeof CODIGOS_ERP_BASE)[number], string | null>;
};

function esValorPendiente(valor: string): boolean {
  const compacto = normalizar(valor).replace(/[^a-z0-9]/g, "");
  return compacto === "" || compacto === "na";
}

export function normalizarValorErpExcel(valor: string): string | null {
  return esValorPendiente(valor) ? null : valor.trim();
}

function codigoProcesoEncabezado(valor: string): CodigoProcesoErp | null {
  const encabezado = normalizar(valor);
  if (/erp.*contab|contab.*erp/.test(encabezado)) return "CONT";
  if (/nomin/.test(encabezado)) return "NOM";
  if (/inventar/.test(encabezado)) return "INV";
  return null;
}

export async function leerErpsClientesExcel(buffer: Buffer): Promise<{
  hoja: string;
  filaEncabezado: number;
  filas: FilaErpsClienteExcel[];
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("El archivo no contiene hojas.");

  let filaEncabezado = 0;
  let columnaCliente = 0;
  let columnaNit = 0;
  const columnasProceso = new Map<CodigoProcesoErp, number>();

  for (let fila = 1; fila <= Math.min(20, worksheet.rowCount); fila++) {
    let cliente = 0;
    let nit = 0;
    const procesos = new Map<CodigoProcesoErp, number>();
    worksheet.getRow(fila).eachCell((celda, columna) => {
      const texto = celdaTexto(celda.value);
      const encabezado = normalizar(texto);
      if (/^cliente$|razon social/.test(encabezado)) cliente = columna;
      if (/^nit$|nit cliente/.test(encabezado)) nit = columna;
      const codigo = codigoProcesoEncabezado(texto);
      if (codigo) procesos.set(codigo, columna);
    });
    if (cliente && nit && CODIGOS_ERP_BASE.every((codigo) => procesos.has(codigo))) {
      filaEncabezado = fila;
      columnaCliente = cliente;
      columnaNit = nit;
      for (const [codigo, columna] of procesos) columnasProceso.set(codigo, columna);
      break;
    }
  }

  if (!filaEncabezado) {
    throw new Error("No se encontraron los encabezados CLIENTE, NIT, ERP CONTABLE, NÓMINA e INVENTARIO.");
  }

  const filas: FilaErpsClienteExcel[] = [];
  for (let numeroFila = filaEncabezado + 1; numeroFila <= worksheet.rowCount; numeroFila++) {
    const row = worksheet.getRow(numeroFila);
    const nombre = celdaTexto(row.getCell(columnaCliente).value);
    const nit = celdaTexto(row.getCell(columnaNit).value);
    const valores = Object.fromEntries(
      CODIGOS_ERP_BASE.map((codigo) => {
        const texto = celdaTexto(row.getCell(columnasProceso.get(codigo)!).value);
        return [codigo, normalizarValorErpExcel(texto)];
      }),
    ) as FilaErpsClienteExcel["erps"];

    if (!nombre && !nit && Object.values(valores).every((valor) => valor == null)) continue;
    if (!nombre || !nit) {
      throw new Error(`La fila ${numeroFila} debe tener CLIENTE y NIT.`);
    }
    filas.push({ fila: numeroFila, nombre, nit, erps: valores });
  }

  if (filas.length === 0) throw new Error("El archivo no contiene clientes para actualizar.");
  return { hoja: worksheet.name, filaEncabezado, filas };
}
