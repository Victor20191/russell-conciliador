"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { revisarAperturasBalance } from "@/app/actions/balance-cruce-aperturas";
import type { EstadoCrucesAperturas, InformeCruceAperturas } from "@/lib/balance/cruce-aperturas-servidor";
import { CAMPOS_MONTOS } from "@/lib/balance/montos-cruce";
import { fmtContable, fmtDateTime } from "@/lib/format";
import { notifyError, notifyInfo } from "@/lib/client-notifications";

function InformePareja({ informe }: { informe: InformeCruceAperturas }) {
  const [busqueda, setBusqueda] = useState("");
  const [limite, setLimite] = useState(50);
  const filtradas = informe.resultado.filas.filter((f) => `${f.cuenta8} ${f.nombre}`.toLocaleLowerCase("es").includes(busqueda.toLocaleLowerCase("es")));
  return (
    <details open={informe.inconsistente} className="rounded-lg border border-ink-200 bg-white">
      <summary className="cursor-pointer px-4 py-3 text-[12.5px] font-semibold">
        Cuenta {informe.cuenta.version} · Terceros {informe.tercero.version} — {informe.inconsistente ? `${informe.resultado.filas.length} cuenta(s) inconsistente(s)` : `${informe.resultado.totalCuentas} cuentas comparadas sin diferencias`}
      </summary>
      <div className="space-y-2 border-t border-ink-100 px-4 py-3 text-[12px]">
        <p>Por cuenta: <a className="text-blue-600 underline" href={`/balance/${informe.cuenta.id}#cruce-aperturas`}>#{informe.cuenta.id} · {informe.cuenta.archivo || informe.cuenta.version}</a></p>
        <p>Por terceros: <a className="text-blue-600 underline" href={`/balance/${informe.tercero.id}#cruce-aperturas`}>#{informe.tercero.id} · {informe.tercero.archivo || informe.tercero.version}</a></p>
        <p className="text-ink-500">Comparación del {fmtDateTime(informe.actualizadoEn)}. Diferencia = por cuenta − por terceros.</p>
        {informe.inconsistente && <p className="text-err-700">Ambos archivos permanecen inconsistentes hasta eliminar uno de ellos desde «Eliminar → Solo esta versión». Estos son los valores detectados en la comparación.</p>}
      </div>
      {informe.inconsistente && <>
        <div className="px-4 pb-3"><input aria-label={`Buscar cuenta en comparación ${informe.id}`} placeholder="Buscar cuenta de movimiento o nombre…" className="w-full max-w-md rounded-md border border-ink-200 px-3 py-2 text-[12px]" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setLimite(50); }} /></div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-ink-50 text-[10px] uppercase tracking-wide text-ink-500"><tr>
              <th className="px-4 py-2 text-left">Cuenta de movimiento / archivo</th>
              {['Saldo inicial', 'Débitos', 'Créditos', 'Saldo final'].map((titulo) => <th key={titulo} className="whitespace-nowrap px-4 py-2 text-right">{titulo}</th>)}
            </tr></thead>
            <tbody>
              {filtradas.slice(0, limite).map((f) => <Fragment key={f.cuenta8}>
                <tr className="border-t border-ink-200 bg-ink-50/60"><th colSpan={5} className="px-4 py-2 text-left font-medium"><span className="font-mono font-semibold">{f.cuenta8}</span> · {f.nombre}
                  {f.estado === "solo_cuenta" && <span className="ml-2 text-err-700">No existe en el archivo por terceros</span>}
                  {f.estado === "solo_tercero" && <span className="ml-2 text-err-700">No existe en el archivo por cuenta</span>}
                  {f.sinDesgloseTercero && <span className="ml-2 text-ink-500">Sin desglose real por terceros</span>}
                </th></tr>
                {([['cuenta', 'Por cuenta'], ['tercero', 'Por terceros'], ['diff', 'Diferencia']] as const).map(([lado, etiqueta]) => <tr key={lado} className={lado === 'diff' ? 'border-t border-ink-100 font-semibold' : ''}>
                  <td className="px-4 py-2">{etiqueta}</td>
                  {CAMPOS_MONTOS.map((campo) => <td key={campo} className={`whitespace-nowrap px-4 py-2 text-right font-mono tabular-nums ${lado === 'diff' && f.diff[campo] !== 0 ? 'bg-err-50 text-err-700' : 'text-ink-600'}`}>
                    {(lado === 'cuenta' && f.estado === 'solo_tercero') || (lado === 'tercero' && f.estado === 'solo_cuenta') ? '—' : fmtContable(f[lado][campo])}
                  </td>)}
                </tr>)}
              </Fragment>)}
              {!filtradas.length && <tr><td colSpan={5} className="px-4 py-4 text-ink-500">No hay cuentas que coincidan con la búsqueda.</td></tr>}
            </tbody>
          </table>
        </div>
        {filtradas.length > limite && <button type="button" className="m-3 rounded border border-ink-200 px-3 py-2 text-[12px]" onClick={() => setLimite((n) => n + 50)}>Mostrar 50 cuentas más ({Math.min(limite, filtradas.length)} de {filtradas.length})</button>}
      </>}
    </details>
  );
}

export function CruceAperturasPanel({ balanceId, estado, puedeRevisar }: { balanceId: number; estado: EstadoCrucesAperturas; puedeRevisar: boolean }) {
  const [revisando, startTransition] = useTransition();
  const router = useRouter();
  const inconsistentes = estado.pares.filter((p) => p.inconsistente);
  const titulo = inconsistentes.length ? 'Archivo inconsistente entre aperturas' : estado.pendiente ? 'Validación entre archivos pendiente' : estado.pares.length ? 'Archivos comparados sin diferencias' : 'Validación cruzada por apertura';
  return <section id="cruce-aperturas" aria-label="Validación cruzada por apertura" className={`my-4 scroll-mt-20 rounded-lg border p-4 ${inconsistentes.length ? 'border-err-200 bg-err-50/40' : 'border-ink-200 bg-white'}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className={`text-[14px] font-semibold ${inconsistentes.length ? 'text-err-700' : 'text-ink-800'}`}>{titulo}</h2>
        <p className="mt-1 text-[12px] text-ink-500">Saldo inicial, débitos, créditos y saldo final por código completo de cuenta de movimiento.</p>
      </div>
      {puedeRevisar && <button type="button" disabled={revisando} className="rounded-md border border-ink-200 bg-white px-3 py-2 text-[12px] font-medium disabled:opacity-60" onClick={() => startTransition(async () => {
        try {
          const resultado = await revisarAperturasBalance(balanceId);
          if (!resultado.ok) notifyError(resultado.message); else notifyInfo(resultado.message);
          router.refresh();
        } catch { notifyError('No se pudo revisar. Vuelve a intentarlo.'); }
      })}>{revisando ? 'Comparando…' : 'Revisar archivos'}</button>}
    </div>
    {estado.motivo && <p className="mt-3 text-[12px] text-ink-600">{estado.motivo}</p>}
    {estado.pendiente && estado.disponible && <p className="mt-3 text-[12px] text-warn-700">Hay archivos que aún no se han comparado. Usa «Revisar archivos» para completar el control.</p>}
    {estado.pares.length > 0 && <div className="mt-4 space-y-3">{estado.pares.map((p) => <InformePareja key={p.id} informe={p} />)}</div>}
  </section>;
}
