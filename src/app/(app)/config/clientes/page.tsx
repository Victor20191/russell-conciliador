import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import ClientesClient, { type ClientRow, type ModuleRef } from "./clientes-client";
import { requireRole } from "@/lib/rbac";

export default async function ClientesPage() {
  await requireRole("Líder");
  const [clients, modules] = await Promise.all([
    prisma.client.findMany({
      orderBy: { name: "asc" },
      include: { modules: true },
    }),
    prisma.module.findMany({ orderBy: { name: "asc" } }),
  ]);

  const rows: ClientRow[] = clients.map((c) => ({
    id: c.id,
    name: c.name,
    nit: c.nit,
    erp: c.erp,
    sector: c.sector,
    modules: c.modules.map((m) => ({ moduleId: m.moduleId, status: m.status })),
  }));
  const mods: ModuleRef[] = modules.map((m) => ({ id: m.id, name: m.name }));
  const erps = [...new Set(clients.map((c) => c.erp))].sort();
  const sectors = [...new Set(clients.map((c) => c.sector))].sort();

  return (
    <div>
      <PageHeader
        title="Clientes y parametrizaciones"
        subtitle="Estado de parametrización por cliente y módulo. Los módulos en gris requieren configuración."
      />
      <ClientesClient clients={rows} modules={mods} erps={erps} sectors={sectors} />
    </div>
  );
}
