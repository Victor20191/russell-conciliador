"use client";

import Link from "next/link";
import { Card } from "@/components/ui";
import { Icon } from "@/components/icons";
import {
  PageSizeSelect,
  PaginationFooter,
  usePagination,
} from "@/components/pagination-controls";
import { statusChip } from "@/lib/format";

export type ResultadoRow = {
  id: number;
  clientName: string;
  module: string;
  period: string;
  erp: string;
  diff: string;
  items: number;
  status: string;
  owner: string;
};

export default function ResultadosTabla({ rows }: { rows: ResultadoRow[] }) {
  const pg = usePagination(rows, 50);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
        <span className="text-[12px] text-ink-500">{pg.total} conciliación(es)</span>
        <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
      </div>
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
            {pg.pageItems.map((r) => (
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
            {rows.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-ink-400">Sin conciliaciones registradas.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <PaginationFooter
        rangeLabel={pg.rangeLabel}
        currentPage={pg.page}
        totalPages={pg.totalPages}
        onPageChange={pg.setPage}
      />
    </Card>
  );
}
