import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { registrarError } from "@/lib/errores";
import { impuestoPorClave, impuestoPorSlug, RETENCION } from "@/lib/impuestos/impuestos-dian";
import { cargarRevision, type RevisionVista } from "@/lib/impuestos/retencion/revision-servidor";
import { cargarResultadosRevision, type ResultadosPantalla } from "@/lib/impuestos/retencion/resultados-servidor";
import { cruceParaPantalla } from "@/lib/impuestos/retencion/cruce";
import { autorizarCierreConciliacion } from "@/lib/conciliacion/verificar-bloqueo";
import RevisionClient from "./revision-client";

/** Una revisión de un impuesto DIAN: `/impuestos/retencion/<id>` o `/impuestos/iva/<id>`. */
export default async function RevisionImpuestoPage({ params }: { params: Promise<{ impuesto: string; id: string }> }) {
  await requirePermiso("impuestos:ver");
  const { impuesto: slug, id } = await params;
  if (!impuestoPorSlug(slug)) notFound();
  const revisionId = Number(id);
  if (!Number.isSafeInteger(revisionId) || revisionId <= 0) notFound();
  const revision = await cargarRevision(revisionId);
  if (!revision) notFound();
  // Alcance de lectura sobre el cliente; sin él, la revisión no existe para quien consulta.
  const lectura = await authorizePermiso("impuestos:ver", { clientId: revision.clienteId, modo: "lectura" });
  if (!lectura.ok) notFound();
  const impuesto = impuestoPorClave(revision.impuesto) ?? RETENCION;
  // Un enlace con el impuesto equivocado lleva a la ruta de la revisión.
  if (impuesto.slug !== slug) redirect(`/impuestos/${impuesto.slug}/${revision.id}`);
  const enProceso = revision.estado !== "en_firme";
  const [puedeCargar, puedeEditar, puedeEliminar] = await Promise.all(
    ["impuestos:cargar", "impuestos:editar", "impuestos:eliminar"].map((p) =>
      authorizePermiso(p, { clientId: revision.clienteId, modo: "escritura" }).then((r) => r.ok && enProceso),
    ),
  );
  const enFirme = revision.estado === "en_firme";
  // El cruce, la oportunidad, los pagos y el cierre solo se calculan si el impuesto ya tiene esas pestañas.
  const conResultados = impuesto.pestanas.includes("cruce");
  // El cierre en firme llega con Novedades (en IVA, la fase 5).
  const conCierre = impuesto.pestanas.includes("novedades");
  const [resultados, puedeCerrar, puedeDesbloquear] = await Promise.all([
    conResultados ? resultadosDeLaRevision(revision) : resultadosVacios(revision),
    enProceso && conCierre ? autorizarCierreConciliacion("conciliaciones:cerrar", revision.clienteId).then((r) => r.ok) : false,
    enFirme && conCierre ? autorizarCierreConciliacion("conciliaciones:desbloquear", revision.clienteId).then((r) => r.ok) : false,
  ]);

  return (
    <div>
      <PageHeader title={`${impuesto.nombre} · ${revision.nombreCliente}`} subtitle={impuesto.textos.subtituloRevision} />
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
async function resultadosDeLaRevision(revision: RevisionVista): Promise<ResultadosPantalla> {
  try {
    const r = await cargarResultadosRevision(revision);
    return { ...r, cruce: r.cruce.estado === "listo" ? { ...r.cruce, resultado: cruceParaPantalla(r.cruce.resultado) } : r.cruce };
  } catch (e) {
    registrarError("resultados de la revisión de impuestos", e);
    return resultadosVacios(revision, "No fue posible calcular los resultados de la revisión. Recarga la página; si sigue, repórtalo a la Mesa de ayuda.");
  }
}

/** Resultados sin calcular: el impuesto aún no los tiene o fallaron (con el mensaje como pendiente). */
function resultadosVacios(revision: RevisionVista, mensaje?: string): ResultadosPantalla {
  const total = { retenciones: 0, sanciones: 0, totalDeclarado: 0, impuestoPagado: 0, sancionPagada: 0, intereses: 0, totalPagado: 0, diferencia: 0 };
  return {
    periodos: revision.periodos,
    cruce: { estado: "bloqueado", mensaje: mensaje ?? "El cruce contable de este impuesto todavía no está disponible.", balance: null, umbral: 0 },
    oportunidad: [],
    pagos: { filas: [], total, pendientesMarca: 0 },
    saldoInicialRestado: null,
    evaluacion: { pendientes: mensaje ? [{ tipo: "cruce", texto: mensaje }] : [], avisos: [] },
    calendario: { cargado: false, aplica: revision.periodicidad === "Mensual" },
    cierre: null,
    desdeCopia: false,
  };
}
