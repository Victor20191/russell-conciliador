import { PageHeader } from "@/components/ui";
import { requirePermiso } from "@/lib/rbac";
import { getUmbralesVista } from "@/lib/parametros/umbrales";
import ParametrosClient from "./parametros-client";

export default async function ParametrosPage() {
  // Administrador y Superadministrador (permiso parametros:administrar).
  await requirePermiso("parametros:administrar");

  const umbrales = await getUmbralesVista();

  return (
    <div>
      <PageHeader
        title="Parámetros de alertas"
        subtitle="Montos a partir de los cuales una diferencia deja de ser un aviso informativo y pasa a contar como alerta. Aplican a toda la plataforma y de inmediato, también sobre los balances ya cargados."
      />
      <ParametrosClient umbrales={umbrales} />
    </div>
  );
}
