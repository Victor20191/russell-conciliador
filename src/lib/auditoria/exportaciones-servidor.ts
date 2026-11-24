// Exportaciones de papeles de trabajo (Excel del balance, del borrador, del cargue
// de un módulo, de la revisión de impuestos) en la bitácora. Producir el entregable
// es trabajo: el reporte para gerencia lo cuenta una vez por documento y día
// (metodología 7). Best-effort como toda la auditoría: si falla, la descarga sigue.
import "server-only";
import { logAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/dal";

export async function registrarExportacion(params: {
  /** «EXPORTÓ EXCEL DEL BALANCE», «EXPORTÓ EXCEL DEL MÓDULO»… (ver `metricas.ts`). */
  accion: string;
  entidad: string;
  detalle: string;
  clientId: number | null;
  documento: string | null;
}): Promise<void> {
  try {
    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: params.accion,
      entity: params.entidad,
      detail: params.detalle,
      clientId: params.clientId,
      documento: params.documento,
    });
  } catch {
    // La descarga no depende de la bitácora.
  }
}
