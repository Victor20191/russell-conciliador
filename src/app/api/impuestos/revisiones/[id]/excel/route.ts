import { CABECERAS_ARCHIVO_PRIVADO } from "@/lib/seguridad/cabeceras-archivo";
import { getCurrentUser } from "@/lib/dal";
import { authorizePermiso } from "@/lib/rbac";
import { registrarError } from "@/lib/errores";
import { contentDispositionSeguro, cuerpoBinario } from "@/lib/modulos/respuesta-archivo";
import { NOMBRES_MES } from "@/lib/impuestos/calendario";
import { cargarRevision } from "@/lib/impuestos/retencion/revision-servidor";
import { vistasRevision } from "@/lib/impuestos/retencion/vistas";
import { excelRetencion } from "@/lib/export/retencion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUTA_LOG = "GET /api/impuestos/revisiones/[id]/excel";

/** Excel de una revisión de Retención en la fuente: por meses, acumulado y formularios. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return new Response("No autorizado", { status: 401 });
  const permiso = await authorizePermiso("impuestos:ver");
  if (!permiso.ok) return new Response("No autorizado", { status: 403 });

  const { id } = await params;
  const revisionId = Number(id);
  if (!Number.isSafeInteger(revisionId) || revisionId <= 0) return new Response("Identificador inválido", { status: 400 });

  try {
    const revision = await cargarRevision(revisionId);
    if (!revision) return new Response("No encontrado", { status: 404 });
    const alcance = await authorizePermiso("impuestos:ver", { clientId: revision.clienteId, modo: "lectura" });
    if (!alcance.ok) return new Response("No encontrado", { status: 404 });

    const mes = (p: number) => NOMBRES_MES[p - 1] ?? `Período ${p}`;
    const corte = `${mes(revision.mesCorte).toLowerCase()}${revision.mesCorte === 9 ? " (precierre)" : revision.mesCorte === 12 ? " (cierre)" : ""}`;
    const buffer = await excelRetencion(
      { cliente: revision.nombreCliente, nit: revision.nitCliente, anio: revision.anio, corte, periodicidad: revision.periodicidad },
      vistasRevision(revision.periodos),
      revision.formularios.map((f) => ({
        periodo: mes(f.periodo),
        formulario: f.formulario,
        numero: f.numero,
        estado: f.estado === "confirmado" ? "Confirmado" : "Por confirmar",
        correccionDe: f.codigoCorreccion === 1 ? f.numeroAnterior : null,
        concepto: f.concepto,
        numeroPagado: f.numeroPagado,
        fecha: f.fechaSello,
        autoadhesivo: f.autoadhesivo,
        corregidoAMano: f.corregidoAMano.join(", "),
      })),
    );
    const nombre = `Retencion ${revision.nombreCliente} ${revision.anio}-${String(revision.mesCorte).padStart(2, "0")}.xlsx`;
    return new Response(cuerpoBinario(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Length": String(buffer.byteLength),
        "Content-Disposition": contentDispositionSeguro(nombre),
        ...CABECERAS_ARCHIVO_PRIVADO,
      },
    });
  } catch (error) {
    registrarError(RUTA_LOG, error);
    return new Response("No se pudo generar el Excel", { status: 500 });
  }
}
