import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader } from "@/components/ui";
import { descriptorModulo } from "@/lib/modulos/descriptores";
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
      select: { loteId: true, clienteId: true, archivoNombre: true, filasLeidas: true, creadoEn: true },
    }),
    prisma.moduloDatoEncabezado.findMany({
      where: { moduloCodigo, esOficial: true, ...filtroCliente },
      orderBy: [{ creadoEn: "desc" }],
      select: { id: true, clienteId: true, nombreCliente: true, periodo: true, version: true, filas: true, total: true, creadoEn: true },
    }),
  ]);
  const nombrePorCliente = new Map(clientes.map((c) => [c.id, c.name]));

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
        borradores={borradores.map((b) => ({
          loteId: b.loteId,
          cliente: b.clienteId != null ? nombrePorCliente.get(b.clienteId) ?? `Cliente ${b.clienteId}` : "(sin cliente)",
          archivoNombre: b.archivoNombre,
          filas: b.filasLeidas,
          creadoEn: b.creadoEn.toISOString(),
        }))}
        cargados={cargados.map((c) => ({
          id: c.id,
          cliente: c.nombreCliente,
          periodo: c.periodo,
          version: c.version,
          filas: c.filas,
          total: Number(c.total),
          creadoEn: c.creadoEn.toISOString(),
        }))}
      />
    </div>
  );
}
