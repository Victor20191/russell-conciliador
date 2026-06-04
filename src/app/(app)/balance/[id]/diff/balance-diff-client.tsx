"use client";

import { useState } from "react";
import { Card, Chip } from "@/components/ui";
import { fmt } from "@/lib/format";

export type DiffRow = { type: "added" | "removed" | "changed"; code: string; name: string; before: number; after: number; delta: number; flag?: string };
export type DiffData = { summary: { added: number; removed: number; changed: number; totalAffected: number }; rows: DiffRow[] };

type View = "git" | "side" | "sxs";

export default function BalanceDiffClient({ diff, version }: { diff: DiffData; version: string }) {
  const [view, setView] = useState<View>("git");
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <ViewBtn on={view === "git"} onClick={() => setView("git")} label="Git diff" />
        <ViewBtn on={view === "side"} onClick={() => setView("side")} label="Antes / Después" />
        <ViewBtn on={view === "sxs"} onClick={() => setView("sxs")} label="Lado a lado" />
      </div>
      {view === "git" && <GitView rows={diff.rows} />}
      {view === "side" && <SideView rows={diff.rows} />}
      {view === "sxs" && <SxsView rows={diff.rows} version={version} />}
    </div>
  );
}

function sign(t: DiffRow["type"]) { return t === "added" ? "+" : t === "removed" ? "−" : "~"; }

function GitView({ rows }: { rows: DiffRow[] }) {
  return (
    <Card className="overflow-hidden p-0 font-mono text-[12px]">
      {rows.map((r, i) => (
        <div key={i} className={`grid items-center gap-2 border-b border-ink-50 px-3 py-1.5 last:border-0 ${r.type === "added" ? "bg-ok-100" : r.type === "removed" ? "bg-err-100" : ""}`} style={{ gridTemplateColumns: "20px 90px 1fr 130px 130px 120px" }}>
          <span className={`font-bold ${r.type === "added" ? "text-ok-700" : r.type === "removed" ? "text-err-700" : "text-ink-500"}`}>{sign(r.type)}</span>
          <span className="text-ink-600">{r.code}</span>
          <span className="text-ink-800">{r.name}{r.flag && <span className="ml-2"><Chip label={r.flag} tone="err" /></span>}</span>
          <span className={`text-right ${r.type === "changed" ? "text-ink-400 line-through" : "text-ink-500"}`}>{r.type === "added" ? "—" : fmt(r.before)}</span>
          <span className="text-right font-semibold text-ink-800">{r.type === "removed" ? "—" : fmt(r.after)}</span>
          <span className={`text-right ${r.delta > 0 ? "text-ok-700" : "text-err-700"}`}>{r.delta > 0 ? "+" : ""}{fmt(r.delta)}</span>
        </div>
      ))}
    </Card>
  );
}

function SideView({ rows }: { rows: DiffRow[] }) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2 font-semibold">Código</th>
              <th className="px-4 py-2 font-semibold">Cuenta</th>
              <th className="px-4 py-2 font-semibold">Tipo</th>
              <th className="px-4 py-2 text-right font-semibold">v2 (antes)</th>
              <th className="px-4 py-2 text-right font-semibold">v3 (después)</th>
              <th className="px-4 py-2 text-right font-semibold">Δ</th>
              <th className="px-4 py-2 font-semibold">Flag</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`border-b border-ink-50 last:border-0 ${r.type === "added" ? "bg-ok-100" : r.type === "removed" ? "bg-err-100" : ""}`}>
                <td className="px-4 py-2 font-mono text-ink-600">{r.code}</td>
                <td className="px-4 py-2 text-ink-800">{r.name}</td>
                <td className="px-4 py-2">{r.type === "added" ? <Chip label="+ Nueva" tone="ok" /> : r.type === "removed" ? <Chip label="− Eliminada" tone="err" /> : <Chip label="~ Modificada" tone="ink" />}</td>
                <td className="px-4 py-2 text-right font-mono text-ink-500">{r.type === "added" ? "—" : fmt(r.before)}</td>
                <td className="px-4 py-2 text-right font-mono font-semibold text-ink-800">{r.type === "removed" ? "—" : fmt(r.after)}</td>
                <td className={`px-4 py-2 text-right font-mono ${r.delta > 0 ? "text-ok-700" : "text-err-700"}`}>{r.delta > 0 ? "+" : ""}{fmt(r.delta)}</td>
                <td className="px-4 py-2">{r.flag && <Chip label={r.flag} tone="err" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SxsView({ rows, version }: { rows: DiffRow[]; version: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <div className="border-b border-ink-100 px-4 py-3 text-[13px] font-semibold text-ink-800">Versión anterior</div>
        <div className="max-h-[520px] overflow-y-auto">
          <table className="w-full text-[12.5px]">
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={`border-b border-ink-50 ${r.type === "added" ? "bg-ink-50 opacity-40" : ""}`}>
                  <td className="px-4 py-2 font-mono text-ink-500">{r.code}</td>
                  <td className="px-4 py-2 text-ink-700">{r.name}</td>
                  <td className="px-4 py-2 text-right font-mono text-ink-600">{r.type === "added" ? "—" : fmt(r.before)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3 text-[13px] font-semibold text-ink-800">{version} <Chip label="oficial" tone="ok" /></div>
        <div className="max-h-[520px] overflow-y-auto">
          <table className="w-full text-[12.5px]">
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={`border-b border-ink-50 ${r.type === "added" ? "bg-ok-100" : r.delta !== 0 ? "bg-warn-100" : ""}`}>
                  <td className="px-4 py-2 font-mono text-ink-500">{r.code}</td>
                  <td className="px-4 py-2 text-ink-700">{r.name}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold text-ink-800">{r.type === "removed" ? "—" : fmt(r.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ViewBtn({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${on ? "bg-navy-800 text-white" : "text-ink-600 hover:bg-ink-100"}`}>{label}</button>
  );
}
