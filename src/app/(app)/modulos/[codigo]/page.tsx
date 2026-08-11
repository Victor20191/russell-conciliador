import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader } from "@/components/ui";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { fechaCalendarioISO } from "@/lib/fecha-hora";
import { resumirCargasModulo, versionarYOrdenarBorradoresModulo } from "@/lib/modulos/versiones";
import ModulosDatosClient from "./modulos-datos-client";

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
  const nombrePorCliente = new Map(clientes.map((c) => [c.id, c.name]));

  // Conteo de comentarios por dato cargado (encabezado) y por borrador (lote).
  const [comentCargados, comentBorradores] = await Promise.all([
    prisma.comment.groupBy({ by: ["entityId"], where: { entityType: "modulos_datos", entityId: { in: cargados.map((c) => c.id) } }, _count: { _all: true } }),
    prisma.comment.groupBy({ by: ["entityId"], where: { entityType: "modulos_borrador", entityId: { in: borradores.map((b) => b.id) } }, _count: { _all: true } }),
  ]);
  const comentPorEnc = new Map(comentCargados.map((g) => [g.entityId, g._count._all]));
  const comentPorLote = new Map(comentBorradores.map((g) => [g.entityId, g._count._all]));
  const borradoresVersionados = versionarYOrdenarBorradoresModulo(
    borradores.map((b) => ({
      loteId: b.loteId,
      clienteId: b.clienteId,
      moduloCodigo,
      periodoInicial: b.periodoInicial ? fechaCalendarioISO(b.periodoInicial) : null,
      periodoFinal: b.periodoFinal ? fechaCalendarioISO(b.periodoFinal) : null,
      creadoEn: b.creadoEn.toISOString(),
      cliente: b.clienteId != null ? nombrePorCliente.get(b.clienteId) ?? `Cliente ${b.clienteId}` : "(sin cliente)",
      archivoNombre: b.archivoNombre,
      filas: b.filasLeidas,
      comentarios: comentPorLote.get(b.id) ?? 0,
    })),
  );
  const cargadosRecientes = resumirCargasModulo(
    cargados.map((c) => ({
      id: c.id,
      clienteId: c.clienteId,
      moduloCodigo: c.moduloCodigo,
      cliente: c.nombreCliente,
      periodo: c.periodo,
      version: c.version,
      esOficial: c.esOficial,
      filas: c.filas,
      total: Number(c.total),
      archivoNombre: c.archivoNombre,
      origenExtraccion: c.origenExtraccion,
      ultimaCarga: c.ultimaCarga.toISOString(),
      cargadoPor: c.cargadoPor,
      comentarios: comentPorEnc.get(c.id) ?? 0,
    })),
  );

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
        borradores={borradoresVersionados.map((b) => ({
          loteId: b.loteId,
          cliente: b.cliente,
          archivoNombre: b.archivoNombre,
          periodo: b.periodoInicial?.slice(0, 7) ?? null,
          version: b.version,
          versionesGrupo: b.versionesGrupo,
          filas: b.filas,
          creadoEn: b.creadoEn ?? "",
          comentarios: b.comentarios,
        }))}
        cargados={cargadosRecientes}
      />
    </div>
  );
}
