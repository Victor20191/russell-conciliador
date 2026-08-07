"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import {
  PageSizeSelect,
  PaginationControls,
  PaginationFooter,
  usePagination,
} from "@/components/pagination-controls";
import { Card, Chip } from "@/components/ui";
import { CargarBalanceButton, type ClienteOpcion } from "./cargar-balance-modal";
import type { ConfiguracionIABalanceUI } from "@/lib/ia/proveedor-balance";

export type PeriodRow = {
  period: string; versions: number; official: string | null; officialId: number | null;
  status: string; complete: number; lastUpload: string;
  mapped: number; unmapped: number; total: number;
};
export type ClientGroup = {
  clientId: number; clientName: string; clientNit: string;
  periodList: PeriodRow[];
};
export type AuditRow = {
  date: string;
  actor: string;
  role: string;
  action: string;
  ip: string;
  details: string;
  clientId: number;
  clientName: string;
};

type Tab = "clients" | "audit";

function statusTone(s: string): "ok" | "warn" | "blue" | "ink" {
  if (s === "Congelado") return "blue";
  if (s === "Con alertas") return "warn";
  return "ink";
}

function normalizarBusqueda(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function BalanceIndexClient({
  clients, auditRows, auditClients, uploadClients, canUpload, configuracionIA,
}: {
  clients: ClientGroup[];
  auditRows: AuditRow[];
  auditClients: { id: number; name: string }[];
  uploadClients: ClienteOpcion[]; canUpload: boolean;
  configuracionIA: ConfiguracionIABalanceUI | null;
}) {
  const [tab, setTab] = useState<Tab>("clients");

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <TabBtn on={tab === "clients"} onClick={() => setTab("clients")} label="Clientes" count={clients.length} />
        <TabBtn on={tab === "audit"} onClick={() => setTab("audit")} label="Audit log" count={auditRows.length} />
        {canUpload && <CargarBalanceButton clients={uploadClients} configuracionIA={configuracionIA} />}
      </div>

      {tab === "clients" && <ClientsTab clients={clients} />}
      {tab === "audit" && <AuditTab rows={auditRows} clients={auditClients} />}
    </div>
  );
}

function ClientsTab({ clients }: { clients: ClientGroup[] }) {
  const [busqueda, setBusqueda] = useState("");
  const clientesFiltrados = useMemo(() => {
    const termino = normalizarBusqueda(busqueda);
    if (!termino) return clients;

    const nitBuscado = busqueda.replace(/\D/g, "");
    return clients.filter((cliente) => {
      const nitNumerico = cliente.clientNit.replace(/\D/g, "");
      return normalizarBusqueda(cliente.clientName).includes(termino)
        || normalizarBusqueda(cliente.clientNit).includes(termino)
        || (nitBuscado.length > 0 && nitNumerico.includes(nitBuscado));
    });
  }, [busqueda, clients]);

  const pg = usePagination(clientesFiltrados, 50);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex w-full max-w-md items-center gap-2 rounded-md border border-ink-200 bg-white px-3 py-2 text-ink-400 shadow-sm focus-within:border-blue-400">
        <Icon name="search" size={15} />
        <input
          type="text"
          value={busqueda}
          onChange={(event) => {
            setBusqueda(event.target.value);
            pg.resetToFirstPage();
          }}
          placeholder="Buscar por NIT o razón social…"
          aria-label="Buscar clientes por NIT o razón social"
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink-700 outline-none placeholder:text-ink-400"
        />
        {busqueda.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setBusqueda("");
              pg.resetToFirstPage();
            }}
            aria-label="Limpiar búsqueda"
            title="Limpiar búsqueda"
            className="rounded p-0.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
          >
            <Icon name="x" size={14} />
          </button>
        )}
      </div>

      {clientesFiltrados.length === 0 && (
        <Card>
          <div className="px-4 py-10 text-center text-[12.5px] text-ink-400">
            No se encontraron clientes con ese NIT o razón social.
          </div>
        </Card>
      )}

      {pg.pageItems.map((c) => (
        <Card key={c.clientId}>
          <div className="flex items-center gap-2.5 border-b border-ink-100 px-4 py-3">
            <span className="text-ink-400"><Icon name="doc" size={16} /></span>
            <h2 className="text-[13px] font-semibold text-ink-800">{c.clientName}</h2>
            <span className="font-mono text-[11px] text-ink-400">{c.clientNit}</span>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <span className="text-[11px] text-ink-400">{c.periodList.length} período(s)</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                  <th className="px-4 py-2 font-semibold">Período</th>
                  <th className="px-4 py-2 text-right font-semibold">Versiones</th>
                  <th className="px-4 py-2 font-semibold">Versión oficial</th>
                  <th className="px-4 py-2 font-semibold">Estado</th>
                  <th className="px-4 py-2 font-semibold">Completitud</th>
                  <th className="px-4 py-2 font-semibold">Mapeo</th>
                  <th className="px-4 py-2 font-semibold">Última carga</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {c.periodList.map((p) => (
                  <tr key={p.period} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                    <td className="px-4 py-2.5 font-medium text-ink-800">{p.period}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-600">
                      {/* El conteo abre la bitácora de versiones del período, desde
                          donde se entra y se descarga cada versión (no solo la oficial). */}
                      {p.officialId ? (
                        <Link
                          href={`/balance/${p.officialId}?tab=versiones`}
                          title={`Ver las ${p.versions} versión(es) de ${p.period}`}
                          className="text-blue-500 hover:underline"
                        >
                          {p.versions}
                        </Link>
                      ) : (
                        p.versions
                      )}
                    </td>
                    <td className="px-4 py-2.5">{p.official ? <Chip label={`${p.official} oficial`} tone="ok" /> : <span className="text-ink-400">—</span>}</td>
                    <td className="px-4 py-2.5"><Chip label={p.status} tone={statusTone(p.status)} /></td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-ink-150">
                          <div className={`h-full ${p.complete === 100 ? "bg-ok-500" : "bg-warn-500"}`} style={{ width: `${p.complete}%` }} />
                        </div>
                        <span className="font-mono text-[11px] text-ink-500">{p.complete}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-[11px] text-ink-600">{p.mapped}/{p.total}</span>
                      {p.unmapped > 0 && <span className="ml-1.5"><Chip label={`${p.unmapped} sin mapeo`} tone="warn" /></span>}
                    </td>
                    <td className="px-4 py-2.5 text-ink-500">{p.lastUpload}</td>
                    <td className="px-4 py-2.5 text-right">
                      {p.officialId && (
                        <Link href={`/balance/${p.officialId}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-500 hover:underline">
                          Ver <Icon name="chev-r" size={12} />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      {clients.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-150 bg-white px-4 py-2.5 shadow-sm">
          <span className="text-[12px] text-ink-500">{pg.rangeLabel}</span>
          <div className="flex flex-wrap items-center gap-3">
            <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
            <PaginationControls currentPage={pg.page} totalPages={pg.totalPages} onPageChange={pg.setPage} />
          </div>
        </div>
      )}
    </div>
  );
}

function AuditTab({ rows, clients }: { rows: AuditRow[]; clients: { id: number; name: string }[] }) {
  const [clienteId, setClienteId] = useState<string>("todos");
  const rowsFiltradas = useMemo(
    () => clienteId === "todos" ? rows : rows.filter((row) => row.clientId === Number(clienteId)),
    [clienteId, rows],
  );
  const pg = usePagination(rowsFiltradas, 50);
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
        <h2 className="text-[13px] font-semibold text-ink-800">Audit log</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={clienteId}
            onChange={(event) => {
              setClienteId(event.target.value);
              pg.resetToFirstPage();
            }}
            aria-label="Filtrar bitácora por cliente"
            className="rounded-md border border-ink-200 px-2 py-1 text-[12px] text-ink-700 outline-none"
          >
            <option value="todos">Todos los clientes</option>
            {clients.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.name}</option>)}
          </select>
          <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2 font-semibold">Fecha · hora</th>
              <th className="px-4 py-2 font-semibold">Actor</th>
              <th className="px-4 py-2 font-semibold">Rol</th>
              <th className="px-4 py-2 font-semibold">Acción</th>
              <th className="px-4 py-2 font-semibold">IP</th>
              <th className="px-4 py-2 font-semibold">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {pg.pageItems.map((r, i) => (
              <tr key={pg.start + i} className="border-b border-ink-50 last:border-0">
                <td className="px-4 py-2.5 font-mono text-ink-600">{r.date}</td>
                <td className="px-4 py-2.5 text-ink-800">{r.actor}</td>
                <td className="px-4 py-2.5"><Chip label={r.role} tone={r.role.includes("Cliente") ? "blue" : "ink"} /></td>
                <td className="px-4 py-2.5 font-medium text-ink-700">{r.action}</td>
                <td className="px-4 py-2.5 font-mono text-ink-400">{r.ip}</td>
                <td className="px-4 py-2.5 text-ink-500">{r.details}</td>
              </tr>
            ))}
            {rowsFiltradas.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-400">Sin entradas en la bitácora.</td></tr>
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
