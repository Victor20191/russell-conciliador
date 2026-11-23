// Excel del DESCUADRE al agregar terceros a un balance por cuenta (cliente con la excepción de
// balance por terceros): cuenta por cuenta, el movimiento del balance contra el del archivo del ERP.
// Función PURA: recibe las filas ya calculadas y devuelve el Buffer del .xlsx.
import ExcelJS from "exceljs";
import { EXCEL, escribirLibroMarca, estiloEncabezado, rellenoMarca } from "./marca-excel";
import type { DescuadreMovimientos } from "@/lib/balance/movimientos-tercero";

export type DatosExcelDescuadre = {
  cliente: string;
  periodoBalance: string;
  versionBalance: string;
  archivo: string;
  generadoEn: string;
  /** Contra qué se amarró: «el saldo inicial del balance» o el balance de cierre de diciembre. */
  base: string;
  /** Regla 2 (cierre de diciembre): los débitos y créditos del balance no son del año y no se muestran. */
  conDebitosCreditos: boolean;
  descuadres: readonly DescuadreMovimientos[];
  sinCuentaEnBalance: readonly { cuenta: string; movimiento: number; bloquea: boolean }[];
};

const FORMATO_PESOS = '#,##0;[Red]-#,##0';

export async function crearExcelDescuadreMovimientos(d: DatosExcelDescuadre): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Russell Conciliador";
  const hoja = wb.addWorksheet("Descuadre");

  hoja.addRow(["Terceros agregados · movimiento del archivo contra el balance"]).font = { bold: true, size: 13, color: { argb: EXCEL.titulo } };
  hoja.addRow([`${d.cliente} · ${d.periodoBalance} · versión ${d.versionBalance}`]);
  hoja.addRow([`Archivo: ${d.archivo} · generado ${d.generadoEn}`]).font = { color: { argb: EXCEL.textoSecundario } };
  hoja.addRow([`Movimiento = débitos − créditos de enero al corte. En el balance: saldo final − ${d.base}.`]).font = { italic: true, color: { argb: EXCEL.textoSecundario } };
  hoja.addRow([]);

  const encabezado = hoja.addRow([
    "Cuenta", "Nombre de la cuenta", "¿Impide guardar?",
    "Movimiento del balance", "Movimiento del archivo", "Diferencia",
    ...(d.conDebitosCreditos ? ["Débitos del balance", "Débitos del archivo", "Créditos del balance", "Créditos del archivo"] : ["Débitos del archivo", "Créditos del archivo"]),
  ]);
  estiloEncabezado(encabezado);
  for (const [i, x] of d.descuadres.entries()) {
    const fila = hoja.addRow([
      x.cuenta8, x.nombreCuenta, x.bloquea ? "Sí, cuenta de impuestos" : "No, informativa",
      x.movimientoBalance, x.movimientoArchivo, x.diferencia,
      ...(d.conDebitosCreditos ? [x.debitosBalance, x.debitosArchivo, x.creditosBalance, x.creditosArchivo] : [x.debitosArchivo, x.creditosArchivo]),
    ]);
    if (i % 2 === 1) fila.fill = rellenoMarca(EXCEL.cebra);
    for (let c = 4; c <= (d.conDebitosCreditos ? 10 : 8); c++) fila.getCell(c).numFmt = FORMATO_PESOS;
    fila.getCell(6).font = { bold: true };
    if (x.bloquea) fila.getCell(3).font = { bold: true, color: { argb: EXCEL.error } };
  }
  hoja.getColumn(1).width = 14;
  hoja.getColumn(2).width = 48;
  hoja.getColumn(3).width = 24;
  for (let c = 4; c <= 10; c++) hoja.getColumn(c).width = 20;
  hoja.views = [{ state: "frozen", ySplit: 6 }];

  if (d.sinCuentaEnBalance.length > 0) {
    const otra = wb.addWorksheet("Sin cuenta en el balance");
    estiloEncabezado(otra.addRow(["Cuenta del archivo", "Movimiento del archivo", "¿Impide guardar?"]));
    for (const s of d.sinCuentaEnBalance) otra.addRow([s.cuenta, s.movimiento, s.bloquea ? "Sí, cuenta de impuestos" : "No, informativa"]).getCell(2).numFmt = FORMATO_PESOS;
    otra.getColumn(1).width = 20;
    otra.getColumn(2).width = 22;
    otra.getColumn(3).width = 24;
  }

  return escribirLibroMarca(wb);
}
