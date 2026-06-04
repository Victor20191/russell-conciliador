"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Card, Chip } from "@/components/ui";

export type Template = { id: string; code: string; name: string; description: string; activeVersion: string; families: number; items: number; timesUsed: number; lastUpdated: string; lastUpdatedBy: string };
export type Submission = { id: string; consec: string; templateCode: string; templateVersion: string; clientName: string; period: string; recipients: number; status: string; date: string };

export default function RequerimientosClient({ templates, history }: { templates: Template[]; history: Submission[] }) {
  const [tab, setTab] = useState<"templates" | "history">("templates");
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <button onClick={() => setTab("templates")} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium ${tab === "templates" ? "bg-navy-800 text-white" : "text-ink-600 hover:bg-ink-100"}`}>Plantillas <span className={`rounded-full px-1.5 text-[10px] font-semibold ${tab === "templates" ? "bg-white/20" : "bg-ink-100 text-ink-500"}`}>{templates.length}</span></button>
        <button onClick={() => setTab("history")} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium ${tab === "history" ? "bg-navy-800 text-white" : "text-ink-600 hover:bg-ink-100"}`}>Historial de envíos <span className={`rounded-full px-1.5 text-[10px] font-semibold ${tab === "history" ? "bg-white/20" : "bg-ink-100 text-ink-500"}`}>{history.length}</span></button>
      </div>

      {tab === "templates" ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500"><th className="px-4 py-2 font-semibold">Código</th><th className="px-4 py-2 font-semibold">Nombre</th><th className="px-4 py-2 font-semibold">Versión</th><th className="px-4 py-2 text-right font-semibold">Familias</th><th className="px-4 py-2 text-right font-semibold">Ítems</th><th className="px-4 py-2 text-right font-semibold">Usos</th><th className="px-4 py-2 font-semibold">Última actualización</th><th className="px-4 py-2"></th></tr></thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                    <td className="px-4 py-2.5 font-mono text-[11.5px] text-ink-600">{t.code}</td>
                    <td className="px-4 py-2.5"><div className="font-medium text-ink-800">{t.name}</div><div className="text-[11px] text-ink-400">{t.description}</div></td>
                    <td className="px-4 py-2.5"><Chip label={`${t.activeVersion} activa`} tone="ok" /></td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-600">{t.families}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-600">{t.items}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-600">{t.timesUsed}</td>
                    <td className="px-4 py-2.5 text-ink-600">{t.lastUpdated}<div className="text-[11px] text-ink-400">{t.lastUpdatedBy}</div></td>
                    <td className="px-4 py-2.5 text-right"><Link href={`/requerimientos/plantillas/${t.id}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-500 hover:underline">Abrir <Icon name="chev-r" size={12} /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500"><th className="px-4 py-2 font-semibold">ID</th><th className="px-4 py-2 font-semibold">Consecutivo</th><th className="px-4 py-2 font-semibold">Plantilla</th><th className="px-4 py-2 font-semibold">Cliente</th><th className="px-4 py-2 font-semibold">Período</th><th className="px-4 py-2 text-right font-semibold">Destinatarios</th><th className="px-4 py-2 font-semibold">Estado</th><th className="px-4 py-2 font-semibold">Fecha</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                    <td className="px-4 py-2.5 font-mono text-[11.5px] text-ink-500">{h.id}</td>
                    <td className="px-4 py-2.5 font-mono text-ink-600">{h.consec}</td>
                    <td className="px-4 py-2.5 text-ink-700">{h.templateCode} {h.templateVersion}</td>
                    <td className="px-4 py-2.5 text-ink-800">{h.clientName}</td>
                    <td className="px-4 py-2.5 text-ink-600">{h.period}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-600">{h.recipients}</td>
                    <td className="px-4 py-2.5"><Chip label={h.status} tone={h.status === "Enviado" ? "ok" : "warn"} /></td>
                    <td className="px-4 py-2.5 text-ink-500">{h.date}</td>
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
