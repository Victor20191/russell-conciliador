// De dónde sale el período con el que se compara el uso actual.
//
// Prioridad 1: el último reporte cuyo período TERMINA antes de que empiece el
// actual —comparar contra uno que se traslapa (o que contiene al período nuevo)
// no dice nada—. Cada instantánea guarda en `metadatos.fuente.uso` el resumen
// factual completo con el que se construyó, así que el comparativo usa
// exactamente las cifras que gerencia ya vio, sin recalcular nada y sin que un
// cambio posterior de la bitácora las mueva.
//
// Prioridad 2 (respaldo): el período inmediatamente anterior de IGUAL duración,
// calculado en vivo con los mismos filtros de publicación y de usuarios que el
// período actual. Cubre el primer reporte y las instantáneas antiguas que no
// guardaron la fuente.
import "server-only";
import prisma from "@/lib/prisma";
import { compararUso, type ComparativoUso } from "./comparativo";
import { filtrarEventosPublicados, filtrarNavegacionesPublicadas, type FiltroPublicacion } from "./alcance";
import { calcularResumenUso, clasificarFamilia, type EventoAuditoria, type ResumenUsoFactual } from "./metricas";

/** Tope de eventos del período de respaldo (el actual tiene el suyo en cada llamador). */
const MAX_EVENTOS_PREVIOS = 25_000;

/** Campos mínimos del resumen previo; una instantánea vieja puede no traerlos todos. */
function leerUsoDeInstantanea(metadatos: unknown): ResumenUsoFactual | null {
  if (!metadatos || typeof metadatos !== "object") return null;
  const fuente = (metadatos as { fuente?: unknown }).fuente;
  if (!fuente || typeof fuente !== "object") return null;
  const uso = (fuente as { uso?: unknown }).uso;
  if (!uso || typeof uso !== "object") return null;
  const candidato = uso as Partial<ResumenUsoFactual>;
  if (typeof candidato.periodoDesde !== "string" || typeof candidato.periodoHasta !== "string") return null;
  if (typeof candidato.totalAcciones !== "number") return null;
  return {
    ...candidato,
    totalNavegaciones: candidato.totalNavegaciones ?? 0,
    totalConexiones: candidato.totalConexiones ?? 0,
    totalUsuarios: candidato.totalUsuarios ?? 0,
    totalClientes: candidato.totalClientes ?? 0,
    porFamilia: candidato.porFamilia ?? [],
    topUsuarios: candidato.topUsuarios ?? [],
    topAcciones: candidato.topAcciones ?? [],
    detalleUsuarios: candidato.detalleUsuarios ?? [],
    topClientes: candidato.topClientes ?? [],
    serieDiaria: candidato.serieDiaria ?? [],
    evidencia: candidato.evidencia ?? [],
    navegacionesPorFamilia: candidato.navegacionesPorFamilia ?? [],
    primeraAccion: candidato.primeraAccion ?? null,
    ultimaAccion: candidato.ultimaAccion ?? null,
  } as ResumenUsoFactual;
}

/** Resumen del período previo calculado en vivo, con los mismos filtros del actual. */
async function resumirRango(params: {
  desde: Date;
  hasta: Date;
  filtro: FiltroPublicacion;
  usuariosRegistrados: string[];
  nombresClientes: Map<number, string>;
  correosUsuarios: Map<string, string>;
}): Promise<ResumenUsoFactual> {
  const [eventosRaw, conexiones, navegacionesRaw] = await Promise.all([
    prisma.auditEntry.findMany({
      where: { createdAt: { gte: params.desde, lte: params.hasta } },
      orderBy: { createdAt: "desc" },
      take: MAX_EVENTOS_PREVIOS,
      select: { user: true, action: true, entity: true, detail: true, clientId: true, createdAt: true },
    }),
    prisma.accessLog.groupBy({
      by: ["userName"],
      where: { kind: "ingreso", createdAt: { gte: params.desde, lte: params.hasta } },
      _count: { userName: true },
    }),
    prisma.accessLog.groupBy({
      by: ["path"],
      where: { kind: "navegacion", createdAt: { gte: params.desde, lte: params.hasta } },
      _count: { path: true },
    }),
  ]);
  const eventos: EventoAuditoria[] = eventosRaw.map((e) => ({ ...e, createdAt: e.createdAt }));
  const { eventos: publicados } = filtrarEventosPublicados({
    eventos,
    clasificar: (e) => clasificarFamilia(e.action, e.entity, e.detail),
    filtro: params.filtro,
  });
  const { navegaciones } = filtrarNavegacionesPublicadas({
    navegaciones: navegacionesRaw.map((n) => ({ ruta: n.path, total: n._count.path })),
    filtro: params.filtro,
  });
  return calcularResumenUso({
    eventos: publicados,
    conexiones: conexiones.map((c) => ({ usuario: c.userName, total: c._count.userName })),
    navegaciones,
    periodoDesde: params.desde,
    periodoHasta: params.hasta,
    nombresClientes: params.nombresClientes,
    correosUsuarios: params.correosUsuarios,
    usuariosRegistrados: params.usuariosRegistrados,
  });
}

/**
 * Comparativo del período actual contra el reporte anterior (o, en su defecto,
 * contra el período anterior de igual duración). Nunca lanza: si no hay con qué
 * comparar o la consulta falla, devuelve null y la pantalla simplemente no
 * muestra el bloque.
 */
export async function construirComparativoUso(params: {
  usoActual: ResumenUsoFactual;
  desde: Date;
  hasta: Date;
  filtro: FiltroPublicacion;
  usuariosRegistrados: string[];
  nombresClientes: Map<number, string>;
  correosUsuarios: Map<string, string>;
}): Promise<ComparativoUso | null> {
  try {
    // 1) El último reporte cuyo período TERMINA antes de que empiece el actual.
    //
    // La condición de no traslape es lo que hace legible la comparación: un
    // reporte de 09-01 a 09-20 CONTIENE al período 09-12 → 09-20, así que
    // compararlos mide lo mismo contra sí mismo. Se ordena por fin de período
    // —no por fecha de generación— porque lo que interesa es el tramo anterior
    // inmediato, aunque se haya generado después de otro más reciente.
    //
    // Se miran varios porque las instantáneas antiguas no guardaban la fuente:
    // se toma la primera que SÍ la tenga, en vez de renunciar a comparar.
    const candidatos = await prisma.reporteEjecutivoUsoIA.findMany({
      where: { periodoHasta: { lt: params.desde } },
      orderBy: [{ periodoHasta: "desc" }, { creadoEn: "desc" }, { id: "desc" }],
      take: 10,
      select: { metadatos: true, creadoEn: true },
    });
    for (const candidato of candidatos) {
      const usoPrevio = leerUsoDeInstantanea(candidato.metadatos);
      if (!usoPrevio) continue;
      return compararUso({
        actual: params.usoActual,
        previo: usoPrevio,
        base: "reporte_anterior",
        generadoEn: candidato.creadoEn.toISOString(),
      });
    }

    // 2) Respaldo: el período inmediatamente anterior, de la misma duración.
    const duracion = params.hasta.getTime() - params.desde.getTime();
    if (!(duracion > 0)) return null;
    const hastaPrevio = new Date(params.desde.getTime() - 1);
    const desdePrevio = new Date(hastaPrevio.getTime() - duracion);
    const resumenPrevio = await resumirRango({ ...params, desde: desdePrevio, hasta: hastaPrevio });
    // Un período previo sin una sola operación no es una caída: es falta de datos.
    if (resumenPrevio.totalAcciones === 0 && resumenPrevio.totalConexiones === 0) return null;
    return compararUso({ actual: params.usoActual, previo: resumenPrevio, base: "periodo_anterior" });
  } catch {
    return null;
  }
}
