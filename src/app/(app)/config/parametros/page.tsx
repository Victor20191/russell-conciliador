import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { authorizePermiso } from "@/lib/rbac";
import { getUmbralesVista } from "@/lib/parametros/umbrales";
import ParametrosClient from "./parametros-client";

export default async function ParametrosPage() {
  // Todos consultan los montos (`parametros:ver`); los editan Gerente, Socio y los
  // administradores (`parametros:administrar`, 19/Oct/2026). Quien edita entra aunque la
  // matriz de la base aún no tenga `parametros:ver` (nuevo: llega con `db:sync:rbac`).
  const [puedeVer, puedeEditar] = await Promise.all([
    authorizePermiso("parametros:ver").then((r) => r.ok),
    authorizePermiso("parametros:administrar").then((r) => r.ok),
  ]);
  if (!puedeVer && !puedeEditar) redirect("/dashboard");

  const umbrales = await getUmbralesVista();

  return (
    <div>
      <PageHeader
        title="Parámetros de alertas"
        subtitle="Montos a partir de los cuales una diferencia deja de ser un aviso informativo y pasa a contar como alerta, en el balance de comprobación y en los cruces de los módulos. Aplican a toda la plataforma y de inmediato, también sobre lo ya cargado."
      />
      <ParametrosClient umbrales={umbrales} puedeEditar={puedeEditar} />
    </div>
  );
}
