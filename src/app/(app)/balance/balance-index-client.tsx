"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import {
  PageSizeSelect,
  PaginationControls,
  PaginationFooter,
  usePagination,
} from "@/components/pagination-controls";
import { Card, Chip } from "@/components/ui";
import { etiquetaApertura, parsearApertura } from "@/lib/balance/apertura-balance";
import { tonoEstadoBalance } from "@/lib/balance/estado-balance";
import { etiquetaEstadoCorte, type EstadoCorte } from "@/lib/balance/corte";
import { CargarBalanceButton, type ClienteOpcion } from "./cargar-balance-modal";
import type { ConfiguracionIABalanceUI } from "@/lib/ia/proveedor-balance";

/**
 * Un balance VIGENTE del corte: la versión más reciente de su línea (texto del período +
 * apertura). Las versiones anteriores se ven desde el conteo de versiones.
 */
export type CorteRow = {
  /** Clave estable de la línea dentro del corte. */
  key: string;
  /** Id de la versión vigente: el renglón la abre. */
  id: number;
  /** Período COMPLETO del balance («Diciembre 2025», «Enero 2025 – Diciembre 2025»). */
  period: string;
  versions: number;
  status: string; complete: number; lastUpload: string;
  /** Quién confirmó el cargue de esta versión (`cargadoPor`); null si no quedó registrado. */
  uploadedBy: string | null;
  mapped: number; unmapped: number; total: number;
  /** Apertura de la línea (`cuenta` | `tercero`); null en cargues anteriores a este dato. */
  apertura: string | null;
  /** Sus saldos finales difieren de otro balance vigente del mismo corte. */
  inconsistente: boolean;
  /** Módulos (por su nombre, «Inventarios») con la conciliación en firme contra este balance. */
  enFirme: string[];
  /** Archivos que formaron la versión cuando el ERP entregó el balance partido. */
  archivos?: string[];
};
/**
 * Un CORTE del cliente (18/Oct/2026): los balances que terminan en la misma fecha —mensual,
 * anual, por cuenta, por terceros— van juntos porque los módulos concilian contra el saldo
 * final y esos saldos tienen que coincidir entre todos.
 */
export type CorteGroup = {
  key: string;
  /** «31/12/2025». */
  fechaCorte: string;
  estado: EstadoCorte;
  /** Corte de dos balances que difieren: cuántas cuentas alcanzan el umbral. null en los demás casos. */
  cuentasDiferentes?: number | null;
  rows: CorteRow[];
};
export type ClientGroup = {
  clientId: number; clientName: string; clientNit: string;
  cortes: CorteGroup[];
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

// En proceso / en proceso con alertas / cerrado (17/Oct/2026): el loader ya traduce los rótulos viejos.
const statusTone = tonoEstadoBalance;

function normalizarBusqueda(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Qué cortes muestra el listado: todos, los que tienen diferencias, los sin comparar o los que
 * tienen algún balance con cuentas por mapear.
 */
export type FiltroCorte = "todos" | "diferencias" | "sin_comparar" | "por_mapear";

const CORTE_DEL_FILTRO: Record<Exclude<FiltroCorte, "todos">, (corte: CorteGroup) => boolean> = {
  diferencias: (corte) => corte.estado === "inconsistente",
  sin_comparar: (corte) => corte.estado === "sin_comparar",
  // El corte entero, no solo el balance pendiente: su celda cuenta y compara todos sus balances.
  por_mapear: (corte) => corte.rows.some((row) => row.unmapped > 0),
};

const FILTROS: { valor: FiltroCorte; etiqueta: string; aviso: string; vacio: string }[] = [
  { valor: "todos", etiqueta: "Todos", aviso: "", vacio: "No se encontraron clientes con ese NIT o razón social." },
  { valor: "diferencias", etiqueta: "Con diferencias", aviso: "Mostrando solo los cortes con diferencias de saldo final.", vacio: "Ningún cliente tiene cortes con diferencias." },
  { valor: "sin_comparar", etiqueta: "Sin comparar", aviso: "Mostrando solo los cortes que falta comparar.", vacio: "Ningún cliente tiene cortes sin comparar." },
  { valor: "por_mapear", etiqueta: "Por mapear", aviso: "Mostrando solo los cortes con algún balance que tiene cuentas sin mapear.", vacio: "Ningún balance tiene cuentas por mapear." },
];

/**
 * Con un filtro activo deja solo los clientes que tienen algún corte que lo cumple y, de cada uno,
 * solo esos cortes. «todos» no filtra.
 */
export function filtrarClientesPorCorte(clients: ClientGroup[], filtro: FiltroCorte): ClientGroup[] {
  if (filtro === "todos") return clients;
  const cumple = CORTE_DEL_FILTRO[filtro];
  return clients.flatMap((cliente) => {
    const cortes = cliente.cortes.filter(cumple);
    return cortes.length > 0 ? [{ ...cliente, cortes }] : [];
  });
}

const plural = (n: number, singular: string, varios: string) => `${n} ${n === 1 ? singular : varios}`;

export default function BalanceIndexClient({
  clients, puedeVerAuditoria = false, auditRows, auditClients, uploadClients, canUpload, configuracionIA,
}: {
  clients: ClientGroup[];
  /** Pestaña «Audit log»: solo los administradores (`auditoria:ver`). */
  puedeVerAuditoria?: boolean;
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
        {puedeVerAuditoria && <TabBtn on={tab === "audit"} onClick={() => setTab("audit")} label="Audit log" count={auditRows.length} />}
        {canUpload && <CargarBalanceButton clients={uploadClients} configuracionIA={configuracionIA} />}
      </div>

      {tab === "clients" && <ClientsTab clients={clients} />}
      {puedeVerAuditoria && tab === "audit" && <AuditTab rows={auditRows} clients={auditClients} />}
    </div>
  );
}

/**
 * Anchos fijos de la rejilla (18/Oct/2026): todas las tarjetas comparten las mismas columnas, así
 * Estado, Mapeo o Última carga quedan en la misma posición en cada cliente. `null` = el resto (Balance).
 */
const COLUMNAS: (number | null)[] = [176, null, 108, 60, 184, 144, 116, 180, 170, 56];

function Columnas() {
  return <colgroup>{COLUMNAS.map((ancho, i) => <col key={i} style={ancho ? { width: ancho } : undefined} />)}</colgroup>;
}

function ClientsTab({ clients }: { clients: ClientGroup[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<FiltroCorte>("todos");
  const clientesBuscados = useMemo(() => {
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
  const clientesFiltrados = useMemo(() => filtrarClientesPorCorte(clientesBuscados, filtro), [clientesBuscados, filtro]);
  const conteos = useMemo(
    () => Object.fromEntries(FILTROS.map((f) => [f.valor, filtrarClientesPorCorte(clientesBuscados, f.valor).length])) as Record<FiltroCorte, number>,
    [clientesBuscados],
  );

  const pg = usePagination(clientesFiltrados, 50);
  const filtroActivo = FILTROS.find((f) => f.valor === filtro) ?? FILTROS[0];
  const avisoFiltro = filtroActivo.aviso;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
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
          <div role="group" aria-label="Filtrar cortes por estado o por mapeo" className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white p-0.5 shadow-sm">
            {FILTROS.map((f) => (
              <button
                key={f.valor}
                type="button"
                aria-pressed={filtro === f.valor}
                onClick={() => {
                  setFiltro(f.valor);
                  pg.resetToFirstPage();
                }}
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] font-medium transition ${filtro === f.valor ? "bg-navy-800 text-white" : "text-ink-600 hover:bg-ink-100"}`}
              >
                {f.etiqueta}
                <span className={`rounded-full px-1.5 text-[10px] font-semibold ${filtro === f.valor ? "bg-navy-600 text-white" : f.valor === "diferencias" && conteos[f.valor] > 0 ? "bg-err-100 text-err-700" : f.valor === "por_mapear" && conteos[f.valor] > 0 ? "bg-warn-100 text-warn-700" : "bg-ink-100 text-ink-500"}`}>
                  {conteos[f.valor]}
                </span>
              </button>
            ))}
          </div>
        </div>
        {avisoFiltro && <p className="text-[11.5px] text-ink-500">{avisoFiltro}</p>}
      </div>

      {clientesFiltrados.length === 0 && (
        <Card>
          <div className="px-4 py-10 text-center text-[12.5px] text-ink-400">
            {filtroActivo.vacio}
          </div>
        </Card>
      )}

      {pg.pageItems.map((c) => {
        const balances = c.cortes.reduce((n, g) => n + g.rows.length, 0);
        const conDiferencias = c.cortes.filter((g) => g.estado === "inconsistente").length;
        const sinComparar = c.cortes.filter((g) => g.estado === "sin_comparar").length;
        return (
          <Card key={c.clientId}>
            <div className="flex flex-wrap items-center gap-2.5 border-b border-ink-100 px-4 py-3">
              <span className="text-ink-400"><Icon name="doc" size={16} /></span>
              <h2 className="text-[13px] font-semibold text-navy-800">{c.clientName}</h2>
              <span className="tabular-nums text-[11px] text-ink-400">{c.clientNit}</span>
              {conDiferencias > 0 && <Chip label={`${plural(conDiferencias, "corte", "cortes")} con diferencias`} tone="err" />}
              {sinComparar > 0 && <Chip label={`${sinComparar} sin comparar`} tone="warn" />}
              <span className="ml-auto text-[11px] text-ink-400">
                {plural(c.cortes.length, "corte", "cortes")} · {plural(balances, "balance", "balances")}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1300px] table-fixed text-[12.5px]">
                <Columnas />
                <thead>
                  <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                    <th className="px-3 py-2 font-semibold">Corte</th>
                    <th className="px-3 py-2 font-semibold">Balance</th>
                    <th className="px-3 py-2 font-semibold">Tipo</th>
                    <th className="px-3 py-2 text-right font-semibold">Vers.</th>
                    <th className="px-3 py-2 font-semibold">Estado</th>
                    <th className="px-3 py-2 font-semibold">Conciliación en firme</th>
                    <th className="px-3 py-2 font-semibold">Completitud</th>
                    <th className="px-3 py-2 font-semibold">Mapeo</th>
                    <th className="px-3 py-2 font-semibold">Última carga</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {c.cortes.map((g) => (
                    <Fragment key={g.key}>
                      {g.rows.map((p, i) => <FilaCorte key={p.key} p={p} grupo={g} primera={i === 0} ultima={i === g.rows.length - 1} />)}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}

      {clientesFiltrados.length > 0 && (
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

const TONO_ESTADO_CORTE: Record<EstadoCorte, "ok" | "err" | "warn" | "ink"> = {
  consistente: "ok", inconsistente: "err", sin_comparar: "warn", unico: "ink",
};

/** Franja a la izquierda de un corte con varios balances, del color de su estado. */
const FRANJA_ESTADO_CORTE: Record<EstadoCorte, string> = {
  consistente: "border-l-ok-500", inconsistente: "border-l-err-500", sin_comparar: "border-l-warn-500", unico: "border-l-ink-200",
};

/**
 * Celda del CORTE (18/Oct/2026): abarca todas las filas de sus balances. Trae la fecha y, si son
 * varios, cuántos y si sus saldos finales coinciden (enlace al panel «Balances del mismo corte»),
 * con una franja del color del estado.
 */
function CeldaCorte({ grupo }: { grupo: CorteGroup }) {
  const varios = grupo.rows.length > 1;
  return (
    <td
      rowSpan={grupo.rows.length}
      className={`border-b border-ink-100 px-3 py-2.5 ${varios ? `border-l-[3px] bg-ink-50/60 align-top ${FRANJA_ESTADO_CORTE[grupo.estado]}` : "align-middle"}`}
    >
      <div className="font-medium text-ink-800">{grupo.fechaCorte}</div>
      {varios && (
        <>
          <div className="mt-0.5 text-[11px] text-ink-500">{grupo.rows.length} balances</div>
          <Link
            href={`/balance/${grupo.rows[0].id}#corte`}
            className="mt-1.5 inline-block"
            title="Los balances con la misma fecha de corte deben coincidir en sus saldos finales. Abre la comparación."
          >
            <Chip label={etiquetaEstadoCorte(grupo.estado, grupo.cuentasDiferentes ?? null)} tone={TONO_ESTADO_CORTE[grupo.estado]} />
          </Link>
        </>
      )}
    </td>
  );
}

/**
 * Un balance vigente del listado, con su período completo. La primera fila de cada corte pinta la
 * celda del corte; las filas de un corte que difiere van con fondo rojo suave.
 */
function FilaCorte({ p, grupo, primera, ultima }: { p: CorteRow; grupo: CorteGroup; primera: boolean; ultima: boolean }) {
  const apertura = parsearApertura(p.apertura);
  const etiquetaFila = apertura ? `${p.period} · ${etiquetaApertura(p.apertura)}` : p.period;
  const difiere = grupo.estado === "inconsistente" && grupo.rows.length > 1;
  return (
    <tr className={`${ultima ? "border-b border-ink-100" : "border-b border-ink-50"} ${difiere ? "bg-err-100" : ""} hover:bg-ink-50`}>
      {primera && <CeldaCorte grupo={grupo} />}
      <td className="px-3 py-2.5">
        <span className="flex flex-wrap items-center gap-1.5">
          <Link href={`/balance/${p.id}`} className="font-medium text-ink-800 hover:text-blue-600 hover:underline" title={`Abrir ${etiquetaFila}`}>
            {p.period}
          </Link>
          {/* AVISO de balance partido, igual que la carga fraccionada de los módulos:
              la versión listada no salió de un solo archivo. */}
          {(p.archivos?.length ?? 0) > 1 && (
            <span title={`Balance partido: esta versión se armó con ${p.archivos!.length} archivos — ${p.archivos!.join(" + ")}.`}>
              <Chip label={`${p.archivos!.length} archivos`} tone="warn" />
            </span>
          )}
        </span>
      </td>
      <td className="px-3 py-2.5">
        {/* Lo declaró quien cargó el archivo; en un período partido es la clave del renglón. */}
        {apertura
          ? <Chip label={etiquetaApertura(p.apertura)} tone={apertura === "tercero" ? "blue" : "ink"} />
          : <span className="text-ink-300" title="Cargue anterior al registro del tipo de balance.">—</span>}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-ink-600">
        {/* El conteo abre la bitácora de versiones de la línea, desde donde se entra y
            se descarga cada versión. */}
        <Link
          href={`/balance/${p.id}?tab=versiones`}
          title={`Ver las ${p.versions} versión(es) de ${etiquetaFila}`}
          className="text-blue-600 hover:underline"
        >
          {p.versions}
        </Link>
      </td>
      <td className="px-3 py-2.5">
        <span className="flex flex-col items-start gap-1">
          <Chip label={p.status} tone={statusTone(p.status)} />
          {p.inconsistente && (
            <Link href={`/balance/${p.id}#corte`} title="Sus saldos finales difieren de otro balance con la misma fecha de corte.">
              <Chip label="Inconsistente" tone="err" />
            </Link>
          )}
        </span>
      </td>
      <td className="px-3 py-2.5">
        {p.enFirme.length > 0
          ? (
            <span className="flex flex-col items-start gap-1">
              {p.enFirme.map((modulo) => (
                <span key={modulo} title={`Conciliación de ${modulo} en firme contra este balance.`}>
                  <Chip label={modulo} tone="blue" />
                </span>
              ))}
            </span>
          )
          : <span className="text-ink-300">—</span>}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-ink-150">
            <div className={`h-full ${p.complete === 100 ? "bg-ok-500" : "bg-warn-500"}`} style={{ width: `${p.complete}%` }} />
          </div>
          <span className="tabular-nums text-[11px] text-ink-500">{p.complete}%</span>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="whitespace-nowrap tabular-nums text-[11px] text-ink-600">{p.mapped}/{p.total}</span>
          {p.unmapped > 0 && <Chip label={`${p.unmapped} sin mapeo`} tone="warn" />}
        </span>
      </td>
      <td className="px-3 py-2.5 text-ink-500">
        <span className="block whitespace-nowrap">{p.lastUpload}</span>
        {p.uploadedBy && (
          <span className="block truncate text-[11px] text-ink-400" title={`Cargado por ${p.uploadedBy}`}>por {p.uploadedBy}</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right">
        <Link href={`/balance/${p.id}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-600 hover:underline" title={`Abrir ${etiquetaFila}`}>
          Ver <Icon name="chev-r" size={12} />
        </Link>
      </td>
    </tr>
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
        <h2 className="text-[13px] font-semibold text-navy-800">Audit log</h2>
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
                <td className="px-4 py-2.5 tabular-nums text-ink-600">{r.date}</td>
                <td className="px-4 py-2.5 text-ink-800">{r.actor}</td>
                <td className="px-4 py-2.5"><Chip label={r.role} tone={r.role.includes("Cliente") ? "blue" : "ink"} /></td>
                <td className="px-4 py-2.5 font-medium text-ink-700">{r.action}</td>
                <td className="px-4 py-2.5 tabular-nums text-ink-400">{r.ip}</td>
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
      <span className={`rounded-full px-1.5 text-[10px] font-semibold ${on ? "bg-navy-600 text-white" : "bg-ink-100 text-ink-500"}`}>{count}</span>
    </button>
  );
}
