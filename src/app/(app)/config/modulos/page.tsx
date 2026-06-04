import prisma from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";

export default async function ModulosPage() {
  const modules = await prisma.module.findMany({
    include: { _count: { select: { clients: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Módulos y campos"
        subtitle="Catálogo de módulos de conciliación disponibles en la plataforma"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <Card key={m.id} className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-500">
                <Icon name={m.icon as IconName} size={19} />
              </div>
              <div>
                <div className="text-[13.5px] font-semibold text-ink-800">{m.name}</div>
                <div className="font-mono text-[11px] text-ink-400">{m.id}</div>
              </div>
            </div>
            <div className="mt-3 border-t border-ink-100 pt-3 text-[12px] text-ink-500">
              Configurado en{" "}
              <b className="text-ink-800">{m._count.clients}</b> cliente(s)
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
