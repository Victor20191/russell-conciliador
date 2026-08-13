import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader } from "@/components/ui";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { fechaCalendarioISO } from "@/lib/fecha-hora";
import { fmtDate, fmtHora12 } from "@/lib/format";
import { resumirCargasModulo, versionarYOrdenarBorradoresModulo } from "@/lib/modulos/versiones";
import ModulosDatosClient, { type BorradorModuloRow, type CargadoModuloRow } from "./modulos-datos-client";

export default async function ModuloDatosPage({ params }: { params: Promise<{ codigo: string }> }) {
  await requirePermiso("modulos_datos:ver");
  const { codigo } = await params;
  const moduloCodigo = codigo.toUpperCase();
  const descriptor = descriptorModulo(moduloCodigo);
  if (!descriptor) notFound();

  const alc = await alcanceLecturaUsuario();
  const filtroCliente = alc.todos ? {} : { clienteId: { in: alc.clientIds } };

  const [clientes, borradores, cargados] = await Promise.all([
    prisma.client.findMany({
      where: alc.todos ? {} : { id: { in: alc.clientIds } },
      select: { id: true, name: true, nit: true },
      orderBy: { name: "asc" },
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
      },
    }),
    prisma.moduloDatoEncabezado.findMany({
      where: { moduloCodigo, ...filtroCliente },
      orderBy: [{ ultimaCarga: "desc" }, { version: "desc" }],
      select: {
        id: true,
        clienteId: true,
        moduloCodigo: true,
        nombreCliente: true,
        periodo: true,
        version: true,
        esOficial: true,
        filas: true,
        total: true,
        archivoNombre: true,
        origenExtraccion: true,
        ultimaCarga: true,
        cargadoPor: true,
      },
    }),
  ]);
  const clientePorId = new Map(clientes.map((c) => [c.id, c]));

  // Conteo de comentarios por dato cargado (encabezado) y por borrador (lote).
  // Del staging solo se agrega en PostgreSQL: los borradores pueden traer decenas de
  // miles de filas y el listado únicamente necesita el conteo y el total.
  const [comentCargados, comentBorradores, resumenStaging] = await Promise.all([
    prisma.comment.groupBy({ by: ["entityId"], where: { entityType: "modulos_datos", entityId: { in: cargados.map((c) => c.id) } }, _count: { _all: true } }),
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
  const comentPorEnc = new Map(comentCargados.map((g) => [g.entityId, g._count._all]));
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
    })),
  );
  const cargadosRecientes = resumirCargasModulo(
    cargados.map((c) => ({
      id: c.id,
      clienteId: c.clienteId,
      moduloCodigo: c.moduloCodigo,
      periodo: c.periodo,
      version: c.version,
      ultimaCarga: c.ultimaCarga.toISOString(),
      nombreCliente: c.nombreCliente,
      esOficial: c.esOficial,
      filas: c.filas,
      total: Number(c.total),
      archivoNombre: c.archivoNombre,
      origen: c.origenExtraccion,
      cargadoPor: c.cargadoPor,
      comentarios: comentPorEnc.get(c.id) ?? 0,
    })),
  );

  const filasBorradores: BorradorModuloRow[] = borradoresVersionados.map((b) => {
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
    };
  });

  const filasCargados: CargadoModuloRow[] = cargadosRecientes.map((c) => ({
    id: c.id,
    clienteNombre: c.nombreCliente,
    clienteNit: clientePorId.get(c.clienteId)?.nit ?? null,
    periodo: c.periodo,
    version: c.version,
    versiones: c.versiones,
    esOficial: c.esOficial,
    filas: c.filas,
    total: c.total,
    archivoNombre: c.archivoNombre,
    origen: c.origen,
    cargadoPor: c.cargadoPor,
    ordenFecha: c.ultimaCarga,
    fecha: c.ultimaCarga ? fmtDate(c.ultimaCarga) : "—",
    hora: c.ultimaCarga ? fmtHora12(c.ultimaCarga) : null,
    comentarios: c.comentarios,
  }));

  return (
    <div>
      <PageHeader
        title={descriptor.label}
        subtitle="Carga el archivo del cliente, mapea las columnas y consolida por su clasificador contra la cuenta estándar."
      />
      <ModulosDatosClient
        moduloCodigo={moduloCodigo}
        moduloLabel={descriptor.label}
        roles={descriptor.columnas.map((c) => ({ nombre: c.nombre, etiqueta: c.etiqueta, tipo: c.tipo, requerido: c.requerido }))}
        clasificadorRol={descriptor.clasificador}
        clientes={clientes}
        borradores={filasBorradores}
        cargados={filasCargados}
      />
    </div>
  );
}
