import Link from "next/link";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader, Card, CardHeader, StatCard, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { statusChip, fmtCompact } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = { OK: "Conciliado", DIFF: "Diferencia", REVIEW: "En revisión" };
function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "··";
}

export default async function DashboardPage() {
  await requirePermiso("dashboard:ver");
  const user = await getCurrentUser();
  const puedeCrearConciliacion = (await authorizePermiso("conciliaciones:crear")).ok;
  // Todos los indicadores se limitan a la cartera del usuario (Admin/Superadmin
  // ven la plataforma completa). La actividad del equipo (auditoría) es
  // transversal y se mantiene global.
  const alc = await alcanceLecturaUsuario();
  const recWhere = alc.todos ? {} : { clientId: { in: alc.clientIds } };
  const cmWhere = alc.todos ? {} : { clientId: { in: alc.clientIds } };
  const rowWhere = alc.todos ? {} : { reconciliation: { clientId: { in: alc.clientIds } } };
  const clientWhere = alc.todos ? {} : { id: { in: alc.clientIds } };
  const [recs, diffSum, configuredCount, pendingCount, activity, pendingClients] = await Promise.all([
    prisma.reconciliation.findMany({ where: recWhere, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.reconciliationRow.aggregate({ where: rowWhere, _sum: { diff: true } }),
    prisma.clientModule.count({ where: { status: "configured", ...cmWhere } }),
    prisma.clientModule.count({ where: { status: "pending", ...cmWhere } }),
    prisma.auditEntry.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.client.findMany({ where: { ...clientWhere, modules: { some: { status: "pending" } } }, take: 20, include: { erp: { select: { name: true } }, modules: { where: { status: "pending" }, include: { module: true } } } }),
  ]);

  const inProcess = recs.filter((r) => r.status === "DIFF" || r.status === "REVIEW").length;
  const netDiff = diffSum._sum.diff ?? 0;
  const coverage = configuredCount + pendingCount > 0 ? Math.round((configuredCount / (configuredCount + pendingCount)) * 100) : 0;

  return (
    <div>
      <PageHeader
        title={`Hola, ${user?.name?.split(" ")[0] ?? ""}`}
        subtitle="Resumen de tu trabajo de conciliación y diagnóstico"
        actions={puedeCrearConciliacion ? <Link href="/conciliacion/nueva" className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600"><Icon name="play" size={14} /> Nueva conciliación</Link> : null}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Conciliaciones" value={String(recs.length)} hint={`${inProcess} en proceso`} tone="blue" />
        <StatCard label="Pendientes en proceso" value={String(inProcess)} hint="requieren atención" tone={inProcess > 0 ? "warn" : "ok"} />
        <StatCard label="Diferencia neta acumulada" value={fmtCompact(netDiff)} hint="partidas con diferencia" tone={netDiff !== 0 ? "err" : "ok"} />
        <StatCard label="Cobertura parametrización" value={`${coverage}%`} hint={`${configuredCount} módulos configurados`} tone="ink" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Conciliaciones recientes" right={<Link href="/conciliacion/resultados" className="text-[12px] font-medium text-blue-500 hover:underline">Ver todas</Link>} />
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                  <th className="px-4 py-2 font-semibold">ID</th>
                  <th className="px-4 py-2 font-semibold">Cliente</th>
                  <th className="px-4 py-2 font-semibold">Módulo</th>
                  <th className="px-4 py-2 font-semibold">ERP</th>
                  <th className="px-4 py-2 text-right font-semibold">Diferencia</th>
                  <th className="px-4 py-2 font-semibold">Estado</th>
                  <th className="px-4 py-2 font-semibold">Auditor</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {recs.map((r) => (
                  <tr key={r.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                    <td className="px-4 py-2.5 font-mono text-[11.5px] text-ink-500">{r.id}</td>
                    <td className="px-4 py-2.5 text-ink-800">{r.clientName}</td>
                    <td className="px-4 py-2.5 text-ink-600">{r.module}</td>
                    <td className="px-4 py-2.5 text-ink-500">{r.erp}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-700">{r.diff}</td>
                    <td className="px-4 py-2.5"><span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusChip(r.status)}`}>{STATUS_LABEL[r.status] ?? r.status}</span></td>
                    <td className="px-4 py-2.5 text-ink-600">{r.owner}</td>
                    <td className="px-4 py-2.5 text-right"><Link href={`/conciliacion/resultados/${r.id}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-500 hover:underline">Ver <Icon name="chev-r" size={12} /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Actividad del equipo" />
            <div className="divide-y divide-ink-50">
              {activity.map((a) => (
                <div key={a.id} className="flex gap-2.5 px-4 py-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[10px] font-semibold text-white">{initials(a.user)}</div>
                  <div className="text-[12px] text-ink-700">
                    <div><b>{a.user}</b> <span className="text-ink-500">{a.action.toLowerCase()}</span> <b>{a.entity}</b></div>
                    <div className="text-[11px] text-ink-400">{a.detail}</div>
                    <div className="text-[10.5px] text-ink-300">{a.ts}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Parametrización pendiente" />
            <div className="divide-y divide-ink-50">
              {pendingClients.map((c) => (
                <div key={c.id} className="px-4 py-3">
                  <div className="flex items-center justify-between"><span className="text-[12.5px] font-medium text-ink-800">{c.name}</span><span className="font-mono text-[11px] text-ink-400">{c.erp.name}</span></div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">{c.modules.map((m) => <Chip key={m.id} label={m.module.name} tone="warn" />)}</div>
                </div>
              ))}
              {pendingClients.length === 0 && <div className="px-4 py-6 text-center text-[12.5px] text-ink-400">Sin pendientes 🎉</div>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
