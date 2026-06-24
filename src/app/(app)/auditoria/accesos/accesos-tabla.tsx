"use client";

import { Card } from "@/components/ui";
import {
  PageSizeSelect,
  PaginationFooter,
  usePagination,
} from "@/components/pagination-controls";
import AccesosFilters from "./accesos-filters";

export type AccesoRow = {
  id: number;
  ts: string;
  user: string;
  role: string | null;
  kind: string;
  path: string;
  ip: string | null;
};

function kindChip(kind: string): { label: string; cls: string } {
  if (kind === "ingreso") return { label: "Ingreso", cls: "bg-ok-100 text-ok-700" };
  if (kind === "salida") return { label: "Cierre", cls: "bg-warn-100 text-warn-700" };
  return { label: "Navegación", cls: "bg-blue-100 text-navy-700" };
}

/**
 * Detalle cronológico de accesos. El filtrado vive en el servidor (searchParams
 * vía `AccesosFilters`); aquí solo se pagina en memoria el conjunto ya filtrado.
 */
export default function AccesosTabla({
  rows,
  users,
}: {
  rows: AccesoRow[];
  users: string[];
}) {
  const pg = usePagination(rows, 50);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
        <div className="min-w-0 flex-1">
          <AccesosFilters users={users} />
        </div>
        <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2.5 font-semibold">Fecha y hora</th>
              <th className="px-4 py-2.5 font-semibold">Usuario</th>
              <th className="px-4 py-2.5 font-semibold">Evento</th>
              <th className="px-4 py-2.5 font-semibold">Ruta</th>
              <th className="px-4 py-2.5 font-semibold">IP origen</th>
            </tr>
          </thead>
          <tbody>
            {pg.pageItems.map((e) => {
              const chip = kindChip(e.kind);
              return (
                <tr key={e.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11.5px] text-ink-500">{e.ts}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-800">
                    {e.user}
                    {e.role && <span className="ml-1.5 text-[11px] text-ink-400">· {e.role}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex rounded px-2 py-0.5 text-[10.5px] font-semibold ${chip.cls}`}>{chip.label}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11.5px] text-ink-700">{e.path}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11.5px] text-ink-400">{e.ip ?? "—"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-400">Sin accesos en el rango seleccionado.</td></tr>
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
