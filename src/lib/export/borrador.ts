// Exportación a Excel del ÁRBOL CRUDO del borrador (lo que se ve en pantalla, con
// su jerarquía y clasificación). Sin homologación Russell. Si se exporta filtrado,
// recibe solo las filas del filtro (el llamador aplana con `aplanarArbolFiltrado`).
import ExcelJS from "exceljs";
import type { NodoBorrador } from "@/lib/balance/borrador";

export type FilaExportBorrador = { nodo: NodoBorrador; profundidad: number };

const NUM_FMT = "#,##0.00;-#,##0.00";

const nivelLabel = (c: string) =>
  c.length === 0 ? "Total" : c.length <= 2 ? "Clase" : c.length <= 4 ? "Grupo" : c.length <= 6 ? "Cuenta" : "Subcuenta";
const tipoLabel = (n: NodoBorrador) =>
  n.subtotalDuplicado ? "Subtotal duplicado" : n.tipoFila === "movimiento" ? "Movimiento" : n.tipoFila === "total" ? "Total" : "Agrupadora";

export async function crearExportacionBorrador(
  filas: FilaExportBorrador[],
  meta: { archivo: string; generadoEn: Date; filtro: string[] },
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Russell Conciliador";
  wb.created = meta.generadoEn;
  const ws = wb.addWorksheet("Borrador");
  ws.columns = [
    { header: "Código", key: "codigo", width: 16 },
    { header: "Cuenta", key: "cuenta", width: 52 },
    { header: "Tipo", key: "tipo", width: 16 },
    { header: "Nivel", key: "nivel", width: 11 },
    { header: "Saldo anterior", key: "si", width: 20 },
    { header: "Débito", key: "db", width: 20 },
    { header: "Crédito", key: "cr", width: 20 },
    { header: "Saldo actual", key: "saldo", width: 20 },
    { header: "Δ descuadre", key: "delta", width: 18 },
  ];
  ws.getRow(1).font = { bold: true };

  for (const { nodo, profundidad } of filas) {
    const row = ws.addRow({
      codigo: nodo.codigoCrudo || nodo.codigo,
      // Indentado por profundidad para conservar la jerarquía visual del árbol.
      cuenta: `${"    ".repeat(profundidad)}${nodo.nombre}`,
      tipo: tipoLabel(nodo),
      nivel: nivelLabel(nodo.codigo),
      si: nodo.saldoInicial,
      db: nodo.debitos,
      cr: nodo.creditos,
      saldo: nodo.saldoFinal,
      delta: nodo.descuadre != null && nodo.descuadre !== 0 ? nodo.descuadre : null,
    });
    for (const k of ["si", "db", "cr", "saldo", "delta"]) row.getCell(k).numFmt = NUM_FMT;
    // Negrita en agrupadoras (misma convención con que muchos ERP marcan los
    // encabezados); el descuadre en rojo para localizarlo.
    if (nodo.tipoFila !== "movimiento") row.font = { bold: true };
    if (nodo.descuadre != null && nodo.descuadre !== 0) {
      row.getCell("delta").font = { color: { argb: "FFC01919" }, bold: true };
    }
  }

  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "I1" };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
