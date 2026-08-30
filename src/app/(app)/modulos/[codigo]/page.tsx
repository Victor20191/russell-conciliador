import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader } from "@/components/ui";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { fmtDate, fmtHora12 } from "@/lib/format";
import { agruparCargasModuloPorCliente } from "@/lib/modulos/versiones";
import ModulosDatosClient, { type GrupoClienteRow } from "./modulos-datos-client";
import { PestanasModulo } from "./pestanas-modulo";

export default async function ModuloDatosPage({ params }: { params: Promise<{ codigo: string }> }) {
  await requirePermiso("modulos_datos:ver");
  const { codigo } = await params;
  const moduloCodigo = codigo.toUpperCase();
  const descriptor = descriptorModulo(moduloCodigo);
  if (!descriptor) notFound();

  const alc = await alcanceLecturaUsuario();
  const filtroCliente = alc.todos ? {} : { clienteId: { in: alc.clientIds } };

  const [clientes, borradoresPendientes, cargados] = await Promise.all([
    prisma.client.findMany({
      where: alc.todos ? {} : { id: { in: alc.clientIds } },
      select: { id: true, name: true, nit: true, erp: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    // Los borradores se listan en la pestaña «Borradores»; aquí solo se cuenta
    // cuántos quedan por confirmar dentro del alcance del usuario.
    prisma.moduloImportacionLote.count({ where: { moduloCodigo, ...filtroCliente } }),
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

  // Conteo de comentarios por dato cargado (encabezado), más los alcances de la
  // eliminación: perfiles de formato aprendidos y marcas del cruce que caerían con
  // el período o con el cliente. Solo alimentan los conteos del modal.
  const [comentCargados, perfilesPorCliente, marcasPorPeriodo, autorizacionEliminar, autorizacionCrear] = await Promise.all([
    prisma.comment.groupBy({ by: ["entityId"], where: { entityType: "modulos_datos", entityId: { in: cargados.map((c) => c.id) } }, _count: { _all: true } }),
    prisma.perfilCargaModulo.groupBy({ by: ["clienteId"], where: { moduloCodigo, ...filtroCliente }, _count: { _all: true } }),
    prisma.marcaCruceModulo.groupBy({ by: ["clienteId", "periodo"], where: { moduloCodigo, ...filtroCliente }, _count: { _all: true } }),
    // `modulos_datos:eliminar` es SOLO_ADMIN (alcance global): basta el permiso de rol
    // para pintar el botón; la acción revalida permiso Y alcance sobre el cliente.
    authorizePermiso("modulos_datos:eliminar"),
    // Pestaña «Borradores»: mismo permiso que su pantalla.
    authorizePermiso("modulos_datos:crear"),
  ]);
  const comentPorEnc = new Map(comentCargados.map((g) => [g.entityId, g._count._all]));
  const perfilesPorClienteId = new Map(perfilesPorCliente.map((g) => [g.clienteId, g._count._all]));
  const marcasPorClientePeriodo = new Map(marcasPorPeriodo.map((g) => [`${g.clienteId}|${g.periodo}`, g._count._all]));
  const marcasPorClienteId = new Map<number, number>();
  for (const g of marcasPorPeriodo) {
    marcasPorClienteId.set(g.clienteId, (marcasPorClienteId.get(g.clienteId) ?? 0) + g._count._all);
  }

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
        subtitle={moduloCodigo === "ING"
          ? "Carga la facturación como ingreso neto sin IVA ni otros impuestos, conserva el original y consolida los conceptos contra las cuentas 41 de contabilidad."
          : "Carga el archivo del cliente, mapea las columnas y consolida por su clasificador contra la cuenta estándar."}
      />
      <PestanasModulo
        moduloCodigo={moduloCodigo}
        activa="cargados"
        borradoresPendientes={borradoresPendientes}
        puedeVerBorradores={autorizacionCrear.ok}
      />
      <ModulosDatosClient
        moduloCodigo={moduloCodigo}
        moduloLabel={descriptor.label}
        roles={descriptor.columnas.map((c) => ({ nombre: c.nombre, etiqueta: c.etiqueta, tipo: c.tipo, requerido: c.requerido }))}
        clasificadorRol={descriptor.clasificador}
        clientes={clientes.map((cliente) => ({
          id: cliente.id,
          name: cliente.name,
          nit: cliente.nit,
          erp: cliente.erp?.name ?? null,
        }))}
        gruposCargados={filasCargados}
        puedeCrear={autorizacionCrear.ok}
        puedeEliminar={autorizacionEliminar.ok}
      />
    </div>
  );
}
