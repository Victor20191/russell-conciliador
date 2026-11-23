import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { fmtNum } from "@/lib/format";
import { leerRangoElegido } from "@/lib/auditoria/reporte-ejecutivo/rango";
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
  soloFuncionalidadesNuevas,
  type CambioNovedadContexto,
} from "@/lib/auditoria/reporte-ejecutivo/adopcion";
import { listarEnviosReporteEjecutivo, listarReportesGenerados } from "@/app/actions/auditoria-reporte";
import { resumirPendienteDeEnvio } from "@/lib/auditoria/reporte-ejecutivo/envios";
import { construirComparativoUso, construirUsoComparable } from "@/lib/auditoria/reporte-ejecutivo/comparativo-servidor";
import { construirCostosIAReporte } from "@/lib/auditoria/reporte-ejecutivo/costos-ia-servidor";
import { construirTicketsAtendidosReporte } from "@/lib/auditoria/reporte-ejecutivo/tickets-atendidos-servidor";
import { vistaTicketsAtendidos } from "@/lib/auditoria/reporte-ejecutivo/tickets-atendidos";
import {
  explicarPeriodoSugerido,
  sugerirPeriodoReporte,
} from "@/lib/auditoria/reporte-ejecutivo/periodo-sugerido";
import {
  actorUnificado,
  aliasDeActores,
  correosDelReporte,
  nombresDelGastoIA,
  nombresDelReporte,
  unificarActores,
} from "@/lib/auditoria/reporte-ejecutivo/usuarios-reporte";
import { construirUsuariosActivos } from "@/lib/auditoria/reporte-ejecutivo/usuarios-activos-servidor";
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

export default async function ReportesEjecutivosPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string | string[]; hasta?: string | string[] }>;
}) {
  await requireReporteEjecutivo();

  // Período del tablero: el que se elige arriba de los indicadores
  // (`?desde=…&hasta=…`, con la misma regla que el reporte generado) o, si no se
  // eligió o no sirve, los últimos 30 días.
  const ahora = new Date();
  const elegido = leerRangoElegido(await searchParams);
  let desde: Date;
  let hasta: Date;
  if (elegido.estado === "valido") {
    ({ desde, hasta } = elegido);
  } else {
    hasta = new Date(ahora);
    desde = new Date(ahora);
    desde.setDate(desde.getDate() - 29);
    desde.setHours(0, 0, 0, 0);
    hasta.setHours(23, 59, 59, 999);
  }
  const tableroDesde = elegido.estado === "valido" ? elegido.desdeTexto : aYYYYMMDD(desde);
  const tableroHasta = elegido.estado === "valido" ? elegido.hastaTexto : aYYYYMMDD(hasta);

  // El MODAL propone continuar donde terminó el último reporte, para que los
  // períodos no se traslapen; no depende del período que se mire en el tablero.
  const ultimoReporte = await prisma.reporteEjecutivoUsoIA.findFirst({
    orderBy: [{ periodoHasta: "desc" }, { creadoEn: "desc" }, { id: "desc" }],
    select: { periodoDesde: true, periodoHasta: true },
  });
  const periodoSugerido = sugerirPeriodoReporte({
    hoy: aYYYYMMDD(ahora),
    ultimoReporte: ultimoReporte
      ? { desde: aYYYYMMDD(ultimoReporte.periodoDesde), hasta: aYYYYMMDD(ultimoReporte.periodoHasta) }
      : null,
  });
  const defaultDesde = periodoSugerido.desde;
  const defaultHasta = periodoSugerido.hasta;
  const periodoTablero = `${tableroDesde} → ${tableroHasta}`;

  const [eventosRaw, conexionesRaw, navegacionesRaw, versiones, clientes, usuarios, modulosPublicados, envios, generados, usuariosActivos] = await Promise.all([
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
    // «Usuarios activos: X de Y» de la misma ventana del tablero (null si no se pudo medir).
    construirUsuariosActivos({ desde, hasta }),
  ]);

  // Alcance del tablero y del reporte: solo módulos publicados para todos los
  // usuarios y funcionalidades ya disponibles (nada en desarrollo).
  const filtro: FiltroPublicacion = { modulosPublicados };

  // Las cuentas de prueba que usa una persona del equipo se le suman a su cuenta
  // personal (ver `CUENTAS_QUE_SE_SUMAN`).
  const alias = aliasDeActores(usuarios);
  const eventos: EventoAuditoria[] = unificarActores(
    filtrarEventosPublicados({
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
    }).eventos,
    alias,
  );

  const nombresClientes = new Map(clientes.map((c) => [c.id, c.name]));
  // Solo cuentas existentes en la plataforma y del cliente: el tablero mide el
  // uso del equipo de Russell, no el de actores técnicos de la bitácora, el de
  // las cuentas de Xentria que construyen y operan la plataforma ni el de las
  // cuentas de prueba o genéricas.
  const correosUsuarios = correosDelReporte(usuarios);
  const usuariosRegistrados = nombresDelReporte(usuarios);
  const uso = calcularResumenUso({
    eventos,
    conexiones: conexionesRaw.map((c) => ({ usuario: actorUnificado(c.userName, alias), total: c._count.userName })),
    navegaciones: filtrarNavegacionesPublicadas({
      navegaciones: navegacionesRaw.map((n) => ({ ruta: n.path, total: n._count.path })),
      filtro,
    }).navegaciones,
    periodoDesde: desde,
    periodoHasta: hasta,
    nombresClientes,
    correosUsuarios,
    usuariosRegistrados,
    usuariosActivos,
  });

  // ¿Subió o bajó el uso frente al último reporte generado? Los dos lados se miden
  // sin cuentas de prueba ni genéricas (ver `comparativo-servidor.ts`).
  const usoComparable = await construirUsoComparable({ desde, hasta, filtro, nombresClientes });
  const comparativo = usoComparable
    ? await construirComparativoUso({ usoComparableActual: usoComparable, desde, hasta, filtro, nombresClientes })
    : null;

  // Cuánto costó la IA en la misma ventana, contra el mismo tramo anterior.
  const costos = await construirCostosIAReporte({
    desde,
    hasta,
    corte: new Date(),
    ventanaPrevia: comparativo?.ventanaPrevia ?? null,
    base: comparativo?.base ?? null,
    // El gasto sí incluye a las cuentas de prueba: su consumo se paga igual.
    usuariosRegistrados: nombresDelGastoIA(usuarios),
  });

  // Qué tickets del equipo se atendieron en la misma ventana. Solo se manda la
  // lista corta: las soluciones completas se leen en el documento.
  const tickets = vistaTicketsAtendidos(
    await construirTicketsAtendidosReporte({ desde, hasta, corte: new Date() }),
  );

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
    cambios: soloFuncionalidadesNuevas(planos),
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
    tickets,
    totalAcciones: uso.totalAcciones,
    totalRegistros: uso.totalRegistros,
    totalUsuarios: uso.totalUsuarios,
    usuariosActivos: uso.usuariosActivos ?? null,
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
    topAcciones: uso.topAcciones.map((a) => ({
      etiqueta: a.nombre,
      total: a.total,
      detalle: a.registros ? `${fmtNum(a.registros)} registros agrupados por persona, cliente y día` : undefined,
    })),
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
        periodoIndicadores={{
          desde: tableroDesde,
          hasta: tableroHasta,
          elegido: elegido.estado === "valido",
          hoy: aYYYYMMDD(ahora),
          aviso:
            elegido.estado === "invalido"
              ? `${elegido.motivo} Se muestran los últimos 30 días.`
              : eventosRaw.length >= MAX_EVENTOS
                ? `El período tiene más de ${fmtNum(MAX_EVENTOS)} registros y las cifras quedan incompletas. Acorta el rango.`
                : null,
        }}
        notaPeriodo={explicarPeriodoSugerido(periodoSugerido)}
        envios={envios}
        pendiente={pendiente}
        generados={generados}
      />
    </div>
  );
}
