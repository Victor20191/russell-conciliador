"use client";

import { Card } from "@/components/ui";
import {
  PageSizeSelect,
  PaginationFooter,
  usePagination,
} from "@/components/pagination-controls";
import AuditoriaFilters from "./auditoria-filters";

export type AuditoriaRow = {
  id: number;
  ts: string;
  user: string;
  action: string;
  entity: string;
  ip: string | null;
  detail: string;
};

function actionTone(a: string) {
  if (a.includes("EJECUTÓ") || a.includes("INICIÓ")) return "bg-blue-100 text-navy-700";
  if (a.includes("GUARDÓ") || a.includes("CARGÓ")) return "bg-ok-100 text-ok-700";
  if (a.includes("ASIGNÓ")) return "bg-ai-100 text-ai-700";
  return "bg-ink-100 text-ink-600";
}

/**
 * Bitácora de auditoría. El filtrado vive en el servidor (vía searchParams en
 * `AuditoriaFilters`); aquí solo se pagina en memoria el conjunto ya filtrado
 * para no montar miles de filas en el DOM de una sola vez.
 */
export default function AuditoriaTabla({
  rows,
  users,
  actions,
}: {
  rows: AuditoriaRow[];
  users: string[];
  actions: string[];
}) {
  const pg = usePagination(rows, 50);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
        <div className="min-w-0 flex-1">
          <AuditoriaFilters users={users} actions={actions} />
        </div>
        <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
      </div>
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
            {pg.pageItems.map((e) => (
              <tr key={e.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11.5px] text-ink-500">{e.ts}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-ink-800">{e.user}</td>
                <td className="px-4 py-2.5"><span className={`inline-flex rounded px-2 py-0.5 text-[10.5px] font-semibold ${actionTone(e.action)}`}>{e.action}</span></td>
                <td className="px-4 py-2.5 text-ink-700">{e.entity}</td>
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11.5px] text-ink-400">{e.ip ?? "—"}</td>
                <td className="px-4 py-2.5 text-ink-500">{e.detail}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-400">Sin entradas que coincidan con el filtro.</td></tr>}
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
