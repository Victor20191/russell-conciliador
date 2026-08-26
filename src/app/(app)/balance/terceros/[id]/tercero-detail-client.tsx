"use client";

// Detalle de un cargue del balance por tercero. Tres lecturas del MISMO dato,
// todas reconstruidas en el servidor con `tercero-vista.ts`:
//   · Por cuenta   — qué cuentas del auxiliar componen el saldo (una fila por imputable).
//   · Por tercero  — con quién está el saldo (el bucket «sin NIT» va siempre al final).
//   · Detalle      — las filas crudas (cuenta × tercero) para auditar.
// La cuarta pestaña son las versiones del período, como en el balance normal.

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
import { Card, Chip, StatCard } from "@/components/ui";
import { fmtContable, fmtNum } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { eliminarBalanceTercero } from "@/app/actions/balance";
import {
  coincideBusquedaTercero,
  type FilaBalanceTercero,
  type GrupoCuentaTercero,
  type GrupoTerceroBalance,
  type ResumenBalanceTercero,
} from "@/lib/balance/tercero-vista";

export type VersionTerceroRow = {
  id: number;
  version: string;
  esOficial: boolean;
  archivo: string | null;
  filas: number;
  cargadoPor: string | null;
  fecha: string;
};

type Tab = "cuentas" | "terceros" | "detalle" | "versiones";

function TabBtn({
  on,
  onClick,
  label,
  count,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${
        on ? "bg-navy-800 text-white" : "text-ink-600 hover:bg-ink-100"
      }`}
    >
      {label}
      {count != null && (
        <span
          className={`rounded-full px-1.5 text-[10px] font-semibold ${
            on ? "bg-white/20 text-white" : "bg-ink-100 text-ink-500"
          }`}
        >
          {fmtNum(count)}
        </span>
      )}
    </button>
  );
}

/** Buscador de la pantalla: el mismo control en las tres tablas de datos. */
function Buscador({
  valor,
  onCambiar,
  placeholder,
}: {
  valor: string;
  onCambiar: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex w-full max-w-md items-center gap-2 rounded-md border border-ink-200 bg-white px-3 py-2 text-ink-400 shadow-sm focus-within:border-blue-400">
      <Icon name="search" size={15} />
      <input
        type="text"
        value={valor}
        onChange={(event) => onCambiar(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink-700 outline-none placeholder:text-ink-400"
      />
      {valor.length > 0 && (
        <button
          type="button"
          onClick={() => onCambiar("")}
          aria-label="Limpiar búsqueda"
          title="Limpiar búsqueda"
          className="rounded p-0.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

function PieTabla({ pg }: { pg: ReturnType<typeof usePagination<unknown>> }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-4 py-3">
      <span className="text-[12px] text-ink-500">{pg.rangeLabel}</span>
      <div className="flex flex-wrap items-center gap-3">
        <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
        <PaginationControls currentPage={pg.page} totalPages={pg.totalPages} onPageChange={pg.setPage} />
      </div>
    </div>
  );
}

export default function TerceroDetailClient({
  encabezadoId,
  resumen,
  porCuenta,
  porTercero,
  filas,
  versiones,
  puedeEliminar,
}: {
  encabezadoId: number;
  resumen: ResumenBalanceTercero;
  porCuenta: GrupoCuentaTercero[];
  porTercero: GrupoTerceroBalance[];
  filas: FilaBalanceTercero[];
  versiones: VersionTerceroRow[];
  puedeEliminar: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("cuentas");
  const [busqueda, setBusqueda] = useState("");
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [eliminando, startEliminar] = useTransition();

  const onEliminar = () => {
    startEliminar(async () => {
      const r = await eliminarBalanceTercero({ encabezadoId });
      if (!r.ok) {
        notifyError(r.message ?? "No se pudo eliminar el cargue.");
        return;
      }
      notifySuccess(r.message ?? "Cargue eliminado.");
      router.push("/balance/terceros");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Saldo final"
          value={fmtContable(resumen.saldoFinal)}
          hint={`${fmtNum(resumen.filas)} fila(s) del archivo`}
          valueClassName="text-xl"
        />
        <StatCard
          label="Terceros"
          value={fmtNum(resumen.terceros)}
          hint={
            resumen.filasSinNit > 0
              ? `${fmtNum(resumen.filasSinNit)} fila(s) sin NIT · ${fmtContable(resumen.saldoSinNit)}`
              : "todas las filas traen NIT"
          }
          tone={resumen.filasSinNit > 0 ? "warn" : "ink"}
          valueClassName="text-xl"
        />
        <StatCard
          label="Cuentas"
          value={fmtNum(resumen.cuentas)}
          hint="cuentas imputables (8 díg.) de CxC/CxP"
          valueClassName="text-xl"
        />
        <StatCard
          label="Sin homologar"
          value={fmtNum(resumen.sinHomologar)}
          hint={`${fmtNum(resumen.homologadas)} fila(s) con cuenta Russell`}
          tone={resumen.sinHomologar > 0 ? "warn" : "ok"}
          valueClassName="text-xl"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <TabBtn on={tab === "cuentas"} onClick={() => setTab("cuentas")} label="Por cuenta" count={porCuenta.length} />
        <TabBtn on={tab === "terceros"} onClick={() => setTab("terceros")} label="Por tercero" count={porTercero.length} />
        <TabBtn on={tab === "detalle"} onClick={() => setTab("detalle")} label="Detalle" count={filas.length} />
        <TabBtn on={tab === "versiones"} onClick={() => setTab("versiones")} label="Versiones" count={versiones.length} />
        {puedeEliminar && (
          <div className="ml-auto flex items-center gap-1.5">
            {confirmarBorrado ? (
              <>
                <span className="text-[12px] text-err-700">¿Eliminar este cargue y todo su detalle?</span>
                <button
                  type="button"
                  onClick={onEliminar}
                  disabled={eliminando}
                  className="inline-flex items-center gap-1.5 rounded-md bg-err-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-err-700/90 disabled:opacity-60"
                >
                  {eliminando ? <EstadoProcesando etiqueta="Eliminando" /> : "Sí, eliminar"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmarBorrado(false)}
                  disabled={eliminando}
                  className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] font-medium text-ink-600 hover:bg-ink-50 disabled:opacity-60"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmarBorrado(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-err-200 px-3 py-1.5 text-[12.5px] font-medium text-err-700 transition hover:bg-err-50"
              >
                <Icon name="trash" size={14} /> Eliminar cargue
              </button>
            )}
          </div>
        )}
      </div>

      {tab === "cuentas" && <TablaCuentas grupos={porCuenta} busqueda={busqueda} setBusqueda={setBusqueda} />}
      {tab === "terceros" && <TablaTerceros grupos={porTercero} busqueda={busqueda} setBusqueda={setBusqueda} />}
      {tab === "detalle" && <TablaDetalle filas={filas} busqueda={busqueda} setBusqueda={setBusqueda} />}
      {tab === "versiones" && <TablaVersiones versiones={versiones} actual={encabezadoId} />}
    </div>
  );
}

function TablaCuentas({
  grupos,
  busqueda,
  setBusqueda,
}: {
  grupos: GrupoCuentaTercero[];
  busqueda: string;
  setBusqueda: (v: string) => void;
}) {
  const visibles = useMemo(
    () =>
      grupos.filter((g) =>
        coincideBusquedaTercero(
          {
            cuenta4: g.cuenta4,
            cuenta6: g.cuenta8.slice(0, 6),
            cuenta8: g.cuenta8,
            nombreCuenta: g.nombreCuenta,
            nitTercero: null,
            nombreTercero: null,
          },
          busqueda,
        ),
      ),
    [grupos, busqueda],
  );
  const pg = usePagination(visibles, 50);
  const { resetToFirstPage } = pg;
  useEffect(() => {
    resetToFirstPage();
  }, [busqueda, resetToFirstPage]);

  return (
    <div className="flex flex-col gap-3">
      <Buscador valor={busqueda} onCambiar={setBusqueda} placeholder="Buscar por cuenta o nombre de cuenta…" />
      <Card>
        <div className="max-sm:overflow-x-auto">
          <table className="tabla-encabezado-fijo w-full text-[12.5px]">
            <thead className="bg-ink-50 text-ink-500">
              <tr className="text-left text-[11px] uppercase tracking-wider">
                <th className="px-4 py-2 font-semibold">Cuenta</th>
                <th className="px-4 py-2 font-semibold">Nombre</th>
                <th className="px-4 py-2 font-semibold">Homologada</th>
                <th className="px-4 py-2 text-right font-semibold">Terceros</th>
                <th className="px-4 py-2 text-right font-semibold">Saldo inicial</th>
                <th className="px-4 py-2 text-right font-semibold">Débitos</th>
                <th className="px-4 py-2 text-right font-semibold">Créditos</th>
                <th className="px-4 py-2 text-right font-semibold">Saldo final</th>
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.map((g) => (
                <tr key={g.cuenta8} className="border-t border-ink-100 hover:bg-ink-50/50">
                  <td className="px-4 py-2 font-mono font-medium text-ink-800">{g.cuenta8}</td>
                  <td className="max-w-[320px] truncate px-4 py-2 text-ink-700" title={g.nombreCuenta}>
                    {g.nombreCuenta}
                  </td>
                  <td className="px-4 py-2">
                    {g.cuenta6Russell ? (
                      <span className="font-mono text-[11px] text-ink-600">{g.cuenta6Russell}</span>
                    ) : (
                      <Chip label="Sin homologar" tone="warn" />
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-700">{fmtNum(g.terceros)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-600">{fmtContable(g.saldoInicial)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-600">{fmtContable(g.debitos)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-600">{fmtContable(g.creditos)}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums text-ink-800">
                    {fmtContable(g.saldoFinal)}
                  </td>
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[12.5px] text-ink-400">
                    Ninguna cuenta coincide con la búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PieTabla pg={pg} />
      </Card>
    </div>
  );
}

function TablaTerceros({
  grupos,
  busqueda,
  setBusqueda,
}: {
  grupos: GrupoTerceroBalance[];
  busqueda: string;
  setBusqueda: (v: string) => void;
}) {
  const visibles = useMemo(
    () =>
      grupos.filter((g) =>
        coincideBusquedaTercero(
          {
            cuenta4: "",
            cuenta6: "",
            cuenta8: "",
            nombreCuenta: "",
            nitTercero: g.nit,
            nombreTercero: g.nombre,
          },
          busqueda,
        ),
      ),
    [grupos, busqueda],
  );
  const pg = usePagination(visibles, 50);
  const { resetToFirstPage } = pg;
  useEffect(() => {
    resetToFirstPage();
  }, [busqueda, resetToFirstPage]);

  return (
    <div className="flex flex-col gap-3">
      <Buscador valor={busqueda} onCambiar={setBusqueda} placeholder="Buscar por NIT o nombre del tercero…" />
      <Card>
        <div className="max-sm:overflow-x-auto">
          <table className="tabla-encabezado-fijo w-full text-[12.5px]">
            <thead className="bg-ink-50 text-ink-500">
              <tr className="text-left text-[11px] uppercase tracking-wider">
                <th className="px-4 py-2 font-semibold">NIT</th>
                <th className="px-4 py-2 font-semibold">Tercero</th>
                <th className="px-4 py-2 text-right font-semibold">Cuentas</th>
                <th className="px-4 py-2 text-right font-semibold">Filas</th>
                <th className="px-4 py-2 text-right font-semibold">Débitos</th>
                <th className="px-4 py-2 text-right font-semibold">Créditos</th>
                <th className="px-4 py-2 text-right font-semibold">Saldo final</th>
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.map((g) => (
                <tr key={g.nit ?? "__sin_nit__"} className="border-t border-ink-100 hover:bg-ink-50/50">
                  <td className="px-4 py-2 font-mono text-ink-700">
                    {g.nit ?? <Chip label="Sin NIT" tone="warn" />}
                  </td>
                  <td className="max-w-[360px] truncate px-4 py-2 text-ink-700" title={g.nombre ?? undefined}>
                    {g.nit
                      ? g.nombre ?? "—"
                      : "Filas sin tercero identificado (no cruzan contra el auxiliar)"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-700">{fmtNum(g.cuentas)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-700">{fmtNum(g.filas)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-600">{fmtContable(g.debitos)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-600">{fmtContable(g.creditos)}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums text-ink-800">
                    {fmtContable(g.saldoFinal)}
                  </td>
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-[12.5px] text-ink-400">
                    Ningún tercero coincide con la búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PieTabla pg={pg} />
      </Card>
    </div>
  );
}

function TablaDetalle({
  filas,
  busqueda,
  setBusqueda,
}: {
  filas: FilaBalanceTercero[];
  busqueda: string;
  setBusqueda: (v: string) => void;
}) {
  const visibles = useMemo(
    () => filas.filter((f) => coincideBusquedaTercero(f, busqueda)),
    [filas, busqueda],
  );
  const pg = usePagination(visibles, 50);
  const { resetToFirstPage } = pg;
  useEffect(() => {
    resetToFirstPage();
  }, [busqueda, resetToFirstPage]);

  return (
    <div className="flex flex-col gap-3">
      <Buscador
        valor={busqueda}
        onCambiar={setBusqueda}
        placeholder="Buscar por cuenta, nombre de cuenta, NIT o tercero…"
      />
      <Card>
        <div className="max-sm:overflow-x-auto">
          <table className="tabla-encabezado-fijo w-full text-[12.5px]">
            <thead className="bg-ink-50 text-ink-500">
              <tr className="text-left text-[11px] uppercase tracking-wider">
                <th className="px-4 py-2 font-semibold">Cuenta</th>
                <th className="px-4 py-2 font-semibold">Nombre</th>
                <th className="px-4 py-2 font-semibold">NIT</th>
                <th className="px-4 py-2 font-semibold">Tercero</th>
                <th className="px-4 py-2 text-right font-semibold">Saldo inicial</th>
                <th className="px-4 py-2 text-right font-semibold">Débitos</th>
                <th className="px-4 py-2 text-right font-semibold">Créditos</th>
                <th className="px-4 py-2 text-right font-semibold">Saldo final</th>
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.map((f) => (
                <tr key={f.id} className="border-t border-ink-100 hover:bg-ink-50/50">
                  <td className="px-4 py-2 font-mono text-ink-800">{f.cuenta8}</td>
                  <td className="max-w-[260px] truncate px-4 py-2 text-ink-700" title={f.nombreCuenta}>
                    {f.nombreCuenta}
                  </td>
                  <td className="px-4 py-2 font-mono text-[11px] text-ink-600">{f.nitTercero ?? "—"}</td>
                  <td className="max-w-[260px] truncate px-4 py-2 text-ink-700" title={f.nombreTercero ?? undefined}>
                    {f.nombreTercero ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-600">{fmtContable(f.saldoInicial)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-600">{fmtContable(f.debitos)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-600">{fmtContable(f.creditos)}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums text-ink-800">
                    {fmtContable(f.saldoFinal)}
                  </td>
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[12.5px] text-ink-400">
                    Ninguna fila coincide con la búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PieTabla pg={pg} />
      </Card>
    </div>
  );
}

function TablaVersiones({ versiones, actual }: { versiones: VersionTerceroRow[]; actual: number }) {
  return (
    <Card>
      <div className="max-sm:overflow-x-auto">
        <table className="tabla-encabezado-fijo w-full text-[12.5px]">
          <thead className="bg-ink-50 text-ink-500">
            <tr className="text-left text-[11px] uppercase tracking-wider">
              <th className="px-4 py-2 font-semibold">Versión</th>
              <th className="px-4 py-2 font-semibold">Archivo</th>
              <th className="px-4 py-2 text-right font-semibold">Filas</th>
              <th className="px-4 py-2 font-semibold">Cargado por</th>
              <th className="px-4 py-2 font-semibold">Fecha</th>
              <th className="px-4 py-2 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {versiones.map((v) => (
              <tr
                key={v.id}
                className={`border-t border-ink-100 ${v.id === actual ? "bg-blue-50/40" : "hover:bg-ink-50/50"}`}
              >
                <td className="px-4 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <Chip label={v.version} tone={v.esOficial ? "ok" : "ink"} />
                    {v.id === actual && <span className="text-[10.5px] text-ink-400">en pantalla</span>}
                  </span>
                </td>
                <td className="max-w-[320px] truncate px-4 py-2 text-ink-700" title={v.archivo ?? undefined}>
                  {v.archivo ?? "— sin archivo —"}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-700">{fmtNum(v.filas)}</td>
                <td className="px-4 py-2 text-ink-600">{v.cargadoPor ?? "—"}</td>
                <td className="px-4 py-2 text-[11px] text-ink-500">{v.fecha}</td>
                <td className="px-4 py-2 text-right">
                  {v.id === actual ? (
                    <span className="text-[11px] text-ink-400">—</span>
                  ) : (
                    <Link
                      href={`/balance/terceros/${v.id}`}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-500 hover:underline"
                    >
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
  );
}
