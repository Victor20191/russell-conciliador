// REPORTE CON ERRORES (Cartera y CxP, 17/Oct/2026) — puro, sin BD.
//
// Dos validaciones del auxiliar dicen que el reporte del ERP salió mal y bloquean APROBAR EL
// BORRADOR, sin excepción: el mismo documento por el mismo valor bajo dos terceros distintos, y un
// vencimiento imposible (antes de 1990 o más de 30 años después del corte). La única salida es
// corregir el archivo y volver a cargarlo: se evalúan sobre TODAS las filas que el archivo trae como
// documentos, también las omitidas o reclasificadas a mano en el borrador.
import { normalizarTerceroCartera } from "./tercero-cartera";
import {
  documentosRepetidosEntreTerceros,
  vencimientosImposibles,
  type DocumentoRepetido,
  type VencimientoAtipico,
} from "./validaciones-tercero";

/** Una fila del borrador tal como sale del staging. */
export type FilaReporteBorrador = { filaNum: number; valor: number; datos: Record<string, unknown> };

/** Grupos y filas que se listan; el conteo es completo. */
const MAX_LISTADO = 20;

export type ReporteConErrores = {
  documentosRepetidos: { cantidad: number; grupos: DocumentoRepetido[] };
  vencimientosImposibles: { cantidad: number; filas: VencimientoAtipico[] };
};

/** Las dos validaciones sobre las filas del borrador, con la clave del tercero de la promoción. */
export function reporteConErroresCartera(filas: readonly FilaReporteBorrador[], fechaCorte: string | null): ReporteConErrores {
  const conClave = filas.map((f) => ({
    filaNum: f.filaNum,
    valor: f.valor,
    datos: f.datos,
    nitCanonico: normalizarTerceroCartera({ nit: f.datos.nit, dv: f.datos.dv, nombre: f.datos.nombre, sucursal: f.datos.sucursal }).claveCanonica,
  }));
  const repetidos = documentosRepetidosEntreTerceros(conClave);
  const vencimientos = fechaCorte ? vencimientosImposibles(conClave, fechaCorte) : { cantidad: 0, filas: [] };
  return {
    documentosRepetidos: { cantidad: repetidos.length, grupos: repetidos.slice(0, MAX_LISTADO) },
    vencimientosImposibles: { cantidad: vencimientos.cantidad, filas: vencimientos.filas.slice(0, MAX_LISTADO) },
  };
}

export function hayReporteConErrores(r: ReporteConErrores | null | undefined): boolean {
  return !!r && (r.documentosRepetidos.cantidad > 0 || r.vencimientosImposibles.cantidad > 0);
}

/** Por qué no se puede aprobar el borrador; null si el reporte no tiene errores. */
export function motivoReporteConErrores(r: ReporteConErrores | null | undefined): string | null {
  if (!r || !hayReporteConErrores(r)) return null;
  const partes: string[] = [];
  const { documentosRepetidos: d, vencimientosImposibles: v } = r;
  if (d.cantidad > 0) {
    const ejemplo = d.grupos[0];
    partes.push(`${d.cantidad} documento(s) repetido(s) por el mismo valor en terceros distintos${ejemplo ? ` (p. ej. ${ejemplo.documento} en ${ejemplo.terceros.length} terceros)` : ""}`);
  }
  if (v.cantidad > 0) {
    const ejemplo = v.filas[0];
    partes.push(`${v.cantidad} vencimiento(s) imposible(s)${ejemplo ? ` (p. ej. fila ${ejemplo.filaNum}: ${ejemplo.vencimiento})` : ""}`);
  }
  return `El reporte tiene errores: ${partes.join(" y ")}. Corrige el archivo en el ERP y vuelve a cargarlo; este borrador no se puede aprobar.`;
}
