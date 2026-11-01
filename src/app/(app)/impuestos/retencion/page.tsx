import { PageHeader } from "@/components/ui";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { alcanceEscrituraUsuario, alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { anioColombia } from "@/lib/fecha-hora";
import { cargarRevisiones, clientesParaRevision } from "@/lib/impuestos/retencion/revision-servidor";
import RevisionesClient from "./revisiones-client";

export default async function RetencionPage() {
  // Todos consultan las revisiones de su cartera (`impuestos:ver`); crean revisiones el staff y el
  // senior asignados (`impuestos:cargar` + alcance de escritura) y los administradores.
  await requirePermiso("impuestos:ver");
  const [lectura, escritura, puedeCrear] = await Promise.all([
    alcanceLecturaUsuario(),
    alcanceEscrituraUsuario(),
    authorizePermiso("impuestos:cargar").then((r) => r.ok),
  ]);
  const [revisiones, clientes] = await Promise.all([
    cargarRevisiones(lectura.todos ? null : lectura.clientIds),
    puedeCrear ? clientesParaRevision(escritura.todos ? null : escritura.clientIds) : Promise.resolve([]),
  ]);

  return (
    <div>
      <PageHeader
        title="Retención en la fuente"
        subtitle="Revisión acumulada de los formularios 350 (declaración) y 490 (pago) de cada cliente a un corte: el precierre, generalmente a septiembre, y el cierre a diciembre."
      />
      <RevisionesClient revisiones={revisiones} clientes={clientes} puedeCrear={puedeCrear && clientes.length > 0} anioActual={anioColombia()} />
    </div>
  );
}
