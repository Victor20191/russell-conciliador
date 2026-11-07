import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { registrarError } from "@/lib/errores";
import { cargarRevision } from "@/lib/impuestos/retencion/revision-servidor";
import { cargarResultadosRevision, type ResultadosPantalla } from "@/lib/impuestos/retencion/resultados-servidor";
import { cruceParaPantalla } from "@/lib/impuestos/retencion/cruce";
import { autorizarCierreConciliacion } from "@/lib/conciliacion/verificar-bloqueo";
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
  const enFirme = revision.estado === "en_firme";
  const [resultados, puedeCerrar, puedeDesbloquear] = await Promise.all([
    resultadosDeLaRevision(revision),
    enProceso ? autorizarCierreConciliacion("conciliaciones:cerrar", revision.clienteId).then((r) => r.ok) : false,
    enFirme ? autorizarCierreConciliacion("conciliaciones:desbloquear", revision.clienteId).then((r) => r.ok) : false,
  ]);

  return (
    <div>
      <PageHeader
        title={`Retención en la fuente · ${revision.nombreCliente}`}
        subtitle="Importa los PDF de los formularios 350 y 490 del año hasta el corte, revisa lo que leyó la IA y confírmalo. Un formulario solo cuenta cuando está confirmado."
      />
      <RevisionClient
        revision={revision}
        resultados={resultados}
        puedeCargar={puedeCargar}
        puedeEditar={puedeEditar}
        puedeEliminar={puedeEliminar}
        puedeCerrar={puedeCerrar}
        puedeDesbloquear={puedeDesbloquear}
      />
    </div>
  );
}

/** Cruce, oportunidad, pagos y cierre de la revisión, con el cruce recortado para la pantalla. Un fallo no tumba las demás pestañas. */
async function resultadosDeLaRevision(revision: Parameters<typeof cargarResultadosRevision>[0]): Promise<ResultadosPantalla> {
  try {
    const r = await cargarResultadosRevision(revision);
    return { ...r, cruce: r.cruce.estado === "listo" ? { ...r.cruce, resultado: cruceParaPantalla(r.cruce.resultado) } : r.cruce };
  } catch (e) {
    registrarError("resultados de retención en la fuente", e);
    const mensaje = "No fue posible calcular los resultados de la revisión. Recarga la página; si sigue, repórtalo a la Mesa de ayuda.";
    const total = { retenciones: 0, sanciones: 0, totalDeclarado: 0, impuestoPagado: 0, sancionPagada: 0, intereses: 0, totalPagado: 0, diferencia: 0 };
    return {
      periodos: revision.periodos,
      cruce: { estado: "bloqueado", mensaje, balance: null, umbral: 0 },
      oportunidad: [],
      pagos: { filas: [], total, pendientesMarca: 0 },
      saldoInicialRestado: null,
      evaluacion: { pendientes: [{ tipo: "cruce", texto: mensaje }], avisos: [] },
      calendario: { cargado: false, aplica: revision.periodicidad === "Mensual" },
      cierre: null,
      desdeCopia: false,
    };
  }
}
