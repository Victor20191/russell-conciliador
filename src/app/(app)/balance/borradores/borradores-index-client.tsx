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
import type { VinculoClienteBorrador } from "@/lib/balance/autorizacion-borrador";
import { descartarBorrador } from "@/app/actions/balance";
import { notifySuccess, notifyError } from "@/lib/client-notifications";
import {
  PerfilesEnMemoriaButton,
  PerfilesEnMemoriaModal,
  type ClientePerfilesEnMemoria,
} from "@/app/(app)/balance/perfiles-en-memoria";

export type BorradorRow = {
  loteId: string;
  archivoNombre: string;
  conEncabezado: boolean;
  nitDetectado: string | null;
  cliente: VinculoClienteBorrador;
  perfilesEnMemoria: number;
  puedeGestionarPerfiles: boolean;
  periodo: string;
  cuentasMovimiento: number;
  cuadrado: boolean;
  partidaDobleDiff: number;
  cargadoPor: string | null;
  creadoEn: string | null;
  fecha: string;
  hora: string | null;
};

/** Base compartida de los botones de la columna «Acciones»: todos cuadrados y
 *  del MISMO tamaño, para que la columna quede alineada fila a fila. */
const BOTON_ACCION =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition";

function normalizarBusqueda(valor: string | null | undefined) {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function fechaOrdenBorrador(valor: string | null): number {
  if (!valor) return 0;
  const fecha = Date.parse(valor);
  return Number.isFinite(fecha) ? fecha : 0;
}

/** Borradores vigentes (cliente persistido) primero; dentro de cada grupo, recientes. */
export function ordenarBorradoresListado(
  rows: readonly BorradorRow[],
): BorradorRow[] {
  return [...rows].sort((a, b) => {
    const grupoA = a.cliente.tipo === "asignado" ? 0 : 1;
    const grupoB = b.cliente.tipo === "asignado" ? 0 : 1;
    if (grupoA !== grupoB) return grupoA - grupoB;
    return fechaOrdenBorrador(b.creadoEn) - fechaOrdenBorrador(a.creadoEn);
  });
}

/** Coincide si el término aparece en archivo, razón social o NIT (con o sin DV). */
export function coincideBusquedaBorrador(
  borrador: Pick<BorradorRow, "archivoNombre" | "cliente" | "nitDetectado">,
  busqueda: string,
): boolean {
  const termino = normalizarBusqueda(busqueda);
  if (!termino) return true;

  const nitBuscado = claveNit(busqueda);
  const nombreCliente = borrador.cliente.tipo === "sin_cliente"
    ? null
    : borrador.cliente.nombre;
  const nitCliente = borrador.cliente.tipo === "sin_cliente"
    ? null
    : borrador.cliente.nit;
  const nitsFila = [borrador.nitDetectado, nitCliente]
    .map((nit) => claveNit(nit ?? ""))
    .filter(Boolean);

  return (
    normalizarBusqueda(borrador.archivoNombre).includes(termino)
    || normalizarBusqueda(nombreCliente).includes(termino)
    || normalizarBusqueda(nitCliente).includes(termino)
    || normalizarBusqueda(borrador.nitDetectado).includes(termino)
    || (
      nitBuscado.length > 0
      && nitsFila.some((nit) => nit.includes(nitBuscado))
    )
  );
}

export function ClienteBorradorCelda({
  cliente,
  nitDetectado,
}: {
  cliente: VinculoClienteBorrador;
  nitDetectado: string | null;
}) {
  if (cliente.tipo === "asignado") {
    return (
      <span className="inline-flex flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-ink-800">
            {cliente.nombre ?? `Cliente #${cliente.id}`}
          </span>
          <span className="rounded-full border border-ok-100 bg-ok-100/40 px-1.5 py-0.5 text-[9.5px] font-semibold text-ok-700">
            Cliente asignado
          </span>
        </span>
        {(cliente.nit ?? nitDetectado) && (
          <span className="font-mono text-[10.5px] text-ink-400">
            {cliente.nit ?? nitDetectado}
          </span>
        )}
      </span>
    );
  }

  if (cliente.tipo === "sugerido") {
    return (
      <span className="inline-flex flex-col gap-0.5">
        <span className="font-medium text-ink-700">{cliente.nombre}</span>
        <span className="w-fit rounded-full border border-warn-300 bg-warn-50 px-2 py-0.5 text-[9.5px] font-semibold text-warn-700">
          Histórico · sugerencia por NIT
        </span>
        <span className="text-[10px] text-warn-700">
          Aún no está asignado
        </span>
        {(nitDetectado ?? cliente.nit) && (
          <span className="font-mono text-[10.5px] text-ink-400">
            {nitDetectado ?? cliente.nit}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col gap-0.5">
      <span
        className="w-fit rounded-full border border-warn-300 bg-warn-50 px-2 py-0.5 text-[10px] font-semibold text-warn-700"
        title="Asignar el cliente es obligatorio: hazlo al abrir el borrador."
      >
        Histórico · sin cliente asignado
      </span>
      {nitDetectado && (
        <span className="font-mono text-[10.5px] text-ink-400">
          NIT detectado: {nitDetectado}
        </span>
      )}
    </span>
  );
}

export default function BorradoresIndexClient({ rows }: { rows: BorradorRow[] }) {
  const router = useRouter();
  const [descartando, startDescartar] = useTransition();
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [clientePerfiles, setClientePerfiles] = useState<ClientePerfilesEnMemoria | null>(null);
  const borradoresOrdenados = useMemo(
    () => ordenarBorradoresListado(rows),
    [rows],
  );
  const borradoresFiltrados = useMemo(
    () => borradoresOrdenados.filter(
      (borrador) => coincideBusquedaBorrador(borrador, busqueda),
    ),
    [borradoresOrdenados, busqueda],
  );
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
          type="text"
          value={busqueda}
          onChange={(event) => {
            setBusqueda(event.target.value);
            pg.resetToFirstPage();
          }}
          placeholder="Buscar por archivo, NIT o razón social…"
          aria-label="Buscar borradores por archivo, NIT o razón social"
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
                <th className="px-3 py-2 font-semibold">Perfiles en memoria</th>
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
                    <ClienteBorradorCelda
                      cliente={r.cliente}
                      nitDetectado={r.nitDetectado}
                    />
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
                  <td className="px-3 py-2 text-[11px] text-ink-500">
                    <span className="block whitespace-nowrap">{r.fecha}</span>
                    {r.hora && <span className="block whitespace-nowrap text-[10px] text-ink-400">{r.hora}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {r.puedeGestionarPerfiles
                    && r.cliente.tipo === "asignado"
                    && r.cliente.nombre
                    && r.cliente.nit ? (
                      <PerfilesEnMemoriaButton
                        cantidad={r.perfilesEnMemoria}
                        onClick={() => {
                          if (
                            r.cliente.tipo !== "asignado"
                            || !r.cliente.nombre
                            || !r.cliente.nit
                          ) return;
                          setClientePerfiles({
                            id: r.cliente.id,
                            name: r.cliente.nombre,
                            nit: r.cliente.nit,
                            perfilesEnMemoria: r.perfilesEnMemoria,
                          });
                        }}
                        className="whitespace-nowrap"
                      />
                    ) : (
                      <span className="text-[10.5px] leading-tight text-ink-400">
                        {r.cliente.tipo !== "asignado"
                          ? "Asigna el cliente para verlos"
                          : "No disponible para tu cartera"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {/* Acciones como iconos cuadrados del MISMO tamaño (BOTON_ACCION):
                        revisar (ojo) y descartar (papelera). El descarte pide
                        confirmación en el sitio, con ✓/✕ del mismo tamaño. */}
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href={`/balance/borradores/${r.loteId}`}
                        title="Revisar borrador"
                        aria-label="Revisar borrador"
                        className={`${BOTON_ACCION} border-ink-200 text-ink-600 hover:bg-ink-50 hover:text-ink-900`}
                      >
                        <Icon name="eye" size={15} />
                      </Link>
                      {confirmar === r.loteId ? (
                        <>
                          <button
                            onClick={() => onDescartar(r.loteId)}
                            disabled={descartando}
                            title="Confirmar descarte"
                            aria-label="Confirmar descarte"
                            className={`${BOTON_ACCION} border-err-300 bg-err-100 text-err-700 hover:bg-err-200 disabled:opacity-60`}
                          >
                            {descartando ? <EstadoProcesando etiqueta="Descartando" /> : <Icon name="check" size={15} />}
                          </button>
                          <button
                            onClick={() => setConfirmar(null)}
                            title="Cancelar"
                            aria-label="Cancelar descarte"
                            className={`${BOTON_ACCION} border-ink-200 text-ink-500 hover:bg-ink-50 hover:text-ink-800`}
                          >
                            <Icon name="x" size={15} />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmar(r.loteId)}
                          title="Descartar borrador"
                          aria-label="Descartar borrador"
                          className={`${BOTON_ACCION} border-err-200 text-err-600 hover:bg-err-50 hover:text-err-700`}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {borradoresFiltrados.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[12.5px] text-ink-400">
                    No se encontraron borradores con ese archivo, NIT o razón social.
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
      <PerfilesEnMemoriaModal
        cliente={clientePerfiles}
        onClose={() => setClientePerfiles(null)}
      />
    </div>
  );
}
