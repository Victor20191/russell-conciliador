import prisma from "@/lib/prisma";
import { PageHeader, Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";

export default async function ClientesPage() {
  const clients = await prisma.client.findMany({
    include: { modules: { include: { module: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Catálogo de clientes y estado de parametrización por módulo"
        actions={
          <button className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-2 text-[12.5px] font-semibold text-white transition hover:bg-navy-600">
            <Icon name="plus" size={14} /> Nuevo cliente
          </button>
        }
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                <th className="px-4 py-2.5 font-semibold">Código</th>
                <th className="px-4 py-2.5 font-semibold">Cliente</th>
                <th className="px-4 py-2.5 font-semibold">NIT</th>
                <th className="px-4 py-2.5 font-semibold">ERP</th>
                <th className="px-4 py-2.5 font-semibold">Sector</th>
                <th className="px-4 py-2.5 font-semibold">Módulos</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const configured = c.modules.filter((m) => m.status === "configured");
                const pending = c.modules.filter((m) => m.status === "pending");
                return (
                  <tr key={c.id} className="border-b border-ink-50 last:border-0 align-top hover:bg-ink-50">
                    <td className="px-4 py-3 font-mono text-[11.5px] text-ink-500">{c.id}</td>
                    <td className="px-4 py-3 font-medium text-ink-800">{c.name}</td>
                    <td className="px-4 py-3 font-mono text-ink-600">{c.nit}</td>
                    <td className="px-4 py-3 text-ink-600">{c.erp}</td>
                    <td className="px-4 py-3 text-ink-600">{c.sector}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {configured.map((m) => (
                          <Chip key={m.id} label={m.module.name} tone="ok" />
                        ))}
                        {pending.map((m) => (
                          <Chip key={m.id} label={m.module.name} tone="warn" />
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-3 flex items-center gap-4 text-[11.5px] text-ink-500">
        <span className="flex items-center gap-1.5"><Chip label="módulo" tone="ok" /> Parametrizado</span>
        <span className="flex items-center gap-1.5"><Chip label="módulo" tone="warn" /> Pendiente</span>
      </div>
    </div>
  );
}
