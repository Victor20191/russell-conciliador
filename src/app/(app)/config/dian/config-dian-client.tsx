"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Card, EmptyState } from "@/components/ui";
import { Modal } from "@/components/modal";
import { saveDianMapping } from "@/app/actions/dian";
import { notifyError, notifySuccess } from "@/lib/client-notifications";

export type DianFormData = {
  id: number; name: string; code: string;
  sections: { id: number; title: string; lines: { k: string; label: string }[] }[];
  mappings: { lineKey: string; account: string; desc: string; sign: string }[];
};
type Row = { account: string; desc: string; sign: string };

export default function ConfigDianClient({ forms }: { forms: DianFormData[] }) {
  const [activeId, setActiveId] = useState(forms[0]?.id ?? 0);
  const [editing, setEditing] = useState<{ lineKey: string; label: string; rows: Row[] } | null>(null);
  const active = forms.find((f) => f.id === activeId) ?? forms[0];
  if (!active) return <EmptyState icon="doc" title="Sin formatos DIAN" description="No hay formatos cargados." />;

  const mapFor = (k: string) => active.mappings.filter((m) => m.lineKey === k);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {forms.map((f) => (
          <button key={f.id} onClick={() => setActiveId(f.id)} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${f.id === active.id ? "bg-navy-800 text-white" : "text-ink-600 hover:bg-ink-100"}`}>
            {f.name} <span className="font-mono text-[11px] opacity-70">{f.code}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {active.sections.map((s) => (
          <Card key={s.id}>
            <div className="border-b border-ink-100 px-4 py-3 text-[13px] font-semibold text-ink-800">{s.title}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500"><th className="px-4 py-2 font-semibold">Casilla</th><th className="px-4 py-2 font-semibold">Renglón</th><th className="px-4 py-2 font-semibold">Cuentas mapeadas</th><th className="px-4 py-2"></th></tr></thead>
                <tbody>
                  {s.lines.map((l) => {
                    const rows = mapFor(l.k);
                    return (
                      <tr key={l.k} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                        <td className="px-4 py-2 font-mono text-[11px] text-ink-500">{l.k}</td>
                        <td className="px-4 py-2 text-ink-800">{l.label}</td>
                        <td className="px-4 py-2">
                          {rows.length === 0 ? <span className="text-[11.5px] italic text-ink-400">Sin mapeo</span> : (
                            <div className="flex flex-wrap gap-1.5">
                              {rows.map((m, i) => (
                                <span key={i} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${m.sign === "+" ? "bg-ok-100 text-ok-700" : "bg-err-100 text-err-700"}`}>{m.sign === "+" ? "+" : "−"} <span className="font-mono">{m.account}</span></span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button onClick={() => setEditing({ lineKey: l.k, label: l.label, rows: rows.map((m) => ({ account: m.account, desc: m.desc, sign: m.sign })) })} className="inline-flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-[11.5px] font-medium text-ink-600 hover:bg-ink-50"><Icon name="settings" size={12} /> Editar</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>

      {editing && (
        <MappingEditor
          formId={active.id}
          lineKey={editing.lineKey}
          label={editing.label}
          initialRows={editing.rows}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function MappingEditor({
  formId, lineKey, label, initialRows, onClose,
}: {
  formId: number; lineKey: string; label: string; initialRows: Row[]; onClose: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initialRows.length ? initialRows : [{ account: "", desc: "", sign: "+" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => setRows((rs) => [...rs, { account: "", desc: "", sign: "+" }]);
  const remove = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await saveDianMapping(formId, lineKey, rows);
    setSaving(false);
    if (!res.ok) {
      const message = res.message ?? "No se pudo guardar el mapeo DIAN.";
      setError(message);
      notifyError(message);
      return;
    }
    notifySuccess(res.message ?? "Mapeo DIAN guardado.");
    router.refresh();
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${lineKey} · Editar mapeo`}
      footer={
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"><Icon name="check" size={13} /> {saving ? "Guardando…" : "Guardar mapeo"}</button>
      }
    >
      <p className="mb-3 text-[12px] text-ink-500">{label}. Las cuentas con signo <b>+</b> suman al saldo contable del renglón; las de signo <b>−</b> restan.</p>
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <select value={r.sign} onChange={(e) => setRow(i, { sign: e.target.value })} className="rounded-md border border-ink-200 px-2 py-1.5 text-[12px] outline-none">
              <option value="+">+ Suma</option>
              <option value="-">− Resta</option>
            </select>
            <input value={r.account} onChange={(e) => setRow(i, { account: e.target.value })} placeholder="240801" className="w-28 rounded-md border border-ink-200 px-2 py-1.5 font-mono text-[12px] outline-none focus:border-blue-400" />
            <input value={r.desc} onChange={(e) => setRow(i, { desc: e.target.value })} placeholder="Descripción de la cuenta" className="flex-1 rounded-md border border-ink-200 px-2 py-1.5 text-[12px] outline-none focus:border-blue-400" />
            <button onClick={() => remove(i)} title="Eliminar" className="rounded p-1 text-err-500 hover:bg-err-100"><Icon name="x" size={14} /></button>
          </div>
        ))}
      </div>
      <button onClick={add} className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-500 hover:underline"><Icon name="plus" size={13} /> Agregar cuenta</button>
      {error && <p role="alert" className="mt-2 text-[12px] font-medium text-err-700">{error}</p>}
    </Modal>
  );
}
