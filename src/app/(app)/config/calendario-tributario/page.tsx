import { PageHeader } from "@/components/ui";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { cargarCalendarioDian } from "@/lib/impuestos/configuracion-servidor";
import { anioColombia } from "@/lib/fecha-hora";
import CalendarioTributarioClient from "./calendario-tributario-client";

export default async function CalendarioTributarioPage({ searchParams }: { searchParams: Promise<{ anio?: string }> }) {
  // Global (sin cliente): todos consultan con `impuestos:ver`; importan y editan Gerente, Socio y
  // los administradores con `impuestos:configurar`.
  await requirePermiso("impuestos:ver");
  const { anio: anioParam } = await searchParams;
  const actual = anioColombia();
  const pedido = Number(anioParam);
  const anio = Number.isInteger(pedido) && pedido >= 2020 && pedido <= 2100 ? pedido : actual;
  const [{ anios, calendario }, puedeEditar] = await Promise.all([
    cargarCalendarioDian(anio, "RETEFUENTE"),
    authorizePermiso("impuestos:configurar").then((r) => r.ok),
  ]);
  const opcionesAnio = [...new Set([...anios, actual, actual + 1, anio])].sort((a, b) => b - a);

  return (
    <div>
      <PageHeader
        title="Calendario tributario"
        subtitle="Fechas límite de la DIAN para presentar y pagar la Retención en la fuente, por período y último dígito del NIT (sin el dígito de verificación). Con ellas se mide la oportunidad de cada formulario 350 y de su pago. Se carga una vez por año."
      />
      <CalendarioTributarioClient calendario={calendario} opcionesAnio={opcionesAnio} puedeEditar={puedeEditar} />
    </div>
  );
}
