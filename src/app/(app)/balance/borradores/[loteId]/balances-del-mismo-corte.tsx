"use client";

import Link from "next/link";
import { Chip } from "@/components/ui";
import { fmt } from "@/lib/format";
import type { ComparacionBorradorCorte } from "@/app/actions/balance";
import { DiferenciasCorte } from "@/app/(app)/balance/[id]/corte-panel";

/**
 * «Balances del mismo corte» en el borrador (18/Oct/2026): antes de cargar, compara el saldo
 * final de cada cuenta del archivo con los balances vigentes que terminan en la misma fecha.
 * Solo informa —se puede cargar igual y queda inconsistente— salvo cuando la vigente de la misma
 * línea está cerrada: ahí la carga se rechaza y hay que abrirla primero. Una diferencia por debajo
 * del umbral del corte (`corte_saldo_final`) se muestra pero no lo vuelve inconsistente.
 */
export function BalancesDelMismoCorte({ resultado, cargando }: { resultado: ComparacionBorradorCorte | null; cargando: boolean }) {
  if (!resultado) {
    return cargando
      ? <p className="text-[11.5px] text-ink-500">Comparando con los balances del mismo corte…</p>
      : null;
  }
  if (!resultado.ok) return <p className="text-[11.5px] text-ink-500">No se pudo comparar con los balances del mismo corte: {resultado.message}</p>;
  if (resultado.balances.length === 0 && !resultado.bloqueo) {
    return <p className="text-[11.5px] text-ink-500">Es el primer balance del cliente con {resultado.etiqueta.toLowerCase()}.</p>;
  }
  const difieren = resultado.balances.filter((b) => !b.coincide && !b.mismaLinea);
  return (
    <section aria-label="Balances del mismo corte" className="max-w-3xl rounded-lg border border-ink-200 bg-white p-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-[12.5px] font-semibold text-ink-800">Balances del mismo corte · {resultado.etiqueta}</h3>
        {cargando && <span className="text-[11px] text-ink-400">actualizando…</span>}
      </div>
      <p className="mt-0.5 text-[11px] text-ink-500">
        Comparación previa del saldo final por cuenta, con la homologación guardada; la definitiva se calcula al cargar. Una diferencia menor a {fmt(resultado.tolerancia)} se muestra, pero no impide cerrar.
      </p>
      {resultado.bloqueo && (
        <p role="alert" className="mt-2 rounded-md border border-err-200 bg-err-50 px-3 py-2 text-[12px] font-medium text-err-700">
          {resultado.bloqueo.mensaje}{" "}
          <Link href={`/balance/${resultado.bloqueo.balanceId}`} className="underline">Abrir esa versión</Link>
        </p>
      )}
      <div className="mt-2 space-y-2">
        {resultado.balances.map((b) => (
          <details key={b.id} open className={`rounded-md border ${!b.coincide && !b.mismaLinea ? "border-err-200" : "border-ink-150"}`}>
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-[12px]">
              <span className="font-medium text-ink-800">{b.nombre}</span>
              <span className="text-ink-500">· {b.version}</span>
              {b.estaCongelado && <Chip label="Cerrado" tone="blue" />}
              {b.mismaLinea && <Chip label="Esta carga la reemplaza" tone="ink" />}
              {b.coincide
                ? <Chip label={b.menores > 0 ? `Coincide · ${b.menores} diferencia(s) menor(es) a ${fmt(resultado.tolerancia)}` : `Coincide · ${b.cuentasComparadas} cuentas`} tone="ok" />
                : <Chip label={`Difiere en ${b.totalDiferencias - b.menores} cuenta(s)`} tone={b.mismaLinea ? "warn" : "err"} />}
            </summary>
            {b.totalDiferencias > 0 && (
              <>
                {b.totalDiferencias > b.diferencias.length && (
                  <p className="px-3 text-[11px] text-ink-500">Se muestran las primeras {b.diferencias.length} de {b.totalDiferencias} cuentas con diferencia.</p>
                )}
                <DiferenciasCorte comparacion={b} etiquetaA="Este archivo" etiquetaB={`${b.nombre} ${b.version}`} tolerancia={resultado.tolerancia} />
              </>
            )}
          </details>
        ))}
      </div>
      {difieren.length > 0 && (
        <p className="mt-2 text-[11.5px] font-medium text-warn-700">
          Se puede cargar igual: el balance quedará inconsistente con {difieren.map((b) => `${b.nombre} ${b.version}`).join(", ")} hasta que elimines uno de los dos, y el corte no se podrá cerrar mientras tanto.
        </p>
      )}
    </section>
  );
}
