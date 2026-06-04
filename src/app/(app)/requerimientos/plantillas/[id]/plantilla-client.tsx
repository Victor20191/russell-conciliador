"use client";

import { useState } from "react";
import { Card, Chip, EmptyState } from "@/components/ui";

export type Family = { id: string; name: string; items: string[] };
export type Header = { firmName: string; city: string; asunto: string; intro: string; noteGeneric: string; closing: string; signatoryName: string; signatoryRole: string; signatoryFooter: string; consecutivePrefix: string; contactEmails: string[] };

export default function PlantillaClient({ families, header }: { families: Family[]; header: Header | null }) {
  const [section, setSection] = useState<"families" | "header">("families");
  const [activeFam, setActiveFam] = useState(families[0]?.id ?? "");
  const fam = families.find((f) => f.id === activeFam) ?? families[0];

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <SecBtn on={section === "families"} onClick={() => setSection("families")} label="Familias y documentos" />
        <SecBtn on={section === "header"} onClick={() => setSection("header")} label="Encabezado de carta" />
      </div>

      {section === "families" && (
        families.length === 0 ? <EmptyState icon="folder" title="Sin familias" description="Esta plantilla usa la estructura estándar; el detalle editable está disponible en la plantilla de Cierre." /> : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <Card className="self-start">
              <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-2.5"><span className="text-[12px] font-semibold text-ink-700">Familias</span><Chip label={String(families.length)} tone="ink" /></div>
              <div className="flex flex-col p-1.5">
                {families.map((f) => (
                  <button key={f.id} onClick={() => setActiveFam(f.id)} className={`flex items-center justify-between rounded px-2.5 py-2 text-left text-[12px] ${f.id === activeFam ? "bg-blue-50 font-semibold text-navy-700" : "text-ink-600 hover:bg-ink-50"}`}>{f.name}<span className="font-mono text-[11px] text-ink-400">{f.items.length}</span></button>
                ))}
              </div>
            </Card>
            <Card className="self-start">
              <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3"><h2 className="text-[13px] font-semibold text-ink-800">{fam?.name}</h2><Chip label={`${fam?.items.length} ítems`} tone="ink" /></div>
              <ol className="list-decimal space-y-1.5 px-7 py-3 text-[12.5px] text-ink-700 marker:text-ink-400">
                {fam?.items.map((it, i) => <li key={i} className="pl-1">{it}</li>)}
              </ol>
            </Card>
          </div>
        )
      )}

      {section === "header" && (
        header == null ? <EmptyState icon="doc" title="Sin encabezado" description="El encabezado de carta editable está disponible en la plantilla de Cierre." /> : (
          <Card className="max-w-3xl p-5 text-[12.5px]">
            <Field label="Razón social" value={header.firmName} />
            <Field label="Ciudad" value={header.city} />
            <Field label="Asunto" value={header.asunto} />
            <Field label="Introducción" value={header.intro} multiline />
            <Field label="Nota genérica" value={header.noteGeneric} multiline />
            <Field label="Cierre" value={header.closing} multiline />
            <Field label="Firma" value={`${header.signatoryName} · ${header.signatoryRole} · ${header.signatoryFooter}`} />
            <Field label="Correos de contacto" value={header.contactEmails.join(", ")} />
          </Card>
        )
      )}
    </div>
  );
}

function Field({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="mb-3">
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">{label}</div>
      <div className={`mt-0.5 text-ink-800 ${multiline ? "whitespace-pre-line leading-relaxed" : ""}`}>{value}</div>
    </div>
  );
}

function SecBtn({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return <button onClick={onClick} className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${on ? "bg-navy-800 text-white" : "text-ink-600 hover:bg-ink-100"}`}>{label}</button>;
}
