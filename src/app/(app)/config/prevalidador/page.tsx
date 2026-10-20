import { redirect } from "next/navigation";
import { authorizePermiso } from "@/lib/rbac";
import { PREVALIDADOR_MODULOS_ORDEN } from "@/lib/balance/prevalidador/catalogo";

/**
 * «Filtros de cuentas» ya no tiene vista con todos los módulos juntos (5/Oct/2026): repetía los
 * mismos formularios que cada módulo muestra en su página. La ruta se conserva para los enlaces y
 * marcadores (el grupo del menú y las migas apuntan aquí) y lleva al primer módulo del informe.
 */
export default async function PrevalidadorConfigPage() {
  // Todos lo consultan (`parametros:ver`); lo editan Gerente, Socio y administradores. Quien edita
  // entra aunque la matriz de la base aún no tenga `parametros:ver` (llega con `db:sync:rbac`).
  const [puedeVer, puedeEditar] = await Promise.all([
    authorizePermiso("parametros:ver").then((r) => r.ok),
    authorizePermiso("parametros:administrar").then((r) => r.ok),
  ]);
  if (!puedeVer && !puedeEditar) redirect("/dashboard");
  redirect(`/config/prevalidador/${PREVALIDADOR_MODULOS_ORDEN[0].toLowerCase()}`);
}
