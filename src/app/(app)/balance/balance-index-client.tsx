"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Card, Chip } from "@/components/ui";

export type PeriodRow = {
  period: string; versions: number; official: string | null; officialId: string | null;
  status: string; complete: number; lastUpload: string;
};
export type ClientGroup = {
  clientName: string; clientNit: string;
  mapped?: number; unmapped?: number; total?: number;
  periodList: PeriodRow[];
};
export type AuditRow = { date: string; actor: string; role: string; action: string; ip: string; details: string };
export type StdAccount = { code: string; name: string; level: number; nature: string; critical: boolean };

type Tab = "clients" | "audit" | "std";

function statusTone(s: string): "ok" | "warn" | "blue" | "ink" {
  if (s === "Congelado") return "blue";
  if (s === "Con alertas") return "warn";
  return "ink";
}

export default function BalanceIndexClient({
  clients, auditRows, std, clientNames,
}: {
  clients: ClientGroup[]; auditRows: AuditRow[]; std: StdAccount[]; clientNames: string[];
}) {
  const [tab, setTab] = useState<Tab>("clients");

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <TabBtn on={tab === "clients"} onClick={() => setTab("clients")} label="Clientes" count={clients.length} />
        <TabBtn on={tab === "audit"} onClick={() => setTab("audit")} label="Audit log" count={auditRows.length} />
        <TabBtn on={tab === "std"} onClick={() => setTab("std")} label="Plan estándar" count={std.length} />
        <button
          disabled
          title="Carga de balance — se habilita al cablear la importación de archivos (fase posterior)"
          className="ml-auto inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-ink-100 px-3 py-1.5 text-[12.5px] font-semibold text-ink-400"
        >
          <Icon name="upload" size={14} /> Cargar balance
        </button>
      </div>

      {tab === "clients" && <ClientsTab clients={clients} />}
      {tab === "audit" && <AuditTab rows={auditRows} clientNames={clientNames} />}
      {tab === "std" && <StandardTab std={std} />}
    </div>
  );
}

function ClientsTab({ clients }: { clients: ClientGroup[] }) {
  return (
    <div className="flex flex-col gap-5">
      {clients.map((c) => (
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
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
        <h2 className="text-[13px] font-semibold text-ink-800">Audit log</h2>
        <select className="ml-auto rounded-md border border-ink-200 px-2 py-1 text-[12px] text-ink-700 outline-none">
          {clientNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
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
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-ink-50 last:border-0">
                <td className="px-4 py-2.5 font-mono text-ink-600">{r.date}</td>
                <td className="px-4 py-2.5 text-ink-800">{r.actor}</td>
                <td className="px-4 py-2.5"><Chip label={r.role} tone={r.role.includes("Cliente") ? "blue" : "ink"} /></td>
                <td className="px-4 py-2.5 font-medium text-ink-700">{r.action}</td>
                <td className="px-4 py-2.5 font-mono text-ink-400">{r.ip}</td>
                <td className="px-4 py-2.5 text-ink-500">{r.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function StandardTab({ std }: { std: StdAccount[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const rows = std.filter((s) => !needle || s.code.includes(needle) || s.name.toLowerCase().includes(needle));
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
        <h2 className="text-[13px] font-semibold text-ink-800">Plan de cuentas estándar — Russell Bedford</h2>
        <Chip label={`${rows.length} cuentas`} tone="ink" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filtrar…" className="ml-auto rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2 font-semibold">Código</th>
              <th className="px-4 py-2 font-semibold">Nombre</th>
              <th className="px-4 py-2 font-semibold">Nivel</th>
              <th className="px-4 py-2 font-semibold">Naturaleza</th>
              <th className="px-4 py-2 font-semibold">Crítica</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.code} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                <td className="px-4 py-2.5 font-mono text-ink-600" style={{ paddingLeft: (s.level - 1) * 16 + 16 }}>{s.code}</td>
                <td className={`px-4 py-2.5 text-ink-800 ${s.level === 1 ? "font-bold" : s.level === 2 ? "font-medium" : ""}`}>{s.name}</td>
                <td className="px-4 py-2.5 text-ink-500">Nivel {s.level}</td>
                <td className="px-4 py-2.5"><Chip label={s.nature === "D" ? "Débito" : "Crédito"} tone="ink" /></td>
                <td className="px-4 py-2.5">{s.critical && <Chip label="Crítica" tone="warn" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
