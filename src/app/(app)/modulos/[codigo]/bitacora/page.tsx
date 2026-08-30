import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { descriptorModulo, MODULOS_IMPORT } from "@/lib/modulos/descriptores";
import {
  documentacionArchivoCompleta,
  resumirRecoleccionModulosAgrupada,
} from "@/lib/modulos/archivo-original";
import { PestanasModulo } from "../pestanas-modulo";
import BitacoraArchivosModuloClient, {
  type ArchivoBitacoraModuloVm,
} from "./bitacora-archivos-modulo-client";

const ARCHIVOS_POR_PAGINA = 50;

export default async function BitacoraArchivosModuloPage({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string }>;
  searchParams: Promise<{ pagina?: string }>;
}) {
  await requirePermiso("modulos_datos:ver");
  const [{ codigo }, query] = await Promise.all([params, searchParams]);
  const moduloCodigo = codigo.toUpperCase();
  const descriptor = descriptorModulo(moduloCodigo);
  if (!descriptor) notFound();

  const alc = await alcanceLecturaUsuario();
  const filtroCliente = alc.todos ? {} : { clienteId: { in: alc.clientIds } };
  const paginaPedida = Number(query.pagina ?? "1");
  const pagina = Number.isSafeInteger(paginaPedida) && paginaPedida > 0 ? paginaPedida : 1;

  const [total, grupos, borradoresPendientes, puedeEditar, puedeCrear] = await Promise.all([
    prisma.archivoOriginalModulo.count({
      where: { moduloCodigo, ...filtroCliente },
    }),
    // El tablero global usa agregación SQL: nunca trae todos los originales a memoria.
    prisma.archivoOriginalModulo.groupBy({
      by: ["moduloCodigo", "estado", "disponible"],
      where: filtroCliente,
      _count: { _all: true },
    }),
    prisma.moduloImportacionLote.count({ where: { moduloCodigo, ...filtroCliente } }),
    authorizePermiso("modulos_datos:editar"),
    authorizePermiso("modulos_datos:crear"),
  ]);
  const totalPaginas = Math.max(1, Math.ceil(total / ARCHIVOS_POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);

  const archivos = await prisma.archivoOriginalModulo.findMany({
    where: { moduloCodigo, ...filtroCliente },
    orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
    skip: (paginaActual - 1) * ARCHIVOS_POR_PAGINA,
    take: ARCHIVOS_POR_PAGINA,
    select: {
      id: true,
      clienteId: true,
      nombreCliente: true,
      nitCliente: true,
      moduloCodigo: true,
      periodo: true,
      nombreArchivo: true,
      tipoContenido: true,
      tamanoBytes: true,
      huellaSha256: true,
      ubicacionCarpeta: true,
      softwareOrigen: true,
      ubicacionOrigen: true,
      reflejoContableEsperado: true,
      estado: true,
      disponible: true,
      esAnexo: true,
      cargadoPor: true,
      creadoEn: true,
    },
  });

  const filas: ArchivoBitacoraModuloVm[] = archivos.map((archivo) => ({
    id: archivo.id,
    clienteId: archivo.clienteId,
    clienteNombre: archivo.nombreCliente,
    clienteNit: archivo.nitCliente,
    moduloCodigo: archivo.moduloCodigo,
    moduloLabel: descriptor.label,
    periodo: archivo.periodo,
    nombreArchivo: archivo.nombreArchivo,
    tipoContenido: archivo.tipoContenido,
    tamanoBytes: archivo.tamanoBytes,
    huellaSha256: archivo.huellaSha256,
    ubicacionCarpeta: archivo.ubicacionCarpeta,
    softwareOrigen: archivo.softwareOrigen,
    ubicacionOrigen: archivo.ubicacionOrigen,
    reflejoContableEsperado: archivo.reflejoContableEsperado,
    documentacionCompleta: documentacionArchivoCompleta(archivo),
    estado: archivo.estado,
    disponible: archivo.disponible,
    esAnexo: archivo.esAnexo,
    cargadoPor: archivo.cargadoPor,
    fecha: fmtDateTime(archivo.creadoEn),
  }));

  const estadosModulos = resumirRecoleccionModulosAgrupada(
    Object.values(MODULOS_IMPORT).map((modulo) => ({ codigo: modulo.codigo, label: modulo.label })),
    grupos.map((grupo) => ({
      moduloCodigo: grupo.moduloCodigo,
      estado: grupo.estado,
      disponible: grupo.disponible,
      cantidad: grupo._count._all,
    })),
  );

  return (
    <div>
      <PageHeader
        title={`Bitácora · ${descriptor.label}`}
        subtitle="Registro durable de archivos fuente: conserva el original exacto, su SHA-256, módulo, ubicación, estado y documentación del reflejo esperado en contabilidad."
      />
      <PestanasModulo
        moduloCodigo={moduloCodigo}
        activa="bitacora"
        borradoresPendientes={borradoresPendientes}
        puedeVerBorradores={puedeCrear.ok}
      />
      <BitacoraArchivosModuloClient
        archivos={filas}
        estadosModulos={estadosModulos}
        pagina={paginaActual}
        totalPaginas={totalPaginas}
        totalArchivos={total}
        puedeEditar={puedeEditar.ok}
      />
    </div>
  );
}
