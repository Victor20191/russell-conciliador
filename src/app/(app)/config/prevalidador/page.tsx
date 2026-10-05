import { redirect } from "next/navigation";
import { requirePermiso } from "@/lib/rbac";
import { PREVALIDADOR_MODULOS_ORDEN } from "@/lib/balance/prevalidador/catalogo";

/**
 * «Filtros de cuentas» ya no tiene vista con todos los módulos juntos (5/Oct/2026): repetía los
 * mismos formularios que cada módulo muestra en su página. La ruta se conserva para los enlaces y
 * marcadores (el grupo del menú y las migas apuntan aquí) y lleva al primer módulo del informe.
 */
export default async function PrevalidadorConfigPage() {
  // Administrador y Superadministrador (permiso parametros:administrar): qué se
  // prevalida es un criterio de la firma, no un dato de cliente.
  await requirePermiso("parametros:administrar");
  redirect(`/config/prevalidador/${PREVALIDADOR_MODULOS_ORDEN[0].toLowerCase()}`);
}
