import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { alcanceEscrituraUsuario, alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { anioColombia } from "@/lib/fecha-hora";
import { impuestoPorSlug } from "@/lib/impuestos/impuestos-dian";
import { cargarRevisiones, clientesParaRevision } from "@/lib/impuestos/retencion/revision-servidor";
import RevisionesClient from "./revisiones-client";

/** Revisiones de un impuesto DIAN: `/impuestos/retencion` (Retención en la fuente) o `/impuestos/iva`. */
export default async function RevisionesImpuestoPage({ params }: { params: Promise<{ impuesto: string }> }) {
  // Todos consultan las revisiones de su cartera (`impuestos:ver`); crean revisiones el staff y el
  // senior asignados (`impuestos:cargar` + alcance de escritura) y los administradores.
  await requirePermiso("impuestos:ver");
  const impuesto = impuestoPorSlug((await params).impuesto);
  if (!impuesto) notFound();
  const [lectura, escritura, puedeCrear] = await Promise.all([
    alcanceLecturaUsuario(),
    alcanceEscrituraUsuario(),
    authorizePermiso("impuestos:cargar").then((r) => r.ok),
  ]);
  const [revisiones, clientes] = await Promise.all([
    cargarRevisiones(lectura.todos ? null : lectura.clientIds, impuesto.clave),
    puedeCrear ? clientesParaRevision(escritura.todos ? null : escritura.clientIds, impuesto.clave) : Promise.resolve([]),
  ]);

  return (
    <div>
      <PageHeader title={impuesto.nombre} subtitle={impuesto.textos.subtituloLista} />
      <RevisionesClient
        impuestoClave={impuesto.clave}
        revisiones={revisiones}
        clientes={clientes}
        puedeCrear={puedeCrear && clientes.length > 0}
        anioActual={anioColombia()}
      />
    </div>
  );
}
