import "server-only";
import prisma from "@/lib/prisma";
import { ESTADO_CIERRE_FIRME } from "@/lib/conciliacion/cuentas-bloqueo";
import { cargarCalendarioDian } from "../configuracion-servidor";
import { evaluarCierreRetencion, type EvaluacionCierreRetencion } from "./cierre";
import { leerCopiaRetencion } from "./copia-cierre";
import { conMarcaSaldoInicial, detalleSaldoInicialRestado, type CruceRetencionPantalla, type CruceRetencionVista, type DetalleSaldoInicialRestado, type MarcaCruceRetencion } from "./cruce";
import { cargarCruceRetencion } from "./cruce-servidor";
import { impuestoPorClave, RETENCION } from "../impuestos-dian";
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
  /** Lo restado como saldo inicial, tercero por tercero (Novedades); null si el cruce no lo resta. */
  saldoInicialRestado: DetalleSaldoInicialRestado | null;
  evaluacion: EvaluacionCierreRetencion;
  /** El calendario que mide la oportunidad (año y formulario, para el enlace a Calendario tributario). */
  calendario: { cargado: boolean; aplica: boolean; anio?: number; formulario?: string };
  /** El último cierre de la revisión (en firme o desbloqueado). */
  cierre: CierreRetencionVista | null;
  /** Los resultados salen de la copia congelada. */
  desdeCopia: boolean;
};

/** Lo que viaja a la pantalla: el cruce con los terceros recortados (`cruceParaPantalla`). */
export type ResultadosPantalla = Omit<ResultadosRevision, "cruce"> & { cruce: CruceRetencionPantalla };

/** Marcas de los meses (pagos y oportunidad) y la del saldo inicial restado: dimensión `control` de RET. */
async function marcasDeControl(revision: Pick<RevisionVista, "clienteId" | "periodo" | "impuesto">): Promise<(MarcaCruceRetencion & { clave: string })[]> {
  const filas = await prisma.marcaCruceModulo.findMany({
    where: { clienteId: revision.clienteId, moduloCodigo: impuestoDe(revision).clave, periodo: revision.periodo, dimension: "control" },
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

const impuestoDe = (r: Pick<RevisionVista, "impuesto">) => impuestoPorClave(r.impuesto) ?? RETENCION;

/** Los resultados en vivo (lo que evalúa el cierre). */
export async function resultadosEnVivo(revision: RevisionVista): Promise<Omit<ResultadosRevision, "cierre" | "desdeCopia">> {
  const impuesto = impuestoDe(revision);
  // Retención mensual lee RETEFUENTE del año; IVA, el de su periodicidad (el anual, el del año siguiente).
  const destino = impuesto.calendario(revision.periodicidad, revision.anio);
  const [cruceSinMarca, marcas, filasCalendario] = await Promise.all([
    cargarCruceRetencion(revision),
    marcasDeControl(revision),
    destino ? cargarCalendarioDian(destino.anio, destino.formulario).then((r) => r.calendario.filas) : Promise.resolve([]),
  ]);
  const cruce = conMarcaSaldoInicial(cruceSinMarca, marcas);
  const aplica = destino != null;
  const oportunidad = oportunidadRevision({
    impuesto: impuesto.clave, anio: revision.anio, nit: revision.nitCliente, periodos: revision.periodos, calendario: filasCalendario, calendarioAplica: aplica, marcas,
  });
  const pagos = pagosRevision({ impuesto: impuesto.clave, anio: revision.anio, periodos: revision.periodos, marcas });
  const evaluacion = evaluarCierreRetencion({
    codigo: impuesto.declaracion.codigo, periodos: revision.periodos, cruce, pagos, oportunidad, etiquetaPeriodo: (p) => etiquetaPeriodoRevision(revision.periodicidad, p),
  });
  return {
    periodos: revision.periodos, cruce, oportunidad, pagos, saldoInicialRestado: detalleSaldoInicialRestado(cruce), evaluacion,
    calendario: { cargado: filasCalendario.length > 0, aplica, anio: destino?.anio, formulario: destino?.formulario },
  };
}

export async function cargarResultadosRevision(revision: RevisionVista): Promise<ResultadosRevision> {
  const impuesto = impuestoDe(revision);
  const fila = await prisma.conciliacionModuloCierre.findUnique({
    where: { clienteId_moduloCodigo_periodo: { clienteId: revision.clienteId, moduloCodigo: impuesto.clave, periodo: revision.periodo } },
    include: { _count: { select: { cuentas: true } } },
  });
  const copia = fila?.estado === ESTADO_CIERRE_FIRME ? leerCopiaRetencion(fila.copiaCongelada, impuesto.slug === "iva" ? "iva" : "retencion") : null;
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
      codigo: impuesto.declaracion.codigo, periodos: copia.periodos, cruce: copia.cruce, pagos: copia.pagos, oportunidad: copia.oportunidad,
      etiquetaPeriodo: (p) => etiquetaPeriodoRevision(revision.periodicidad, p),
    });
    return {
      periodos: copia.periodos, cruce: copia.cruce, oportunidad: copia.oportunidad, pagos: copia.pagos, saldoInicialRestado: detalleSaldoInicialRestado(copia.cruce), evaluacion,
      calendario: { cargado: true, aplica: impuesto.calendario(revision.periodicidad, revision.anio) != null }, cierre, desdeCopia: true,
    };
  }
  return { ...(await resultadosEnVivo(revision)), cierre, desdeCopia: false };
}
