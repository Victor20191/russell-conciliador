import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { fmtNum } from "@/lib/format";
import { leerRangoElegido, parseRangoReporte } from "@/lib/auditoria/reporte-ejecutivo/rango";
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
  moduloPlataformaDeClave,
  type FiltroPublicacion,
} from "@/lib/auditoria/reporte-ejecutivo/alcance";
import { descripcionAvance, tituloAvance } from "@/lib/auditoria/reporte-ejecutivo/texto-avances";
import { modulosPublicadosParaTodos } from "@/lib/rbac/publicacion";
import { MODULOS_PLATAFORMA, MODULOS_PLATAFORMA_KEYS } from "@/lib/rbac/modulos-plataforma";
import {
  evaluarAdopcion,
  soloFuncionalidadesNuevas,
  type CambioNovedadContexto,
} from "@/lib/auditoria/reporte-ejecutivo/adopcion";
import { listarEnviosReporteEjecutivo, listarReportesGenerados } from "@/app/actions/auditoria-reporte";
import { obtenerPanelEnvioAutomatico } from "@/app/actions/notificaciones-programadas";
import { EnvioAutomatico } from "./envio-automatico";
import { desplegadaEnPeriodo, fechaDespliegueTexto, fechaQueCuenta } from "@/lib/novedades/despliegue";
import { construirComparativoUso, construirUsoComparable } from "@/lib/auditoria/reporte-ejecutivo/comparativo-servidor";
import { construirCostosIAReporte } from "@/lib/auditoria/reporte-ejecutivo/costos-ia-servidor";
import { construirTicketsAtendidosReporte } from "@/lib/auditoria/reporte-ejecutivo/tickets-atendidos-servidor";
import { vistaTicketsAtendidos } from "@/lib/auditoria/reporte-ejecutivo/tickets-atendidos";
import { ultimosDias } from "@/lib/auditoria/reporte-ejecutivo/periodo-sugerido";
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
import {
  ReporteEjecutivoClient,
  type CambioOpcion,
  type KpisIniciales,
  type VersionOpcion,
} from "@/app/(app)/auditoria/adopcion/reporte-ejecutivo-client";
import {
  SelectorPeriodoTablero,
  type PeriodoIndicadores,
} from "@/app/(app)/auditoria/adopcion/selector-periodo-tablero";

// El envío manual del panel «Envío automático» genera y envía el reporte dentro de la solicitud.
export const maxDuration = 300;

const MAX_EVENTOS = 25_000;
const ETIQUETA_MODULO = new Map<string, string>(MODULOS_PLATAFORMA.map((m) => [m.key, m.label]));

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

  // Período de TODA la página: el que se elige arriba, junto al título
  // (`?desde=…&hasta=…`) o, si no se eligió o no sirve, los últimos 30 días. Manda
  // sobre los indicadores, las novedades, los tickets y el reporte que se genere,
  // y se convierte a instantes con la misma regla que el generador
  // (`parseRangoReporte`), así que el tablero y el PDF miden lo mismo.
  const ahora = new Date();
  const elegido = leerRangoElegido(await searchParams);
  const porDefecto = ultimosDias(aYYYYMMDD(ahora), 30);
  const tableroDesde = elegido.estado === "valido" ? elegido.desdeTexto : porDefecto.desde;
  const tableroHasta = elegido.estado === "valido" ? elegido.hastaTexto : porDefecto.hasta;
  const { desde, hasta } =
    elegido.estado === "valido" ? elegido : parseRangoReporte(porDefecto.desde, porDefecto.hasta)!;

  const [eventosRaw, conexionesRaw, navegacionesRaw, versiones, clientes, usuarios, modulosPublicados, envios, generados, usuariosActivos, panelEnvio] = await Promise.all([
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
    // Por ruta Y cuenta: las visitas se filtran por `userId` a las cuentas del uso.
    prisma.accessLog.groupBy({
      by: ["path", "userId"],
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
    prisma.user.findMany({ select: { id: true, name: true, email: true } }),
    modulosPublicadosParaTodos(),
    listarEnviosReporteEjecutivo(50),
    listarReportesGenerados(50),
    // «Usuarios activos: X de Y» de la misma ventana del tablero (null si no se pudo medir).
    construirUsuariosActivos({ desde, hasta }),
    // Envío automático semanal por correo: nunca lanza (si falta la migración, el panel avisa).
    obtenerPanelEnvioAutomatico(),
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
    // Visitas solo de las cuentas del uso, como las operaciones (sin Xentria ni pruebas).
    navegaciones: filtrarNavegacionesPublicadas({
      navegaciones: visitasDeCuentas(
        navegacionesRaw.map((n) => ({ ruta: n.path, userId: n.userId, total: n._count.path })),
        idsDelUso(usuarios),
      ),
      filtro,
    }).navegaciones,
    periodoDesde: desde,
    periodoHasta: hasta,
    nombresClientes,
    correosUsuarios,
    usuariosRegistrados,
    usuariosActivos,
  });

  // ¿Subió o bajó el uso frente al período anterior de igual duración? Los dos lados
  // se miden sin cuentas de prueba ni genéricas (ver `comparativo-servidor.ts`).
  const usoComparable = await construirUsoComparable({ desde, hasta, filtro, nombresClientes });
  const comparativo = usoComparable
    ? await construirComparativoUso({ usoComparableActual: usoComparable, desde, hasta, corte: ahora, filtro, nombresClientes })
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
  // Lo que la ventana de generar lista para elegir qué omitir: los mismos cambios
  // publicables que entran al PDF, con el título tal como lo verá gerencia.
  const cambiosPorVersion = new Map<number, CambioOpcion[]>();
  const planos: CambioNovedadContexto[] = [];
  // El tablero, como el reporte, solo cuenta las versiones desplegadas en su período.
  const versionesDelPeriodo = versiones.filter((v) => desplegadaEnPeriodo(v, desde, hasta));
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
    cambiosPorVersion.set(
      v.id,
      publicables.cambios.map((c) => {
        const clave = moduloPlataformaDeClave(c.moduleKey, MODULOS_PLATAFORMA_KEYS);
        return {
          id: c.id,
          tipo: c.type,
          titulo: tituloAvance(c.title),
          descripcion: descripcionAvance(c.description, 160),
          modulo: clave ? (ETIQUETA_MODULO.get(clave) ?? null) : null,
        };
      }),
    );
    if (!versionesDelPeriodo.includes(v)) continue;
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
    cambios: cambiosPorVersion.get(v.id) ?? [],
    releasedAt: v.releasedAt?.toISOString() ?? null,
    // El día que cuenta para el reporte: el de despliegue (o el de publicación si no lo tiene).
    deployedOn: fechaDespliegueTexto(fechaQueCuenta(v)),
    createdAt: v.createdAt.toISOString(),
  }));

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
    // Cambios publicables de las versiones desplegadas en el período (todos los tipos).
    totalNovedades: planos.length,
    totalVersionesPublicadas: versionesDelPeriodo.length,
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

  // El período manda sobre toda la página (tarjetas e indicadores): por eso el
  // selector va junto al título y no dentro de «Indicadores de uso».
  const periodoIndicadores: PeriodoIndicadores = {
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
  };

  return (
    <div>
      <PageHeader
        title="Reportes para gerencia"
        subtitle="Indicadores de uso, avances de la plataforma y generación de un reporte claro para el cliente."
        actions={
          // La clave remonta el selector cuando cambia el período (p. ej. con «Atrás»).
          <SelectorPeriodoTablero key={`${tableroDesde}|${tableroHasta}`} periodo={periodoIndicadores} />
        }
      />
      <ReporteEjecutivoClient
        versions={versions}
        kpis={kpis}
        periodoDesde={tableroDesde}
        periodoHasta={tableroHasta}
        envios={envios}
        generados={generados}
      />
      <div className="mt-4">
        <EnvioAutomatico resultado={panelEnvio} />
      </div>
    </div>
  );
}
