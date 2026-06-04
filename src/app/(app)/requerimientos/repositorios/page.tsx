import Link from "next/link";
import prisma from "@/lib/prisma";
import { PageHeader, Card, Chip, StatCard } from "@/components/ui";
import { Icon } from "@/components/icons";

function deadlineHint(daysLeft: number): { text: string; cls: string } {
  if (daysLeft < 0) return { text: `Hace ${Math.abs(daysLeft)} días`, cls: "text-err-700" };
  if (daysLeft === 0) return { text: "Hoy", cls: "text-warn-700" };
  return { text: `En ${daysLeft} días`, cls: daysLeft <= 3 ? "text-warn-700" : "text-ink-400" };
}
function statusTone(s: string): "ok" | "err" | "blue" { return s === "Completo" ? "ok" : s === "Vencido parcial" ? "err" : "blue"; }

export default async function RepositoriosPage() {
  const repos = await prisma.reqRepository.findMany({ orderBy: { id: "desc" } });
  const sum = (k: "received" | "pending" | "overdue") => repos.reduce((a, r) => a + r[k], 0);

  return (
    <div>
      <PageHeader title="Repositorios de información" subtitle="Cada requerimiento abre un repositorio donde el cliente carga la documentación. Trazabilidad por documento: usuario, fecha, archivo y estado vs. fecha límite." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Repositorios activos" value={String(repos.length)} tone="blue" />
        <StatCard label="Documentos recibidos" value={String(sum("received"))} tone="ok" />
        <StatCard label="Pendientes" value={String(sum("pending"))} tone="warn" />
        <StatCard label="Vencidos" value={String(sum("overdue"))} tone="err" />
      </div>
      <Card className="mt-5">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500"><th className="px-4 py-2 font-semibold">Consecutivo</th><th className="px-4 py-2 font-semibold">Cliente</th><th className="px-4 py-2 font-semibold">Período</th><th className="px-4 py-2 font-semibold">Enviado</th><th className="px-4 py-2 font-semibold">Vencimiento</th><th className="px-4 py-2 font-semibold">Progreso</th><th className="px-4 py-2 font-semibold">Estado</th><th className="px-4 py-2"></th></tr></thead>
            <tbody>
              {repos.map((r) => {
                const dl = deadlineHint(r.daysLeft);
                return (
                  <tr key={r.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                    <td className="px-4 py-2.5 font-mono text-ink-600">{r.consec}</td>
                    <td className="px-4 py-2.5"><div className="text-ink-800">{r.clientName}</div><div className="font-mono text-[11px] text-ink-400">NIT {r.nit}</div></td>
                    <td className="px-4 py-2.5 text-ink-600">{r.period}</td>
                    <td className="px-4 py-2.5 text-ink-600">{r.sentAt}<div className="text-[11px] text-ink-400">por {r.sentBy}</div></td>
                    <td className="px-4 py-2.5 text-ink-600">{r.deadline}<div className={`text-[11px] ${dl.cls}`}>{dl.text}</div></td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2"><span className="font-mono text-[11px] text-ink-500">{r.received}/{r.total}</span><div className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-150"><div className={`h-full ${r.progress === 100 ? "bg-ok-500" : r.overdue > 0 ? "bg-err-500" : "bg-warn-500"}`} style={{ width: `${r.progress}%` }} /></div></div>
                    </td>
                    <td className="px-4 py-2.5"><Chip label={r.status} tone={statusTone(r.status)} /></td>
                    <td className="px-4 py-2.5 text-right"><Link href={`/requerimientos/repositorios/${r.id}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-500 hover:underline">Abrir <Icon name="chev-r" size={12} /></Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
