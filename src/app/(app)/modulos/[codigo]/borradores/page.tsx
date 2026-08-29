import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader } from "@/components/ui";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { fechaCalendarioISO } from "@/lib/fecha-hora";
import { fmtDate, fmtHora12 } from "@/lib/format";
import { versionarYOrdenarBorradoresModulo } from "@/lib/modulos/versiones";
import BorradoresModuloClient, { type BorradorModuloRow } from "./borradores-modulo-client";
import { PestanasModulo } from "../pestanas-modulo";

// Pestaña «Borradores» del módulo: lo leído del archivo y pendiente de confirmar,
// separado de lo oficial (`/modulos/[codigo]`). Mismo permiso que el detalle del borrador.
export default async function BorradoresModuloPage({ params }: { params: Promise<{ codigo: string }> }) {
  await requirePermiso("modulos_datos:crear");
  const { codigo } = await params;
  const moduloCodigo = codigo.toUpperCase();
  const descriptor = descriptorModulo(moduloCodigo);
  if (!descriptor) notFound();

  const alc = await alcanceLecturaUsuario();
  const filtroCliente = alc.todos ? {} : { clienteId: { in: alc.clientIds } };

  const [clientes, borradores] = await Promise.all([
    prisma.client.findMany({
      where: alc.todos ? {} : { id: { in: alc.clientIds } },
      select: { id: true, name: true, nit: true },
    }),
    prisma.moduloImportacionLote.findMany({
      where: { moduloCodigo, ...filtroCliente },
      orderBy: { creadoEn: "desc" },
      select: {
        id: true,
        loteId: true,
        clienteId: true,
        archivoNombre: true,
        periodoInicial: true,
        periodoFinal: true,
        filasLeidas: true,
        origenExtraccion: true,
        cargadoPor: true,
        creadoEn: true,
        anexoEncabezadoId: true,
      },
    }),
  ]);
  const clientePorId = new Map(clientes.map((c) => [c.id, c]));

  // Anexos declarados con «Agregar archivo»: sin esto un borrador que se SUMA a un
  // cargue existente se ve idéntico a uno que crea versión nueva, y la diferencia solo
  // aparecía al abrirlo. Se resuelve la versión destino para poder anunciarlo en la lista.
  const anexoIds = [...new Set(borradores.map((b) => b.anexoEncabezadoId).filter((id): id is number => id != null))];
  const destinos = anexoIds.length
    ? await prisma.moduloDatoEncabezado.findMany({
        where: { id: { in: anexoIds } },
        select: { id: true, version: true, periodo: true, esOficial: true },
      })
    : [];
  const destinoPorId = new Map(destinos.map((d) => [d.id, d]));

  // Del staging solo se agrega en PostgreSQL: los borradores pueden traer decenas
  // de miles de filas y el listado únicamente necesita el conteo y el total.
  const [comentBorradores, resumenStaging] = await Promise.all([
    prisma.comment.groupBy({ by: ["entityId"], where: { entityType: "modulos_borrador", entityId: { in: borradores.map((b) => b.id) } }, _count: { _all: true } }),
    borradores.length
      ? prisma.moduloImportacionStaging.groupBy({
          by: ["loteId", "tipoFila", "omitida"],
          where: { loteId: { in: borradores.map((b) => b.loteId) } },
          _count: { _all: true },
          _sum: { valor: true },
        })
      : Promise.resolve([]),
  ]);
  const comentPorLote = new Map(comentBorradores.map((g) => [g.entityId, g._count._all]));

  // Filas de movimiento vivas (no omitidas) y su total, más cuántas se omitieron a mano.
  const resumenPorLote = new Map<string, { filas: number; total: number; omitidas: number }>();
  for (const grupo of resumenStaging) {
    if (grupo.tipoFila !== "movimiento") continue;
    const actual = resumenPorLote.get(grupo.loteId) ?? { filas: 0, total: 0, omitidas: 0 };
    if (grupo.omitida === true) {
      actual.omitidas += grupo._count._all;
    } else {
      actual.filas += grupo._count._all;
      actual.total += Number(grupo._sum.valor ?? 0);
    }
    resumenPorLote.set(grupo.loteId, actual);
  }

  const borradoresVersionados = versionarYOrdenarBorradoresModulo(
    borradores.map((b) => ({
      loteId: b.loteId,
      clienteId: b.clienteId,
      moduloCodigo,
      periodoInicial: b.periodoInicial ? fechaCalendarioISO(b.periodoInicial) : null,
      periodoFinal: b.periodoFinal ? fechaCalendarioISO(b.periodoFinal) : null,
      creadoEn: b.creadoEn.toISOString(),
      loteRowId: b.id,
      cliente: b.clienteId != null ? clientePorId.get(b.clienteId) ?? null : null,
      archivoNombre: b.archivoNombre,
      filasLeidas: b.filasLeidas,
      origen: b.origenExtraccion,
      cargadoPor: b.cargadoPor,
      comentarios: comentPorLote.get(b.id) ?? 0,
      anexoEncabezadoId: b.anexoEncabezadoId,
    })),
  );

  // El destino puede haber dejado de ser el vigente entre la subida y la confirmación:
  // en ese caso la carga cae a versión nueva, y conviene avisarlo antes de abrirlo.
  const anexoDe = (id: number | null): { version: number; periodo: string; vigente: boolean } | null => {
    if (id == null) return null;
    const d = destinoPorId.get(id);
    return d ? { version: d.version, periodo: d.periodo, vigente: d.esOficial } : null;
  };

  const filas: BorradorModuloRow[] = borradoresVersionados.map((b) => {
    const resumen = resumenPorLote.get(b.loteId) ?? { filas: b.filasLeidas, total: 0, omitidas: 0 };
    return {
      loteId: b.loteId,
      loteRowId: b.loteRowId,
      archivoNombre: b.archivoNombre,
      clienteNombre: b.cliente?.name ?? (b.clienteId != null ? `Cliente ${b.clienteId}` : "(sin cliente)"),
      clienteNit: b.cliente?.nit ?? null,
      periodo: b.periodoInicial?.slice(0, 7) ?? null,
      version: b.version,
      versionesGrupo: b.versionesGrupo,
      claveGrupo: b.claveGrupo,
      filas: resumen.filas,
      total: resumen.total,
      omitidas: resumen.omitidas,
      origen: b.origen,
      cargadoPor: b.cargadoPor,
      ordenFecha: b.creadoEn,
      fecha: b.creadoEn ? fmtDate(b.creadoEn) : "—",
      hora: b.creadoEn ? fmtHora12(b.creadoEn) : null,
      comentarios: b.comentarios,
      anexo: anexoDe(b.anexoEncabezadoId),
    };
  });

  return (
    <div>
      <PageHeader
        title={descriptor.label}
        subtitle="Lo que se leyó del archivo antes de consolidar y cargar. Revisa la estructura (agrupadoras y movimiento), ajusta lo que haga falta, y carga o descarta. Nada se ha guardado como dato oficial del módulo."
      />
      <PestanasModulo moduloCodigo={moduloCodigo} activa="borradores" borradoresPendientes={filas.length} puedeVerBorradores />
      <BorradoresModuloClient moduloCodigo={moduloCodigo} moduloLabel={descriptor.label} borradores={filas} />
    </div>
  );
}
