"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import {
  PageSizeSelect,
  PaginationControls,
  PaginationFooter,
  usePagination,
} from "@/components/pagination-controls";
import { Card, Chip } from "@/components/ui";
import { CargarBalanceButton, type ClienteOpcion } from "./cargar-balance-modal";

export type PeriodRow = {
  period: string; versions: number; official: string | null; officialId: number | null;
  status: string; complete: number; lastUpload: string;
};
export type ClientGroup = {
  clientName: string; clientNit: string;
  mapped?: number; unmapped?: number; total?: number;
  periodList: PeriodRow[];
};
export type AuditRow = { date: string; actor: string; role: string; action: string; ip: string; details: string };

type Tab = "clients" | "audit";

function statusTone(s: string): "ok" | "warn" | "blue" | "ink" {
  if (s === "Congelado") return "blue";
  if (s === "Con alertas") return "warn";
  return "ink";
}

export default function BalanceIndexClient({
  clients, auditRows, clientNames, uploadClients, canUpload,
}: {
  clients: ClientGroup[]; auditRows: AuditRow[]; clientNames: string[];
  uploadClients: ClienteOpcion[]; canUpload: boolean;
}) {
  const [tab, setTab] = useState<Tab>("clients");

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <TabBtn on={tab === "clients"} onClick={() => setTab("clients")} label="Clientes" count={clients.length} />
        <TabBtn on={tab === "audit"} onClick={() => setTab("audit")} label="Audit log" count={auditRows.length} />
        {canUpload && <CargarBalanceButton clients={uploadClients} />}
      </div>

      {tab === "clients" && <ClientsTab clients={clients} />}
      {tab === "audit" && <AuditTab rows={auditRows} clientNames={clientNames} />}
    </div>
  );
}

function ClientsTab({ clients }: { clients: ClientGroup[] }) {
  const pg = usePagination(clients, 50);
  return (
    <div className="flex flex-col gap-5">
      {clients.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-150 bg-white px-4 py-2.5 shadow-sm">
          <span className="text-[12px] text-ink-500">{pg.rangeLabel}</span>
          <div className="flex flex-wrap items-center gap-3">
            <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
            <PaginationControls currentPage={pg.page} totalPages={pg.totalPages} onPageChange={pg.setPage} />
          </div>
        </div>
      )}
      {pg.pageItems.map((c) => (
        <Card key={c.clientName}>
          <div className="flex items-center gap-2.5 border-b border-ink-100 px-4 py-3">
            <span className="text-ink-400"><Icon name="doc" size={16} /></span>
            <h2 className="text-[13px] font-semibold text-ink-800">{c.clientName}</h2>
            <span className="font-mono text-[11px] text-ink-400">{c.clientNit}</span>
            {c.total != null && <span className="ml-2"><Chip label={`${c.mapped}/${c.total} mapeadas`} tone="ink" /></span>}
            {c.unmapped != null && c.unmapped > 0 && <Chip label={`${c.unmapped} sin mapeo`} tone="warn" />}
            <span className="ml-auto text-[11px] text-ink-400">{c.periodList.length} período(s)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                  <th className="px-4 py-2 font-semibold">Período</th>
                  <th className="px-4 py-2 text-right font-semibold">Versiones</th>
                  <th className="px-4 py-2 font-semibold">Versión oficial</th>
                  <th className="px-4 py-2 font-semibold">Estado</th>
                  <th className="px-4 py-2 font-semibold">Completitud</th>
                  <th className="px-4 py-2 font-semibold">Última carga</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {c.periodList.map((p) => (
                  <tr key={p.period} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                    <td className="px-4 py-2.5 font-medium text-ink-800">{p.period}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-600">{p.versions}</td>
                    <td className="px-4 py-2.5">{p.official ? <Chip label={`${p.official} oficial`} tone="ok" /> : <span className="text-ink-400">—</span>}</td>
                    <td className="px-4 py-2.5"><Chip label={p.status} tone={statusTone(p.status)} /></td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-ink-150">
                          <div className={`h-full ${p.complete === 100 ? "bg-ok-500" : "bg-warn-500"}`} style={{ width: `${p.complete}%` }} />
                        </div>
                        <span className="font-mono text-[11px] text-ink-500">{p.complete}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-ink-500">{p.lastUpload}</td>
                    <td className="px-4 py-2.5 text-right">
                      {p.officialId && (
                        <Link href={`/balance/${p.officialId}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-500 hover:underline">
                          Ver <Icon name="chev-r" size={12} />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}

function AuditTab({ rows, clientNames }: { rows: AuditRow[]; clientNames: string[] }) {
  const pg = usePagination(rows, 50);
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
        <h2 className="text-[13px] font-semibold text-ink-800">Audit log</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select className="rounded-md border border-ink-200 px-2 py-1 text-[12px] text-ink-700 outline-none">
            {clientNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2 font-semibold">Fecha · hora</th>
              <th className="px-4 py-2 font-semibold">Actor</th>
              <th className="px-4 py-2 font-semibold">Rol</th>
              <th className="px-4 py-2 font-semibold">Acción</th>
              <th className="px-4 py-2 font-semibold">IP</th>
              <th className="px-4 py-2 font-semibold">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {pg.pageItems.map((r, i) => (
              <tr key={pg.start + i} className="border-b border-ink-50 last:border-0">
                <td className="px-4 py-2.5 font-mono text-ink-600">{r.date}</td>
                <td className="px-4 py-2.5 text-ink-800">{r.actor}</td>
                <td className="px-4 py-2.5"><Chip label={r.role} tone={r.role.includes("Cliente") ? "blue" : "ink"} /></td>
                <td className="px-4 py-2.5 font-medium text-ink-700">{r.action}</td>
                <td className="px-4 py-2.5 font-mono text-ink-400">{r.ip}</td>
                <td className="px-4 py-2.5 text-ink-500">{r.details}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-400">Sin entradas en la bitácora.</td></tr>
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

function TabBtn({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${on ? "bg-navy-800 text-white" : "text-ink-600 hover:bg-ink-100"}`}>
      {label}
      <span className={`rounded-full px-1.5 text-[10px] font-semibold ${on ? "bg-white/20 text-white" : "bg-ink-100 text-ink-500"}`}>{count}</span>
    </button>
  );
}
