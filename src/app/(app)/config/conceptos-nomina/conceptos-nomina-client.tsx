"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { Card, CardHeader, StatCard } from "@/components/ui";
import { PageSizeSelect, PaginationFooter, usePagination } from "@/components/pagination-controls";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { fmtDate } from "@/lib/format";
import { eliminarConceptoNomina } from "@/app/actions/import-conceptos-nomina";
import { ImportConceptosNominaButton } from "./import-conceptos-nomina-modal";

/** Un concepto de nómina de un cliente, con TODAS las cuentas contra las que cruza. */
export type ConceptoRow = {
  clienteId: number;
  clienteCodigo: string;
  clienteNombre: string;
  clienteNit: string;
  /** Código del concepto: la llave del mapeo. */
  codigo: string;
  /** Nombre legible. Null en los mapeos que se crearon a mano antes de la carga masiva. */
  concepto: string | null;
  cuentas: { codigo: string; nombre: string | null }[];
  actualizadoEn: number;
};

const BOTON_ACCION =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition";

function normalizarBusqueda(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Tablero de los conceptos de nómina cargados, por cliente. La edición fina de un
 * concepto suelto sigue viviendo en la pestaña «Consolidado» del cargue; aquí se
 * carga en bloque, se revisa el catálogo completo y se retira lo que sobre.
 */
export default function ConceptosNominaClient({
  rows,
  totalClientes,
}: {
  rows: ConceptoRow[];
  totalClientes: number;
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [borrando, setBorrando] = useState<ConceptoRow | null>(null);
  const [enProceso, iniciarBorrado] = useTransition();

  const filtradas = useMemo(() => {
    const q = normalizarBusqueda(busqueda);
    if (!q) return rows;
    return rows.filter((r) =>
      normalizarBusqueda(
        `${r.clienteNombre} ${r.clienteCodigo} ${r.clienteNit} ${r.codigo} ${r.concepto ?? ""} ${r.cuentas
          .map((c) => c.codigo)
          .join(" ")}`,
      ).includes(q),
    );
  }, [rows, busqueda]);

  const pg = usePagination(filtradas);
  const buscando = busqueda.trim().length > 0;

  const totales = useMemo(
    () => ({
      conceptos: rows.length,
      clientes: new Set(rows.map((r) => r.clienteId)).size,
      sinCuenta: rows.filter((r) => r.cuentas.length === 0).length,
    }),
    [rows],
  );

  const confirmarBorrado = () => {
    const objetivo = borrando;
    if (!objetivo) return;
    iniciarBorrado(async () => {
      const res = await eliminarConceptoNomina({
        clienteId: objetivo.clienteId,
        codigo: objetivo.codigo,
      });
      if (res.ok) {
        notifySuccess(res.message);
        setBorrando(null);
        router.refresh();
      } else {
        notifyError(res.message);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Conceptos mapeados" value={String(totales.conceptos)} hint="códigos con cuenta asignada" />
        <StatCard
          label="Clientes con catálogo"
          value={`${totales.clientes} de ${totalClientes}`}
          hint="de los clientes a tu alcance"
        />
        <StatCard
          label="Conceptos sin cuenta"
          value={String(totales.sinCuenta)}
          tone={totales.sinCuenta > 0 ? "warn" : "ok"}
          hint="no cruzan contra el balance"
        />
      </div>

      <Card>
        <CardHeader
          title="Conceptos por cliente"
          right={<ImportConceptosNominaButton />}
        />
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 px-4 py-3">
          <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-md border border-ink-200 bg-white px-3 py-2 text-ink-400 shadow-sm focus-within:border-blue-400">
            <Icon name="search" size={15} />
            <input
              type="text"
              value={busqueda}
              onChange={(evento) => {
                setBusqueda(evento.target.value);
                pg.resetToFirstPage();
              }}
              placeholder="Buscar por cliente, código, concepto o cuenta…"
              aria-label="Buscar conceptos por cliente, código, concepto o cuenta"
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
          <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                <th className="px-4 py-2 font-semibold">Cliente</th>
                <th className="px-4 py-2 font-semibold">Código</th>
                <th className="px-4 py-2 font-semibold">Concepto</th>
                <th className="px-4 py-2 font-semibold">Cuenta(s)</th>
                <th className="px-4 py-2 font-semibold">Actualizado</th>
                <th className="px-4 py-2 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[12.5px] text-ink-400">
                    {buscando
                      ? "Ningún concepto coincide con esa búsqueda."
                      : "Todavía no hay conceptos de nómina cargados. Descarga la plantilla e impórtalos desde Excel."}
                  </td>
                </tr>
              )}
              {pg.pageItems.map((r) => (
                <tr
                  key={`${r.clienteId}:${r.codigo}`}
                  className="border-b border-ink-50 last:border-0 hover:bg-ink-50"
                >
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-ink-800">{r.clienteNombre}</div>
                    <div className="flex flex-wrap gap-x-2 font-mono text-[11px] text-ink-400">
                      <span>{r.clienteCodigo}</span>
                      <span>NIT {r.clienteNit}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-ink-700">{r.codigo}</td>
                  <td className="px-4 py-2.5 text-ink-700">
                    {r.concepto ?? <span className="text-ink-400">Sin nombre (mapeo manual)</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {r.cuentas.map((c) => (
                        <span
                          key={c.codigo}
                          title={c.nombre ?? undefined}
                          className="rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-mono text-[11px] text-ink-700"
                        >
                          {c.codigo}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-ink-500">{fmtDate(new Date(r.actualizadoEn))}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setBorrando(r)}
                        title="Eliminar este concepto y sus cuentas"
                        aria-label={`Eliminar el concepto ${r.codigo} de ${r.clienteNombre}`}
                        className={`${BOTON_ACCION} border-ink-200 bg-white text-ink-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700`}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </td>
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

      {borrando && (
        <Modal
          open
          onClose={() => setBorrando(null)}
          title="Eliminar concepto de nómina"
          size="md"
          footer={
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBorrando(null)}
                className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 transition hover:bg-ink-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarBorrado}
                disabled={enProceso}
                className="rounded-md bg-red-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {enProceso ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          }
        >
          <p className="text-[12.5px] leading-relaxed text-ink-600">
            Se retirará el concepto{" "}
            <span className="font-mono font-semibold text-ink-800">{borrando.codigo}</span>
            {borrando.concepto ? ` («${borrando.concepto}»)` : ""} de{" "}
            <span className="font-semibold">{borrando.clienteNombre}</span> y sus{" "}
            {borrando.cuentas.length} cuenta(s) asignada(s). Las filas de nómina con ese código dejarán
            de cruzar contra el balance hasta que vuelvas a asignarles cuenta. Los datos ya cargados no
            se tocan.
          </p>
        </Modal>
      )}
    </div>
  );
}
