"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Card, Chip } from "@/components/ui";
import { markRepoItemReceived } from "@/app/actions/repositorios";

export type Item = { id: string; idx: number; doc: string; due: string; status: string; file: string | null; size: string | null; by: string | null; at: string | null };
export type Family = { id: string; code: string; name: string; total: number; received: number; pending: number; items: Item[] };
export type Activity = { id: string; at: string; actor: string; role: string; action: string; detail: string };

function itemStatus(s: string): { label: string; tone: "ok" | "warn" | "err" } {
  if (s === "received") return { label: "Recibido", tone: "ok" };
  if (s === "overdue") return { label: "Vencido", tone: "err" };
  return { label: "Pendiente", tone: "warn" };
}

export default function RepoClient({ repositoryId, families, activity }: { repositoryId: string; families: Family[]; activity: Activity[] }) {
  const [tab, setTab] = useState<"docs" | "activity">("docs");
  const [filter, setFilter] = useState<"all" | "received" | "pending" | "overdue">("all");
  const [open, setOpen] = useState<string[]>(families.map((f) => f.id));
  const toggle = (id: string) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center gap-2">
        <TabBtn on={tab === "docs"} onClick={() => setTab("docs")} label="Documentos" />
        <TabBtn on={tab === "activity"} onClick={() => setTab("activity")} label="Actividad" count={activity.length} />
        {tab === "docs" && (
          <div className="ml-auto flex gap-1.5">
            {(["all", "received", "pending", "overdue"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${filter === f ? "bg-navy-800 text-white" : "bg-ink-100 text-ink-600"}`}>{f === "all" ? "Todos" : f === "received" ? "Recibidos" : f === "pending" ? "Pendientes" : "Vencidos"}</button>
            ))}
          </div>
        )}
      </div>

      {tab === "docs" ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500"><th className="px-3 py-2 font-semibold">#</th><th className="px-3 py-2 font-semibold">Documento</th><th className="px-3 py-2 font-semibold">Vence</th><th className="px-3 py-2 font-semibold">Estado</th><th className="px-3 py-2 font-semibold">Archivo</th><th className="px-3 py-2 font-semibold">Cargado por</th><th className="px-3 py-2 font-semibold">Fecha</th><th className="px-3 py-2"></th></tr></thead>
              <tbody>
                {families.map((fam) => {
                  const items = fam.items.filter((it) => filter === "all" || it.status === filter);
                  if (filter !== "all" && items.length === 0) return null;
                  const isOpen = open.includes(fam.id);
                  return (
                    <FragmentRows key={fam.id}>
                      <tr className="cursor-pointer border-b border-ink-100 bg-ink-50" onClick={() => toggle(fam.id)}>
                        <td className="px-3 py-2 font-mono font-semibold text-ink-700"><span className="mr-1 inline-block align-middle"><Icon name={isOpen ? "chev-d" : "chev-r"} size={12} /></span>{fam.code}</td>
                        <td className="px-3 py-2 font-semibold text-ink-800">{fam.name}</td>
                        <td className="px-3 py-2 text-ink-500" colSpan={6}>{fam.received}/{fam.total} recibidos · {fam.pending} pendientes</td>
                      </tr>
                      {isOpen && items.map((it) => {
                        const st = itemStatus(it.status);
                        return (
                          <tr key={it.id} className="border-b border-ink-50 hover:bg-ink-50">
                            <td className="px-3 py-2 pl-7 font-mono text-[11px] text-ink-500">{fam.code}.{it.idx}</td>
                            <td className="px-3 py-2 text-ink-700">{it.doc}</td>
                            <td className="px-3 py-2 text-ink-500">{it.due}</td>
                            <td className="px-3 py-2"><Chip label={st.label} tone={st.tone} /></td>
                            <td className="px-3 py-2 text-ink-600">{it.file ? <span className="inline-flex items-center gap-1"><Icon name="doc" size={12} />{it.file} <span className="text-ink-400">({it.size})</span></span> : "—"}</td>
                            <td className="px-3 py-2 text-ink-600">{it.by ?? "—"}</td>
                            <td className="px-3 py-2 text-ink-500">{it.at ?? "—"}</td>
                            <td className="px-3 py-2 text-right">
                              {it.status === "received" ? (
                                <button disabled title="Descarga — fase posterior" className="cursor-not-allowed rounded p-1 text-ink-300"><Icon name="download" size={13} /></button>
                              ) : (
                                <form action={markRepoItemReceived}><input type="hidden" name="itemId" value={it.id} /><input type="hidden" name="repositoryId" value={repositoryId} /><button type="submit" title="Marcar recibido" className="inline-flex items-center gap-1 rounded-md border border-ok-100 bg-ok-100 px-2 py-1 text-[11px] font-semibold text-ok-700 hover:opacity-80"><Icon name="check" size={11} /> Recibir</button></form>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </FragmentRows>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500"><th className="px-4 py-2 font-semibold">Fecha · hora</th><th className="px-4 py-2 font-semibold">Actor</th><th className="px-4 py-2 font-semibold">Rol</th><th className="px-4 py-2 font-semibold">Acción</th><th className="px-4 py-2 font-semibold">Detalle</th></tr></thead>
              <tbody>
                {activity.map((a) => (
                  <tr key={a.id} className="border-b border-ink-50 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-ink-600">{a.at}</td>
                    <td className="px-4 py-2.5 text-ink-800">{a.actor}</td>
                    <td className="px-4 py-2.5"><Chip label={a.role} tone={a.role === "Cliente" ? "blue" : a.role === "Auditor" ? "ink" : "warn"} /></td>
                    <td className="px-4 py-2.5 font-medium text-ink-700">{a.action}</td>
                    <td className="px-4 py-2.5 text-ink-500">{a.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function FragmentRows({ children }: { children: React.ReactNode }) { return <>{children}</>; }
function TabBtn({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count?: number }) {
  return <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium ${on ? "bg-navy-800 text-white" : "text-ink-600 hover:bg-ink-100"}`}>{label}{count != null && <span className={`rounded-full px-1.5 text-[10px] font-semibold ${on ? "bg-white/20" : "bg-ink-100 text-ink-500"}`}>{count}</span>}</button>;
}
