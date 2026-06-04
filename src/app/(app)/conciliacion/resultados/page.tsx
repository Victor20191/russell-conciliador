import Link from "next/link";
import prisma from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import { Icon } from "@/components/icons";
import { statusChip } from "@/lib/format";

export default async function ResultadosPage() {
  const recs = await prisma.reconciliation.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Resultados de conciliación"
        subtitle="Histórico de cruces ejecutados entre contabilidad y módulos auxiliares"
      />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                <th className="px-4 py-2.5 font-semibold">ID</th>
                <th className="px-4 py-2.5 font-semibold">Cliente</th>
                <th className="px-4 py-2.5 font-semibold">Módulo</th>
                <th className="px-4 py-2.5 font-semibold">Período</th>
                <th className="px-4 py-2.5 font-semibold">ERP</th>
                <th className="px-4 py-2.5 text-right font-semibold">Diferencia</th>
                <th className="px-4 py-2.5 text-right font-semibold">Partidas</th>
                <th className="px-4 py-2.5 font-semibold">Estado</th>
                <th className="px-4 py-2.5 font-semibold">Responsable</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {recs.map((r) => (
                <tr key={r.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                  <td className="px-4 py-2.5 font-mono text-[11.5px] text-ink-500">{r.id}</td>
                  <td className="px-4 py-2.5 text-ink-800">{r.clientName}</td>
                  <td className="px-4 py-2.5 text-ink-600">{r.module}</td>
                  <td className="px-4 py-2.5 text-ink-600">{r.period}</td>
                  <td className="px-4 py-2.5 text-ink-500">{r.erp}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-ink-700">{r.diff}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-ink-600">{r.items}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusChip(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-600">{r.owner}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/conciliacion/resultados/${r.id}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-500 hover:underline">Ver <Icon name="chev-r" size={12} /></Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
