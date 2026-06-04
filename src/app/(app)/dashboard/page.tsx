import Link from "next/link";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { PageHeader, Card, CardHeader, StatCard, Chip } from "@/components/ui";
import { statusChip } from "@/lib/format";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  const [clientsCount, recs, balancesCount, dianDiff, pendingClients] =
    await Promise.all([
      prisma.client.count(),
      prisma.reconciliation.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.balance.count(),
      prisma.dianPeriod.count({ where: { status: { in: ["DIFF", "PEND"] } } }),
      prisma.client.findMany({
        where: { modules: { some: { status: "pending" } } },
        include: { modules: { where: { status: "pending" }, include: { module: true } } },
      }),
    ]);

  const diffRecs = recs.filter((r) => r.status === "DIFF").length;

  return (
    <div>
      <PageHeader
        title={`Hola, ${user?.name?.split(" ")[0] ?? ""}`}
        subtitle="Resumen de tu trabajo de conciliación y diagnóstico"
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Clientes activos" value={String(clientsCount)} hint="con módulos parametrizados" tone="blue" />
        <StatCard label="Conciliaciones" value={String(recs.length)} hint={`${diffRecs} con diferencias`} tone={diffRecs > 0 ? "warn" : "ok"} />
        <StatCard label="Balances cargados" value={String(balancesCount)} hint="versiones en repositorio" tone="ink" />
        <StatCard label="DIAN por revisar" value={String(dianDiff)} hint="formatos con diferencias o pendientes" tone={dianDiff > 0 ? "err" : "ok"} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Conciliaciones recientes */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Conciliaciones recientes"
            right={<Link href="/conciliacion/resultados" className="text-[12px] font-medium text-blue-500 hover:underline">Ver todas</Link>}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                  <th className="px-4 py-2 font-semibold">ID</th>
                  <th className="px-4 py-2 font-semibold">Cliente</th>
                  <th className="px-4 py-2 font-semibold">Módulo</th>
                  <th className="px-4 py-2 font-semibold">Período</th>
                  <th className="px-4 py-2 text-right font-semibold">Diferencia</th>
                  <th className="px-4 py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {recs.map((r) => (
                  <tr key={r.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                    <td className="px-4 py-2.5 font-mono text-[11.5px] text-ink-500">{r.id}</td>
                    <td className="px-4 py-2.5 text-ink-800">{r.clientName}</td>
                    <td className="px-4 py-2.5 text-ink-600">{r.module}</td>
                    <td className="px-4 py-2.5 text-ink-600">{r.period}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-700">{r.diff}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusChip(r.status)}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Parametrización pendiente */}
        <Card>
          <CardHeader title="Parametrización pendiente" />
          <div className="divide-y divide-ink-50">
            {pendingClients.map((c) => (
              <div key={c.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-medium text-ink-800">{c.name}</span>
                  <span className="font-mono text-[11px] text-ink-400">{c.erp}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {c.modules.map((m) => (
                    <Chip key={m.id} label={m.module.name} tone="warn" />
                  ))}
                </div>
              </div>
            ))}
            {pendingClients.length === 0 && (
              <div className="px-4 py-6 text-center text-[12.5px] text-ink-400">
                Sin pendientes de parametrización 🎉
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
