import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { requireReporteEjecutivo } from "@/lib/rbac/reporte-ejecutivo";
import {
  calcularResumenUso,
  clasificarFamilia,
  conteosPorFamiliaCanon,
  type EventoAuditoria,
} from "@/lib/auditoria/reporte-ejecutivo/metricas";
import {
  filtrarCambiosPublicados,
  filtrarEventosPublicados,
  filtrarNavegacionesPublicadas,
  type FiltroPublicacion,
} from "@/lib/auditoria/reporte-ejecutivo/alcance";
import { modulosPublicadosParaTodos } from "@/lib/rbac/publicacion";
import { MODULOS_PLATAFORMA_KEYS } from "@/lib/rbac/modulos-plataforma";
import {
  evaluarAdopcion,
  type CambioNovedadContexto,
} from "@/lib/auditoria/reporte-ejecutivo/adopcion";
import { listarEnviosReporteEjecutivo, listarReportesGenerados } from "@/app/actions/auditoria-reporte";
import { resumirPendienteDeEnvio } from "@/lib/auditoria/reporte-ejecutivo/envios";
import { construirComparativoUso } from "@/lib/auditoria/reporte-ejecutivo/comparativo-servidor";
import { construirCostosIAReporte } from "@/lib/auditoria/reporte-ejecutivo/costos-ia-servidor";
import {
  explicarPeriodoSugerido,
  sugerirPeriodoReporte,
} from "@/lib/auditoria/reporte-ejecutivo/periodo-sugerido";
import {
  correosDelReporte,
  nombresDelReporte,
} from "@/lib/auditoria/reporte-ejecutivo/usuarios-reporte";
import {
  ReporteEjecutivoClient,
  type KpisIniciales,
  type VersionOpcion,
} from "@/app/(app)/auditoria/adopcion/reporte-ejecutivo-client";

const MAX_EVENTOS = 25_000;

function aYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function ReportesEjecutivosPage() {
  await requireReporteEjecutivo();

  const hasta = new Date();
  const desde = new Date();
  desde.setDate(desde.getDate() - 29);
  desde.setHours(0, 0, 0, 0);
  hasta.setHours(23, 59, 59, 999);

  // El tablero sigue leyendo los últimos 30 días; el MODAL propone continuar
  // donde terminó el último reporte, para que los períodos no se traslapen.
  const ultimoReporte = await prisma.reporteEjecutivoUsoIA.findFirst({
    orderBy: [{ periodoHasta: "desc" }, { creadoEn: "desc" }, { id: "desc" }],
    select: { periodoDesde: true, periodoHasta: true },
  });
  const periodoSugerido = sugerirPeriodoReporte({
    hoy: aYYYYMMDD(hasta),
    ultimoReporte: ultimoReporte
      ? { desde: aYYYYMMDD(ultimoReporte.periodoDesde), hasta: aYYYYMMDD(ultimoReporte.periodoHasta) }
      : null,
  });
  const defaultDesde = periodoSugerido.desde;
  const defaultHasta = periodoSugerido.hasta;
  const periodoTablero = `${aYYYYMMDD(desde)} → ${aYYYYMMDD(hasta)}`;

  const [eventosRaw, conexionesRaw, navegacionesRaw, versiones, clientes, usuarios, modulosPublicados, envios, generados] = await Promise.all([
    prisma.auditEntry.findMany({
      where: { createdAt: { gte: desde, lte: hasta } },
      orderBy: { createdAt: "desc" },
      take: MAX_EVENTOS,
      select: {
        user: true,
        action: true,
        entity: true,
        detail: true,
        clientId: true,
        createdAt: true,
      },
    }),
    // Inicios de sesión y visitas: se cuentan aparte de las operaciones, y el
    // comparativo las necesita para no leer un período sin medir como una caída.
    prisma.accessLog.groupBy({
      by: ["userName"],
      where: { kind: "ingreso", createdAt: { gte: desde, lte: hasta } },
      _count: { userName: true },
      orderBy: { userName: "asc" },
    }),
    prisma.accessLog.groupBy({
      by: ["path"],
      where: { kind: "navegacion", createdAt: { gte: desde, lte: hasta } },
      _count: { path: true },
      orderBy: { path: "asc" },
    }),
    prisma.platformVersion.findMany({
      where: { status: "publicada" },
      orderBy: [{ order: "desc" }, { id: "desc" }],
      include: {
        changes: {
          orderBy: [{ order: "asc" }, { id: "asc" }],
          select: {
            id: true,
            moduleKey: true,
            title: true,
            type: true,
            description: true,
            route: true,
            howTo: true,
            example: true,
            featureStatus: true,
          },
        },
      },
    }),
    prisma.client.findMany({ select: { id: true, name: true } }),
    prisma.user.findMany({ select: { name: true, email: true } }),
    modulosPublicadosParaTodos(),
    listarEnviosReporteEjecutivo(50),
    listarReportesGenerados(50),
  ]);

  // Alcance del tablero y del reporte: solo módulos publicados para todos los
  // usuarios y funcionalidades ya disponibles (nada en desarrollo).
  const filtro: FiltroPublicacion = { modulosPublicados };

  const eventos: EventoAuditoria[] = filtrarEventosPublicados({
    eventos: eventosRaw.map((e) => ({
      user: e.user,
      action: e.action,
      entity: e.entity,
      detail: e.detail,
      clientId: e.clientId,
      createdAt: e.createdAt,
    })),
    clasificar: (e) => clasificarFamilia(e.action, e.entity, e.detail),
    filtro,
  }).eventos;

  const nombresClientes = new Map(clientes.map((c) => [c.id, c.name]));
  // Solo cuentas existentes en la plataforma y del cliente: el tablero mide el
  // uso del equipo de Russell, no el de actores técnicos de la bitácora ni el
  // de las cuentas de Xentria que construyen y operan la plataforma.
  const correosUsuarios = correosDelReporte(usuarios);
  const usuariosRegistrados = nombresDelReporte(usuarios);
  const uso = calcularResumenUso({
    eventos,
    conexiones: conexionesRaw.map((c) => ({ usuario: c.userName, total: c._count.userName })),
    navegaciones: filtrarNavegacionesPublicadas({
      navegaciones: navegacionesRaw.map((n) => ({ ruta: n.path, total: n._count.path })),
      filtro,
    }).navegaciones,
    periodoDesde: desde,
    periodoHasta: hasta,
    nombresClientes,
    correosUsuarios,
    usuariosRegistrados,
  });

  // ¿Subió o bajó el uso frente al último reporte generado?
  const comparativo = await construirComparativoUso({
    usoActual: uso,
    desde,
    hasta,
    filtro,
    usuariosRegistrados,
    nombresClientes,
    correosUsuarios,
  });

  // Cuánto costó la IA en la misma ventana, contra el mismo tramo anterior.
  const costos = await construirCostosIAReporte({
    desde,
    hasta,
    corte: new Date(),
    ventanaPrevia: comparativo?.ventanaPrevia ?? null,
    base: comparativo?.base ?? null,
    usuariosRegistrados,
  });

  const cambiosPublicadosPorVersion = new Map<number, number>();
  const planos: CambioNovedadContexto[] = [];
  for (const v of versiones) {
    const publicables = filtrarCambiosPublicados({
      cambios: v.changes.map((c) => ({
        ...c,
        modulo: c.moduleKey,
        estadoFuncionalidad: c.featureStatus,
      })),
      filtro,
      clavesConocidas: MODULOS_PLATAFORMA_KEYS,
    });
    cambiosPublicadosPorVersion.set(v.id, publicables.cambios.length);
    for (const c of publicables.cambios) {
      planos.push({
        versionNumero: v.number,
        versionTitulo: v.title,
        tipo: c.type,
        titulo: c.title,
        descripcion: c.description,
        modulo: c.moduleKey,
        ruta: c.route,
        comoOperar: c.howTo,
        ejemplo: c.example,
        estadoFuncionalidad: c.featureStatus,
      });
    }
  }

  const adopcion = evaluarAdopcion({
    cambios: planos,
    conteosPorFamilia: conteosPorFamiliaCanon(eventos, usuariosRegistrados),
  });

  const versions: VersionOpcion[] = versiones.map((v) => ({
    id: v.id,
    number: v.number,
    title: v.title,
    changesCount: cambiosPublicadosPorVersion.get(v.id) ?? 0,
    releasedAt: v.releasedAt?.toISOString() ?? null,
    createdAt: v.createdAt.toISOString(),
  }));

  // Qué avances aún no se le han contado al cliente (según los envíos registrados).
  const pendiente = resumirPendienteDeEnvio({
    versiones: versions.map((v) => ({ id: v.id, changesCount: v.changesCount })),
    envios,
  });

  const kpis: KpisIniciales = {
    comparativo,
    costos,
    totalAcciones: uso.totalAcciones,
    totalUsuarios: uso.totalUsuarios,
    totalClientes: uso.totalClientes,
    usadas: adopcion.usadas,
    sinEvidencia: adopcion.sinEvidencia,
    noMedibles: adopcion.noMedibles,
    porcentajeAdopcion: adopcion.porcentajeAdopcion,
    totalNovedades: adopcion.totalCambios,
    totalVersionesPublicadas: versiones.length,
    porFamilia: uso.porFamilia.map((f) => ({ etiqueta: f.nombre, total: f.total })),
    topUsuarios: uso.topUsuarios.map((u) => ({
      etiqueta: u.usuario,
      total: u.total,
      detalle:
        [
          u.correo ?? undefined,
          u.porFamilia
            .slice(0, 2)
            .map((f) => f.nombre)
            .join(" · ") || undefined,
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
    })),
    topAcciones: uso.topAcciones.map((a) => ({ etiqueta: a.nombre, total: a.total })),
    topClientes: uso.topClientes.map((c) => ({ etiqueta: c.nombre, total: c.total })),
    serieDiaria: uso.serieDiaria.map((d) => ({
      fecha: d.fecha,
      total: d.total,
      usuarios: d.usuarios,
    })),
    adopcionBarras: [
      { etiqueta: "Con actividad relacionada", total: adopcion.usadas },
      { etiqueta: "Sin actividad relacionada", total: adopcion.sinEvidencia },
      { etiqueta: "No se puede medir", total: adopcion.noMedibles },
    ].filter((b) => b.total > 0),
  };

  return (
    <div>
      <PageHeader
        title="Reportes para gerencia"
        subtitle="Indicadores de uso, avances de la plataforma y generación de un reporte claro para el cliente."
      />
      <ReporteEjecutivoClient
        versions={versions}
        kpis={kpis}
        defaultDesde={defaultDesde}
        defaultHasta={defaultHasta}
        periodoTablero={periodoTablero}
        notaPeriodo={explicarPeriodoSugerido(periodoSugerido)}
        envios={envios}
        pendiente={pendiente}
        generados={generados}
      />
    </div>
  );
}
