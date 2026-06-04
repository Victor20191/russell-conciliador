import Link from "next/link";
import prisma from "@/lib/prisma";
import { PageHeader, Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";

const PROCESS_LABEL: Record<string, { label: string; tone: "warn" | "err" }> = {
  DIFF: { label: "Diferencia abierta", tone: "err" },
  REVIEW: { label: "En revisión", tone: "warn" },
};

export default async function EnProcesoPage() {
  const recs = await prisma.reconciliation.findMany({
    where: { status: { in: ["DIFF", "REVIEW"] } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader title="Conciliaciones en curso" subtitle={`${recs.length} conciliaciones abiertas. Continúa donde lo dejaste.`} />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                <th className="px-4 py-2.5 font-semibold">ID</th>
                <th className="px-4 py-2.5 font-semibold">Cliente</th>
                <th className="px-4 py-2.5 font-semibold">Módulo</th>
                <th className="px-4 py-2.5 font-semibold">Período</th>
                <th className="px-4 py-2.5 font-semibold">Estado</th>
                <th className="px-4 py-2.5 font-semibold">Última actividad</th>
                <th className="px-4 py-2.5 font-semibold">Auditor</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {recs.map((r) => {
                const st = PROCESS_LABEL[r.status] ?? { label: r.status, tone: "warn" as const };
                return (
                  <tr key={r.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                    <td className="px-4 py-2.5 font-mono text-[11.5px] text-ink-500">{r.id}</td>
                    <td className="px-4 py-2.5 text-ink-800">{r.clientName}</td>
                    <td className="px-4 py-2.5 text-ink-600">{r.module}</td>
                    <td className="px-4 py-2.5 text-ink-600">{r.period}</td>
                    <td className="px-4 py-2.5"><Chip label={st.label} tone={st.tone} /></td>
                    <td className="px-4 py-2.5 text-ink-500">{r.lastActivity ?? "—"}</td>
                    <td className="px-4 py-2.5 text-ink-600">{r.owner}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/conciliacion/resultados/${r.id}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-500 hover:underline">Abrir <Icon name="chev-r" size={12} /></Link>
                    </td>
                  </tr>
                );
              })}
              {recs.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-ink-400">Sin conciliaciones en proceso</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
