import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader } from "@/components/ui";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { procesoErpDeModulo, nombreProcesoErp } from "@/lib/erp-procesos";
import { listarPatronesDeModulo } from "@/lib/modulos/patrones/servidor";
import { UMBRAL_COINCIDENCIA_PATRON } from "@/lib/modulos/patrones/coincidencia";
import { PestanasModulo } from "../pestanas-modulo";
import PatronesModuloClient from "./patrones-modulo-client";

// Pestaña «Patrones de archivo»: cómo se lee el archivo de cada aplicativo en este módulo. La ven
// quienes cargan (`modulos_datos:crear`); crear, aprobar, editar y desactivar es del Administrador.
export default async function PatronesModuloPage({ params }: { params: Promise<{ codigo: string }> }) {
  await requirePermiso("modulos_datos:crear");
  const { codigo } = await params;
  const moduloCodigo = codigo.toUpperCase();
  const descriptor = descriptorModulo(moduloCodigo);
  if (!descriptor) notFound();

  const alc = await alcanceLecturaUsuario();
  const [patrones, borradoresPendientes, administrar, lecturasPendientes] = await Promise.all([
    listarPatronesDeModulo(descriptor),
    prisma.moduloImportacionLote.count({
      where: { moduloCodigo, ...(alc.todos ? {} : { clienteId: { in: alc.clientIds } }) },
    }),
    authorizePermiso("perfiles_carga:administrar"),
    moduloCodigo === "INV" ? prisma.archivoOriginalModulo.count({
      where: { moduloCodigo, ...(alc.todos ? {} : { clienteId: { in: alc.clientIds } }), estado: { in: ["recibido", "no_procesable"] }, revisionAsistencia: { gt: 0 }, loteId: { not: null } },
    }) : Promise.resolve(0),
  ]);
  const proceso = procesoErpDeModulo(moduloCodigo);

  return (
    <div>
      <PageHeader
        title={descriptor.label}
        subtitle={moduloCodigo === "INV"
          ? "Los formatos conocidos se reconocen al cargar. Si el archivo cambió, la asistencia prepara una nueva lectura para revisar."
          : `Patrones de archivo por aplicativo (campo ${proceso ? nombreProcesoErp(proceso) : "—"} de la ficha del cliente). Un archivo con ${UMBRAL_COINCIDENCIA_PATRON} % o más de coincidencia se carga sin configurar columnas.`}
      />
      <PestanasModulo moduloCodigo={moduloCodigo} activa="patrones" borradoresPendientes={borradoresPendientes + lecturasPendientes} puedeVerBorradores />
      <PatronesModuloClient
        moduloCodigo={moduloCodigo}
        moduloLabel={descriptor.label}
        patrones={patrones}
        puedeAdministrar={administrar.ok}
      />
    </div>
  );
}
