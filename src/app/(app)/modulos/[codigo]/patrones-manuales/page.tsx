import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader } from "@/components/ui";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { listarFormatosManualesDeModulo } from "@/lib/modulos/formatos-manuales-servidor";
import { PestanasModulo } from "../pestanas-modulo";
import PatronesManualesClient from "./patrones-manuales-client";

// Pestaña «Patrones manuales» (21/Oct/2026): los mapeos de «Archivo manual» que cada cliente guardó
// al confirmar un cargue. Son de ese cliente (no se comparten como los patrones del aplicativo) y se
// reconocen por % de coincidencia de sus títulos. La ven quienes cargan (`modulos_datos:crear`),
// dentro de su cartera; borrar es de quien administra los perfiles de carga.
export default async function PatronesManualesModuloPage({ params }: { params: Promise<{ codigo: string }> }) {
  await requirePermiso("modulos_datos:crear");
  const { codigo } = await params;
  const moduloCodigo = codigo.toUpperCase();
  const descriptor = descriptorModulo(moduloCodigo);
  if (!descriptor) notFound();

  const alc = await alcanceLecturaUsuario();
  const filtroCliente = alc.todos ? {} : { clienteId: { in: alc.clientIds } };
  const [clientes, borradoresPendientes, administrar, lecturasPendientes] = await Promise.all([
    listarFormatosManualesDeModulo(descriptor),
    prisma.moduloImportacionLote.count({ where: { moduloCodigo, ...filtroCliente } }),
    authorizePermiso("perfiles_carga:administrar"),
    moduloCodigo === "INV" ? prisma.archivoOriginalModulo.count({
      where: { moduloCodigo, ...filtroCliente, estado: { in: ["recibido", "no_procesable"] }, revisionAsistencia: { gt: 0 }, loteId: { not: null } },
    }) : Promise.resolve(0),
  ]);

  return (
    <div>
      <PageHeader
        title={descriptor.label}
        subtitle="Patrones manuales de cada cliente: el mapeo de columnas de sus archivos cargados con «Archivo manual». Un archivo nuevo del mismo cliente con 80 % o más de coincidencia en los títulos se lee con su patrón, sin importar el nombre de la hoja."
      />
      <PestanasModulo moduloCodigo={moduloCodigo} activa="patrones_manuales" borradoresPendientes={borradoresPendientes + lecturasPendientes} puedeVerBorradores />
      <PatronesManualesClient clientes={clientes} puedeBorrar={administrar.ok} />
    </div>
  );
}
