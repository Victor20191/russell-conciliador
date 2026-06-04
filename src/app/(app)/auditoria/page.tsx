import prisma from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import AuditoriaFilters from "./auditoria-filters";

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<{ q?: string; user?: string; action?: string }> }) {
  const sp = await searchParams;
  const all = await prisma.auditEntry.findMany({ orderBy: { ts: "desc" } });

  const users = [...new Set(all.map((e) => e.user))].sort();
  const actions = [...new Set(all.map((e) => e.action))].sort();

  const q = (sp.q ?? "").toLowerCase();
  const entries = all.filter((e) =>
    (!q || e.entity.toLowerCase().includes(q) || e.detail.toLowerCase().includes(q)) &&
    (!sp.user || e.user === sp.user) &&
    (!sp.action || e.action === sp.action),
  );

  const actionTone = (a: string) => {
    if (a.includes("EJECUTÓ") || a.includes("INICIÓ")) return "bg-blue-100 text-navy-700";
    if (a.includes("GUARDÓ") || a.includes("CARGÓ")) return "bg-ok-100 text-ok-700";
    if (a.includes("ASIGNÓ")) return "bg-ai-100 text-ai-700";
    return "bg-ink-100 text-ink-600";
  };

  return (
    <div>
      <PageHeader title="Auditoría" subtitle="Bitácora inmutable: trazabilidad de acciones del sistema con usuario, IP y detalle." />
      <Card>
        <div className="border-b border-ink-100 px-4 py-3"><AuditoriaFilters users={users} actions={actions} /></div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                <th className="px-4 py-2.5 font-semibold">Fecha y hora</th>
                <th className="px-4 py-2.5 font-semibold">Usuario</th>
                <th className="px-4 py-2.5 font-semibold">Acción</th>
                <th className="px-4 py-2.5 font-semibold">Entidad</th>
                <th className="px-4 py-2.5 font-semibold">IP origen</th>
                <th className="px-4 py-2.5 font-semibold">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11.5px] text-ink-500">{e.ts}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-800">{e.user}</td>
                  <td className="px-4 py-2.5"><span className={`inline-flex rounded px-2 py-0.5 text-[10.5px] font-semibold ${actionTone(e.action)}`}>{e.action}</span></td>
                  <td className="px-4 py-2.5 text-ink-700">{e.entity}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11.5px] text-ink-400">{e.ip ?? "—"}</td>
                  <td className="px-4 py-2.5 text-ink-500">{e.detail}</td>
                </tr>
              ))}
              {entries.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-400">Sin entradas que coincidan con el filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
