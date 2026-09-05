"use client";

import { useMemo, useState } from "react";
import { Card, Chip, EmptyState, StatCard } from "@/components/ui";
import { Icon } from "@/components/icons";
import { PageSizeSelect, PaginationFooter, usePagination } from "@/components/pagination-controls";
import { fmtContable as fmt, fmtNum } from "@/lib/format";
import {
  filtrarComparacionTerceros,
  resumirComparacionTerceros,
  type ComparacionCuentaTerceros,
} from "@/lib/balance/visor-terceros";

export type FuenteTercero = { version: string; archivo: string; filas: number; origen: string };

/**
 * Cliente del visor «Balance por terceros». Solo lectura: filtra, busca y pagina
 * en memoria la comparación YA calculada en el servidor (mismo patrón que
 * `balance-diff-client.tsx`). Sin esta pantalla no hay forma directa de ver si la
 * homologación de una cuenta se replicó igual en su detalle por tercero.
 */
export default function TercerosClient({
  comparaciones,
  fuenteTercero,
}: {
  comparaciones: ComparacionCuentaTerceros[];
  fuenteTercero: FuenteTercero;
}) {
  const [q, setQ] = useState("");
  const [soloDiferencias, setSoloDiferencias] = useState(false);

  const filtradas = useMemo(
    () => filtrarComparacionTerceros(comparaciones, { q, soloDiferencias }),
    [comparaciones, q, soloDiferencias],
  );
  const pg = usePagination(filtradas, 50);
  const resumen = useMemo(() => resumirComparacionTerceros(comparaciones), [comparaciones]);

  return (
    <div>
      <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-500">
        <span className="inline-flex items-center gap-1"><Icon name="link" size={12} /> Fuente por tercero: versión {fuenteTercero.version}</span>
        <span className="font-mono">{fuenteTercero.archivo} · {fmtNum(fuenteTercero.filas)} filas</span>
      </p>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Cuentas comparadas" value={fmtNum(resumen.totalCuentas)} tone="ink" />
        <StatCard label="Con diferencia" value={fmtNum(resumen.conDiferencia)} tone={resumen.conDiferencia > 0 ? "warn" : "ok"} />
        <StatCard label="Incompletas" value={fmtNum(resumen.incompletas)} tone={resumen.incompletas > 0 ? "err" : "ok"} />
        <StatCard
          label="Saldo balance / Σ terceros"
          value={`${fmt(resumen.saldoBalance)} / ${fmt(resumen.saldoTercero)}`}
          tone={Math.abs(resumen.saldoBalance - resumen.saldoTercero) > 0.01 ? "warn" : "blue"}
          valueClassName="text-[14px]"
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-ink-400 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
          <Icon name="search" size={14} />
          <input
            aria-label="Buscar cuenta o tercero"
            value={q}
            onChange={(e) => { setQ(e.target.value); pg.resetToFirstPage(); }}
            placeholder="Buscar cuenta, NIT o tercero…"
            className="w-56 bg-transparent text-[12.5px] text-ink-800 outline-none placeholder:text-ink-400"
          />
        </div>
        <label className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-600">
          <input
            type="checkbox"
            checked={soloDiferencias}
            onChange={(e) => { setSoloDiferencias(e.target.checked); pg.resetToFirstPage(); }}
          />
          Solo con diferencia
        </label>
        <div className="ml-auto"><PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} /></div>
      </div>

      {filtradas.length === 0 ? (
        <Card><EmptyState icon="search" title="Sin resultados" description="Ningún registro coincide con el filtro aplicado." /></Card>
      ) : (
        <div className="space-y-3">
          {pg.pageItems.map((fila) => (
            <FilaCuenta key={`${fila.cuenta8}:${q}`} fila={fila} busqueda={q} />
          ))}
        </div>
      )}

      <div className="mt-3"><PaginationFooter rangeLabel={pg.rangeLabel} currentPage={pg.page} totalPages={pg.totalPages} onPageChange={pg.setPage} /></div>
    </div>
  );
}

function estadoChip(fila: ComparacionCuentaTerceros) {
  if (fila.incompleto) {
    return <Chip label={!fila.enBalance ? "Sin cuenta en el balance" : "Sin detalle por tercero"} tone="err" />;
  }
  if (fila.diferenciaHomologacion && fila.diferenciaSaldo) return <Chip label="Homologación y saldo difieren" tone="err" />;
  if (fila.diferenciaHomologacion) return <Chip label="Homologación difiere" tone="warn" />;
  if (fila.diferenciaSaldo) return <Chip label="Saldo difiere" tone="warn" />;
  return <Chip label="Ok" tone="ok" />;
}

function FilaCuenta({ fila, busqueda }: { fila: ComparacionCuentaTerceros; busqueda: string }) {
  const [expandido, setExpandido] = useState(!!busqueda.trim());
  const q = busqueda.trim().toLowerCase();
  const coincideCuenta = `${fila.cuenta8} ${fila.nombreCuenta}`.toLowerCase().includes(q);
  const detalle = useMemo(() => coincideCuenta ? fila.terceros : fila.terceros.filter((t) => `${t.nitTercero ?? ""} ${t.nombreTercero ?? ""}`.toLowerCase().includes(q)), [fila.terceros, q, coincideCuenta]);
  const pg = usePagination(detalle, 50);
  const abierto = expandido;
  return (
    <Card className="overflow-hidden p-0">
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-ink-100 px-4 py-2.5 ${fila.tieneDiferencia ? "bg-warn-100/40" : ""}`}>
        <span className="font-mono text-[12.5px] font-semibold text-ink-800">{fila.cuenta8}</span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-700">{fila.nombreCuenta || "—"}</span>
        {estadoChip(fila)}
        <button type="button" aria-expanded={abierto} onClick={() => setExpandido((v) => !v)} className="text-[12px] font-semibold text-blue-600 hover:underline">{abierto ? "Ocultar detalle" : `Ver detalle (${fila.terceros.length})`}</button>
      </div>

      <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">Balance (cuenta)</div>
          <div className="text-[12.5px] text-ink-700">
            Russell:{" "}
            <span className="font-mono font-semibold text-ink-800">
              {fila.enBalance ? (fila.cuenta6RussellBalance ?? "Sin homologar") : "—"}
            </span>
          </div>
          <div className="mt-0.5 text-[12.5px] text-ink-700">
            Saldo final: <span className="font-mono font-semibold text-ink-800">{fila.enBalance ? fmt(fila.saldoFinalBalance) : "—"}</span>
          </div>
        </div>
        <div>
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">Consolidado por tercero</div>
          <div className="text-[12.5px] text-ink-700">
            Russell:{" "}
            <span className="font-mono font-semibold text-ink-800">
              {!fila.enTercero
                ? "—"
                : fila.homologacionInconsistente
                  ? "Inconsistente entre terceros"
                  : (fila.cuenta6RussellTercero ?? "Sin homologar")}
            </span>
          </div>
          <div className="mt-0.5 text-[12.5px] text-ink-700">
            Σ saldo final: <span className="font-mono font-semibold text-ink-800">{fila.enTercero ? fmt(fila.saldoConsolidadoTercero) : "—"}</span>
          </div>
        </div>
      </div>

      {abierto && (fila.terceros.length > 0 ? (
        <div className="overflow-x-auto border-t border-ink-100">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[10.5px] uppercase tracking-wider text-ink-500">
                <th className="px-4 py-1.5 font-semibold">NIT</th>
                <th className="px-4 py-1.5 font-semibold">Tercero</th>
                <th className="px-4 py-1.5 font-semibold">Russell</th>
                <th className="px-4 py-1.5 text-right font-semibold">Saldo inicial</th>
                <th className="px-4 py-1.5 text-right font-semibold">Débitos</th>
                <th className="px-4 py-1.5 text-right font-semibold">Créditos</th>
                <th className="px-4 py-1.5 text-right font-semibold">Saldo final</th>
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.map((t, i) => (
                <tr key={i} className="border-b border-ink-50 last:border-0">
                  <td className="px-4 py-1.5 font-mono text-ink-600">{t.nitTercero ?? "—"}</td>
                  <td className="px-4 py-1.5 text-ink-700">
                    {t.esFilaPropia ? <span className="italic text-ink-400">Sin desagregar por tercero</span> : (t.nombreTercero || "—")}
                  </td>
                  <td className="px-4 py-1.5 font-mono text-ink-600">{t.cuenta6Russell ?? "—"}</td>
                  <td className="px-4 py-1.5 text-right font-mono text-ink-600">{fmt(t.saldoInicial)}</td>
                  <td className="px-4 py-1.5 text-right font-mono text-ink-600">{fmt(t.debitos)}</td>
                  <td className="px-4 py-1.5 text-right font-mono text-ink-600">{fmt(t.creditos)}</td>
                  <td className="px-4 py-1.5 text-right font-mono font-semibold text-ink-800">{fmt(t.saldoFinal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <PaginationFooter rangeLabel={pg.rangeLabel} currentPage={pg.page} totalPages={pg.totalPages} onPageChange={pg.setPage} />
        </div>
      ) : (
        <div className="border-t border-ink-100 px-4 py-2.5 text-[12px] text-ink-400">Sin filas en el detalle por tercero.</div>
      ))}
    </Card>
  );
}
