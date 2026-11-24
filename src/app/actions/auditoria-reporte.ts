"use server";

import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { mensajeErrorBD } from "@/lib/errores";
import { authorizeReporteEjecutivo } from "@/lib/rbac/reporte-ejecutivo";
import { evaluarAdopcion, soloFuncionalidadesNuevas } from "@/lib/auditoria/reporte-ejecutivo/adopcion";
import {
  calcularResumenUso,
  clasificarFamilia,
  conteosPorFamiliaCanon,
} from "@/lib/auditoria/reporte-ejecutivo/metricas";
import {
  filtrarEventosPublicados,
  filtrarNavegacionesPublicadas,
  type FiltroPublicacion,
} from "@/lib/auditoria/reporte-ejecutivo/alcance";
import { construirComparativoUso, construirUsoComparable } from "@/lib/auditoria/reporte-ejecutivo/comparativo-servidor";
import { construirCostosIAReporte } from "@/lib/auditoria/reporte-ejecutivo/costos-ia-servidor";
import type { CostosIA } from "@/lib/auditoria/reporte-ejecutivo/costos-ia";
import { construirTicketsAtendidosReporte } from "@/lib/auditoria/reporte-ejecutivo/tickets-atendidos-servidor";
import type { TicketsAtendidos } from "@/lib/auditoria/reporte-ejecutivo/tickets-atendidos";
import { parseRangoReporte } from "@/lib/auditoria/reporte-ejecutivo/rango";
import { filtroVersionesDelPeriodo } from "@/lib/auditoria/reporte-ejecutivo/novedades-periodo";
import {
  actorUnificado,
  aliasDeActores,
  correosDelReporte,
  idsDelUso,
  nombresDelGastoIA,
  nombresDelReporte,
  unificarActores,
  visitasDeCuentas,
} from "@/lib/auditoria/reporte-ejecutivo/usuarios-reporte";
import { construirUsuariosActivos } from "@/lib/auditoria/reporte-ejecutivo/usuarios-activos-servidor";
import type { ComparativoUso } from "@/lib/auditoria/reporte-ejecutivo/comparativo";
import { modulosPublicadosParaTodos } from "@/lib/rbac/publicacion";
import {
  RegistroEnvioReporteSchema,
  ReporteEjecutivoUsoScopeSchema,
  type RegistroEnvioReporte,
  type ReporteEjecutivoUsoScope,
} from "@/lib/definitions";
import type { EnvioReportePrevio } from "@/lib/auditoria/reporte-ejecutivo/envios";
import { revalidatePath } from "next/cache";
import {
  crearContextoNovedades,
  generarReporteEjecutivoNucleo,
  MAX_EVENTOS_AUDITORIA,
  type GenerarReporteEjecutivoResult as ResultadoGeneracionReporte,
} from "@/lib/auditoria/reporte-ejecutivo/generar-servidor";

/** Misma regla que el tablero (ver `rango.ts`): así coinciden sus cifras. */
const parseRango = parseRangoReporte;

/** El resultado de generar: lo define el núcleo; la pantalla lo importa de aquí. */
export type GenerarReporteEjecutivoResult = ResultadoGeneracionReporte;

/**
 * Genera el reporte ejecutivo de uso y adopción (HTML) a partir de la bitácora de
 * auditoría y las novedades publicadas. Solo Superadministrador. La generación en sí
 * vive en `generarReporteEjecutivoNucleo`, que también usa el envío automático.
 */
export async function generarReporteEjecutivoUso(
  opciones: ReporteEjecutivoUsoScope,
  signal?: AbortSignal,
): Promise<GenerarReporteEjecutivoResult> {
  const authz = await authorizeReporteEjecutivo();
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = ReporteEjecutivoUsoScopeSchema.safeParse(opciones);
  if (!parsed.success) {
    return { ok: false, message: "El alcance del reporte no es válido. Revisa las fechas y las versiones." };
  }

  return generarReporteEjecutivoNucleo({
    opciones: parsed.data,
    signal,
    obtenerActor: async () => {
      const user = await getCurrentUser();
      return user ? { id: user.id, nombre: user.name } : null;
    },
  });
}

/**
 * Resumen factual ligero (sin IA) para la página de previsualización de KPIs.
 */
export async function obtenerResumenUsoAdopcion(opciones: {
  desde: string;
  hasta: string;
}): Promise<
  | {
      ok: true;
      uso: ReturnType<typeof calcularResumenUso>;
      adopcion: ReturnType<typeof evaluarAdopcion>;
      comparativo: ComparativoUso | null;
      costos: CostosIA | null;
      tickets: TicketsAtendidos | null;
      totalVersionesPublicadas: number;
    }
  | { ok: false; message: string }
> {
  const authz = await authorizeReporteEjecutivo();
  if (!authz.ok) return { ok: false, message: authz.message };

  const rango = parseRango(opciones.desde, opciones.hasta);
  if (!rango) {
    return { ok: false, message: "El rango de fechas no es válido o supera 366 días." };
  }

  try {
    const [eventosRaw, conexionesRaw, navegacionesRaw, versiones, clientes, usuarios, modulosPublicados] = await Promise.all([
      prisma.auditEntry.findMany({
        where: { createdAt: { gte: rango.desde, lte: rango.hasta } },
        orderBy: { createdAt: "desc" },
        take: MAX_EVENTOS_AUDITORIA,
        select: {
          user: true,
          action: true,
          entity: true,
          detail: true,
          clientId: true,
          createdAt: true,
          document: true,
        },
      }),
      prisma.accessLog.groupBy({
        by: ["userName"],
        where: {
          kind: "ingreso",
          createdAt: { gte: rango.desde, lte: rango.hasta },
        },
        _count: { userName: true },
        orderBy: { userName: "asc" },
      }),
      prisma.accessLog.groupBy({
        by: ["path", "userId"],
        where: {
          kind: "navegacion",
          createdAt: { gte: rango.desde, lte: rango.hasta },
        },
        _count: { path: true },
        orderBy: { path: "asc" },
      }),
      // Solo las desplegadas en el período, igual que el reporte generado.
      prisma.platformVersion.findMany({
        where: filtroVersionesDelPeriodo(rango.desde, rango.hasta),
        orderBy: [{ order: "desc" }, { id: "desc" }],
        include: { changes: { orderBy: [{ order: "asc" }, { id: "asc" }] } },
      }),
      prisma.client.findMany({ select: { id: true, name: true } }),
      prisma.user.findMany({ select: { id: true, name: true, email: true } }),
      modulosPublicadosParaTodos(),
    ]);

    const filtro: FiltroPublicacion = { modulosPublicados };
    const alias = aliasDeActores(usuarios);
    const eventos = unificarActores(
      filtrarEventosPublicados({
        eventos: eventosRaw.map((e) => ({
          user: e.user,
          action: e.action,
          entity: e.entity,
          detail: e.detail,
          clientId: e.clientId,
          createdAt: e.createdAt,
          document: e.document,
        })),
        clasificar: (e) => clasificarFamilia(e.action, e.entity, e.detail),
        filtro,
      }).eventos,
      alias,
    );
    const navegaciones = filtrarNavegacionesPublicadas({
      navegaciones: visitasDeCuentas(
        navegacionesRaw.map((navegacion) => ({
          ruta: navegacion.path,
          userId: navegacion.userId,
          total: navegacion._count.path,
        })),
        idsDelUso(usuarios),
      ),
      filtro,
    }).navegaciones;

    const nombresClientes = new Map(clientes.map((c) => [c.id, c.name]));
    const uso = calcularResumenUso({
      eventos,
      conexiones: conexionesRaw.map((conexion) => ({
        usuario: actorUnificado(conexion.userName, alias),
        total: conexion._count.userName,
      })),
      navegaciones,
      periodoDesde: rango.desde,
      periodoHasta: rango.hasta,
      nombresClientes,
      correosUsuarios: correosDelReporte(usuarios),
      usuariosRegistrados: nombresDelReporte(usuarios),
      usuariosActivos: await construirUsuariosActivos({ desde: rango.desde, hasta: rango.hasta }),
    });
    const { planos } = crearContextoNovedades(versiones, filtro);
    const adopcion = evaluarAdopcion({
      cambios: soloFuncionalidadesNuevas(planos),
      conteosPorFamilia: conteosPorFamiliaCanon(eventos, nombresDelReporte(usuarios)),
    });
    const usoComparable = await construirUsoComparable({
      desde: rango.desde,
      hasta: rango.hasta,
      filtro,
      nombresClientes,
    });
    const comparativo = usoComparable
      ? await construirComparativoUso({
          usoComparableActual: usoComparable,
          desde: rango.desde,
          hasta: rango.hasta,
          corte: new Date(),
          filtro,
          nombresClientes,
        })
      : null;

    const costos = await construirCostosIAReporte({
      desde: rango.desde,
      hasta: rango.hasta,
      corte: new Date(),
      ventanaPrevia: comparativo?.ventanaPrevia ?? null,
      base: comparativo?.base ?? null,
      usuariosRegistrados: nombresDelGastoIA(usuarios),
    });

    const tickets = await construirTicketsAtendidosReporte({
      desde: rango.desde,
      hasta: rango.hasta,
      corte: new Date(),
    });

    return {
      ok: true,
      uso,
      adopcion,
      comparativo,
      costos,
      tickets,
      totalVersionesPublicadas: versiones.length,
    };
  } catch {
    return { ok: false, message: "No se pudo cargar el resumen de uso y adopción." };
  }
}

/* ===== Registro de envíos: evita repetir avances ya comunicados ===== */

const RUTA_REPORTES = "/config/reportes-ejecutivos";

export type RegistrarEnvioResult =
  | { ok: true; envio: EnvioReportePrevio }
  | { ok: false; message: string };

function esTablaEnviosNoDisponible(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : "";
  return /P2021|P2022|envios_reporte_ejecutivo|does not exist|no existe/i.test(msg);
}

type FilaEnvio = {
  id: number;
  titulo: string;
  periodoDesde: Date;
  periodoHasta: Date;
  versionIds: number[];
  totalNovedades: number;
  totalAcciones: number;
  canal: string;
  enviadoPor: string;
  enviadoEn: Date;
};

function aEnvioPrevio(fila: FilaEnvio): EnvioReportePrevio {
  return {
    id: fila.id,
    titulo: fila.titulo,
    periodoDesde: fila.periodoDesde.toISOString(),
    periodoHasta: fila.periodoHasta.toISOString(),
    versionIds: fila.versionIds,
    totalNovedades: fila.totalNovedades,
    totalAcciones: fila.totalAcciones,
    canal: fila.canal,
    enviadoPor: fila.enviadoPor,
    enviadoEn: fila.enviadoEn.toISOString(),
  };
}

const SELECT_ENVIO = {
  id: true,
  titulo: true,
  periodoDesde: true,
  periodoHasta: true,
  versionIds: true,
  totalNovedades: true,
  totalAcciones: true,
  canal: true,
  enviadoPor: true,
  enviadoEn: true,
} as const;

/**
 * Lee los envíos registrados (para los loaders RSC). Nunca lanza: si la tabla
 * aún no existe en el entorno, la pantalla funciona como antes (sin historial).
 */
export async function listarEnviosReporteEjecutivo(limite = 50): Promise<EnvioReportePrevio[]> {
  const authz = await authorizeReporteEjecutivo();
  if (!authz.ok) return [];
  try {
    const filas = await prisma.envioReporteEjecutivo.findMany({
      orderBy: [{ enviadoEn: "desc" }, { id: "desc" }],
      take: Math.min(Math.max(limite, 1), 200),
      select: SELECT_ENVIO,
    });
    return filas.map(aEnvioPrevio);
  } catch (e) {
    if (esTablaEnviosNoDisponible(e)) return [];
    throw e;
  }
}

/**
 * Marca un reporte como entregado al cliente: deja constancia del período y de
 * las versiones de Novedades incluidas, para que el siguiente reporte solo
 * proponga lo que aún no se ha contado.
 */
export async function registrarEnvioReporteEjecutivo(
  datos: RegistroEnvioReporte,
): Promise<RegistrarEnvioResult> {
  const authz = await authorizeReporteEjecutivo();
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = RegistroEnvioReporteSchema.safeParse(datos);
  if (!parsed.success) {
    return { ok: false, message: "No se pudo registrar el envío: los datos del reporte no son válidos." };
  }

  const rango = parseRango(parsed.data.desde, parsed.data.hasta);
  if (!rango) {
    return { ok: false, message: "El período del reporte no es válido." };
  }

  const versionIds = Array.from(new Set(parsed.data.versionIds)).sort((a, b) => a - b);

  try {
    const user = await getCurrentUser();
    const fila = await prisma.envioReporteEjecutivo.create({
      data: {
        titulo: parsed.data.titulo,
        periodoDesde: rango.desde,
        periodoHasta: rango.hasta,
        versionIds,
        totalNovedades: parsed.data.totalNovedades,
        totalAcciones: parsed.data.totalAcciones,
        canal: parsed.data.canal,
        nota: parsed.data.nota ?? null,
        enviadoPor: user?.name ?? "Sistema",
        enviadoPorId: user?.id ?? null,
      },
      select: SELECT_ENVIO,
    });

    await logAudit({
      user: user?.name ?? "Sistema",
      action: "REGISTRÓ ENVÍO DE REPORTE",
      entity: "Uso y adopción",
      detail: `Marcó como enviado «${parsed.data.titulo}» (${versionIds.length} versiones de novedades, canal ${parsed.data.canal}).`,
    });

    revalidatePath(RUTA_REPORTES);
    return { ok: true, envio: aEnvioPrevio(fila) };
  } catch (e) {
    if (esTablaEnviosNoDisponible(e)) {
      return {
        ok: false,
        message:
          "El historial de envíos aún no está disponible en este entorno. Aplica la migración pendiente e inténtalo de nuevo.",
      };
    }
    return { ok: false, message: mensajeErrorBD("registrarEnvioReporteEjecutivo", e) };
  }
}

/** Deshace un registro de envío hecho por error (vuelve a considerar sus versiones como pendientes). */
export async function eliminarEnvioReporteEjecutivo(
  id: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const authz = await authorizeReporteEjecutivo();
  if (!authz.ok) return { ok: false, message: authz.message };

  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, message: "El registro de envío no es válido." };
  }

  try {
    const user = await getCurrentUser();
    await prisma.envioReporteEjecutivo.delete({ where: { id } });
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "ELIMINÓ ENVÍO DE REPORTE",
      entity: "Uso y adopción",
      detail: `Deshizo el registro de envío #${id}; sus novedades vuelven a considerarse pendientes.`,
    });
    revalidatePath(RUTA_REPORTES);
    return { ok: true };
  } catch (e) {
    if (esTablaEnviosNoDisponible(e)) {
      return { ok: false, message: "El historial de envíos no está disponible en este entorno." };
    }
    return { ok: false, message: mensajeErrorBD("eliminarEnvioReporteEjecutivo", e) };
  }
}

/* ===== Historial de reportes GENERADOS (instantáneas) ===== */
//
// Guarda la copia de cada reporte (la que se reutiliza al volver a generar el
// mismo alcance) y avisa cuando el período de la página se traslapa con uno ya
// generado. Borrar una instantánea la saca del historial: si se vuelve a generar
// ese período, el documento se arma de nuevo. El período lo elige la página y el
// comparativo no lee este historial. Es distinto del registro de ENVÍOS, que
// controla qué avances ya se le contaron al cliente.

export type ReporteGeneradoPrevio = {
  id: number;
  titulo: string;
  modelo: string;
  periodoDesde: string;
  periodoHasta: string;
  generadoEn: string;
  totalAcciones: number;
  totalUsuarios: number;
  totalNovedades: number;
};

/** Historial de reportes generados, del más reciente al más antiguo. */
export async function listarReportesGenerados(limite = 50): Promise<ReporteGeneradoPrevio[]> {
  const authz = await authorizeReporteEjecutivo();
  if (!authz.ok) return [];

  try {
    const filas = await prisma.reporteEjecutivoUsoIA.findMany({
      orderBy: [{ periodoHasta: "desc" }, { creadoEn: "desc" }, { id: "desc" }],
      take: Math.min(Math.max(1, limite), 200),
      select: {
        id: true, titulo: true, modelo: true, periodoDesde: true, periodoHasta: true,
        creadoEn: true, totalAcciones: true, totalUsuarios: true, totalNovedades: true,
      },
    });
    return filas.map((f) => ({
      id: f.id,
      titulo: f.titulo,
      modelo: f.modelo,
      periodoDesde: f.periodoDesde.toISOString(),
      periodoHasta: f.periodoHasta.toISOString(),
      generadoEn: f.creadoEn.toISOString(),
      totalAcciones: f.totalAcciones,
      totalUsuarios: f.totalUsuarios,
      totalNovedades: f.totalNovedades,
    }));
  } catch {
    return [];
  }
}

export type EliminarReporteGeneradoResult = { ok: true; eliminados: number } | { ok: false; message: string };

/** Borra UNA instantánea: sale del historial y de los avisos de traslape. */
export async function eliminarReporteGenerado(id: number): Promise<EliminarReporteGeneradoResult> {
  const authz = await authorizeReporteEjecutivo();
  if (!authz.ok) return { ok: false, message: authz.message };
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "El reporte indicado no es válido." };

  try {
    const user = await getCurrentUser();
    const fila = await prisma.reporteEjecutivoUsoIA.delete({
      where: { id },
      select: { periodoDesde: true, periodoHasta: true },
    });
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "ELIMINÓ REPORTE GENERADO",
      entity: "Uso y adopción",
      detail: `Borró el reporte #${id} del período ${fila.periodoDesde.toISOString().slice(0, 10)} → ${fila.periodoHasta.toISOString().slice(0, 10)}. Si se vuelve a generar ese período, el documento se arma de nuevo.`,
    });
    revalidatePath(RUTA_REPORTES);
    return { ok: true, eliminados: 1 };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("eliminarReporteGenerado", e) };
  }
}

/** Vacía el historial completo: la próxima generación arranca sin serie previa. */
export async function eliminarTodosLosReportesGenerados(): Promise<EliminarReporteGeneradoResult> {
  const authz = await authorizeReporteEjecutivo();
  if (!authz.ok) return { ok: false, message: authz.message };

  try {
    const user = await getCurrentUser();
    const { count } = await prisma.reporteEjecutivoUsoIA.deleteMany({});
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "VACIÓ EL HISTORIAL DE REPORTES GENERADOS",
      entity: "Uso y adopción",
      detail: `Borró ${count} reporte(s) generados. El historial queda vacío; cada período se arma de nuevo al generarlo.`,
    });
    revalidatePath(RUTA_REPORTES);
    return { ok: true, eliminados: count };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("eliminarTodosLosReportesGenerados", e) };
  }
}
