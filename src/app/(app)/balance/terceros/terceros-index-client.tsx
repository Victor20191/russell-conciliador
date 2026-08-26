"use client";

// Listado de cargues del balance por tercero. Mismo lenguaje visual que el
// listado de borradores de balance: buscador, tabla, chips de estado y la
// columna «Acciones» con iconos cuadrados del mismo tamaño.

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Icon } from "@/components/icons";
import {
  PageSizeSelect,
  PaginationControls,
  usePagination,
} from "@/components/pagination-controls";
import { Card, Chip, EmptyState } from "@/components/ui";
import { fmtContable, fmtNum } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { eliminarBalanceTercero } from "@/app/actions/balance";

export type CargueTerceroRow = {
  id: number;
  clienteId: number;
  clienteNombre: string;
  clienteNit: string | null;
  periodo: string;
  version: string;
  /** Cuántos cargues existen del mismo (cliente, período). */
  versionesPeriodo: number;
  esOficial: boolean;
  archivo: string | null;
  tamanoArchivo: string | null;
  filas: number;
  terceros: number;
  cuentas: number;
  saldoFinal: number;
  cargadoPor: string | null;
  fecha: string;
  hora: string | null;
  ordenFecha: string;
};

const BOTON_ACCION =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition";

function coincide(fila: CargueTerceroRow, termino: string): boolean {
  const q = termino.trim().toLowerCase();
  if (!q) return true;
  const qSinPuntos = q.replace(/[.\-\s]/g, "");
  return [fila.archivo ?? "", fila.clienteNombre, fila.clienteNit ?? "", fila.periodo, fila.version].some(
    (campo) => {
      const valor = campo.toLowerCase();
      return valor.includes(q) || valor.replace(/[.\-\s]/g, "").includes(qSinPuntos);
    },
  );
}

export default function TercerosIndexClient({
  filas,
  puedeEliminar,
}: {
  filas: CargueTerceroRow[];
  /** `balance:eliminar` (solo administradores): pinta la papelera del cargue. */
  puedeEliminar: boolean;
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [confirmar, setConfirmar] = useState<number | null>(null);
  const [eliminando, startEliminar] = useTransition();

  const visibles = useMemo(() => filas.filter((f) => coincide(f, busqueda)), [filas, busqueda]);
  const pg = usePagination(visibles, 50);
  const { resetToFirstPage } = pg;
  useEffect(() => {
    resetToFirstPage();
  }, [busqueda, resetToFirstPage]);

  const onEliminar = (id: number) => {
    startEliminar(async () => {
      const r = await eliminarBalanceTercero({ encabezadoId: id });
      if (r.ok) notifySuccess(r.message ?? "Cargue eliminado.");
      else notifyError(r.message ?? "No se pudo eliminar el cargue.");
      setConfirmar(null);
      router.refresh();
    });
  };

  if (filas.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="doc"
          title="Aún no hay balances por tercero"
          description="Se cargan desde «Cargar balance» marcando «Abrir por tercero (CxC/CxP)». No generan borrador: quedan cargados directamente aquí."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex w-full max-w-md items-center gap-2 rounded-md border border-ink-200 bg-white px-3 py-2 text-ink-400 shadow-sm focus-within:border-blue-400">
        <Icon name="search" size={15} />
        <input
          type="text"
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
          placeholder="Buscar por archivo, NIT, razón social o período…"
          aria-label="Buscar por archivo, NIT, razón social o período"
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink-700 outline-none placeholder:text-ink-400"
        />
        {busqueda.length > 0 && (
          <button
            type="button"
            onClick={() => setBusqueda("")}
            aria-label="Limpiar búsqueda"
            title="Limpiar búsqueda"
            className="rounded p-0.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
          >
            <Icon name="x" size={14} />
          </button>
        )}
      </div>

      <Card>
        <div className="max-sm:overflow-x-auto">
          <table className="tabla-encabezado-fijo w-full text-[12.5px]">
            <thead className="bg-ink-50 text-ink-500">
              <tr className="text-left text-[11px] uppercase tracking-wider">
                <th className="px-4 py-2 font-semibold">Archivo</th>
                <th className="px-4 py-2 font-semibold">Cliente / NIT</th>
                <th className="px-4 py-2 font-semibold">Período</th>
                <th className="px-4 py-2 font-semibold">Versión</th>
                <th className="px-4 py-2 text-right font-semibold">Filas</th>
                <th className="px-4 py-2 text-right font-semibold">Terceros</th>
                <th className="px-4 py-2 text-right font-semibold">Cuentas</th>
                <th className="px-4 py-2 text-right font-semibold">Saldo final</th>
                <th className="px-4 py-2 font-semibold">Última carga</th>
                <th className="px-4 py-2 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.map((f) => (
                <tr key={f.id} className="border-t border-ink-100 align-middle hover:bg-ink-50/50">
                  <td className="max-w-[260px] px-4 py-2.5">
                    <Link
                      href={`/balance/terceros/${f.id}`}
                      className="block truncate font-medium text-blue-500 hover:underline"
                      title={f.archivo ?? undefined}
                    >
                      {f.archivo ?? "— sin archivo —"}
                    </Link>
                    <span className="block text-[10.5px] text-ink-400">
                      {[f.tamanoArchivo, f.cargadoPor ? `por ${f.cargadoPor}` : null].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex flex-col gap-0.5">
                      <span className="font-medium text-ink-800">{f.clienteNombre}</span>
                      {f.clienteNit && (
                        <span className="font-mono text-[10.5px] text-ink-400">{f.clienteNit}</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-700">{f.periodo}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <Chip label={f.version} tone={f.esOficial ? "ok" : "ink"} />
                      {f.versionesPeriodo > 1 && (
                        <span
                          className="text-[10.5px] text-ink-400"
                          title={`${f.versionesPeriodo} cargues del mismo cliente y período`}
                        >
                          de {f.versionesPeriodo}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-700">{fmtNum(f.filas)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-700">{fmtNum(f.terceros)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-700">{fmtNum(f.cuentas)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-ink-800">
                    {fmtContable(f.saldoFinal)}
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-ink-500">
                    <span className="block whitespace-nowrap">{f.fecha}</span>
                    {f.hora && (
                      <span className="block whitespace-nowrap text-[10px] text-ink-400">{f.hora}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href={`/balance/terceros/${f.id}`}
                        title="Ver cargue"
                        aria-label={`Ver el cargue ${f.version} de ${f.periodo}`}
                        className={`${BOTON_ACCION} border-ink-200 text-ink-600 hover:bg-ink-50 hover:text-ink-900`}
                      >
                        <Icon name="eye" size={15} />
                      </Link>
                      {puedeEliminar &&
                        (confirmar === f.id ? (
                          <>
                            <button
                              onClick={() => onEliminar(f.id)}
                              disabled={eliminando}
                              title="Confirmar eliminación"
                              aria-label="Confirmar eliminación"
                              className={`${BOTON_ACCION} border-err-300 bg-err-100 text-err-700 hover:bg-err-200 disabled:opacity-60`}
                            >
                              {eliminando ? (
                                <EstadoProcesando etiqueta="Eliminando" />
                              ) : (
                                <Icon name="check" size={15} />
                              )}
                            </button>
                            <button
                              onClick={() => setConfirmar(null)}
                              title="Cancelar"
                              aria-label="Cancelar eliminación"
                              className={`${BOTON_ACCION} border-ink-200 text-ink-500 hover:bg-ink-50 hover:text-ink-800`}
                            >
                              <Icon name="x" size={15} />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmar(f.id)}
                            title="Eliminar cargue"
                            aria-label={`Eliminar el cargue ${f.version} de ${f.periodo}`}
                            className={`${BOTON_ACCION} border-err-200 text-err-600 hover:bg-err-50 hover:text-err-700`}
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-[12.5px] text-ink-400">
                    No se encontraron cargues con ese archivo, NIT, razón social o período.
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
            <PaginationControls
              currentPage={pg.page}
              totalPages={pg.totalPages}
              onPageChange={pg.setPage}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
