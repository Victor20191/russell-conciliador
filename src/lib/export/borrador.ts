// Exportación a Excel del ÁRBOL CRUDO del borrador (lo que se ve en pantalla, con
// su jerarquía y clasificación). Sin homologación Russell. Si se exporta filtrado,
// recibe solo las filas del filtro (el llamador aplana con `aplanarArbolFiltrado`).
//
// Cada agrupadora trae dos columnas con FÓRMULA VIVA para validar la agrupación en
// el propio Excel: "Suma hijos" (SUM de las celdas "Saldo actual" de sus hijos
// directos) y "Δ vs hijos" (Saldo actual del archivo − Suma hijos). Así el usuario
// localiza al instante dónde el subtotal no cuadra con su desglose, y si edita un
// saldo, recalcula solo. Se mantiene además la columna "Δ descuadre (app)" con el
// valor autoritativo (con re-atribución de gemelos) para cotejar.
import ExcelJS from "exceljs";
import type { NodoBorrador } from "@/lib/balance/borrador";
import { nombreNivelCuenta } from "@/lib/balance/nivel-cuenta";

export type FilaExportBorrador = { nodo: NodoBorrador; profundidad: number };

const NUM_FMT = "#,##0.00;-#,##0.00";

const nivelLabel = (codigo: string) =>
  codigo.replace(/\D/g, "").length === 0 ? "Total" : nombreNivelCuenta(codigo);
const tipoLabel = (n: NodoBorrador) => {
  const base = n.subtotalDuplicado ? "Subtotal duplicado" : n.tipoFila === "movimiento" ? "Movimiento" : n.tipoFila === "total" ? "Total" : "Agrupadora";
  // Las OMITIDAS se conservan en el crudo (línea a línea) pero no cuentan ni se cargan.
  return n.omitida ? `${base} · OMITIDA` : base;
};

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
    { header: "Suma cuentas (fórmula)", key: "sumaHijos", width: 22 },
    { header: "Δ vs cuentas (fórmula)", key: "deltaFormula", width: 20 },
    { header: "Δ descuadre (app)", key: "delta", width: 18 },
  ];
  ws.getRow(1).font = { bold: true };

  // Columnas (letra) para construir las fórmulas: H = "Saldo actual", I = "Suma hijos".
  const COL_SALDO = "H";
  const COL_SUMA = "I";
  // Fila de Excel de cada nodo: header = 1, primer dato = 2, etc. Los hijos pueden
  // salir ANTES (summary-below) o DESPUÉS del padre; las referencias de celda valen
  // en ambos sentidos. Se indexa por `filaNum` (único por fila del staging).
  const rowOf = new Map<number, number>();
  filas.forEach((f, i) => rowOf.set(f.nodo.filaNum, i + 2));

  filas.forEach(({ nodo, profundidad }, i) => {
    const excelRow = i + 2;
    const esAgrup = nodo.tipoFila !== "movimiento";
    // Hijos DIRECTOS presentes en el export (excluye subtotales duplicados, como el
    // descuadre de la app). Se referencia su "Saldo actual" (col H) — el mismo valor
    // que el subtotal del padre debería igualar.
    const celdasHijos = esAgrup
      ? nodo.hijos.filter((h) => !h.subtotalDuplicado && !h.omitida && rowOf.has(h.filaNum)).map((h) => `${COL_SALDO}${rowOf.get(h.filaNum)}`)
      : [];
    const conHijos = celdasHijos.length > 0;
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
      // Suma VIVA de los hijos: si el usuario edita un saldo, recalcula. Solo agrupadoras.
      sumaHijos: conHijos ? { formula: `SUM(${celdasHijos.join(",")})` } : null,
      // Diferencia de agrupación VIVA: Saldo actual (archivo) − Suma hijos. ≠0 = descuadre.
      deltaFormula: conHijos ? { formula: `${COL_SALDO}${excelRow}-${COL_SUMA}${excelRow}` } : null,
      // Δ que calculó la app (autoritativo: con re-atribución de gemelos), para cotejar.
      delta: nodo.descuadre != null && nodo.descuadre !== 0 ? nodo.descuadre : null,
    });
    for (const k of ["si", "db", "cr", "saldo", "sumaHijos", "deltaFormula", "delta"]) row.getCell(k).numFmt = NUM_FMT;
    // Negrita en agrupadoras (misma convención con que muchos ERP marcan los
    // encabezados); el descuadre en rojo para localizarlo.
    if (esAgrup) row.font = { bold: true };
    if (nodo.descuadre != null && nodo.descuadre !== 0) {
      row.getCell("delta").font = { color: { argb: "FFC01919" }, bold: true };
      row.getCell("deltaFormula").font = { color: { argb: "FFC01919" }, bold: true };
    }
    // Fila OMITIDA: se conserva (línea a línea) pero se muestra tachada/gris.
    if (nodo.omitida) row.font = { color: { argb: "FF98A2B3" }, italic: true, strike: true };
  });

  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "K1" };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
