// Documento de un registro de la bitácora (`registros_auditoria.documento`).
//
// El reporte para gerencia agrupa los pasos repetidos del día por documento y no
// por cliente: homologar dos balances del mismo cliente son dos operaciones (ver
// `src/lib/auditoria/reporte-ejecutivo/metricas.ts`). Módulo PURO.

export type TipoDocumentoAuditoria = "balance" | "lote" | "conciliacion" | "consolidado" | "revision";

/**
 * Identificador estable del documento: «balance:12» (balance cargado), «lote:<id>»
 * (borrador), «conciliacion:7-CAR-2026-09» (la conciliación de un módulo en un
 * período: cliente, módulo y período), «consolidado:7-CAR» (el Consolidado del
 * módulo de un cliente), «revision:5» (revisión de impuestos).
 */
export function documentoAuditoria(tipo: TipoDocumentoAuditoria, id: string | number): string {
  return `${tipo}:${id}`;
}

/** La conciliación de un módulo en un período, como documento de la bitácora. */
export function documentoConciliacion(e: { clienteId: number; moduloCodigo: string; periodo: string }): string {
  return documentoAuditoria("conciliacion", `${e.clienteId}-${e.moduloCodigo}-${e.periodo}`);
}
