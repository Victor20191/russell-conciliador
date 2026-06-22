"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Card, Chip } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { fmt, fmtPct } from "@/lib/format";
import { addReconciliationComment, setRowStatus } from "@/app/actions/reconciliation";

export type Row = { id: number; cuenta: string; desc: string; cont: number; mod: number; diff: number; items: number; manualStatus: string | null };
export type Comment = { id: number; cuenta: string; who: string; initials: string; text: string; time: string };

function statusOf(diff: number, materiality: number, manual: string | null): { label: string; tone: "ok" | "warn" | "err" | "ink" } {
  if (manual === "conciliada") return { label: "Conciliada", tone: "ok" };
  if (manual === "excepcion") return { label: "Excepción", tone: "ink" };
  if (manual === "ajuste") return { label: "Ajuste solicitado", tone: "warn" };
  if (diff === 0) return { label: "Conciliado", tone: "ok" };
  if (Math.abs(diff) > materiality) return { label: "Diferencia material", tone: "err" };
  return { label: "Diferencia menor", tone: "warn" };
}

export default function CruceClient({
  reconciliationId, materiality, rows, comments,
}: {
  reconciliationId: number; materiality: number; rows: Row[]; comments: Comment[];
  totals: { cont: number; mod: number; diff: number }; diffPct: number;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "diff">("all");
  const [selected, setSelected] = useState<string>(rows[0]?.cuenta ?? "");
  const [tab, setTab] = useState<"comments" | "detalle" | "acciones">("comments");

  const commentsByAccount = (cuenta: string) => comments.filter((c) => c.cuenta === cuenta);
  const shown = rows.filter((r) => filter === "all" || r.diff !== 0);
  const sel = rows.find((r) => r.cuenta === selected) ?? rows[0];

  return (
    <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
      {/* Tabla */}
      <Card className="lg:col-span-2">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
          <button onClick={() => setFilter("all")} className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${filter === "all" ? "bg-navy-800 text-white" : "bg-ink-100 text-ink-600"}`}>Todas {rows.length}</button>
          <button onClick={() => setFilter("diff")} className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${filter === "diff" ? "bg-navy-800 text-white" : "bg-err-100 text-err-700"}`}>Con diferencia {rows.filter((r) => r.diff !== 0).length}</button>
          <span className="ml-auto"><Chip label={`Materialidad: ${fmt(materiality)}`} tone="ink" /></span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                <th className="px-3 py-2 font-semibold">Cuenta</th>
                <th className="px-3 py-2 font-semibold">Descripción</th>
                <th className="px-3 py-2 text-right font-semibold">Contab.</th>
                <th className="px-3 py-2 text-right font-semibold">Módulo</th>
                <th className="px-3 py-2 text-right font-semibold">Diferencia</th>
                <th className="px-3 py-2 text-right font-semibold">% Var.</th>
                <th className="px-3 py-2 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const st = statusOf(r.diff, materiality, r.manualStatus);
                const variation = r.cont !== 0 ? (r.diff / r.cont) * 100 : 0;
                const nc = commentsByAccount(r.cuenta).length;
                return (
                  <tr key={r.id} onClick={() => setSelected(r.cuenta)} className={`cursor-pointer border-b border-ink-50 last:border-0 ${selected === r.cuenta ? "bg-blue-50" : "hover:bg-ink-50"}`}>
                    <td className="px-3 py-2 font-mono text-ink-700">{r.cuenta}{nc > 0 && <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-ai-100 px-1.5 text-[10px] font-semibold text-ai-700"><Icon name="msg" size={9} />{nc}</span>}</td>
                    <td className="px-3 py-2 text-ink-700">{r.desc}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-700">{fmt(r.cont)}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-700">{fmt(r.mod)}</td>
                    <td className={`px-3 py-2 text-right font-mono ${r.diff === 0 ? "text-ink-400" : r.diff > 0 ? "text-ok-700" : "text-err-700"}`}>{fmt(r.diff)}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-500">{r.diff === 0 ? "—" : fmtPct(variation)}</td>
                    <td className="px-3 py-2"><Chip label={st.label} tone={st.tone} /></td>
                  </tr>
                );
              })}
              <tr className="bg-navy-800 text-white">
                <td className="px-3 py-2.5 font-semibold" colSpan={2}>TOTALES</td>
                <td className="px-3 py-2.5 text-right font-mono">{fmt(rows.reduce((s, r) => s + r.cont, 0))}</td>
                <td className="px-3 py-2.5 text-right font-mono">{fmt(rows.reduce((s, r) => s + r.mod, 0))}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[#FF9991]">{fmt(rows.reduce((s, r) => s + r.diff, 0))}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[#FF9991]" colSpan={2}>{fmtPct(rows.reduce((s, r) => s + r.cont, 0) !== 0 ? (rows.reduce((s, r) => s + r.diff, 0) / rows.reduce((s, r) => s + r.cont, 0)) * 100 : 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Panel lateral */}
      {sel && (
        <Card className="self-start">
          <div className="border-b border-ink-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[12px] text-ink-500">{sel.cuenta}</span>
              <Chip label={statusOf(sel.diff, materiality, sel.manualStatus).label} tone={statusOf(sel.diff, materiality, sel.manualStatus).tone} />
              <span className="ml-auto"><Chip label={`${sel.items} ítems`} tone="ink" /></span>
            </div>
            <h3 className="mt-1 text-[13px] font-semibold text-ink-800">{sel.desc}</h3>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-[12px]">
            <KV label="Saldo contabilidad" value={fmt(sel.cont)} />
            <KV label="Saldo módulo" value={fmt(sel.mod)} />
            <KV label="Diferencia" value={fmt(sel.diff)} />
            <KV label="Variación" value={sel.cont !== 0 ? fmtPct((sel.diff / sel.cont) * 100) : "—"} />
          </div>
          <div className="flex items-center gap-1 border-y border-ink-100 px-3 py-1.5">
            <PanelTab on={tab === "comments"} onClick={() => setTab("comments")} label="Comentarios" count={commentsByAccount(sel.cuenta).length} />
            <PanelTab on={tab === "detalle"} onClick={() => setTab("detalle")} label="Detalle" />
            <PanelTab on={tab === "acciones"} onClick={() => setTab("acciones")} label="Acciones" />
          </div>

          {tab === "comments" && (
            <div className="px-4 py-3">
              <div className="flex flex-col gap-3">
                {commentsByAccount(sel.cuenta).length === 0 && <p className="text-[12px] text-ink-400">Sin comentarios para esta cuenta.</p>}
                {commentsByAccount(sel.cuenta).map((c) => (
                  <div key={c.id} className="flex gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[10px] font-semibold text-white">{c.initials}</div>
                    <div className="text-[12px] text-ink-700">
                      <div><b>{c.who}</b> <span className="text-ink-400">· {c.time}</span></div>
                      <div className="mt-0.5 leading-snug">{c.text}</div>
                    </div>
                  </div>
                ))}
              </div>
              <ActionForm
                action={addReconciliationComment}
                successMessage="Comentario registrado."
                errorMessage="No se pudo registrar el comentario."
                className="mt-3"
                resetOnSuccess
                onSuccess={() => router.refresh()}
              >
                {(pending) => (
                  <>
                    <input type="hidden" name="reconciliationId" value={reconciliationId} />
                    <input type="hidden" name="cuenta" value={sel.cuenta} />
                    <textarea name="text" rows={3} placeholder="Escribe una observación o asigna a un compañero con @…" className="w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-blue-400" />
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-[11px] text-ink-400">Visible para auditores asignados al cruce</span>
                      <button type="submit" disabled={pending} className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"><Icon name="send" size={13} /> {pending ? "Comentando…" : "Comentar"}</button>
                    </div>
                  </>
                )}
              </ActionForm>
            </div>
          )}

          {tab === "detalle" && (
            <div className="grid grid-cols-1 gap-2 px-4 py-3 text-[12px]">
              <KV label="Bodegas afectadas" value="BOD-01, BOD-02" />
              <KV label="Última transacción" value="31/03/2026 23:48" />
              <KV label="Origen del registro" value="SIESA módulo INV" />
              <button disabled title="Descarga — fase posterior" className="mt-1 inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-ink-100 px-2.5 py-1.5 text-[12px] font-semibold text-ink-400"><Icon name="download" size={13} /> Descargar detalle de la cuenta</button>
            </div>
          )}

          {tab === "acciones" && (
            <div className="flex flex-col gap-2 px-4 py-3">
              <RowAction reconciliationId={reconciliationId} rowId={sel.id} status="conciliada" icon="check" label="Marcar como conciliada manualmente" />
              <button disabled title="Reasignación — fase posterior" className="inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-ink-150 px-2.5 py-2 text-left text-[12.5px] text-ink-400"><Icon name="users" size={14} /> Asignar a otro auditor</button>
              <RowAction reconciliationId={reconciliationId} rowId={sel.id} status="ajuste" icon="warn" label="Solicitar ajuste contable" />
              <RowAction reconciliationId={reconciliationId} rowId={sel.id} status="excepcion" icon="x" label="Marcar como excepción" danger />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function RowAction({ reconciliationId, rowId, status, icon, label, danger }: { reconciliationId: number; rowId: number; status: string; icon: "check" | "warn" | "x"; label: string; danger?: boolean }) {
  const router = useRouter();

  return (
    <ActionForm
      action={setRowStatus}
      successMessage="Partida actualizada."
      errorMessage="No se pudo actualizar la partida."
      showInlineError={false}
      onSuccess={() => router.refresh()}
    >
      {(pending) => (
        <>
          <input type="hidden" name="reconciliationId" value={reconciliationId} />
          <input type="hidden" name="rowId" value={rowId} />
          <input type="hidden" name="status" value={status} />
          <button type="submit" disabled={pending} className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-[12.5px] disabled:opacity-60 ${danger ? "border-err-100 bg-err-100 text-err-700 hover:opacity-80" : "border-ink-150 text-ink-700 hover:bg-ink-50"}`}><Icon name={icon} size={14} /> {pending ? "Actualizando…" : label}</button>
        </>
      )}
    </ActionForm>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className="mt-0.5 font-mono text-ink-800">{value}</div>
    </div>
  );
}

function PanelTab({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-[12px] font-medium ${on ? "bg-ink-100 text-ink-900" : "text-ink-500 hover:bg-ink-50"}`}>{label}{count != null && count > 0 && <span className="rounded-full bg-ai-100 px-1 text-[10px] font-semibold text-ai-700">{count}</span>}</button>
  );
}
