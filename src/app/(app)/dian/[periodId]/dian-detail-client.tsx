"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Card, Chip } from "@/components/ui";
import { fmt } from "@/lib/format";
import { addDianComment, requestDianAiAnalysis } from "@/app/actions/dian";

export type Line = { k: string; label: string; decl: number; cont: number; diff: number };
export type Section = { id: number; key: string; title: string; side: string; note: string | null; lines: Line[] };
export type Mapping = { lineKey: string; account: string; desc: string; sign: string };
export type Comment = { id: number; lineKey: string; who: string; initials: string; text: string; time: string; isAI: boolean };

function lineStatus(l: Line, hasMapping: boolean): { label: string; tone: "ok" | "warn" | "err" } {
  if (!hasMapping) return { label: "Sin mapeo", tone: "warn" };
  if (l.diff === 0 || Math.abs(l.diff) < 1000) return { label: "OK", tone: "ok" };
  return { label: "Diferencia", tone: "err" };
}

export default function DianDetailClient({
  formId, formName, periodId, sections, mappings, comments,
}: {
  formId: number; formName: string; periodId: number; sections: Section[]; mappings: Mapping[]; comments: Comment[];
}) {
  const [activeSection, setActiveSection] = useState(sections[0]?.id ?? 0);
  const allLines = sections.flatMap((s) => s.lines);
  const [selectedKey, setSelectedKey] = useState(allLines.find((l) => l.diff !== 0)?.k ?? allLines[0]?.k ?? "");

  const mappingFor = (k: string) => mappings.filter((m) => m.lineKey === k);
  const commentsFor = (k: string) => comments.filter((c) => c.lineKey === k);
  const sec = sections.find((s) => s.id === activeSection) ?? sections[0];
  const sel = allLines.find((l) => l.k === selectedKey) ?? allLines[0];

  const secTotal = (s: Section) => s.lines.reduce((a, l) => ({ decl: a.decl + l.decl, cont: a.cont + l.cont, diff: a.diff + l.diff }), { decl: 0, cont: 0, diff: 0 });

  return (
    <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[200px_minmax(0,1fr)_320px]">
      {/* Índice de secciones */}
      <Card className="self-start">
        <div className="border-b border-ink-100 px-4 py-2.5 text-[12px] font-semibold text-ink-700">Índice de {formName}</div>
        <div className="flex flex-col p-1.5">
          {sections.map((s) => {
            const dif = s.lines.filter((l) => l.diff !== 0).length;
            return (
              <button key={s.id} onClick={() => setActiveSection(s.id)} className={`rounded px-2.5 py-2 text-left text-[12px] ${s.id === activeSection ? "bg-blue-50 font-semibold text-navy-700" : "text-ink-600 hover:bg-ink-50"}`}>
                <div>{s.title}</div>
                <div className={`text-[10.5px] ${dif > 0 ? "text-err-700" : "text-ok-700"}`}>{s.lines.length} renglones · {dif > 0 ? `${dif} dif.` : "OK"}</div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Tabla de renglones */}
      <Card className="self-start">
        <div className="border-b border-ink-100 px-4 py-3 text-[13px] font-semibold text-ink-800">{sec?.title}{sec?.note && <span className="ml-2 text-[11px] font-normal text-ink-400">{sec.note}</span>}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500"><th className="px-3 py-2 font-semibold">Casilla</th><th className="px-3 py-2 font-semibold">Concepto</th><th className="px-3 py-2 text-right font-semibold">DIAN</th><th className="px-3 py-2 text-right font-semibold">Contab.</th><th className="px-3 py-2 text-right font-semibold">Diferencia</th><th className="px-3 py-2 font-semibold">Estado</th></tr></thead>
            <tbody>
              {sec?.lines.map((l) => {
                const hasMap = mappingFor(l.k).length > 0;
                const st = lineStatus(l, hasMap);
                const nc = commentsFor(l.k).length;
                return (
                  <tr key={l.k} onClick={() => setSelectedKey(l.k)} className={`cursor-pointer border-b border-ink-50 ${selectedKey === l.k ? "bg-blue-50" : "hover:bg-ink-50"}`}>
                    <td className="px-3 py-2 font-mono text-[11px] text-ink-500">{l.k}</td>
                    <td className="px-3 py-2 text-ink-800">{l.label}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-700">{l.decl === 0 ? "—" : fmt(l.decl)}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-700">{l.cont === 0 ? "—" : fmt(l.cont)}</td>
                    <td className={`px-3 py-2 text-right font-mono ${l.diff === 0 ? "text-ink-400" : l.diff > 0 ? "text-ok-700" : "text-err-700"}`}>{l.diff === 0 ? "$ 0" : fmt(l.diff)}</td>
                    <td className="px-3 py-2"><span className="inline-flex items-center gap-1"><Chip label={st.label} tone={st.tone} />{nc > 0 && <span className="inline-flex items-center gap-0.5 rounded-full bg-ai-100 px-1.5 text-[10px] font-semibold text-ai-700"><Icon name="msg" size={9} />{nc}</span>}</span></td>
                  </tr>
                );
              })}
              {sec && (() => { const t = secTotal(sec); return (
                <tr className="bg-navy-800 text-white"><td className="px-3 py-2.5 font-semibold" colSpan={2}>TOTAL {sec.title}</td><td className="px-3 py-2.5 text-right font-mono">{fmt(t.decl)}</td><td className="px-3 py-2.5 text-right font-mono">{fmt(t.cont)}</td><td className="px-3 py-2.5 text-right font-mono text-[#FF9991]">{fmt(t.diff)}</td><td></td></tr>
              ); })()}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Panel del renglón */}
      {sel && (
        <Card className="self-start">
          <div className="border-b border-ink-100 px-4 py-3">
            <div className="font-mono text-[11px] text-ink-500">{sel.k}</div>
            <h3 className="mt-0.5 text-[12.5px] font-semibold text-ink-800">{sel.label}</h3>
          </div>
          <div className="grid grid-cols-1 gap-1.5 border-b border-ink-100 px-4 py-3 text-[12px]">
            <KV label="Declaración DIAN" value={fmt(sel.decl)} />
            <KV label="Contabilidad" value={fmt(sel.cont)} />
            <KV label="Diferencia" value={fmt(sel.diff)} />
          </div>
          <div className="border-b border-ink-100 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Cuentas mapeadas</div>
            <div className="mt-2 flex flex-col gap-1.5">
              {mappingFor(sel.k).length === 0 ? <span className="text-[12px] italic text-ink-400">Sin mapeo configurado</span> : mappingFor(sel.k).map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px]"><Chip label={m.sign === "+" ? "+" : "−"} tone={m.sign === "+" ? "ok" : "err"} /><span className="font-mono text-ink-700">{m.account}</span><span className="text-ink-500">{m.desc}</span></div>
              ))}
            </div>
          </div>
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Observaciones {commentsFor(sel.k).length > 0 && <Chip label={String(commentsFor(sel.k).length)} tone="ai" />}</div>
            <div className="mt-2 flex flex-col gap-2.5">
              {commentsFor(sel.k).length === 0 && <span className="text-[12px] text-ink-400">Sin observaciones.</span>}
              {commentsFor(sel.k).map((c) => (
                <div key={c.id} className={`rounded-md px-2.5 py-2 ${c.isAI ? "bg-ai-100" : ""}`}>
                  <div className="flex items-center gap-1.5 text-[11.5px]"><b>{c.who}</b>{c.isAI && <Chip label="IA" tone="ai" />}<span className="text-ink-400">· {c.time}</span></div>
                  <div className="mt-0.5 text-[12px] leading-snug text-ink-700">{c.text}</div>
                </div>
              ))}
            </div>
            <form action={addDianComment} className="mt-3">
              <input type="hidden" name="formId" value={formId} /><input type="hidden" name="lineKey" value={sel.k} /><input type="hidden" name="periodId" value={periodId} />
              <textarea name="text" rows={2} placeholder="Agregar observación, asignar con @…" className="w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-blue-400" />
              <div className="mt-1.5 flex justify-end">
                <button type="submit" className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600"><Icon name="send" size={13} /> Comentar</button>
              </div>
            </form>
            <form action={requestDianAiAnalysis} className="mt-2">
              <input type="hidden" name="formId" value={formId} /><input type="hidden" name="lineKey" value={sel.k} /><input type="hidden" name="periodId" value={periodId} /><input type="hidden" name="diff" value={sel.diff} />
              <button type="submit" className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-ai-100 bg-ai-100 px-2.5 py-1.5 text-[12px] font-semibold text-ai-700 hover:opacity-80"><Icon name="ai" size={13} /> Pedir análisis IA</button>
            </form>
          </div>
        </Card>
      )}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between"><span className="text-ink-500">{label}</span><span className="font-mono text-ink-800">{value}</span></div>;
}
