import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { BackLink, PageHeader } from "@/components/ui";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { esVersionEditable } from "@/lib/modulos/patrones/version";
import EditorPatronClient from "../editor-patron-client";

// Edición de una versión PENDIENTE sobre su muestra (Administrador). Una aprobada no se edita:
// se crea otra versión a partir de ella.
export default async function EditarPatronPage({ params }: { params: Promise<{ codigo: string; versionId: string }> }) {
  await requirePermiso("perfiles_carga:administrar");
  const { codigo, versionId } = await params;
  const moduloCodigo = codigo.toUpperCase();
  const descriptor = descriptorModulo(moduloCodigo);
  const id = Number(versionId);
  if (!descriptor || !Number.isInteger(id) || id <= 0) notFound();

  const version = await prisma.versionPatronArchivoModulo.findFirst({
    where: { id, moduloCodigo },
    include: { erp: { select: { name: true } } },
  });
  if (!version) notFound();
  const ruta = `/modulos/${codigo.toLowerCase()}/patrones`;
  const editable = esVersionEditable(version) && version.muestraClaveObjeto != null;

  return (
    <div>
      <div className="mb-3">
        <BackLink href={ruta} label="Patrones de archivo" />
      </div>
      <PageHeader
        title={`${version.erp.name} · versión ${version.version} · ${descriptor.label}`}
        subtitle={editable
          ? "Ajusta cómo se lee el archivo. Los cambios aplican a las próximas cargas que coincidan con esta versión."
          : "Esta versión no se puede editar: solo una versión pendiente y con muestra se edita. Para otro formato crea una versión nueva a partir de ella."}
      />
      {editable && (
        <EditorPatronClient
          moduloCodigo={moduloCodigo}
          moduloLabel={descriptor.label}
          roles={descriptor.columnas.map((c) => ({ nombre: c.nombre, etiqueta: c.etiqueta, tipo: c.tipo, requerido: c.requerido, ...(c.nombre === descriptor.valor ? { derivaDe: descriptor.valorAlterno ?? [] } : {}) }))}
          clasificadorRol={descriptor.clasificador}
          conNivelCartera={descriptor.crucePorTercero.detalleTercero === true}
          erps={[]}
          edicion={{
            id: version.id,
            version: version.version,
            erpNombre: version.erp.name,
            nota: version.nota ?? "",
            actualizadoEn: version.actualizadoEn.toISOString(),
            muestraNombre: version.muestraNombre ?? "muestra",
          }}
        />
      )}
    </div>
  );
}
