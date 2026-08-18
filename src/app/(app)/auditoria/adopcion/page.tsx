import { redirect } from "next/navigation";
import { requireReporteEjecutivo } from "@/lib/rbac/reporte-ejecutivo";

/** Compatibilidad para enlaces guardados: autoriza antes de revelar la ruta nueva. */
export default async function AuditoriaAdopcionRedirectPage() {
  await requireReporteEjecutivo();
  redirect("/config/reportes-ejecutivos");
}
