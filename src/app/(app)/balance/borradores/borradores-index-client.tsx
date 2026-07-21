"use client";

import { EstadoProcesando } from "@/components/estado-procesando";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import {
  PageSizeSelect,
  PaginationControls,
  usePagination,
} from "@/components/pagination-controls";
import { Card, Chip, EmptyState } from "@/components/ui";
import { fmt } from "@/lib/format";
import { claveNit } from "@/lib/nit";
import { descartarBorrador } from "@/app/actions/balance";
import { notifySuccess, notifyError } from "@/lib/client-notifications";

export type BorradorRow = {
  loteId: string;
  archivoNombre: string;
  conEncabezado: boolean;
  nitDetectado: string | null;
  clienteSugerido: string | null;
  periodo: string;
  cuentasMovimiento: number;
  cuadrado: boolean;
  partidaDobleDiff: number;
  cargadoPor: string | null;
  fecha: string;
};

function normalizarBusqueda(valor: string | null) {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function BorradoresIndexClient({ rows }: { rows: BorradorRow[] }) {
  const router = useRouter();
  const [descartando, startDescartar] = useTransition();
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const borradoresFiltrados = useMemo(() => {
    const termino = normalizarBusqueda(busqueda);
    if (!termino) return rows;

    const nitBuscado = claveNit(busqueda);
    return rows.filter((borrador) =>
      normalizarBusqueda(borrador.clienteSugerido).includes(termino)
      || normalizarBusqueda(borrador.nitDetectado).includes(termino)
      || (nitBuscado.length > 0 && claveNit(borrador.nitDetectado ?? "").includes(nitBuscado)),
    );
  }, [busqueda, rows]);
  const pg = usePagination(borradoresFiltrados, 50);

  const onDescartar = (loteId: string) => {
    startDescartar(async () => {
      const r = await descartarBorrador(loteId);
      if (r.ok) notifySuccess(r.message ?? "Borrador descartado.");
      else notifyError(r.message ?? "No se pudo descartar.");
      setConfirmar(null);
      router.refresh();
    });
  };

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="doc"
          title="No tienes borradores"
          description="Sube un balance desde «Balance» → «Cargar balance». Tras leerlo, quedará aquí como borrador para revisar antes de cargarlo."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex w-full max-w-md items-center gap-2 rounded-md border border-ink-200 bg-white px-3 py-2 text-ink-400 shadow-sm focus-within:border-blue-400">
        <Icon name="search" size={15} />
        <input
          type="search"
          value={busqueda}
          onChange={(event) => {
            setBusqueda(event.target.value);
            pg.resetToFirstPage();
          }}
          placeholder="Buscar por NIT o razón social…"
          aria-label="Buscar borradores por NIT o razón social"
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

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-ink-50 text-ink-500">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">Archivo</th>
                <th className="px-3 py-2 font-semibold">Cliente / NIT</th>
                <th className="px-3 py-2 font-semibold">Período</th>
                <th className="px-3 py-2 text-right font-semibold">Cuentas</th>
                <th className="px-3 py-2 font-semibold">Estado</th>
                <th className="px-3 py-2 font-semibold">Fecha</th>
                <th className="px-3 py-2 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.map((r) => (
                <tr key={r.loteId} className="border-t border-ink-100 align-middle hover:bg-ink-50/50">
                  <td className="px-3 py-2">
                    <Link href={`/balance/borradores/${r.loteId}`} className="font-medium text-blue-500 hover:underline">
                      {r.archivoNombre}
                    </Link>
                    {!r.conEncabezado && <span className="block text-[10.5px] text-ink-400">recuperado del staging (relee para el nombre)</span>}
                    {r.cargadoPor && <span className="block text-[10.5px] text-ink-400">por {r.cargadoPor}</span>}
                  </td>
                  <td className="px-3 py-2 text-ink-700">
                    {r.clienteSugerido ?? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-warn-300 bg-warn-50 px-2 py-0.5 text-[10.5px] font-semibold text-warn-700" title="Asignar el cliente es obligatorio: hazlo al abrir el borrador (Revisar).">
                        Sin cliente — asígnalo en «Revisar»
                      </span>
                    )}
                    {r.nitDetectado && <span className="block font-mono text-[10.5px] text-ink-400">{r.nitDetectado}</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-ink-600">{r.periodo}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-700">{r.cuentasMovimiento}</td>
                  <td className="px-3 py-2">
                    {r.cuadrado ? (
                      <Chip label="Cuadrado" tone="ok" />
                    ) : (
                      <span className="inline-flex flex-col gap-0.5">
                        <Chip label="Descuadrado" tone="warn" />
                        <span className="text-[10px] text-warn-700">DB−CR {fmt(r.partidaDobleDiff)}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-ink-500">{r.fecha}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/balance/borradores/${r.loteId}`}
                        className="inline-flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-[11.5px] font-semibold text-ink-700 hover:bg-ink-50"
                      >
                        <Icon name="chev-r" size={12} /> Revisar
                      </Link>
                      {confirmar === r.loteId ? (
                        <span className="inline-flex items-center gap-1">
                          <button
                            onClick={() => onDescartar(r.loteId)}
                            disabled={descartando}
                            className="rounded-md bg-err-100 px-2 py-1 text-[11.5px] font-semibold text-err-700 hover:bg-err-200 disabled:opacity-60"
                          >
                            {descartando ? <EstadoProcesando>Descartando</EstadoProcesando> : "Confirmar"}
                          </button>
                          <button onClick={() => setConfirmar(null)} className="rounded-md border border-ink-200 px-2 py-1 text-[11.5px] text-ink-600 hover:bg-ink-50">
                            Cancelar
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmar(r.loteId)}
                          className="inline-flex items-center gap-1 rounded-md border border-err-200 px-2 py-1 text-[11.5px] font-semibold text-err-700 hover:bg-err-50"
                        >
                          <Icon name="x" size={12} /> Descartar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {borradoresFiltrados.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-[12.5px] text-ink-400">
                    No se encontraron borradores con ese NIT o razón social.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-4 py-3">
          <span className="text-[12px] text-ink-500">{pg.rangeLabel}</span>
          <div className="flex flex-wrap items-center gap-3">
            <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
            <PaginationControls currentPage={pg.page} totalPages={pg.totalPages} onPageChange={pg.setPage} />
          </div>
        </div>
      </Card>
    </div>
  );
}
