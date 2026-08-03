import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import ModulosClient, { type ModuleWithFields } from "./modulos-client";
import { requirePermiso, authorizePermiso } from "@/lib/rbac";
import { descriptorModulo } from "@/lib/modulos/descriptores";

export default async function ModulosPage() {
  await requirePermiso("modulos:ver");
  const [modules, puedeConfigurar] = await Promise.all([
    prisma.module.findMany({ orderBy: { name: "asc" }, include: { fields: { orderBy: { order: "asc" } } } }),
    authorizePermiso("modulos:configurar").then((r) => r.ok),
  ]);

  // Los campos reales de cada módulo los define el MOTOR de importación (descriptores en
  // código). Adjuntamos esas columnas para mostrarlas como fuente de verdad.
  const conDescriptor: ModuleWithFields[] = modules.map((m) => ({
    ...m,
    descriptorColumns:
      descriptorModulo(m.code)?.columnas.map((c) => ({ nombre: c.nombre, etiqueta: c.etiqueta, tipo: c.tipo, requerido: c.requerido, sinonimos: c.sinonimos ?? [] })) ?? null,
  }));

  return (
    <div>
      <PageHeader
        title="Módulos y campos"
        subtitle="Columnas que el motor de importación espera en cada archivo. Se definen en código y aplican a todos los clientes."
      />
      <ModulosClient modules={conDescriptor} puedeConfigurar={puedeConfigurar} />
    </div>
  );
}
