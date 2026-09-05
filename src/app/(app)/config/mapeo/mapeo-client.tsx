"use client";

import { EstadoProcesando } from "@/components/estado-procesando";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Card, Chip, StatCard, EmptyState } from "@/components/ui";
import {
  PageSizeSelect,
  PaginationFooter,
  usePagination,
} from "@/components/pagination-controls";
import { Modal } from "@/components/modal";
import { notifyActionState } from "@/lib/client-notifications";
import { fmtDateTimeLong } from "@/lib/format";
import {
  createStandardAccount,
  updateStandardAccount,
  deleteStandardAccount,
} from "@/app/actions/standard-accounts";
import { crearSubgrupo, editarSubgrupo, eliminarSubgrupo } from "@/app/actions/subgrupos";
import { esExcepcionCuenta } from "@/lib/balance/mapeo-cliente-config";
import { detectarAnomaliasMapeo } from "@/lib/balance/anomalias-mapeo";
import { MapeoClienteTab, HomologacionClienteForm } from "./homologacion-client";
import type { CuentaPucCliente } from "@/lib/balance/catalogo-puc-cliente";

export type Account = CuentaPucCliente;
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

export type Subgrupo = { id: number; codigo: string; nombre: string; grupo: string; nombreGrupo: string; naturaleza: string };

type Tab = "mapping" | "standard" | "subgrupos" | "mapeocliente";

export default function MapeoClient({
  clientNames, cliente, accounts, std, subgrupos, canManage, logs, lockedStdCodes, clienteId, clienteNit, puedeMapear,
}: {
  clientNames: string[]; cliente: string; accounts: Account[]; std: StdAccount[]; subgrupos: Subgrupo[]; canManage: boolean; logs: StdLogRow[]; lockedStdCodes: string[]; clienteId: number | null; clienteNit: string | null; puedeMapear: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("mapeocliente");
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("all");
  const [editTarget, setEditTarget] = useState<Account | null | undefined>(undefined);
  const niveles = useMemo(() => [...new Set(accounts.map((a) => a.level))].sort((a, b) => a - b), [accounts]);
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [soloAnomalias, setSoloAnomalias] = useState(false);
  // Una sola detección para el informe y la vista editable; las cuentas recuperadas
  // del histórico no se interpretan como reglas de la memoria.
  const anomalias = useMemo(() => {
    const m = new Map<string, ReturnType<typeof detectarAnomaliasMapeo>[number]>();
    for (const a of detectarAnomaliasMapeo(accounts.filter((a) => a.enMemoria))) m.set(a.code, a);
    return m;
  }, [accounts]);

  const stdByCode = useMemo(() => new Map(std.map((s) => [s.code, s.name])), [std]);
  const stats = useMemo(() => ({
    total: accounts.length,
    stdMapped: accounts.filter((a) => a.cuenta6Russell).length,
    porConfirmar: accounts.filter((a) => a.cuenta6Russell && (a.coincidencia == null || a.coincidencia < 100)).length,
  }), [accounts]);

  const rows = accounts
    .filter((a) => level === "all" || a.level === Number(level))
    .filter((a) => !soloPendientes || (!!a.cuenta6Russell && (a.coincidencia == null || a.coincidencia < 100)))
    .filter((a) => !soloAnomalias || anomalias.has(a.code))
    .filter((a) => !q || a.code.includes(q) || a.name.toLowerCase().includes(q.toLowerCase()));
  const pg = usePagination(rows, 50);

  const stdCoverage = stats.total > 0 ? Math.round((stats.stdMapped / stats.total) * 100) : 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TabBtn on={tab === "mapeocliente"} onClick={() => setTab("mapeocliente")} label="Mapeo balance/cliente" count={accounts.length} />
        <TabBtn on={tab === "mapping"} onClick={() => setTab("mapping")} label="Mapeo por cliente" count={accounts.length} />
        <TabBtn on={tab === "standard"} onClick={() => setTab("standard")} label="Plan estándar Russell" count={std.length} />
        <TabBtn on={tab === "subgrupos"} onClick={() => setTab("subgrupos")} label="Subgrupos (nivel 4)" count={subgrupos.length} />
        {/* Descarga SOLO el plan estándar Russell (catálogo completo). Vive en la barra de
            pestañas, así que se ve también desde las otras tres: el rótulo dice QUÉ baja
            para que desde «Mapeo por cliente» o «Subgrupos» no se espere el contenido de
            esa pestaña. */}
        <a
          href="/config/mapeo/exportar"
          download
          title="Descargar el plan de cuentas estándar Russell en Excel. Solo baja ese catálogo: no incluye el PUC del cliente, la memoria de mapeo ni los subgrupos."
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 transition hover:bg-ink-50"
        >
          <Icon name="download" size={13} /> Exportar plan estándar
        </a>
      </div>

      {tab === "mapping" ? (
        <>
      {/* El informe comparte el editor de homologación con la vista del PUC. */}
      <div className="mb-4 rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-[11.5px] leading-relaxed text-ink-600">
        <b className="text-ink-700">Informe de consulta.</b> Muestra el PUC completo de <b>{cliente}</b> (todos los niveles) con la
        cuenta estándar que tiene asignada hoy. Puedes corregir una cuenta desde su estándar o administrar el catálogo en <b>Mapeo balance/cliente</b>.
      </div>

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
          <div className="mt-1 flex flex-wrap gap-1.5">
            {niveles.map((n) => <Chip key={n} label={`N${n}`} tone="ink" />)}
          </div>
        </Card>
        <StatCard label="Mapeadas a estándar" value={`${stats.stdMapped}/${stats.total}`} hint={`${stdCoverage}% cobertura`} tone="ok" />
        <StatCard label="Por confirmar" value={String(stats.porConfirmar)} hint="coincidencia < 100%" tone={stats.porConfirmar > 0 ? "warn" : "ok"} />
      </div>

      {/* Leyenda */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-ink-500">
        <span className="rounded-md bg-ink-50 px-2.5 py-1.5"><b className="text-ink-700">Cuenta del cliente</b> · PUC (todos los niveles)</span>
        <Icon name="chev-r" size={12} />
        <span className="rounded-md bg-ink-50 px-2.5 py-1.5"><b className="text-ink-700">Cuenta estándar</b> · plan Russell (6 díg)</span>
        <Icon name="chev-r" size={12} />
        <span className="rounded-md bg-ink-50 px-2.5 py-1.5"><b className="text-ink-700">% + Confirmación</b> · estado del mapeo</span>
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
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap overflow-hidden rounded-md border border-ink-200 text-[11.5px]">
              {["all", ...niveles.map(String)].map((l) => (
                <button key={l} onClick={() => { setLevel(l); pg.resetToFirstPage(); }} className={`px-2.5 py-1 ${level === l ? "bg-navy-800 text-white" : "bg-white text-ink-600 hover:bg-ink-50"}`}>{l === "all" ? "Todos" : `N${l}`}</button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { setSoloPendientes((v) => !v); pg.resetToFirstPage(); }}
              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11.5px] font-medium transition ${soloPendientes ? "border-warn-300 bg-warn-100 text-warn-700" : "border-ink-200 text-ink-600 hover:bg-ink-50"}`}
            >
              <Icon name="warn" size={12} /> Por confirmar{stats.porConfirmar > 0 ? ` (${stats.porConfirmar})` : ""}
            </button>
            {/* Lo que este informe aporta y la vista editable no. Se ordena con los cruces
                de clase primero: son los que mueven saldo de un estado financiero a otro. */}
            <button
              type="button"
              onClick={() => { setSoloAnomalias((v) => !v); pg.resetToFirstPage(); }}
              title="Auxiliares cuya homologación no coincide con la regla de su grupo"
              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11.5px] font-medium transition ${soloAnomalias ? "border-err-300 bg-err-100 text-err-700" : "border-ink-200 text-ink-600 hover:bg-ink-50"}`}
            >
              <Icon name="warn" size={12} /> Revisar{anomalias.size > 0 ? ` (${anomalias.size})` : ""}
            </button>
            <input value={q} onChange={(e) => { setQ(e.target.value); pg.resetToFirstPage(); }} placeholder="Filtrar por código o nombre…" className="rounded-md border border-ink-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-blue-400" />
            <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
          </div>
        </div>

        {rows.length === 0 ? (
          soloAnomalias ? (
            <EmptyState icon="check" title="Sin anomalías" description="Todas las cuentas auxiliares de este cliente siguen la homologación de su grupo." />
          ) : soloPendientes ? (
            <EmptyState icon="check" title="Nada por confirmar" description="Todas las cuentas con mapeo están confirmadas o son coincidencia exacta (100%)." />
          ) : (
            <EmptyState icon="doc" title="Sin cuentas para este cliente" description="Este cliente no tiene un PUC cargado en el repositorio de mapeo." />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                  <th className="px-3 py-2 font-semibold">Nivel</th>
                  <th className="px-3 py-2 font-semibold">Código</th>
                  <th className="px-3 py-2 font-semibold">Nombre cuenta (ERP)</th>
                  <th className="px-3 py-2 font-semibold">Cuenta estándar (balance)</th>
                  <th className="px-3 py-2 font-semibold">% Coincidencia</th>
                  <th className="px-3 py-2 font-semibold">Confirmación</th>
                </tr>
              </thead>
              <tbody>
                {pg.pageItems.map((a) => {
                  const sinMapeo = !a.cuenta6Russell;
                  const confirmado = a.coincidencia != null && a.coincidencia >= 100;
                  return (
                    <tr key={a.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                      <td className="px-3 py-2"><Chip label={`N${a.level}`} tone="ink" /></td>
                      <td className="px-3 py-2 font-mono text-ink-600" style={{ paddingLeft: 12 + Math.max(0, a.level - 4) * 5 }}>{a.code}</td>
                      <td className="px-3 py-2 text-ink-800">
                        {a.level !== 4 && <span className="mr-1 text-ink-400">└</span>}{a.name}
                        {(() => {
                          const an = anomalias.get(a.code);
                          if (!an) return null;
                          const etiqueta = an.cruzaClase
                            ? `Cruza de clase · su grupo va a ${an.cuenta6RussellDelGrupo}`
                            : `Difiere de su grupo (${an.cuenta6RussellDelGrupo})`;
                          return <span className="ml-2"><Chip label={etiqueta} tone={an.cruzaClase ? "err" : "warn"} /></span>;
                        })()}
                      </td>
                      <td className="px-3 py-2">
                        {puedeMapear && a.code.length >= 4 ? (
                          <button type="button" onClick={() => setEditTarget(a)} className="text-left text-blue-600 hover:underline" title={`Editar homologación de ${a.code}`}>{a.cuenta6Russell ? `${a.cuenta6Russell} · ${stdByCode.get(a.cuenta6Russell) ?? ""}` : "Asignar"}</button>
                        ) : sinMapeo ? (
                          <Chip label="Sin mapeo" tone="warn" />
                        ) : (
                          <span className="font-mono text-[11.5px] text-blue-600">{a.cuenta6Russell}{stdByCode.get(a.cuenta6Russell!) ? <span className="ml-1 font-sans text-ink-500">· {stdByCode.get(a.cuenta6Russell!)}</span> : null}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {sinMapeo || a.coincidencia == null ? (
                          <span className="text-ink-400">—</span>
                        ) : (
                          <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${a.coincidencia >= 85 ? "bg-ok-100 text-ok-700" : a.coincidencia >= 55 ? "bg-warn-100 text-warn-700" : "bg-err-100 text-err-700"}`}>{a.coincidencia}%</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {sinMapeo ? (
                          <span className="text-ink-400">—</span>
                        ) : confirmado ? (
                          <Chip label={esExcepcionCuenta(a.origenMapeo) ? "Solo esta cuenta" : a.origenMapeo === "manual" ? "Confirmado" : "Exacto"} tone="ok" />
                        ) : (
                          <Chip label="Por confirmar" tone="warn" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 px-4 py-2.5 text-[11.5px] text-ink-500">
          <span>{stats.stdMapped} mapeadas al estándar de {stats.total}{stats.porConfirmar > 0 ? ` · ${stats.porConfirmar} por confirmar` : ""}{anomalias.size > 0 ? ` · ${anomalias.size} por revisar` : ""}</span>
        </div>
        <PaginationFooter
          rangeLabel={pg.rangeLabel}
          currentPage={pg.page}
          totalPages={pg.totalPages}
          onPageChange={pg.setPage}
        />
      </Card>
        </>
      ) : tab === "mapeocliente" ? (
        <MapeoClienteTab accounts={accounts} std={std} anomalias={anomalias} clienteId={clienteId} clienteNit={clienteNit} puedeMapear={puedeMapear} cliente={cliente} clientNames={clientNames} onEditar={setEditTarget} />
      ) : tab === "standard" ? (
        <StandardTab std={std} canManage={canManage} logs={logs} lockedStdCodes={lockedStdCodes} />
      ) : (
        <SubgruposTab subgrupos={subgrupos} canManage={canManage} />
      )}
      {puedeMapear && clienteId != null && editTarget !== undefined && (
        <HomologacionClienteForm cuenta={editTarget} clienteId={clienteId} std={std} accounts={accounts} onClose={() => setEditTarget(undefined)} />
      )}
    </div>
  );
}

function StandardTab({ std, canManage, logs, lockedStdCodes }: { std: StdAccount[]; canManage: boolean; logs: StdLogRow[]; lockedStdCodes: string[] }) {
  const [q, setQ] = useState("");
  // Códigos de cuenta estándar con balances ya asociados: su código no se puede
  // mover ni la cuenta eliminar (la regla la garantiza la Server Action; aquí
  // solo se bloquea el campo y el botón para evitar el intento).
  const lockedCodes = useMemo(() => new Set(lockedStdCodes), [lockedStdCodes]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StdAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StdAccount | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const needle = q.trim().toLowerCase();
  // Una búsqueda numérica se interpreta SIEMPRE como prefijo del código PUC
  // (escribir «23» debe traer 23xxxx, no cualquier cuenta cuyo texto contenga
  // «23»). El texto libre sigue buscando en todas las columnas.
  const esPrefijoCodigo = /^\d+$/.test(needle);
  const rows = std.filter((s) => {
    if (!needle) return true;
    if (esPrefijoCodigo) return s.code.startsWith(needle);
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
            placeholder="código (23…) o texto: rubro, soporte"
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
        locked={lockedCodes.has(editTarget.code)}
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
  locked,
  onClose,
  onDelete,
}: {
  mode: "create" | "edit";
  account?: StdAccount;
  locked?: boolean;
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
                disabled={locked}
                title={locked ? "No se puede eliminar: la cuenta ya tiene balances asociados." : undefined}
                className="rounded-md border border-err-200 px-3 py-2 text-[13px] font-semibold text-err-700 hover:bg-err-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
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
            {pending ? <EstadoProcesando>Guardando</EstadoProcesando> : isEdit ? "Guardar cambios" : "Crear cuenta"}
          </button>
        </div>
      }
    >
      <form id="standard-account-form" action={action} className="flex flex-col gap-4">
        {isEdit && <input type="hidden" name="id" value={a!.id} />}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Código del sistema">
            <input
              name="code"
              defaultValue={a?.code ?? ""}
              required
              readOnly={locked}
              aria-disabled={locked}
              className={`${INPUT_CLS} ${locked ? "cursor-not-allowed bg-ink-50 text-ink-500" : ""}`}
            />
            {locked && (
              <p className="text-[11px] leading-snug text-ink-500">
                No editable: esta cuenta ya tiene balances de clientes asociados.
              </p>
            )}
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
          {pending ? <EstadoProcesando>Eliminando</EstadoProcesando> : "Eliminar definitivamente"}
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
  return fmtDateTimeLong(iso);
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
          <div className="ml-auto flex flex-wrap items-center gap-2">
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

// ===== Subgrupos del plan estándar (nivel 4) — solo Administrador edita =====

function SubgruposTab({ subgrupos, canManage }: { subgrupos: Subgrupo[]; canManage: boolean }) {
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Subgrupo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Subgrupo | null>(null);
  const needle = q.trim().toLowerCase();
  const rows = subgrupos.filter((s) => !needle || [s.codigo, s.nombre, s.grupo, s.nombreGrupo].some((v) => v.toLowerCase().includes(needle)));
  const pg = usePagination(rows, 50);

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
          <h2 className="text-[13px] font-semibold text-ink-800">Subgrupos del plan estándar (nivel 4)</h2>
          <Chip label={`${pg.total} subgrupos`} tone="ink" />
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); pg.resetToFirstPage(); }}
              placeholder="filtrar código, subgrupo o grupo"
              className="w-72 rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400"
            />
            <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
            {canManage && (
              <button type="button" onClick={() => setCreateOpen(true)} className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-800">
                Nuevo subgrupo
              </button>
            )}
          </div>
        </div>
        {canManage && (
          <div className="border-b border-ink-100 bg-blue-50/40 px-4 py-2 text-[11.5px] text-ink-600">
            Estos nombres alimentan los <b>niveles 4 y 2</b> del balance normalizado. Haz clic en el <b>código</b> para editar.
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                <th className="px-4 py-2 font-semibold">Código (4D)</th>
                <th className="px-4 py-2 font-semibold">Subgrupo</th>
                <th className="px-4 py-2 font-semibold">Grupo (2D)</th>
                <th className="px-4 py-2 font-semibold">Nombre grupo</th>
                <th className="px-4 py-2 font-semibold">Naturaleza</th>
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.map((s) => (
                <tr key={s.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                  <td className="px-4 py-2.5 font-mono text-ink-600">
                    {canManage ? (
                      <button type="button" onClick={() => setEditTarget(s)} title="Editar subgrupo" className="font-mono font-semibold text-blue-600 hover:underline">{s.codigo}</button>
                    ) : (
                      s.codigo
                    )}
                  </td>
                  <td className="min-w-56 px-4 py-2.5 font-medium text-ink-800">{s.nombre}</td>
                  <td className="px-4 py-2.5 font-mono text-ink-500">{s.grupo}</td>
                  <td className="min-w-44 px-4 py-2.5 text-ink-700">{s.nombreGrupo}</td>
                  <td className="px-4 py-2.5"><Chip label={s.naturaleza === "D" ? "Débito" : "Crédito"} tone="ink" /></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-400">Sin subgrupos que coincidan con el filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationFooter rangeLabel={pg.rangeLabel} currentPage={pg.page} totalPages={pg.totalPages} onPageChange={pg.setPage} />
      </Card>

      {canManage && createOpen && <SubgrupoForm mode="create" onClose={() => setCreateOpen(false)} />}
      {canManage && editTarget && (
        <SubgrupoForm
          mode="edit"
          subgrupo={editTarget}
          onClose={() => setEditTarget(null)}
          onDelete={() => { const t = editTarget; setEditTarget(null); setDeleteTarget(t); }}
        />
      )}
      {canManage && deleteTarget && <DeleteSubgrupoForm subgrupo={deleteTarget} onClose={() => setDeleteTarget(null)} />}
    </>
  );
}

function SubgrupoForm({ mode, subgrupo, onClose, onDelete }: { mode: "create" | "edit"; subgrupo?: Subgrupo; onClose: () => void; onDelete?: () => void }) {
  const isEdit = mode === "edit";
  const [state, action, pending] = useActionState(isEdit ? editarSubgrupo : crearSubgrupo, undefined);
  const s = subgrupo;

  useEffect(() => {
    notifyActionState(state, {
      success: isEdit ? "Subgrupo actualizado." : "Subgrupo creado.",
      error: isEdit ? "No se pudo actualizar el subgrupo." : "No se pudo crear el subgrupo.",
    });
    if (state?.ok) onClose();
  }, [state, isEdit, onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={isEdit ? `Editar subgrupo · ${s?.codigo}` : "Nuevo subgrupo"}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div>
            {isEdit && onDelete && (
              <button type="button" onClick={onDelete} className="rounded-md border border-err-200 px-3 py-2 text-[13px] font-semibold text-err-700 hover:bg-err-50">
                Eliminar
              </button>
            )}
          </div>
          <button type="submit" form="subgrupo-form" disabled={pending} className="rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
            {pending ? <EstadoProcesando>Guardando</EstadoProcesando> : isEdit ? "Guardar cambios" : "Crear subgrupo"}
          </button>
        </div>
      }
    >
      <form id="subgrupo-form" action={action} className="flex flex-col gap-4">
        {isEdit && <input type="hidden" name="id" value={s!.id} />}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Código del subgrupo (4 dígitos)">
            <input name="codigo" defaultValue={s?.codigo ?? ""} required inputMode="numeric" pattern="\d{4}" placeholder="1105" className={INPUT_CLS} />
            <p className="text-[11px] leading-snug text-ink-500">El grupo (nivel 2) se deriva de los 2 primeros dígitos.</p>
          </Campo>
          <Campo label="Naturaleza">
            <select name="naturaleza" defaultValue={s?.naturaleza ?? "D"} required className={INPUT_CLS}>
              <option value="D">Débito</option>
              <option value="C">Crédito</option>
            </select>
          </Campo>
          <Campo label="Nombre del subgrupo (nivel 4)" full>
            <input name="nombre" defaultValue={s?.nombre ?? ""} required placeholder="Caja" className={INPUT_CLS} />
          </Campo>
          <Campo label="Nombre del grupo (nivel 2)" full>
            <input name="nombreGrupo" defaultValue={s?.nombreGrupo ?? ""} required placeholder="Disponible" className={INPUT_CLS} />
          </Campo>
        </div>
        {state?.message && <p className="text-[12px] text-err-700">{state.message}</p>}
      </form>
    </Modal>
  );
}

function DeleteSubgrupoForm({ subgrupo, onClose }: { subgrupo: Subgrupo; onClose: () => void }) {
  const [state, action, pending] = useActionState(eliminarSubgrupo, undefined);

  useEffect(() => {
    notifyActionState(state, { success: "Subgrupo eliminado.", error: "No se pudo eliminar el subgrupo." });
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Eliminar subgrupo"
      footer={
        <button type="submit" form="delete-subgrupo-form" disabled={pending} className="rounded-md bg-err-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-err-700/90 disabled:opacity-60">
          {pending ? <EstadoProcesando>Eliminando</EstadoProcesando> : "Eliminar definitivamente"}
        </button>
      }
    >
      <form id="delete-subgrupo-form" action={action} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={subgrupo.id} />
        <p className="text-[13px] text-ink-600">
          Vas a eliminar el subgrupo <strong className="font-mono">{subgrupo.codigo}</strong> · {subgrupo.nombre}. Las cuentas de ese
          subgrupo seguirán existiendo, pero en el balance se mostrarán con su código (sin nombre) hasta que lo vuelvas a crear.
        </p>
        {state?.message && <p className="text-[12px] text-err-700">{state.message}</p>}
      </form>
    </Modal>
  );
}
