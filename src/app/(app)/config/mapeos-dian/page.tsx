import { PageHeader } from "@/components/ui";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { cargarMapeoDian } from "@/lib/impuestos/configuracion-servidor";
import MapeosDianClient from "./mapeos-dian-client";

export default async function MapeosDianPage({ searchParams }: { searchParams: Promise<{ formulario?: string }> }) {
  // Global (sin cliente): todos consultan con `impuestos:ver`; editan Gerente, Socio y los
  // administradores con `impuestos:configurar`. Una pestaña por formulario: 350 (Retención en la
  // fuente) y 300 (IVA).
  await requirePermiso("impuestos:ver");
  const { formulario: pedido } = await searchParams;
  const formulario = pedido === "300" ? "300" : "350";
  const [vista, puedeEditar] = await Promise.all([
    cargarMapeoDian(formulario),
    authorizePermiso("impuestos:configurar").then((r) => r.ok),
  ]);

  return (
    <div>
      <PageHeader
        title="Mapeos DIAN"
        subtitle="Contra qué cuenta Russell se concilia cada renglón de los formularios de la DIAN y qué terceros son la DIAN. Vale para todos los clientes: lo declarado se compara con el saldo final de su cuenta en el balance del corte."
      />
      <MapeosDianClient vista={vista} puedeEditar={puedeEditar} />
    </div>
  );
}
