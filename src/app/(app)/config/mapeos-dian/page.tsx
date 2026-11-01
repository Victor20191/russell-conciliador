import { PageHeader } from "@/components/ui";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { cargarMapeoDian } from "@/lib/impuestos/configuracion-servidor";
import MapeosDianClient from "./mapeos-dian-client";

export default async function MapeosDianPage() {
  // Global (sin cliente): todos consultan con `impuestos:ver`; editan Gerente, Socio y los
  // administradores con `impuestos:configurar`.
  await requirePermiso("impuestos:ver");
  const [vista, puedeEditar] = await Promise.all([
    cargarMapeoDian(),
    authorizePermiso("impuestos:configurar").then((r) => r.ok),
  ]);

  return (
    <div>
      <PageHeader
        title="Mapeos DIAN"
        subtitle="Contra qué cuenta Russell se concilia cada concepto del formulario 350 (Retención en la fuente) y qué terceros son la DIAN. Vale para todos los clientes: cada concepto suma sus dos columnas, persona jurídica y natural, y se compara con el saldo final de su cuenta en el balance por terceros."
      />
      <MapeosDianClient vista={vista} puedeEditar={puedeEditar} />
    </div>
  );
}
