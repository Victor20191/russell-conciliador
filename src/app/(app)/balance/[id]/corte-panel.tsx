"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Chip } from "@/components/ui";
import { revisarComparacionCorte } from "@/app/actions/balance-corte";
import type { BalanceCorteVm, ComparacionCorteVm, VistaCorte } from "@/lib/balance/comparacion-corte-servidor";
import { tonoEstadoBalance } from "@/lib/balance/estado-balance";
import { fmtContable, fmtDateTime } from "@/lib/format";
import { notifyError, notifyInfo } from "@/lib/client-notifications";

const ETIQUETA_ESTADO_DIFERENCIA = { descuadre: "", solo_a: "Solo en este balance", solo_b: "Solo en el otro balance" } as const;

/** Tabla de diferencias de saldo final (este − el otro), con búsqueda y carga por tramos. */
export function DiferenciasCorte({ comparacion, etiquetaA = "Este balance", etiquetaB = "El otro" }: { comparacion: Pick<ComparacionCorteVm, "diferencias">; etiquetaA?: string; etiquetaB?: string }) {
  const [busqueda, setBusqueda] = useState("");
  const [limite, setLimite] = useState(50);
  const termino = busqueda.toLocaleLowerCase("es");
  const filtradas = comparacion.diferencias.filter((d) => `${d.cuenta8} ${d.nombre}`.toLocaleLowerCase("es").includes(termino));
  return (
    <div className="border-t border-ink-100">
      <div className="px-4 py-2">
        <input
          aria-label="Buscar cuenta con diferencia"
          placeholder="Buscar cuenta o nombre…"
          className="w-full max-w-md rounded-md border border-ink-200 px-3 py-1.5 text-[12px]"
          value={busqueda}
          onChange={(e) => { setBusqueda(e.target.value); setLimite(50); }}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-ink-50 text-[10px] uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-2 text-left">Cuenta</th>
              <th className="whitespace-nowrap px-4 py-2 text-right">{etiquetaA}</th>
              <th className="whitespace-nowrap px-4 py-2 text-right">{etiquetaB}</th>
              <th className="whitespace-nowrap px-4 py-2 text-right">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.slice(0, limite).map((d) => (
              <tr key={d.cuenta8} className="border-t border-ink-100">
                <td className="px-4 py-2">
                  <span className="font-mono font-semibold">{d.cuenta8}</span> · {d.nombre}
                  {d.estado !== "descuadre" && <span className="ml-2 text-err-700">{ETIQUETA_ESTADO_DIFERENCIA[d.estado]}</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono tabular-nums text-ink-600">{fmtContable(d.saldoA)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono tabular-nums text-ink-600">{fmtContable(d.saldoB)}</td>
                <td className="whitespace-nowrap bg-err-50 px-4 py-2 text-right font-mono font-semibold tabular-nums text-err-700">{fmtContable(d.diferencia)}</td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-4 text-ink-500">No hay cuentas que coincidan con la búsqueda.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {filtradas.length > limite && (
        <button type="button" className="m-3 rounded border border-ink-200 px-3 py-1.5 text-[12px]" onClick={() => setLimite((n) => n + 50)}>
          Mostrar 50 cuentas más ({Math.min(limite, filtradas.length)} de {filtradas.length})
        </button>
      )}
    </div>
  );
}

function ResultadoComparacion({ comparacion }: { comparacion: ComparacionCorteVm | null }) {
  if (!comparacion) return <Chip label="Sin comparar" tone="warn" />;
  return comparacion.inconsistente
    ? <Chip label={`Difiere en ${comparacion.diferencias.length} cuenta(s)`} tone="err" />
    : <Chip label={`Coincide · ${comparacion.cuentasComparadas} cuentas comparadas`} tone="ok" />;
}

/** Un balance del corte: su período completo, su estado y cómo se compara con este. */
function BalanceDelCorte({ otro, acciones, esteVigente }: { otro: BalanceCorteVm; acciones?: ReactNode; esteVigente: boolean }) {
  const inconsistente = otro.comparacion?.inconsistente === true;
  return (
    <details open={inconsistente} className={`rounded-lg border bg-white ${inconsistente ? "border-err-200" : "border-ink-200"}`}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-[12.5px]">
        <span className="font-semibold text-ink-800">{otro.nombre}</span>
        <span className="text-ink-500">· {otro.version}</span>
        <Chip label={otro.estado} tone={tonoEstadoBalance(otro.estado)} />
        {otro.enFirme.map((f) => (
          <span key={`${f.moduloCodigo}-${f.periodo}`} title={`Conciliación en firme de ${f.moduloCodigo} · ${f.periodo} (cerró ${f.cerradoPor}) contra este balance.`}>
            <Chip label={`En firme · ${f.moduloCodigo}`} tone="blue" />
          </span>
        ))}
        {esteVigente && <ResultadoComparacion comparacion={otro.comparacion} />}
        <span className="ml-auto flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {acciones}
          <Link href={`/balance/${otro.id}#corte`} className="text-[12px] font-medium text-blue-600 hover:underline">Ver</Link>
        </span>
      </summary>
      {otro.comparacion && (
        <p className="border-t border-ink-100 px-4 py-2 text-[11.5px] text-ink-500">
          Comparación del {fmtDateTime(otro.comparacion.actualizadoEn)}. Diferencia = saldo final de este balance − saldo final de {otro.nombre} {otro.version}. Última carga del otro: {otro.ultimaCarga}.
        </p>
      )}
      {inconsistente && otro.comparacion && <DiferenciasCorte comparacion={otro.comparacion} etiquetaB={`${otro.nombre} ${otro.version}`} />}
    </details>
  );
}

/**
 * «Balances del mismo corte» (18/Oct/2026): los demás balances vigentes con la misma fecha de
 * corte y si sus saldos finales coinciden con los de este. `accionesPorBalance` agrega, por
 * balance, los botones para resolver una diferencia (abrir, eliminar, reemplazar).
 */
export function CortePanel({ balanceId, vista, puedeRevisar, accionesPorBalance = {}, aviso }: {
  balanceId: number;
  vista: VistaCorte;
  puedeRevisar: boolean;
  accionesPorBalance?: Record<number, ReactNode>;
  /** Mensaje adicional bajo el título (p. ej. qué falta para cerrar). */
  aviso?: ReactNode;
}) {
  const [revisando, startTransition] = useTransition();
  const router = useRouter();
  const inconsistentes = vista.otros.filter((o) => o.comparacion?.inconsistente).length;
  const titulo = !vista.disponible ? "Balances del mismo corte · no disponible"
    : inconsistentes > 0 ? `Saldos finales distintos a ${inconsistentes} balance(s) del mismo corte`
    : vista.estado === "sin_comparar" ? "Balances del mismo corte · sin comparar"
    : "Balances del mismo corte";
  return (
    <section id="corte" aria-label="Balances del mismo corte" className={`my-4 scroll-mt-20 rounded-lg border p-4 ${inconsistentes > 0 ? "border-err-200 bg-err-50/40" : "border-ink-200 bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={`text-[14px] font-semibold ${inconsistentes > 0 ? "text-err-700" : "text-ink-800"}`}>{titulo}</h2>
          <p className="mt-1 text-[12px] text-ink-500">
            {vista.etiqueta}. Los balances que terminan en la misma fecha —mensual, anual, por cuenta o por terceros— deben coincidir en sus saldos finales: los módulos concilian contra esa columna. Una diferencia se resuelve eliminando uno de los balances.
          </p>
          {aviso && <div className="mt-2 text-[12px]">{aviso}</div>}
        </div>
        {puedeRevisar && (
          <button
            type="button"
            disabled={revisando}
            className="rounded-md border border-ink-200 bg-white px-3 py-2 text-[12px] font-medium disabled:opacity-60"
            onClick={() => startTransition(async () => {
              try {
                const r = await revisarComparacionCorte(balanceId);
                if (r.ok) notifyInfo(r.message); else notifyError(r.message);
                router.refresh();
              } catch {
                notifyError("No se pudo revisar. Vuelve a intentarlo.");
              }
            })}
          >
            {revisando ? "Comparando…" : "Revisar comparación"}
          </button>
        )}
      </div>

      {!vista.disponible && <p className="mt-3 text-[12px] text-err-700">{vista.motivo}</p>}
      {vista.disponible && !vista.esVigente && vista.vigenteDeMiLinea && (
        <p className="mt-3 text-[12px] text-warn-700">
          Esta es una versión anterior de su línea: no entra en la comparación del corte. La vigente es la{" "}
          <Link href={`/balance/${vista.vigenteDeMiLinea.id}#corte`} className="font-semibold underline">{vista.vigenteDeMiLinea.version}</Link>.
        </p>
      )}
      {vista.disponible && vista.estado === "sin_comparar" && vista.esVigente && (
        <p className="mt-3 text-[12px] text-warn-700">Hay balances del corte que aún no se han comparado. Usa «Revisar comparación» para completar el control.</p>
      )}
      {vista.disponible && vista.otros.length === 0 && (
        <p className="mt-3 text-[12px] text-ink-600">Es el único balance con este corte.</p>
      )}
      {vista.otros.length > 0 && (
        <div className="mt-4 space-y-3">
          {vista.otros.map((o) => (
            <BalanceDelCorte key={o.id} otro={o} esteVigente={vista.esVigente} acciones={accionesPorBalance[o.id]} />
          ))}
        </div>
      )}
      {vista.anterioresEnFirme.length > 0 && (
        <div className="mt-4 space-y-2">
          {vista.anterioresEnFirme.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-navy-700/30 bg-navy-700/5 px-4 py-3 text-[12.5px]">
              <span>
                La conciliación de <b>{a.enFirme.map((f) => `${f.moduloCodigo} · ${f.periodo}`).join(", ")}</b> sigue contra la versión anterior{" "}
                <Link href={`/balance/${a.id}`} className="font-semibold underline">{a.version}</Link> de esta línea.
              </span>
              <span className="ml-auto flex items-center gap-2">{accionesPorBalance[a.id]}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
