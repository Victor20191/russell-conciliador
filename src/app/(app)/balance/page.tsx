import Link from "next/link";
import prisma from "@/lib/prisma";
import { PageHeader, Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";

export default async function BalancePage() {
  const balances = await prisma.balance.findMany({
    orderBy: [{ clientName: "asc" }, { createdAt: "desc" }],
  });

  // Agrupar por cliente
  const byClient = new Map<string, typeof balances>();
  for (const b of balances) {
    const list = byClient.get(b.clientName) ?? [];
    list.push(b);
    byClient.set(b.clientName, list);
  }

  const toneFor = (status: string) =>
    status === "Congelado" ? "blue" : status === "Con alertas" ? "warn" : "ink";

  return (
    <div>
      <PageHeader
        title="Balance de comprobación"
        subtitle="Repositorio de balances cargados por cliente y período"
      />

      <div className="flex flex-col gap-5">
        {[...byClient.entries()].map(([clientName, list]) => (
          <Card key={clientName}>
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="text-ink-400"><Icon name="doc" size={16} /></span>
                <h2 className="text-[13px] font-semibold text-ink-800">{clientName}</h2>
                <span className="font-mono text-[11px] text-ink-400">{list[0].clientNit}</span>
              </div>
              <span className="text-[11px] text-ink-400">{list.length} período(s)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                    <th className="px-4 py-2 font-semibold">Período</th>
                    <th className="px-4 py-2 font-semibold">Versión</th>
                    <th className="px-4 py-2 font-semibold">Estado</th>
                    <th className="px-4 py-2 font-semibold">Completitud</th>
                    <th className="px-4 py-2 text-right font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((b) => (
                    <tr key={b.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                      <td className="px-4 py-2.5 text-ink-800">{b.period}</td>
                      <td className="px-4 py-2.5 font-mono text-ink-600">{b.version}</td>
                      <td className="px-4 py-2.5"><Chip label={b.status} tone={toneFor(b.status)} /></td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink-100">
                            <div className="h-full bg-blue-500" style={{ width: `${b.complete}%` }} />
                          </div>
                          <span className="font-mono text-[11px] text-ink-500">{b.complete}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link href={`/balance/${b.id}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-500 hover:underline">
                          Ver detalle <Icon name="chev-r" size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
