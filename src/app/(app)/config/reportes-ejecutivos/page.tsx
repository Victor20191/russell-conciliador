import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { requireReporteEjecutivo } from "@/lib/rbac/reporte-ejecutivo";
import {
  calcularResumenUso,
  conteosPorFamiliaCanon,
  type EventoAuditoria,
} from "@/lib/auditoria/reporte-ejecutivo/metricas";
import {
  evaluarAdopcion,
  type CambioNovedadContexto,
} from "@/lib/auditoria/reporte-ejecutivo/adopcion";
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

  const defaultDesde = aYYYYMMDD(desde);
  const defaultHasta = aYYYYMMDD(hasta);

  const [eventosRaw, versiones, clientes] = await Promise.all([
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
  ]);

  const eventos: EventoAuditoria[] = eventosRaw.map((e) => ({
    user: e.user,
    action: e.action,
    entity: e.entity,
    detail: e.detail,
    clientId: e.clientId,
    createdAt: e.createdAt,
  }));

  const nombresClientes = new Map(clientes.map((c) => [c.id, c.name]));
  const uso = calcularResumenUso({
    eventos,
    periodoDesde: desde,
    periodoHasta: hasta,
    nombresClientes,
  });

  const planos: CambioNovedadContexto[] = [];
  for (const v of versiones) {
    for (const c of v.changes) {
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
    conteosPorFamilia: conteosPorFamiliaCanon(eventos),
  });

  const versions: VersionOpcion[] = versiones.map((v) => ({
    id: v.id,
    number: v.number,
    title: v.title,
    changesCount: v.changes.length,
    releasedAt: v.releasedAt?.toISOString() ?? null,
    createdAt: v.createdAt.toISOString(),
  }));

  const kpis: KpisIniciales = {
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
        u.porFamilia
          .slice(0, 2)
          .map((f) => f.nombre)
          .join(" · ") || undefined,
    })),
    topAcciones: uso.topAcciones.map((a) => ({ etiqueta: a.nombre, total: a.total })),
    topClientes: uso.topClientes.map((c) => ({ etiqueta: c.nombre, total: c.total })),
    serieDiaria: uso.serieDiaria.map((d) => ({ fecha: d.fecha, total: d.total })),
    adopcionBarras: [
      { etiqueta: "Usadas en el período", total: adopcion.usadas },
      { etiqueta: "Sin evidencia de uso", total: adopcion.sinEvidencia },
      { etiqueta: "No medibles con bitácora", total: adopcion.noMedibles },
    ].filter((b) => b.total > 0 || adopcion.totalCambios > 0),
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
      />
    </div>
  );
}
