"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Card, Chip, StatCard, EmptyState } from "@/components/ui";
import {
  PageSizeSelect,
  PaginationFooter,
  usePagination,
} from "@/components/pagination-controls";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import { notifyActionState } from "@/lib/client-notifications";
import { updateAccountMapping, suggestMappingsAI } from "@/app/actions/mapping";
import {
  createStandardAccount,
  updateStandardAccount,
  deleteStandardAccount,
} from "@/app/actions/standard-accounts";

export type Account = { id: number; code: string; level: number; name: string; russellCode: string | null };
export type RussellOpt = { code: string; name: string; module: string | null };
export type StdAccount = {
  id: number;
  code: string;
  name: string;
  level: number;
  nature: string;
  parent: string | null;
  critical: boolean;
  russellAccount: string | null;
  categoryType: string | null;
  includes: string | null;
  excludes: string | null;
  possibleAccounts: string | null;
  supportingDocuments: string | null;
  controlSupports: string | null;
  mappingNotes: string | null;
};
/** Fila de la bitácora dedicada del plan estándar (movimientos). */
export type StdLogRow = {
  id: number;
  code: string;
  action: string;
  user: string;
  detail: string;
  createdAt: string; // ISO
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
  clientNames, cliente, accounts, options, std, canManage, logs,
}: {
  clientNames: string[]; cliente: string; accounts: Account[]; options: RussellOpt[]; std: StdAccount[]; canManage: boolean; logs: StdLogRow[];
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
        <StandardTab std={std} canManage={canManage} logs={logs} />
      )}
    </div>
  );
}

function StandardTab({ std, canManage, logs }: { std: StdAccount[]; canManage: boolean; logs: StdLogRow[] }) {
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StdAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StdAccount | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const needle = q.trim().toLowerCase();
  const rows = std.filter((s) => {
    if (!needle) return true;
    return [s.code, s.name, s.russellAccount, s.categoryType, s.includes, s.mappingNotes]
      .some((value) => value?.toLowerCase().includes(needle));
  });
  const pg = usePagination(rows, 50);

  return (
    <>
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
          {canManage && (
            <>
              <button
                type="button"
                onClick={() => setLogsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-50"
              >
                <Icon name="log" size={13} /> Bitácora
              </button>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-800"
              >
                Nueva cuenta
              </button>
            </>
          )}
        </div>
      </div>
      {canManage && (
        <div className="border-b border-ink-100 bg-blue-50/40 px-4 py-2 text-[11.5px] text-ink-600">
          Haz clic en el <b>código del sistema</b> para editar la cuenta. Cada cambio (crear, editar, eliminar) queda registrado en la <b>bitácora</b>.
        </div>
      )}
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
              <tr key={s.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                <td className="px-4 py-2.5 font-mono text-ink-600" style={{ paddingLeft: (s.level - 1) * 16 + 16 }}>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => setEditTarget(s)}
                      title="Editar cuenta estándar"
                      className="font-mono font-semibold text-blue-600 hover:underline"
                    >
                      {s.code}
                    </button>
                  ) : (
                    s.code
                  )}
                </td>
                <td className="min-w-56 px-4 py-2.5 font-medium text-ink-800">{s.name}</td>
                <td className="min-w-44 px-4 py-2.5 text-ink-700">{s.russellAccount ?? "—"}</td>
                <td className="min-w-56 px-4 py-2.5 text-ink-600">{s.categoryType ?? "—"}</td>
                <td className="px-4 py-2.5"><Chip label={s.nature === "D" ? "Débito" : "Crédito"} tone="ink" /></td>
                <td className="max-w-md whitespace-normal px-4 py-2.5 leading-relaxed text-ink-600">{s.includes ?? "—"}</td>
                <td className="max-w-xs whitespace-normal px-4 py-2.5 leading-relaxed text-ink-500">{s.supportingDocuments ?? "—"}</td>
                <td className="max-w-md whitespace-normal px-4 py-2.5 leading-relaxed text-ink-500">{s.mappingNotes ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-ink-400">Sin cuentas que coincidan con el filtro.</td></tr>
            )}
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

    {canManage && createOpen && (
      <StandardAccountForm mode="create" onClose={() => setCreateOpen(false)} />
    )}
    {canManage && editTarget && (
      <StandardAccountForm
        mode="edit"
        account={editTarget}
        onClose={() => setEditTarget(null)}
        onDelete={() => {
          const t = editTarget;
          setEditTarget(null);
          setDeleteTarget(t);
        }}
      />
    )}
    {canManage && deleteTarget && (
      <DeleteStandardAccountForm account={deleteTarget} onClose={() => setDeleteTarget(null)} />
    )}
    {canManage && logsOpen && (
      <LogsModal logs={logs} onClose={() => setLogsOpen(false)} />
    )}
    </>
  );
}

// ----- Formularios y bitácora del plan estándar (solo Administrador) -----

const INPUT_CLS = "rounded-md border border-ink-200 px-3 py-2 text-[13px] outline-none focus:border-blue-400";
const TEXTAREA_CLS = `${INPUT_CLS} min-h-[64px] resize-y`;

function Campo({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <label className="text-[12px] font-medium text-ink-700">{label}</label>
      {children}
    </div>
  );
}

function StandardAccountForm({
  mode,
  account,
  onClose,
  onDelete,
}: {
  mode: "create" | "edit";
  account?: StdAccount;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const isEdit = mode === "edit";
  const [state, action, pending] = useActionState(
    isEdit ? updateStandardAccount : createStandardAccount,
    undefined,
  );
  const a = account;

  useEffect(() => {
    notifyActionState(state, {
      success: isEdit ? "Cuenta estándar actualizada." : "Cuenta estándar creada.",
      error: isEdit ? "No se pudo actualizar la cuenta." : "No se pudo crear la cuenta.",
    });
    if (state?.ok) onClose();
  }, [state, isEdit, onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      size="3xl"
      title={isEdit ? `Editar cuenta estándar · ${a?.code}` : "Nueva cuenta estándar"}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div>
            {isEdit && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="rounded-md border border-err-200 px-3 py-2 text-[13px] font-semibold text-err-700 hover:bg-err-50"
              >
                Eliminar
              </button>
            )}
          </div>
          <button
            type="submit"
            form="standard-account-form"
            disabled={pending}
            className="rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear cuenta"}
          </button>
        </div>
      }
    >
      <form id="standard-account-form" action={action} className="flex flex-col gap-4">
        {isEdit && <input type="hidden" name="id" value={a!.id} />}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Código del sistema">
            <input name="code" defaultValue={a?.code ?? ""} required className={INPUT_CLS} />
          </Campo>
          <Campo label="Nombre PUC">
            <input name="name" defaultValue={a?.name ?? ""} required className={INPUT_CLS} />
          </Campo>
          <Campo label="Nivel">
            <input name="level" type="number" min={1} max={12} defaultValue={a?.level ?? 1} required className={INPUT_CLS} />
          </Campo>
          <Campo label="Naturaleza">
            <select name="nature" defaultValue={a?.nature ?? "D"} required className={INPUT_CLS}>
              <option value="D">Débito</option>
              <option value="C">Crédito</option>
            </select>
          </Campo>
          <Campo label="Cuenta Russell">
            <input name="russellAccount" defaultValue={a?.russellAccount ?? ""} className={INPUT_CLS} />
          </Campo>
          <Campo label="Tipo rubro">
            <input name="categoryType" defaultValue={a?.categoryType ?? ""} className={INPUT_CLS} />
          </Campo>
          <Campo label="Cuenta padre">
            <input name="parent" defaultValue={a?.parent ?? ""} className={INPUT_CLS} />
          </Campo>
          <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-ink-800">
            <input
              type="checkbox"
              name="critical"
              defaultChecked={a?.critical ?? false}
              className="h-4 w-4 rounded border-ink-300 text-navy-600 focus:ring-navy-600"
            />
            Cuenta crítica
          </label>
          <Campo label="Qué incluye" full>
            <textarea name="includes" defaultValue={a?.includes ?? ""} className={TEXTAREA_CLS} />
          </Campo>
          <Campo label="Qué no incluye" full>
            <textarea name="excludes" defaultValue={a?.excludes ?? ""} className={TEXTAREA_CLS} />
          </Campo>
          <Campo label="Cuentas posibles" full>
            <textarea name="possibleAccounts" defaultValue={a?.possibleAccounts ?? ""} className={TEXTAREA_CLS} />
          </Campo>
          <Campo label="Soportes de terceros" full>
            <textarea name="supportingDocuments" defaultValue={a?.supportingDocuments ?? ""} className={TEXTAREA_CLS} />
          </Campo>
          <Campo label="Soportes de control" full>
            <textarea name="controlSupports" defaultValue={a?.controlSupports ?? ""} className={TEXTAREA_CLS} />
          </Campo>
          <Campo label="Observaciones de homologación" full>
            <textarea name="mappingNotes" defaultValue={a?.mappingNotes ?? ""} className={TEXTAREA_CLS} />
          </Campo>
        </div>

        {state?.message && <p className="text-[12px] text-err-700">{state.message}</p>}
        {state?.errors && (
          <p className="text-[12px] text-err-700">
            {Object.values(state.errors).flat().filter(Boolean)[0]}
          </p>
        )}
      </form>
    </Modal>
  );
}

function DeleteStandardAccountForm({ account, onClose }: { account: StdAccount; onClose: () => void }) {
  const [state, action, pending] = useActionState(deleteStandardAccount, undefined);

  useEffect(() => {
    notifyActionState(state, {
      success: "Cuenta estándar eliminada.",
      error: "No se pudo eliminar la cuenta.",
    });
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Eliminar cuenta estándar"
      footer={
        <button
          type="submit"
          form="delete-standard-account-form"
          disabled={pending}
          className="rounded-md bg-err-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-err-700/90 disabled:opacity-60"
        >
          {pending ? "Eliminando…" : "Eliminar definitivamente"}
        </button>
      }
    >
      <form id="delete-standard-account-form" action={action} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={account.id} />
        <p className="text-[13px] text-ink-600">
          Vas a eliminar permanentemente la cuenta estándar{" "}
          <strong className="font-mono">{account.code}</strong> · {account.name}. Esta acción
          quedará registrada en la bitácora y no se puede deshacer.
        </p>
        {state?.message && <p className="text-[12px] text-err-700">{state.message}</p>}
      </form>
    </Modal>
  );
}

function fmtFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

function logTone(action: string): "ok" | "blue" | "err" | "ink" {
  if (action.includes("CREÓ")) return "ok";
  if (action.includes("EDITÓ")) return "blue";
  if (action.includes("ELIMINÓ")) return "err";
  return "ink";
}

function LogsModal({ logs, onClose }: { logs: StdLogRow[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const rows = logs.filter(
    (l) => !needle || [l.code, l.action, l.user, l.detail].some((v) => v.toLowerCase().includes(needle)),
  );
  const pg = usePagination(rows, 50);

  return (
    <Modal open onClose={onClose} size="3xl" title="Bitácora del plan estándar">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[12px] text-ink-500">
            Movimientos sobre las cuentas estándar (crear · editar · eliminar). {logs.length} registro(s).
          </p>
          <div className="ml-auto flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                pg.resetToFirstPage();
              }}
              placeholder="filtrar por código, acción, usuario…"
              className="w-64 rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400"
            />
            <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
          </div>
        </div>
        <div className="overflow-x-auto rounded-md border border-ink-100">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                <th className="px-3 py-2 font-semibold">Fecha y hora</th>
                <th className="px-3 py-2 font-semibold">Acción</th>
                <th className="px-3 py-2 font-semibold">Código</th>
                <th className="px-3 py-2 font-semibold">Usuario</th>
                <th className="px-3 py-2 font-semibold">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.map((l) => (
                <tr key={l.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11.5px] text-ink-500">{fmtFecha(l.createdAt)}</td>
                  <td className="px-3 py-2"><Chip label={l.action} tone={logTone(l.action)} /></td>
                  <td className="px-3 py-2 font-mono text-ink-700">{l.code}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-800">{l.user}</td>
                  <td className="px-3 py-2 text-ink-600">{l.detail}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-ink-400">Sin movimientos registrados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationFooter
          rangeLabel={pg.rangeLabel}
          currentPage={pg.page}
          totalPages={pg.totalPages}
          onPageChange={pg.setPage}
        />
      </div>
    </Modal>
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
