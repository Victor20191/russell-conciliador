// Retención de `registros_acceso`. La analítica de accesos solo necesita un
// histórico acotado; los registros más antiguos que la ventana de retención se
// purgan periódicamente (script `db:purgar:accesos`) para que la tabla no crezca
// sin límite. Lógica PURA (sin BD), reutilizable y testeable.
import { restarMesesColombia } from "@/lib/fecha-hora";

// Meses de histórico que se conservan por defecto. Configurable por entorno
// (ACCESS_LOG_RETENCION_MESES) en el script de purga.
export const MESES_RETENCION_DEFECTO = 18;

/**
 * Fecha de corte de retención: todo `creado_en` ANTERIOR a este instante es
 * purgable. Resta `mesesRetencion` meses a `ahora` sin mutarlo.
 */
export function fechaCorteRetencion(mesesRetencion: number, ahora: Date): Date {
  return restarMesesColombia(ahora, mesesRetencion);
}
