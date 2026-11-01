import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { registrarError } from "@/lib/errores";
import { cargarRevision } from "@/lib/impuestos/retencion/revision-servidor";
import { cargarCruceRetencion } from "@/lib/impuestos/retencion/cruce-servidor";
import { cruceParaPantalla, type CruceRetencionPantalla } from "@/lib/impuestos/retencion/cruce";
import RevisionClient from "./revision-client";

export default async function RevisionRetencionPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermiso("impuestos:ver");
  const { id } = await params;
  const revisionId = Number(id);
  if (!Number.isSafeInteger(revisionId) || revisionId <= 0) notFound();
  const revision = await cargarRevision(revisionId);
  if (!revision) notFound();
  // Alcance de lectura sobre el cliente; sin él, la revisión no existe para quien consulta.
  const lectura = await authorizePermiso("impuestos:ver", { clientId: revision.clienteId, modo: "lectura" });
  if (!lectura.ok) notFound();
  const enProceso = revision.estado !== "en_firme";
  const [puedeCargar, puedeEditar, puedeEliminar] = await Promise.all(
    ["impuestos:cargar", "impuestos:editar", "impuestos:eliminar"].map((p) =>
      authorizePermiso(p, { clientId: revision.clienteId, modo: "escritura" }).then((r) => r.ok && enProceso),
    ),
  );
  const cruce = await cruceDeLaRevision(revision);

  return (
    <div>
      <PageHeader
        title={`Retención en la fuente · ${revision.nombreCliente}`}
        subtitle="Importa los PDF de los formularios 350 y 490 del año hasta el corte, revisa lo que leyó la IA y confírmalo. Un formulario solo cuenta cuando está confirmado."
      />
      <RevisionClient revision={revision} cruce={cruce} puedeCargar={puedeCargar} puedeEditar={puedeEditar} puedeEliminar={puedeEliminar} />
    </div>
  );
}

/** El cruce contable de la revisión, recortado para la pantalla. Un fallo no tumba las demás pestañas. */
async function cruceDeLaRevision(revision: Parameters<typeof cargarCruceRetencion>[0]): Promise<CruceRetencionPantalla> {
  try {
    const cruce = await cargarCruceRetencion(revision);
    return cruce.estado === "listo" ? { ...cruce, resultado: cruceParaPantalla(cruce.resultado) } : cruce;
  } catch (e) {
    registrarError("cruce de retención en la fuente", e);
    return { estado: "bloqueado", mensaje: "No fue posible calcular el cruce contable. Recarga la página; si sigue, repórtalo a la Mesa de ayuda.", balance: null, umbral: 0 };
  }
}
