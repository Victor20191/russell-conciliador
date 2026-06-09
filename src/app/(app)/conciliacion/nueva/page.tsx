import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import NuevaClient, { type ClientOpt, type ModuleOpt, type StdField } from "./nueva-client";

export default async function NuevaConciliacionPage() {
  await requirePermiso("conciliaciones:crear");
  const [clients, modules, fields] = await Promise.all([
    prisma.client.findMany({ orderBy: { name: "asc" }, include: { modules: true } }),
    prisma.module.findMany({ orderBy: { name: "asc" } }),
    prisma.moduleField.findMany({ orderBy: { order: "asc" } }),
  ]);

  const clientOpts: ClientOpt[] = clients.map((c) => ({
    id: c.id, name: c.name, nit: c.nit, erp: c.erp, sector: c.sector,
    configured: c.modules.filter((m) => m.status === "configured").map((m) => m.moduleId),
  }));
  const moduleOpts: ModuleOpt[] = modules.map((m) => ({ id: m.id, code: m.code, name: m.name, icon: m.icon }));
  const fieldsByModule: Record<number, StdField[]> = {};
  for (const f of fields) {
    (fieldsByModule[f.moduleId] ??= []).push({ key: f.key, label: f.label, type: f.type, required: f.required });
  }

  return (
    <div>
      <PageHeader title="Nueva conciliación" subtitle="Asistente de parametrización y ejecución de un nuevo cruce contable vs. auxiliar." />
      <NuevaClient clients={clientOpts} modules={moduleOpts} fieldsByModule={fieldsByModule} />
    </div>
  );
}
