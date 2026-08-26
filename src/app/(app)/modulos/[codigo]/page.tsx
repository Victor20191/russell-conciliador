import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader } from "@/components/ui";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { fechaCalendarioISO } from "@/lib/fecha-hora";
import { fmtDate, fmtHora12 } from "@/lib/format";
import { agruparCargasModuloPorCliente, versionarYOrdenarBorradoresModulo } from "@/lib/modulos/versiones";
import ModulosDatosClient, { type BorradorModuloRow, type GrupoClienteRow } from "./modulos-datos-client";

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
        estaCongelado: true,
        filas: true,
        total: true,
        archivoNombre: true,
        hoja: true,
        observaciones: true,
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
  const [comentCargados, comentBorradores, resumenStaging, perfilesPorCliente, marcasPorPeriodo, autorizacionEliminar] = await Promise.all([
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
    // Alcances de la eliminación: perfiles de formato aprendidos y marcas del cruce
    // que caerían con el período o con el cliente. Solo alimentan los conteos del modal.
    prisma.perfilCargaModulo.groupBy({ by: ["clienteId"], where: { moduloCodigo, ...filtroCliente }, _count: { _all: true } }),
    prisma.marcaCruceModulo.groupBy({ by: ["clienteId", "periodo"], where: { moduloCodigo, ...filtroCliente }, _count: { _all: true } }),
    // `modulos_datos:eliminar` es SOLO_ADMIN (alcance global): basta el permiso de rol
    // para pintar el botón; la acción revalida permiso Y alcance sobre el cliente.
    authorizePermiso("modulos_datos:eliminar"),
  ]);
  const comentPorEnc = new Map(comentCargados.map((g) => [g.entityId, g._count._all]));
  const comentPorLote = new Map(comentBorradores.map((g) => [g.entityId, g._count._all]));
  const perfilesPorClienteId = new Map(perfilesPorCliente.map((g) => [g.clienteId, g._count._all]));
  const marcasPorClientePeriodo = new Map(marcasPorPeriodo.map((g) => [`${g.clienteId}|${g.periodo}`, g._count._all]));
  const marcasPorClienteId = new Map<number, number>();
  for (const g of marcasPorPeriodo) {
    marcasPorClienteId.set(g.clienteId, (marcasPorClienteId.get(g.clienteId) ?? 0) + g._count._all);
  }

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
  // Los cargados se muestran agrupados como en `/balance`: una tarjeta por
  // cliente y, dentro, una fila por período con su conteo de versiones (volver a
  // cargar el mismo archivo del período suma una versión, no otra fila suelta).
  const gruposCargados = agruparCargasModuloPorCliente(
    cargados.map((c) => ({
      id: c.id,
      clienteId: c.clienteId,
      clienteNombre: c.nombreCliente,
      clienteNit: clientePorId.get(c.clienteId)?.nit ?? null,
      moduloCodigo: c.moduloCodigo,
      periodo: c.periodo,
      version: c.version,
      esOficial: c.esOficial,
      estaCongelado: c.estaCongelado,
      filas: c.filas,
      total: Number(c.total),
      archivoNombre: c.archivoNombre,
      hoja: c.hoja,
      observaciones: c.observaciones,
      origen: c.origenExtraccion,
      cargadoPor: c.cargadoPor,
      ultimaCarga: c.ultimaCarga.toISOString(),
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

  const filasCargados: GrupoClienteRow[] = gruposCargados.map((grupo) => ({
    clienteId: grupo.clienteId,
    clienteNombre: grupo.clienteNombre,
    clienteNit: grupo.clienteNit,
    // Alcance «todo el cliente» del modal de eliminación: cargues de TODOS sus
    // períodos (no solo el vigente de cada uno), perfiles y marcas del cruce.
    cargasCliente: grupo.periodos.reduce((n, p) => n + p.versiones, 0),
    perfilesCliente: perfilesPorClienteId.get(grupo.clienteId) ?? 0,
    marcasCliente: marcasPorClienteId.get(grupo.clienteId) ?? 0,
    periodos: grupo.periodos.map((p) => ({
      marcasPeriodo: marcasPorClientePeriodo.get(`${grupo.clienteId}|${p.periodo}`) ?? 0,
      periodo: p.periodo,
      id: p.id,
      version: p.version,
      versiones: p.versiones,
      esOficial: p.esOficial,
      estaCongelado: p.estaCongelado,
      filas: p.filas,
      total: p.total,
      archivoNombre: p.archivoNombre,
      hoja: p.hoja,
      observaciones: p.observaciones,
      origen: p.origen,
      cargadoPor: p.cargadoPor,
      fecha: p.ultimaCarga ? fmtDate(p.ultimaCarga) : "—",
      hora: p.ultimaCarga ? fmtHora12(p.ultimaCarga) : null,
      comentarios: p.comentarios,
    })),
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
        gruposCargados={filasCargados}
        puedeEliminar={autorizacionEliminar.ok}
      />
    </div>
  );
}
