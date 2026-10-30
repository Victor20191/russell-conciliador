import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader } from "@/components/ui";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { listarFormatosManualesDeModulo } from "@/lib/modulos/formatos-manuales-servidor";
import { PestanasModulo } from "../pestanas-modulo";
import FormatosPropiosClient from "./formatos-propios-client";

// Pestaña «Formatos propios» (21/Oct/2026; antes «Patrones manuales»): los mapeos de columnas
// hechos a mano que cada cliente guardó al confirmar un cargue con la opción «Formato propio». Son
// de ese cliente (no se comparten como los patrones del aplicativo) y se reconocen por % de
// coincidencia de sus títulos. La ven quienes cargan (`modulos_datos:crear`), dentro de su cartera;
// borrar es de quien administra los perfiles de carga.
export default async function FormatosPropiosModuloPage({ params }: { params: Promise<{ codigo: string }> }) {
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
        subtitle="Formatos propios de cada cliente: el mapeo de columnas que se hizo a mano al cargar sus archivos con la opción «Formato propio». Un archivo nuevo del mismo cliente con 80 % o más de coincidencia en los títulos se lee con su formato, sin importar el nombre de la hoja."
      />
      <PestanasModulo moduloCodigo={moduloCodigo} activa="formatos_propios" borradoresPendientes={borradoresPendientes + lecturasPendientes} puedeVerBorradores />
      <FormatosPropiosClient clientes={clientes} puedeBorrar={administrar.ok} />
    </div>
  );
}
