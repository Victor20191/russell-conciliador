import { CABECERAS_ARCHIVO_PRIVADO } from "@/lib/seguridad/cabeceras-archivo";
import { getCurrentUser } from "@/lib/dal";
import { authorizePermiso } from "@/lib/rbac";
import { registrarError } from "@/lib/errores";
import { contentDispositionSeguro, cuerpoBinario } from "@/lib/modulos/respuesta-archivo";
import { NOMBRES_MES } from "@/lib/impuestos/calendario";
import { cargarRevision } from "@/lib/impuestos/retencion/revision-servidor";
import { vistasRevision } from "@/lib/impuestos/retencion/vistas";
import { etiquetaPeriodoRevision } from "@/lib/impuestos/retencion/periodos-revision";
import { impuestoPorClave, RETENCION } from "@/lib/impuestos/impuestos-dian";
import { cargarResultadosRevision } from "@/lib/impuestos/retencion/resultados-servidor";
import type { ResultadosExcel } from "@/lib/export/retencion";
import { excelRetencion } from "@/lib/export/retencion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUTA_LOG = "GET /api/impuestos/revisiones/[id]/excel";

/** Excel de una revisión de Impuestos · DIAN: por meses o períodos, acumulado, formularios y, si el impuesto ya los tiene, cruce contable, oportunidad y pagos (en firme, de la copia congelada). */
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
    const impuesto = impuestoPorClave(revision.impuesto) ?? RETENCION;
    const mes = (p: number) => NOMBRES_MES[p - 1] ?? `Período ${p}`;
    // El cruce y los resultados solo entran si el impuesto ya los tiene (IVA los suma en las fases 4 y 5).
    // Un fallo de los resultados no impide descargar las vistas: la hoja del cruce lo explica.
    const calculados = impuesto.pestanas.includes("cruce")
      ? await cargarResultadosRevision(revision).catch((e: unknown) => {
          registrarError(`${RUTA_LOG} (resultados)`, e);
          return null;
        })
      : null;
    const resultados: ResultadosExcel | undefined = !impuesto.pestanas.includes("cruce")
      ? undefined
      : calculados
        ? {
            cruce: calculados.cruce,
            ...(impuesto.pestanas.includes("pagos") ? { oportunidad: calculados.oportunidad, pagos: calculados.pagos } : {}),
            saldoInicialRestado: calculados.saldoInicialRestado,
          }
        : { cruce: { estado: "bloqueado", mensaje: "No fue posible calcular el cruce contable.", balance: null, umbral: 0 } };
    const periodos = calculados?.periodos ?? revision.periodos;
    const atajo = impuesto.cortesAtajo.find((c) => c.mes === revision.mesCorte);
    const corte = `${mes(revision.mesCorte).toLowerCase()}${atajo ? ` (${atajo.etiqueta.split(" · ")[0].toLowerCase()})` : ""}`;
    const buffer = await excelRetencion(
      { impuesto: impuesto.nombre, cliente: revision.nombreCliente, nit: revision.nitCliente, anio: revision.anio, corte, periodicidad: revision.periodicidad },
      vistasRevision(periodos, revision.impuesto, revision.periodicidad),
      revision.formularios.map((f) => ({
        periodo: etiquetaPeriodoRevision(revision.periodicidad, f.periodo),
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
      resultados,
    );
    const nombre = `${impuesto.clave === "IVA" ? "IVA" : "Retencion"} ${revision.nombreCliente} ${revision.anio}-${String(revision.mesCorte).padStart(2, "0")}.xlsx`;
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
