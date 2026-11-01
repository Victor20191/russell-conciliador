import "server-only";
import prisma from "@/lib/prisma";
import { ESTADO_CIERRE_FIRME } from "@/lib/conciliacion/cuentas-bloqueo";
import { cargarCalendarioDian } from "../configuracion-servidor";
import { evaluarCierreRetencion, type EvaluacionCierreRetencion } from "./cierre";
import { leerCopiaRetencion } from "./copia-cierre";
import type { CruceRetencionPantalla, CruceRetencionVista, MarcaCruceRetencion } from "./cruce";
import { cargarCruceRetencion, MODULO_RETENCION } from "./cruce-servidor";
import { oportunidadRevision, type FilaOportunidad } from "./oportunidad";
import { pagosRevision, type ResultadoPagos } from "./pagos";
import { etiquetaPeriodoRevision, type PeriodoRevision } from "./periodos-revision";
import type { RevisionVista } from "./revision-servidor";

/**
 * Los resultados de una revisión: cruce contable, oportunidad, pagos efectuados y qué falta para
 * cerrar. En proceso se calculan en vivo; en firme salen de la copia congelada del cierre.
 */

export type CierreRetencionVista = {
  id: number;
  estado: string;
  cerradoPor: string;
  cerradoEn: string;
  balancePeriodo: string;
  balanceEncabezadoId: number;
  cuentasBloqueadas: number;
  huella: string | null;
  desbloqueadoPor: string | null;
  desbloqueadoEn: string | null;
  justificacionDesbloqueo: string | null;
};

export type ResultadosRevision = {
  /** En firme con copia válida: los períodos congelados; si no, los de la revisión. */
  periodos: PeriodoRevision[];
  cruce: CruceRetencionVista;
  oportunidad: FilaOportunidad[];
  pagos: ResultadoPagos;
  evaluacion: EvaluacionCierreRetencion;
  calendario: { cargado: boolean; aplica: boolean };
  /** El último cierre de la revisión (en firme o desbloqueado). */
  cierre: CierreRetencionVista | null;
  /** Los resultados salen de la copia congelada. */
  desdeCopia: boolean;
};

/** Lo que viaja a la pantalla: el cruce con los terceros recortados (`cruceParaPantalla`). */
export type ResultadosPantalla = Omit<ResultadosRevision, "cruce"> & { cruce: CruceRetencionPantalla };

/** Marcas de los meses (pagos y oportunidad) de la revisión: dimensión `control` de RET. */
async function marcasDeControl(revision: Pick<RevisionVista, "clienteId" | "periodo">): Promise<(MarcaCruceRetencion & { clave: string })[]> {
  const filas = await prisma.marcaCruceModulo.findMany({
    where: { clienteId: revision.clienteId, moduloCodigo: MODULO_RETENCION, periodo: revision.periodo, dimension: "control" },
    orderBy: { numero: "asc" },
  });
  return filas
    .filter((m) => m.clave)
    .map((m) => ({
      clave: m.clave as string,
      numero: m.numero,
      nota: m.nota,
      referenciaAnexo: m.referenciaAnexo,
      diferencia: Number(m.diferencia),
      marcadoPor: m.marcadoPor,
      marcadoEn: m.marcadoEn.toISOString(),
    }));
}

/** Los resultados en vivo (lo que evalúa el cierre). */
export async function resultadosEnVivo(revision: RevisionVista): Promise<Omit<ResultadosRevision, "cierre" | "desdeCopia">> {
  const [cruce, marcas, { calendario }] = await Promise.all([
    cargarCruceRetencion(revision),
    marcasDeControl(revision),
    cargarCalendarioDian(revision.anio, "RETEFUENTE"),
  ]);
  const aplica = revision.periodicidad === "Mensual";
  const oportunidad = oportunidadRevision({
    anio: revision.anio, nit: revision.nitCliente, periodos: revision.periodos, calendario: calendario.filas, calendarioAplica: aplica, marcas,
  });
  const pagos = pagosRevision({ anio: revision.anio, periodos: revision.periodos, marcas });
  const evaluacion = evaluarCierreRetencion({
    periodos: revision.periodos, cruce, pagos, oportunidad, etiquetaPeriodo: (p) => etiquetaPeriodoRevision(revision.periodicidad, p),
  });
  return { periodos: revision.periodos, cruce, oportunidad, pagos, evaluacion, calendario: { cargado: calendario.filas.length > 0, aplica } };
}

export async function cargarResultadosRevision(revision: RevisionVista): Promise<ResultadosRevision> {
  const fila = await prisma.conciliacionModuloCierre.findUnique({
    where: { clienteId_moduloCodigo_periodo: { clienteId: revision.clienteId, moduloCodigo: MODULO_RETENCION, periodo: revision.periodo } },
    include: { _count: { select: { cuentas: true } } },
  });
  const copia = fila?.estado === ESTADO_CIERRE_FIRME ? leerCopiaRetencion(fila.copiaCongelada) : null;
  const cierre: CierreRetencionVista | null = fila
    ? {
        id: fila.id,
        estado: fila.estado,
        cerradoPor: fila.cerradoPor,
        cerradoEn: fila.cerradoEn.toISOString(),
        balancePeriodo: fila.balancePeriodo,
        balanceEncabezadoId: fila.balanceEncabezadoId,
        cuentasBloqueadas: fila._count.cuentas,
        huella: copia?.huella ?? null,
        desbloqueadoPor: fila.desbloqueadoPor,
        desbloqueadoEn: fila.desbloqueadoEn?.toISOString() ?? null,
        justificacionDesbloqueo: fila.justificacionDesbloqueo,
      }
    : null;
  if (copia && revision.estado === "en_firme") {
    const evaluacion = evaluarCierreRetencion({
      periodos: copia.periodos, cruce: copia.cruce, pagos: copia.pagos, oportunidad: copia.oportunidad,
      etiquetaPeriodo: (p) => etiquetaPeriodoRevision(revision.periodicidad, p),
    });
    return {
      periodos: copia.periodos, cruce: copia.cruce, oportunidad: copia.oportunidad, pagos: copia.pagos, evaluacion,
      calendario: { cargado: true, aplica: revision.periodicidad === "Mensual" }, cierre, desdeCopia: true,
    };
  }
  return { ...(await resultadosEnVivo(revision)), cierre, desdeCopia: false };
}
