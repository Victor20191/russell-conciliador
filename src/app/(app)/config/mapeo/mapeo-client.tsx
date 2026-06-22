"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Card, Chip, StatCard, EmptyState } from "@/components/ui";
import {
  PageSizeSelect,
  PaginationFooter,
  usePagination,
} from "@/components/pagination-controls";
import { ActionForm } from "@/components/action-form";
import { updateAccountMapping, suggestMappingsAI } from "@/app/actions/mapping";

export type Account = { id: number; code: string; level: number; name: string; russellCode: string | null };
export type RussellOpt = { code: string; name: string; module: string | null };
export type StdAccount = {
  code: string;
  name: string;
  level: number;
  nature: string;
  critical: boolean;
  russellAccount: string | null;
  categoryType: string | null;
  includes: string | null;
  supportingDocuments: string | null;
  mappingNotes: string | null;
};

type Tab = "mapping" | "standard";

// Estado de parametrización por módulo (metadata demo; el conteo se deriva de los mapeos).
const MODULE_STATUS: Record<string, "ok" | "partial" | "missing"> = {
  "Caja": "ok", "Bancos": "ok", "Cartera": "partial", "Inventarios": "ok",
  "Activos fijos": "missing", "Cuentas por pagar": "ok", "DIAN": "partial",
  "Nómina": "missing", "Ingresos": "ok",
};
const STATE_LABEL: Record<string, { label: string; tone: "ok" | "warn" | "err" }> = {
  ok: { label: "Parametrizado", tone: "ok" },
  partial: { label: "Parametrizado parcial", tone: "warn" },
  missing: { label: "Sin parametrizar", tone: "err" },
};

export default function MapeoClient({
  clientNames, cliente, accounts, options, std,
}: {
  clientNames: string[]; cliente: string; accounts: Account[]; options: RussellOpt[]; std: StdAccount[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("mapping");
  const [q, setQ] = useState("");
  const [level, setLevel] = useState<"all" | "4" | "6" | "8">("all");

  const optByCode = useMemo(() => new Map(options.map((o) => [o.code, o])), [options]);
  const stats = useMemo(() => ({
    total: accounts.length,
    n4: accounts.filter((a) => a.level === 4).length,
    n6: accounts.filter((a) => a.level === 6).length,
    n8: accounts.filter((a) => a.level === 8).length,
    mapped: accounts.filter((a) => a.russellCode).length,
  }), [accounts]);
  const modulesOk = Object.values(MODULE_STATUS).filter((s) => s === "ok").length;

  // Conteo por módulo derivado de los mapeos actuales
  const moduleCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of accounts) {
      const opt = a.russellCode ? optByCode.get(a.russellCode) : null;
      if (opt?.module) m[opt.module] = (m[opt.module] ?? 0) + 1;
    }
    return m;
  }, [accounts, optByCode]);

  const rows = accounts
    .filter((a) => level === "all" || a.level === Number(level))
    .filter((a) => !q || a.code.includes(q) || a.name.toLowerCase().includes(q.toLowerCase()));
  const pg = usePagination(rows, 50);

  const coverage = stats.total > 0 ? Math.round((stats.mapped / stats.total) * 100) : 0;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <TabBtn on={tab === "mapping"} onClick={() => setTab("mapping")} label="Mapeo por cliente" count={accounts.length} />
        <TabBtn on={tab === "standard"} onClick={() => setTab("standard")} label="Plan estándar Russell" count={std.length} />
      </div>

      {tab === "mapping" ? (
        <>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Cliente</div>
          <div className="mt-1 text-[15px] font-semibold text-ink-900">{cliente}</div>
          <div className="mt-1 text-[12px] text-ink-500">PUC del cliente</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Cuentas del cliente</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-ink-900">{stats.total}</div>
          <div className="mt-1 flex gap-1.5">
            <Chip label={`N4 · ${stats.n4}`} tone="ink" /><Chip label={`N6 · ${stats.n6}`} tone="ink" /><Chip label={`N8 · ${stats.n8}`} tone="ink" />
          </div>
        </Card>
        <StatCard label="Parametrizadas" value={String(stats.mapped)} hint={`${coverage}% cobertura`} tone="ok" />
        <StatCard label="Módulos de conciliación" value={`${modulesOk}/9`} hint="Parametrizados para este cliente" tone="blue" />
      </div>

      {/* Leyenda 3 segmentos */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-ink-500">
        <span className="rounded-md bg-ink-50 px-2.5 py-1.5"><b className="text-ink-700">Cuenta del cliente</b> · PUC del ERP (N4/N6/N8)</span>
        <Icon name="chev-r" size={12} />
        <span className="rounded-md bg-ink-50 px-2.5 py-1.5"><b className="text-ink-700">Cuenta Russell</b> · selector contra el estándar</span>
        <Icon name="chev-r" size={12} />
        <span className="rounded-md bg-ink-50 px-2.5 py-1.5"><b className="text-ink-700">Conciliación</b> · módulo + estado</span>
      </div>

      {/* Tabla */}
      <Card className="mt-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
          <h2 className="text-[13px] font-semibold text-ink-800">Parametrización cuenta a cuenta</h2>
          <select
            value={cliente}
            onChange={(e) => router.push(`/config/mapeo?cliente=${encodeURIComponent(e.target.value)}`)}
            className="rounded-md border border-ink-200 px-2 py-1 text-[12px] text-ink-700 outline-none"
          >
            {clientNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-ink-200 text-[11.5px]">
              {(["all", "4", "6", "8"] as const).map((l) => (
                <button key={l} onClick={() => { setLevel(l); pg.resetToFirstPage(); }} className={`px-2.5 py-1 ${level === l ? "bg-navy-800 text-white" : "bg-white text-ink-600 hover:bg-ink-50"}`}>{l === "all" ? "Todos" : `N${l}`}</button>
              ))}
            </div>
            <input value={q} onChange={(e) => { setQ(e.target.value); pg.resetToFirstPage(); }} placeholder="Filtrar por código o nombre…" className="rounded-md border border-ink-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-blue-400" />
            <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
            <ActionForm
              action={suggestMappingsAI}
              successMessage="Sugerencias IA aplicadas."
              errorMessage="No se pudieron generar sugerencias IA."
              showInlineError={false}
              onSuccess={() => router.refresh()}
            >
              {(pending) => (
                <>
                  <input type="hidden" name="clientName" value={cliente} />
                  <button
                    type="submit"
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 rounded-md border border-ai-100 bg-ai-100 px-2.5 py-1.5 text-[12px] font-semibold text-ai-700 hover:opacity-80 disabled:opacity-60"
                  >
                    <Icon name="ai" size={13} /> {pending ? "Sugiriendo…" : "Sugerencias IA"}
                  </button>
                </>
              )}
            </ActionForm>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon="doc" title="Sin cuentas para este cliente" description="Este cliente no tiene un PUC cargado en el repositorio de mapeo." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                  <th className="px-3 py-2 font-semibold">Nivel</th>
                  <th className="px-3 py-2 font-semibold">Código</th>
                  <th className="px-3 py-2 font-semibold">Nombre cuenta (ERP)</th>
                  <th className="px-3 py-2 font-semibold">Cuenta Russell</th>
                  <th className="px-3 py-2 font-semibold">Módulo · estado</th>
                </tr>
              </thead>
              <tbody>
                {pg.pageItems.map((a) => {
                  const opt = a.russellCode ? optByCode.get(a.russellCode) : null;
                  const mod = opt?.module ?? null;
                  const st = mod ? MODULE_STATUS[mod] : null;
                  return (
                    <tr key={a.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                      <td className="px-3 py-2"><Chip label={`N${a.level}`} tone="ink" /></td>
                      <td className="px-3 py-2 font-mono text-ink-600" style={{ paddingLeft: a.level === 4 ? 12 : a.level === 6 ? 28 : 48 }}>{a.code}</td>
                      <td className="px-3 py-2 text-ink-800">{a.level !== 4 && <span className="mr-1 text-ink-300">└</span>}{a.name}</td>
                      <td className="px-3 py-2">
                        <ActionForm
                          action={updateAccountMapping}
                          successMessage="Mapeo actualizado."
                          errorMessage="No se pudo actualizar el mapeo."
                          showInlineError={false}
                          onSuccess={() => router.refresh()}
                        >
                          {(pending) => (
                            <>
                              <input type="hidden" name="id" value={a.id} />
                              <select
                                name="russell"
                                defaultValue={a.russellCode ?? ""}
                                disabled={pending}
                                onChange={(e) => e.currentTarget.form?.requestSubmit()}
                                className="w-full rounded-md border border-ink-200 px-2 py-1 text-[12px] outline-none focus:border-blue-400 disabled:bg-ink-50 disabled:text-ink-400"
                              >
                                <option value="">— Sin parametrizar —</option>
                                {options.map((o) => <option key={o.code} value={o.code}>{o.code} · {o.name}</option>)}
                              </select>
                            </>
                          )}
                        </ActionForm>
                      </td>
                      <td className="px-3 py-2">
                        {!a.russellCode ? <span className="italic text-ink-400">—</span>
                          : !mod ? <span className="text-ink-500">No participa en conciliaciones</span>
                          : <span className="inline-flex items-center gap-1.5"><Chip label={mod} tone="blue" /><Chip label={STATE_LABEL[st!].label} tone={STATE_LABEL[st!].tone} /></span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 px-4 py-2.5 text-[11.5px] text-ink-500">
          <span>{stats.mapped} parametrizadas de {stats.total}</span>
          <span>Última actualización: 08/Ene/2026 11:32 · Manuela Gutiérrez</span>
        </div>
        <PaginationFooter
          rangeLabel={pg.rangeLabel}
          currentPage={pg.page}
          totalPages={pg.totalPages}
          onPageChange={pg.setPage}
        />
      </Card>

      {/* Resumen por módulo */}
      <Card className="mt-4">
        <div className="border-b border-ink-100 px-4 py-3 text-[13px] font-semibold text-ink-800">Estado de parametrización por módulo</div>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
          {Object.entries(MODULE_STATUS).map(([mod, state]) => (
            <div key={mod} className="rounded-md border border-ink-150 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-ink-800">{mod}</span>
                <Chip label={STATE_LABEL[state].label} tone={STATE_LABEL[state].tone} />
              </div>
              <div className="mt-1 text-[11.5px] text-ink-500">{moduleCounts[mod] ?? 0} cuentas</div>
            </div>
          ))}
        </div>
      </Card>
        </>
      ) : (
        <StandardTab std={std} />
      )}
    </div>
  );
}

function StandardTab({ std }: { std: StdAccount[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const rows = std.filter((s) => {
    if (!needle) return true;
    return [s.code, s.name, s.russellAccount, s.categoryType, s.includes, s.mappingNotes]
      .some((value) => value?.toLowerCase().includes(needle));
  });
  const pg = usePagination(rows, 50);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
        <h2 className="text-[13px] font-semibold text-ink-800">Plan de cuentas estándar — Russell Bedford</h2>
        <Chip label={`${pg.total} cuentas`} tone="ink" />
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              pg.resetToFirstPage();
            }}
            placeholder="filtrar cuenta, rubro o soporte"
            className="w-72 rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400"
          />
          <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2 font-semibold">Código</th>
              <th className="px-4 py-2 font-semibold">Nombre PUC</th>
              <th className="px-4 py-2 font-semibold">Cuenta Russell</th>
              <th className="px-4 py-2 font-semibold">Tipo rubro</th>
              <th className="px-4 py-2 font-semibold">Naturaleza</th>
              <th className="px-4 py-2 font-semibold">Qué incluye</th>
              <th className="px-4 py-2 font-semibold">Soportes</th>
              <th className="px-4 py-2 font-semibold">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {pg.pageItems.map((s) => (
              <tr key={s.code} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                <td className="px-4 py-2.5 font-mono text-ink-600" style={{ paddingLeft: (s.level - 1) * 16 + 16 }}>{s.code}</td>
                <td className="min-w-56 px-4 py-2.5 font-medium text-ink-800">{s.name}</td>
                <td className="min-w-44 px-4 py-2.5 text-ink-700">{s.russellAccount ?? "—"}</td>
                <td className="min-w-56 px-4 py-2.5 text-ink-600">{s.categoryType ?? "—"}</td>
                <td className="px-4 py-2.5"><Chip label={s.nature === "D" ? "Débito" : "Crédito"} tone="ink" /></td>
                <td className="max-w-md whitespace-normal px-4 py-2.5 leading-relaxed text-ink-600">{s.includes ?? "—"}</td>
                <td className="max-w-xs whitespace-normal px-4 py-2.5 leading-relaxed text-ink-500">{s.supportingDocuments ?? "—"}</td>
                <td className="max-w-md whitespace-normal px-4 py-2.5 leading-relaxed text-ink-500">{s.mappingNotes ?? "—"}</td>
              </tr>
            ))}
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
