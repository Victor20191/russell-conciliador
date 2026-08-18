import "server-only";

import { redirect } from "next/navigation";
import { authorizePermiso, type AuthzResult } from "@/lib/rbac";
import { esSuperadministrador } from "@/lib/rbac/modulos-plataforma";

export const PERMISO_REPORTE_EJECUTIVO = "auditoria:reporte_ejecutivo";

/**
 * Defensa en profundidad mientras la matriz persistida se sincroniza con el
 * catálogo: el permiso y el rol exacto deben cumplirse al mismo tiempo.
 */
export function restringirReporteEjecutivoASuperadministrador(
  autorizacion: AuthzResult,
): AuthzResult {
  if (!autorizacion.ok) return autorizacion;
  if (!esSuperadministrador(autorizacion.role)) {
    return { ok: false, message: "No tienes permisos para esta acción." };
  }
  return autorizacion;
}

export async function authorizeReporteEjecutivo(): Promise<AuthzResult> {
  const autorizacion = await authorizePermiso(PERMISO_REPORTE_EJECUTIVO);
  return restringirReporteEjecutivoASuperadministrador(autorizacion);
}

export async function requireReporteEjecutivo(): Promise<void> {
  const autorizacion = await authorizeReporteEjecutivo();
  if (!autorizacion.ok) redirect("/dashboard");
}
