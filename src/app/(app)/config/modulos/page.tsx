import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import ModulosClient, { type ModuleWithFields } from "./modulos-client";
import { requireRole } from "@/lib/rbac";

export default async function ModulosPage() {
  await requireRole("Líder");
  const modules = await prisma.module.findMany({
    orderBy: { name: "asc" },
    include: { fields: { orderBy: { order: "asc" } } },
  });

  return (
    <div>
      <PageHeader
        title="Módulos y campos"
        subtitle="Define los campos mínimos que deben venir en cada archivo. Aplican a todos los clientes."
      />
      <ModulosClient modules={modules as ModuleWithFields[]} />
    </div>
  );
}
