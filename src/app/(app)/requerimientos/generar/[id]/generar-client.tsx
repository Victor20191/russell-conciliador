"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, BrandMark } from "@/components/icons";
import { Card } from "@/components/ui";
import { Modal } from "@/components/modal";
import { generateRequirement } from "@/app/actions/requerimientos";

export type GenFamily = { name: string; items: string[] };
export type GenHeader = { firmName: string; city: string; asunto: string; intro: string; noteGeneric: string; closing: string; signatoryName: string; signatoryRole: string; signatoryFooter: string; contactEmails: string[] };
export type Contact = { name: string; role: string; email: string; primary: boolean };
type Client = { name: string; nit: string; code: string };

export default function GenerarClient({
  templateCode, templateVersion, header, families, clients, contactsByClient,
}: {
  templateCode: string; templateVersion: string; header: GenHeader; families: GenFamily[]; clients: Client[]; contactsByClient: Record<string, Contact[]>;
}) {
  const router = useRouter();
  const [clientIdx, setClientIdx] = useState(0);
  const client = clients[clientIdx];
  const contacts = useMemo(() => contactsByClient[client.name] ?? [], [contactsByClient, client.name]);
  const [period, setPeriod] = useState("Cierre 2025");
  const [yearC, setYearC] = useState("2025");
  const [cutoff, setCutoff] = useState("31 de diciembre de 2025");
  const [recipients, setRecipients] = useState<string[]>(() => contacts.map((c) => c.email));
  const [sent, setSent] = useState<{ consec: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const yearP = String(Number(yearC) - 1);
  const consec = `RFA 014 – 2026 ${client.code}`;
  const replaceVars = (s: string) => s.replaceAll("{{fecha_corte}}", cutoff).replaceAll("{{cliente}}", client.name).replaceAll("{{año_corte}}", yearC).replaceAll("{{año_anterior}}", yearP);

  const onClientChange = (i: number) => { setClientIdx(i); setRecipients((contactsByClient[clients[i].name] ?? []).map((c) => c.email)); };
  const toggle = (email: string) => setRecipients((r) => (r.includes(email) ? r.filter((e) => e !== email) : [...r, email]));

  const send = async () => {
    setSaving(true);
    const res = await generateRequirement({ templateCode, templateVersion, clientName: client.name, clientCode: client.code, period, recipients: recipients.length });
    setSaving(false);
    setSent({ consec: res.consec });
  };

  const primary = useMemo(() => contacts.filter((c) => c.primary), [contacts]);
  const copyTo = useMemo(() => contacts.filter((c) => !c.primary), [contacts]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
      {/* Configuración */}
      <Card className="self-start p-4">
        <h2 className="mb-3 text-[13px] font-semibold text-ink-800">Configuración del envío</h2>
        <label className="mb-3 block"><span className="text-[11.5px] font-medium text-ink-600">Cliente</span>
          <select value={clientIdx} onChange={(e) => onClientChange(Number(e.target.value))} className="mt-1 w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400">
            {clients.map((c, i) => <option key={c.code} value={i}>{c.name}</option>)}
          </select>
          <span className="mt-1 block text-[11px] text-ink-400">NIT {client.nit} · sufijo {client.code}</span>
        </label>
        <div className="mb-3 flex gap-2">
          <label className="flex-1"><span className="text-[11.5px] font-medium text-ink-600">Período</span><input value={period} onChange={(e) => setPeriod(e.target.value)} className="mt-1 w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400" /></label>
          <label className="w-24"><span className="text-[11.5px] font-medium text-ink-600">Año corte</span><input value={yearC} onChange={(e) => setYearC(e.target.value)} className="mt-1 w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400" /></label>
        </div>
        <label className="mb-3 block"><span className="text-[11.5px] font-medium text-ink-600">Fecha de corte</span><input value={cutoff} onChange={(e) => setCutoff(e.target.value)} className="mt-1 w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400" /></label>
        <div className="mb-3"><span className="text-[11.5px] font-medium text-ink-600">Consecutivo</span><div className="mt-1 rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1.5 font-mono text-[12px] text-ink-600">{consec}</div></div>

        <div className="text-[11.5px] font-medium text-ink-600">Destinatarios</div>
        <div className="mt-1.5 flex flex-col gap-1.5">
          {contacts.map((c) => {
            const on = recipients.includes(c.email);
            return (
              <label key={c.email} className={`flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 ${on ? "border-blue-300 bg-blue-50" : "border-ink-150"}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(c.email)} className="mt-0.5" />
                <div className="text-[12px]"><div className="flex items-center gap-1.5"><b className="text-ink-800">{c.name}</b>{c.primary && <span className="rounded-full bg-blue-100 px-1.5 text-[10px] font-semibold text-navy-700">principal</span>}</div><div className="text-ink-500">{c.role}</div><div className="font-mono text-[11px] text-ink-400">{c.email}</div></div>
              </label>
            );
          })}
        </div>

        <div className="mt-3 flex gap-2">
          <button disabled title="Exportación — fase posterior" className="flex-1 cursor-not-allowed rounded-md bg-ink-100 px-2.5 py-2 text-[12px] font-semibold text-ink-400">PDF</button>
          <button disabled title="Exportación — fase posterior" className="flex-1 cursor-not-allowed rounded-md bg-ink-100 px-2.5 py-2 text-[12px] font-semibold text-ink-400">Word</button>
        </div>
        <button onClick={send} disabled={saving || recipients.length === 0} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-navy-700 px-3 py-2.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"><Icon name="send" size={14} /> {saving ? "Enviando…" : `Enviar por email (${recipients.length})`}</button>
      </Card>

      {/* Vista previa */}
      <Card className="self-start p-0">
        <div className="border-b border-ink-100 px-4 py-2.5 text-[11px] text-ink-400">Vista previa de la carta · A4 · {families.length + 1} secciones</div>
        <div className="overflow-y-auto p-8" style={{ fontFamily: "Georgia, serif", maxHeight: 720 }}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2"><BrandMark size={32} /><div><div className="text-[13px] font-semibold">Russell Bedford</div><div className="text-[10px] uppercase tracking-wider text-ink-500">{header.firmName.toUpperCase()}</div></div></div>
            <div className="text-right text-[11px] text-ink-500">{header.city}, 6 de enero de 2026<div className="font-mono">{consec}</div></div>
          </div>
          <div className="mt-6 text-[12.5px] leading-relaxed text-ink-800">
            <p>Señores</p><p className="font-semibold uppercase">{client.name}</p><p>NIT {client.nit}</p><p>Ciudad.</p>
            {primary.map((c) => <div key={c.email} className="mt-3"><p>Doctor:</p><p className="font-semibold">{c.name}</p><p>{c.role}.</p></div>)}
            {copyTo.length > 0 && <div className="mt-3"><p className="font-semibold">Copia a:</p>{copyTo.map((c) => <p key={c.email}>{c.name} — {c.role}.</p>)}</div>}
            <p className="mt-4"><b>ASUNTO:</b> {replaceVars(header.asunto)}</p>
            <p className="mt-3 whitespace-pre-line">{header.intro}</p>
            <p className="mt-3">{header.noteGeneric}</p>
            <div className="my-4 border-t border-dashed border-ink-300 pt-1 text-center text-[10px] text-ink-300">— documentos solicitados —</div>
            {families.map((f) => (
              <div key={f.name} className="mt-3"><p className="font-semibold">{f.name}</p><ul className="ml-5 list-disc">{f.items.map((it, i) => <li key={i}>{replaceVars(it)}</li>)}</ul></div>
            ))}
            <p className="mt-4">{header.closing}</p>
            <p className="mt-2">A continuación, las direcciones de correo del equipo:</p>
            <ul className="ml-5 list-disc font-mono text-[11px]">{header.contactEmails.map((e) => <li key={e}>{e}</li>)}</ul>
            <div className="mt-6"><p>Cordialmente,</p><div className="mt-6"><p className="font-semibold">{header.signatoryName}</p><p>{header.signatoryRole}</p><p className="text-ink-500">{header.signatoryFooter}</p></div></div>
          </div>
        </div>
      </Card>

      {sent && (
        <Modal open onClose={() => setSent(null)} title="Requerimiento enviado">
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ok-100 text-ok-700"><Icon name="check" size={24} /></div>
            <p className="text-[13px] text-ink-700">Se envió <b>{sent.consec}</b> a <b>{recipients.length} destinatario(s)</b>. Quedó registrado en el historial.</p>
            <div className="mt-1 flex gap-2">
              <button onClick={() => setSent(null)} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] text-ink-600 hover:bg-ink-50">Cerrar</button>
              <button onClick={() => router.push("/requerimientos")} className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600">Ver historial</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
