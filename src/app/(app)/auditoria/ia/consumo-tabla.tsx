"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { Icon } from "@/components/icons";
import { PageSizeSelect, PaginationFooter, usePagination } from "@/components/pagination-controls";

export type ConsumoRow = {
  id: number;
  ts: string;
  tipo: string;
  modelo: string;
  cliente: string;
  usuario: string | null;
  archivo: string | null;
  tokens: number;
  costoUsd: number;
  trm: number;
  costoCop: number;
};

const fmtTokens = (n: number) => n.toLocaleString("es-CO");
const fmtUsd = (n: number) =>
  `US$ ${n.toLocaleString("es-CO", { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;
const fmtTrm = (n: number) =>
  n > 0 ? n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
// Costo por llamada: suele ser pequeño (decenas/cientos de COP) → 2 decimales.
const fmtCop = (n: number) =>
  `$ ${n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type ClienteTotal = { llamadas: number; tokens: number; costoUsd: number; costoCop: number };
type FechaTotal = ClienteTotal & { label: string };

const fechaDe = (row: ConsumoRow) => row.ts.split(" ")[0] ?? row.ts;
const fechaKey = (cliente: string, fecha: string) => `${cliente}::${fecha}`;

/**
 * Detalle de llamadas a la IA (paginado en memoria sobre el conjunto que envía el
 * servidor, como `AccesosTabla`). Una fila por llamada (extracción o lote de mapeo).
 */
export default function ConsumoTabla({ rows }: { rows: ConsumoRow[] }) {
  const [clientesContraidos, setClientesContraidos] = useState<Set<string>>(() => new Set());
  const [fechasContraidas, setFechasContraidas] = useState<Set<string>>(() => new Set());
  const rowsAgrupadas = useMemo(
    () =>
      rows
        .map((row, index) => ({ row, index }))
        .sort((a, b) => {
          const aSinCliente = a.row.cliente.startsWith("—");
          const bSinCliente = b.row.cliente.startsWith("—");
          if (aSinCliente !== bSinCliente) return aSinCliente ? 1 : -1;
          return a.row.cliente.localeCompare(b.row.cliente, "es") || a.index - b.index;
        })
        .map(({ row }) => row),
    [rows],
  );
  const totalesCliente = useMemo(() => {
    const map = new Map<string, ClienteTotal>();
    for (const row of rowsAgrupadas) {
      const actual = map.get(row.cliente) ?? { llamadas: 0, tokens: 0, costoUsd: 0, costoCop: 0 };
      actual.llamadas += 1;
      actual.tokens += row.tokens;
      actual.costoUsd += row.costoUsd;
      actual.costoCop += row.costoCop;
      map.set(row.cliente, actual);
    }
    return map;
  }, [rowsAgrupadas]);
  const totalesFecha = useMemo(() => {
    const map = new Map<string, FechaTotal>();
    for (const row of rowsAgrupadas) {
      const fecha = fechaDe(row);
      const key = fechaKey(row.cliente, fecha);
      const actual = map.get(key) ?? { label: fecha, llamadas: 0, tokens: 0, costoUsd: 0, costoCop: 0 };
      actual.llamadas += 1;
      actual.tokens += row.tokens;
      actual.costoUsd += row.costoUsd;
      actual.costoCop += row.costoCop;
      map.set(key, actual);
    }
    return map;
  }, [rowsAgrupadas]);
  const clientes = useMemo(() => [...totalesCliente.keys()], [totalesCliente]);
  const fechas = useMemo(() => [...totalesFecha.keys()], [totalesFecha]);
  const pg = usePagination(rowsAgrupadas, 50);
  const hayClientes = clientes.length > 0;
  const hayContraidos = clientesContraidos.size > 0 || fechasContraidas.size > 0;
  const todosContraidos =
    hayClientes &&
    clientes.every((cliente) => clientesContraidos.has(cliente)) &&
    fechas.every((fecha) => fechasContraidas.has(fecha));

  function setClienteContraido(cliente: string, contraido: boolean) {
    setClientesContraidos((actual) => {
      const siguiente = new Set(actual);
      if (contraido) siguiente.add(cliente);
      else siguiente.delete(cliente);
      return siguiente;
    });
  }

  function setFechaContraida(key: string, contraida: boolean) {
    setFechasContraidas((actual) => {
      const siguiente = new Set(actual);
      if (contraida) siguiente.add(key);
      else siguiente.delete(key);
      return siguiente;
    });
  }

  function contraerTodos() {
    setClientesContraidos(new Set(clientes));
    setFechasContraidas(new Set(fechas));
  }

  function expandirTodos() {
    setClientesContraidos(new Set());
    setFechasContraidas(new Set());
  }

  const filas: React.ReactNode[] = [];
  let clienteActual: string | null = null;
  let fechaActual: string | null = null;
  for (const e of pg.pageItems) {
    const clienteContraido = clientesContraidos.has(e.cliente);
    const fecha = fechaDe(e);
    const keyFecha = fechaKey(e.cliente, fecha);
    const fechaContraida = fechasContraidas.has(keyFecha);
    if (e.cliente !== clienteActual) {
      clienteActual = e.cliente;
      fechaActual = null;
      const total = totalesCliente.get(e.cliente);
      const trmPromedio = total && total.costoUsd > 0 ? total.costoCop / total.costoUsd : 0;
      filas.push(
        <tr key={`cliente-${e.cliente}-${e.id}`} className="border-y border-ink-100 bg-ink-50/80">
          <td colSpan={4} className="px-4 py-2.5 text-[12px] font-semibold text-ink-800">
            <button
              type="button"
              onClick={() => setClienteContraido(e.cliente, !clienteContraido)}
              className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
              aria-expanded={!clienteContraido}
              aria-label={`${clienteContraido ? "Expandir" : "Contraer"} llamadas de ${e.cliente}`}
              title={clienteContraido ? "Expandir cliente" : "Contraer cliente"}
            >
              <Icon name={clienteContraido ? "chev-r" : "chev-d"} size={13} className="shrink-0 text-ink-500" />
              <span className="min-w-0 truncate">{e.cliente}</span>
              <span className="shrink-0 font-normal text-ink-500">{fmtTokens(total?.llamadas ?? 0)} llamada(s)</span>
            </button>
          </td>
          <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-[11.5px] font-semibold text-ink-700">{fmtTokens(total?.tokens ?? 0)}</td>
          <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-[11.5px] font-semibold text-ink-700">{fmtUsd(total?.costoUsd ?? 0)}</td>
          <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-[11.5px] text-ink-500">{fmtTrm(trmPromedio)}</td>
          <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-[12px] font-semibold text-ink-800">{fmtCop(total?.costoCop ?? 0)}</td>
        </tr>,
      );
    }
    if (clienteContraido) continue;
    if (keyFecha !== fechaActual) {
      fechaActual = keyFecha;
      const totalFecha = totalesFecha.get(keyFecha);
      const trmFecha = totalFecha && totalFecha.costoUsd > 0 ? totalFecha.costoCop / totalFecha.costoUsd : 0;
      filas.push(
        <tr key={`fecha-${keyFecha}-${e.id}`} className="border-b border-ink-100 bg-white">
          <td colSpan={4} className="px-4 py-2 text-[11.5px] font-semibold text-ink-700">
            <button
              type="button"
              onClick={() => setFechaContraida(keyFecha, !fechaContraida)}
              className="ml-5 inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition hover:bg-ink-50 focus:outline-none focus:ring-2 focus:ring-blue-300"
              aria-expanded={!fechaContraida}
              aria-label={`${fechaContraida ? "Expandir" : "Contraer"} llamadas del ${totalFecha?.label ?? fecha}`}
              title={fechaContraida ? "Expandir fecha" : "Contraer fecha"}
            >
              <Icon name={fechaContraida ? "chev-r" : "chev-d"} size={12} className="shrink-0 text-ink-400" />
              <span className="font-mono text-ink-600">{totalFecha?.label ?? fecha}</span>
              <span className="shrink-0 font-normal text-ink-400">{fmtTokens(totalFecha?.llamadas ?? 0)} llamada(s)</span>
            </button>
          </td>
          <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-[11px] font-semibold text-ink-600">{fmtTokens(totalFecha?.tokens ?? 0)}</td>
          <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-[11px] font-semibold text-ink-600">{fmtUsd(totalFecha?.costoUsd ?? 0)}</td>
          <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-[11px] text-ink-400">{fmtTrm(trmFecha)}</td>
          <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-[11.5px] font-semibold text-ink-700">{fmtCop(totalFecha?.costoCop ?? 0)}</td>
        </tr>,
      );
    }
    if (fechaContraida) continue;
    filas.push(
      <tr key={e.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11.5px] text-ink-500">{e.ts}</td>
        <td className="px-4 py-2.5 text-ink-800">
          {e.tipo}
          <span className="ml-1.5 font-mono text-[10.5px] text-ink-400">{e.modelo}</span>
        </td>
        <td className="whitespace-nowrap px-4 py-2.5 text-ink-600">{e.usuario ?? "—"}</td>
        <td className="max-w-[220px] truncate px-4 py-2.5 text-ink-600" title={e.archivo ?? undefined}>{e.archivo ?? "—"}</td>
        <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-[11.5px] text-ink-600">{fmtTokens(e.tokens)}</td>
        <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-[11.5px] text-ink-600">{fmtUsd(e.costoUsd)}</td>
        <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-[11.5px] text-ink-500">{fmtTrm(e.trm)}</td>
        <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-[12px] font-semibold text-ink-800">{fmtCop(e.costoCop)}</td>
      </tr>,
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
        <h2 className="min-w-0 flex-1 text-[13px] font-semibold text-ink-800">Detalle de llamadas a la IA · por cliente y fecha</h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={expandirTodos}
            disabled={!hayClientes || !hayContraidos}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 text-[12px] font-semibold text-ink-600 transition hover:border-ink-300 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-45"
            title="Expandir todo"
          >
            <Icon name="chev-d" size={13} />
            Expandir
          </button>
          <button
            type="button"
            onClick={contraerTodos}
            disabled={!hayClientes || todosContraidos}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 text-[12px] font-semibold text-ink-600 transition hover:border-ink-300 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-45"
            title="Contraer todo"
          >
            <Icon name="chev-r" size={13} />
            Contraer
          </button>
        </div>
        <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2.5 font-semibold">Fecha y hora</th>
              <th className="px-4 py-2.5 font-semibold">Operación</th>
              <th className="px-4 py-2.5 font-semibold">Usuario</th>
              <th className="px-4 py-2.5 font-semibold">Archivo</th>
              <th className="px-4 py-2.5 text-right font-semibold">Tokens</th>
              <th className="px-4 py-2.5 text-right font-semibold">Costo USD</th>
              <th className="px-4 py-2.5 text-right font-semibold">TRM</th>
              <th className="px-4 py-2.5 text-right font-semibold">Costo (COP)</th>
            </tr>
          </thead>
          <tbody>
            {filas}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-ink-400">Aún no hay consumo de IA registrado.</td>
              </tr>
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
