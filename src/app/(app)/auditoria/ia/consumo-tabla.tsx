"use client";

import { Card } from "@/components/ui";
import { PageSizeSelect, PaginationFooter, usePagination } from "@/components/pagination-controls";

export type ConsumoRow = {
  id: number;
  ts: string;
  tipo: string;
  modelo: string;
  cliente: string;
  usuario: string | null;
  archivo: string | null;
  tokens: number;
  costoCop: number;
};

const fmtTokens = (n: number) => n.toLocaleString("es-CO");
// Costo por llamada: suele ser pequeño (decenas/cientos de COP) → 2 decimales.
const fmtCop = (n: number) =>
  `$ ${n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Detalle de llamadas a la IA (paginado en memoria sobre el conjunto que envía el
 * servidor, como `AccesosTabla`). Una fila por llamada (extracción o lote de mapeo).
 */
export default function ConsumoTabla({ rows }: { rows: ConsumoRow[] }) {
  const pg = usePagination(rows, 50);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
        <h2 className="min-w-0 flex-1 text-[13px] font-semibold text-ink-800">Detalle de llamadas a la IA</h2>
        <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2.5 font-semibold">Fecha y hora</th>
              <th className="px-4 py-2.5 font-semibold">Operación</th>
              <th className="px-4 py-2.5 font-semibold">Cliente</th>
              <th className="px-4 py-2.5 font-semibold">Usuario</th>
              <th className="px-4 py-2.5 font-semibold">Archivo</th>
              <th className="px-4 py-2.5 text-right font-semibold">Tokens</th>
              <th className="px-4 py-2.5 text-right font-semibold">Costo (COP)</th>
            </tr>
          </thead>
          <tbody>
            {pg.pageItems.map((e) => (
              <tr key={e.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11.5px] text-ink-500">{e.ts}</td>
                <td className="px-4 py-2.5 text-ink-800">
                  {e.tipo}
                  <span className="ml-1.5 font-mono text-[10.5px] text-ink-400">{e.modelo}</span>
                </td>
                <td className="px-4 py-2.5 text-ink-700">{e.cliente}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-ink-600">{e.usuario ?? "—"}</td>
                <td className="max-w-[220px] truncate px-4 py-2.5 text-ink-600" title={e.archivo ?? undefined}>{e.archivo ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-[11.5px] text-ink-600">{fmtTokens(e.tokens)}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-[12px] font-semibold text-ink-800">{fmtCop(e.costoCop)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-400">Aún no hay consumo de IA registrado.</td>
              </tr>
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
