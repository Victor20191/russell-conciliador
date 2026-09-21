"use client";

import { useId, useState } from "react";
import { Card } from "@/components/ui";
import { fmt, fmtNum } from "@/lib/format";
import {
  alertasComparativo,
  type ComparativoUso,
  type VariacionUso,
} from "@/lib/auditoria/reporte-ejecutivo/comparativo";
import { hayConsumoIA, type CostosIA } from "@/lib/auditoria/reporte-ejecutivo/costos-ia";

export type BarraUso = {
  etiqueta: string;
  total: number;
  detalle?: string;
};

export type SerieDiaUso = {
  fecha: string; // YYYY-MM-DD
  total: number;
  usuarios?: { usuario: string; total: number }[];
};

function anchoBarra(valor: number, max: number): number {
  if (max <= 0 || valor <= 0) return 0;
  return Math.max(3, Math.round((valor / max) * 100));
}

function ListaBarras({
  titulo,
  subtitulo,
  items,
  vacio,
  barClass = "bg-navy-700",
  trackClass = "bg-ink-100",
}: {
  titulo: string;
  subtitulo?: string;
  items?: BarraUso[] | null;
  vacio: string;
  barClass?: string;
  trackClass?: string;
}) {
  const filas = Array.isArray(items) ? items : [];
  const max = filas.reduce((m, item) => Math.max(m, Number(item?.total) || 0), 0) || 1;

  return (
    <Card className="p-4">
      <h2 className="text-[13px] font-semibold text-ink-800">{titulo}</h2>
      {subtitulo && <p className="mt-0.5 text-[11.5px] text-ink-500">{subtitulo}</p>}
      {filas.length === 0 ? (
        <p className="py-8 text-center text-[12.5px] text-ink-400">{vacio}</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {filas.map((item, index) => {
            const etiqueta = item?.etiqueta ?? `Ítem ${index + 1}`;
            const total = Number(item?.total) || 0;
            return (
              <li key={`${titulo}-${index}-${etiqueta}`}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <span className="block truncate text-[12.5px] text-ink-800">{etiqueta}</span>
                    {item?.detalle && (
                      <span className="block truncate text-[11px] text-ink-400">{item.detalle}</span>
                    )}
                  </div>
                  <span className="shrink-0 font-mono text-[12px] font-semibold text-ink-700">
                    {fmtNum(total)}
                  </span>
                </div>
                <div className={`h-1.5 w-full overflow-hidden rounded-full ${trackClass}`}>
                  <div
                    className={`h-full rounded-full ${barClass}`}
                    style={{ width: `${anchoBarra(total, max)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function RitmoDiario({ serie }: { serie?: SerieDiaUso[] | null }) {
  const [diaActivo, setDiaActivo] = useState<number | null>(null);
  const tooltipId = useId();
  const puntos = Array.isArray(serie) ? serie.slice(-21) : [];
  const max = puntos.reduce((m, p) => Math.max(m, Number(p?.total) || 0), 0) || 1;

  return (
    <Card className="min-w-0 p-4 lg:col-span-2">
      <h2 className="text-[13px] font-semibold text-ink-800">Ritmo de uso diario</h2>
      <p className="mt-0.5 text-[11.5px] text-ink-500">
        Acciones por día en el período
        {(serie?.length ?? 0) > 21 ? " (últimos 21 días del rango)" : ""}
      </p>
      {puntos.length === 0 ? (
        <p className="py-8 text-center text-[12.5px] text-ink-400">
          Sin actividad diaria registrada en el período.
        </p>
      ) : (
        <div className="relative mt-4 flex h-28 items-end gap-1">
          {puntos.map((d, index) => {
            const total = Number(d?.total) || 0;
            const h = Math.max(4, Math.round((total / max) * 100));
            const fecha = d?.fecha ?? `dia-${index}`;
            return (
              <div
                key={`${fecha}-${index}`}
                className="flex h-full min-w-0 flex-1 flex-col items-center"
                onMouseEnter={() => setDiaActivo(index)}
                onMouseLeave={() => setDiaActivo(null)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setDiaActivo(null);
                }}
              >
                <div className="flex min-h-0 w-full flex-1 items-end justify-center">
                  <button
                    type="button"
                    aria-label={`${fecha}: ${fmtNum(total)} acciones`}
                    aria-describedby={diaActivo === index ? tooltipId : undefined}
                    onFocus={() => setDiaActivo(index)}
                    onBlur={() => setDiaActivo(null)}
                    onClick={() => setDiaActivo(index)}
                    className="w-full max-w-[14px] cursor-pointer rounded-t-sm bg-navy-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700"
                    style={{ height: `${h}%` }}
                  />
                </div>
                {diaActivo === index && (
                  <div
                    id={tooltipId}
                    role="tooltip"
                    className="absolute bottom-full z-50 max-h-80 w-80 max-w-full overflow-y-auto rounded-xl border border-ink-150 bg-white text-[12px] text-ink-800 shadow-lg"
                    style={{ left: `clamp(0px, calc(${((index + 0.5) / puntos.length) * 100}% - 10rem), max(0px, calc(100% - 20rem)))` }}
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-ink-150 bg-ink-50 px-3 py-2.5">
                      <span className="font-semibold text-navy-800">{fecha.split("-").reverse().join("/")}</span>
                      <span className="rounded-full bg-navy-700 px-2 py-0.5 text-[11px] font-semibold text-white">
                        {fmtNum(total)} {total === 1 ? "acción" : "acciones"}
                      </span>
                    </div>
                    <table className="w-full table-fixed border-collapse text-left">
                      <thead className="text-[10px] uppercase tracking-wide text-ink-500">
                        <tr>
                          <th scope="col" className="px-3 py-2 font-semibold">Usuario</th>
                          <th scope="col" className="w-20 px-3 py-2 text-right font-semibold">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(d.usuarios ?? []).map((u) => (
                          <tr key={u.usuario} className="border-t border-ink-100 even:bg-ink-50">
                            <td className="break-words px-3 py-2 leading-snug">{u.usuario}</td>
                            <td className="px-3 py-2 text-right align-top font-mono font-semibold tabular-nums text-navy-700">{fmtNum(u.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <span className="mt-1 max-w-full shrink-0 truncate text-[9px] text-ink-400">
                  {fecha.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

const TONO_ALERTA: Record<"alza" | "baja" | "estable", string> = {
  alza: "border-ok-500/30 bg-ok-100 text-ok-700",
  baja: "border-err-500/30 bg-err-100 text-err-700",
  estable: "border-ink-150 bg-ink-50 text-ink-700",
};

const ICONO_ALERTA: Record<"alza" | "baja" | "estable", string> = {
  alza: "▲",
  baja: "▼",
  estable: "=",
};

/** Signo y color de una variación. Una caída no es «malo» por sí sola: solo se señala. */
function Delta({ v }: { v: VariacionUso }) {
  const tono =
    v.direccion === "subio"
      ? "text-ok-700"
      : v.direccion === "bajo"
        ? "text-err-700"
        : "text-ink-500";
  const flecha = v.direccion === "subio" ? "▲" : v.direccion === "bajo" ? "▼" : "=";
  const pct = v.variacionPct == null ? "nuevo" : `${Math.abs(v.variacionPct)} %`;
  return (
    <span className={`font-mono text-[11.5px] font-semibold tabular-nums ${tono}`}>
      {flecha} {pct}
    </span>
  );
}

function FilaVariacion({ v }: { v: VariacionUso }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-ink-100 py-1.5 last:border-b-0">
      <span className="min-w-0 truncate text-[12.5px] text-ink-800">{v.etiqueta}</span>
      <span className="flex shrink-0 items-baseline gap-2">
        <span className="font-mono text-[12.5px] tabular-nums text-ink-400">{fmtNum(v.previo)}</span>
        <span className="text-[11px] text-ink-300">→</span>
        <span className="font-mono text-[12.5px] font-semibold tabular-nums text-navy-700">{fmtNum(v.actual)}</span>
        <Delta v={v} />
      </span>
    </li>
  );
}

/**
 * Comparativo del período actual contra el del reporte anterior. Responde la
 * pregunta de gerencia: ¿el equipo usó más o menos la plataforma?
 */
export function ComparativoUsoCard({ comparativo }: { comparativo?: ComparativoUso | null }) {
  if (!comparativo) return null;
  const c = comparativo;
  const alertas = alertasComparativo(c);
  const origen =
    c.base === "reporte_anterior"
      ? `Reporte anterior (${c.previo.desde} → ${c.previo.hasta}${
          c.generadoEn ? `, generado el ${c.generadoEn.slice(0, 10)}` : ""
        })`
      : `Período anterior (${c.previo.desde} → ${c.previo.hasta})`;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold text-ink-800">¿Subió o bajó el uso?</h2>
          <p className="mt-0.5 text-[11.5px] text-ink-500">
            {origen} vs. actual ({c.actual.desde} → {c.actual.hasta})
          </p>
        </div>
      </div>

      {/* Dos alertas: cuánto se operó y cuánta gente operó. */}
      {alertas.map((alerta) => (
        <div
          key={alerta.clave}
          role="alert"
          className={`mt-2 flex items-start gap-2.5 rounded-md border px-3 py-2.5 ${TONO_ALERTA[alerta.nivel]}`}
        >
          <span aria-hidden className="text-[15px] leading-none">
            {ICONO_ALERTA[alerta.nivel]}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold">{alerta.titulo}</p>
            <p className="mt-0.5 text-[11.5px] opacity-90">{alerta.mensaje}</p>
          </div>
        </div>
      ))}

      {!c.comparable && (
        <p className="mt-2 rounded-md bg-warn-100 px-2.5 py-1.5 text-[11.5px] text-warn-700">
          Los períodos no miden lo mismo ({c.previo.dias} días frente a {c.actual.dias}). Compara el
          promedio diario, no los totales.
        </p>
      )}

      <ul className="mt-3">
        {c.totales.map((v) => (
          <FilaVariacion key={v.etiqueta} v={v} />
        ))}
        <FilaVariacion v={c.promedioDiario} />
      </ul>

      {c.porFamilia.length > 0 && (
        <>
          <h3 className="mt-4 text-[12px] font-semibold text-ink-700">Por módulo o proceso</h3>
          <ul className="mt-1">
            {c.porFamilia.slice(0, 8).map((v) => (
              <FilaVariacion key={v.etiqueta} v={v} />
            ))}
          </ul>
        </>
      )}

      {(c.usuarios.nuevos.length > 0 || c.usuarios.salieron.length > 0) && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {c.usuarios.nuevos.length > 0 && (
            <p className="rounded-md bg-ok-100 px-2.5 py-2 text-[11.5px] text-ok-700">
              <strong>Empezaron a operar ({c.usuarios.nuevos.length}):</strong>{" "}
              {c.usuarios.nuevos.join(", ")}
            </p>
          )}
          {c.usuarios.salieron.length > 0 && (
            <p className="rounded-md bg-err-100 px-2.5 py-2 text-[11.5px] text-err-700">
              <strong>Dejaron de operar ({c.usuarios.salieron.length}):</strong>{" "}
              {c.usuarios.salieron.join(", ")}
            </p>
          )}
        </div>
      )}

      {c.porUsuario.length > 0 && (
        <>
          <h3 className="mt-4 text-[12px] font-semibold text-ink-700">Por usuario</h3>
          <p className="text-[11px] text-ink-400">
            Operaciones de cada persona; {c.usuarios.continuaron} operaron en ambos períodos.
          </p>
          <ul className="mt-1">
            {c.porUsuario.slice(0, 8).map((v) => (
              <FilaVariacion key={v.etiqueta} v={v} />
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}


/**
 * Costos de IA del período. Va aparte del comparativo de uso porque responde
 * otra pregunta —cuánto cuesta operar— y porque su variación NO se pinta de
 * verde o rojo: que el gasto suba suele significar que se usó más la
 * plataforma, así que el juicio lo pone quien lee, no la tarjeta.
 */
export function CostosIACard({ costos }: { costos?: CostosIA | null }) {
  if (!hayConsumoIA(costos) || !costos) return null;
  const { actual, previo, mes } = costos;
  const fecha = (iso: string) => iso.slice(0, 10);

  return (
    <Card className="p-4">
      <h2 className="text-[13px] font-semibold text-ink-800">Costos de IA</h2>
      <p className="mt-0.5 text-[11.5px] text-ink-500">
        Consumo de las funciones con IA entre {fecha(actual.desde)} y {fecha(actual.hasta)}.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <p className="font-mono text-[17px] font-semibold tabular-nums text-navy-700">{fmt(actual.costoCop)}</p>
          <p className="text-[11px] text-ink-500">Gasto del período</p>
        </div>
        <div>
          <p className="font-mono text-[17px] font-semibold tabular-nums text-ink-800">{fmtNum(actual.tokens)}</p>
          <p className="text-[11px] text-ink-500">Tokens</p>
        </div>
        <div>
          <p className="font-mono text-[17px] font-semibold tabular-nums text-ink-800">{fmtNum(actual.llamadas)}</p>
          <p className="text-[11px] text-ink-500">Operaciones con IA</p>
        </div>
      </div>

      {previo && (
        <ul className="mt-3">
          {costos.variaciones.map((v) => {
            const enPesos = v.etiqueta.includes("pesos");
            return (
              <li
                key={v.etiqueta}
                className="flex items-baseline justify-between gap-3 border-b border-ink-100 py-1.5 last:border-b-0"
              >
                <span className="min-w-0 truncate text-[12.5px] text-ink-800">{v.etiqueta}</span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="font-mono text-[12.5px] tabular-nums text-ink-400">
                    {enPesos ? fmt(v.previo) : fmtNum(v.previo)}
                  </span>
                  <span className="text-[11px] text-ink-300">→</span>
                  <span className="font-mono text-[12.5px] font-semibold tabular-nums text-navy-700">
                    {enPesos ? fmt(v.actual) : fmtNum(v.actual)}
                  </span>
                  <span className="font-mono text-[11.5px] font-semibold tabular-nums text-ink-500">
                    {v.direccion === "subio" ? "▲" : v.direccion === "bajo" ? "▼" : "="}{" "}
                    {v.variacionPct == null ? "nuevo" : `${Math.abs(v.variacionPct)} %`}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {previo && (
        <p className="mt-1 text-[11px] text-ink-400">
          Comparado con {costos.base === "reporte_anterior" ? "el reporte anterior" : "el período anterior"} (
          {fecha(previo.desde)} → {fecha(previo.hasta)}).
        </p>
      )}

      {mes && costos.mesEtiqueta && (
        <p className="mt-2 rounded-md bg-ink-100 px-2.5 py-2 text-[11.5px] text-ink-700">
          Acumulado de {costos.mesEtiqueta}: <strong>{fmt(mes.costoCop)}</strong> en {fmtNum(mes.tokens)}{" "}
          tokens y {fmtNum(mes.llamadas)} operaciones.
        </p>
      )}

      {actual.porOperacion.length > 1 && (
        <ul className="mt-3">
          {actual.porOperacion.map((o) => (
            <li
              key={o.nombre}
              className="flex items-baseline justify-between gap-3 border-b border-ink-100 py-1.5 last:border-b-0"
            >
              <span className="min-w-0 truncate text-[12.5px] text-ink-800">
                {o.nombre}
                <span className="ml-1.5 text-[11px] text-ink-400">{fmtNum(o.llamadas)} operación(es)</span>
              </span>
              <span className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-ink-700">
                {fmt(o.costoCop)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * Panel permanente de indicadores de uso de la plataforma.
 * Siempre visible en Configuración › Reportes ejecutivos (con o sin reporte IA).
 */
export function IndicadoresUso({
  periodoLabel,
  porFamilia,
  topUsuarios,
  topAcciones,
  topClientes,
  serieDiaria,
  adopcion,
  comparativo,
  costos,
}: {
  periodoLabel: string;
  comparativo?: ComparativoUso | null;
  costos?: CostosIA | null;
  porFamilia?: BarraUso[] | null;
  topUsuarios?: BarraUso[] | null;
  topAcciones?: BarraUso[] | null;
  topClientes?: BarraUso[] | null;
  serieDiaria?: SerieDiaUso[] | null;
  adopcion?: BarraUso[] | null;
}) {
  return (
    <section aria-label="Indicadores de uso de la plataforma" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-serif text-lg text-ink-900">Indicadores de uso</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-500">
            Actividad real de los usuarios en el período {periodoLabel}. Estos indicadores están
            siempre disponibles en la plataforma.
          </p>
        </div>
      </div>

      <ComparativoUsoCard comparativo={comparativo} />
      <CostosIACard costos={costos} />

      <div className="grid gap-3 lg:grid-cols-2">
        <ListaBarras
          titulo="Módulos y procesos más usados"
          subtitulo="Acciones agrupadas por familia de proceso"
          items={porFamilia}
          vacio="Aún no hay acciones registradas en este período."
          barClass="bg-navy-700"
          trackClass="bg-ink-100"
        />
        <ListaBarras
          titulo="Usuarios con más actividad"
          subtitulo="Quién más opera la plataforma"
          items={topUsuarios}
          vacio="Sin usuarios activos en el período."
          barClass="bg-blue-500"
          trackClass="bg-blue-100"
        />
        <ListaBarras
          titulo="Acciones más frecuentes"
          subtitulo="Tipos de operación con mayor volumen"
          items={topAcciones}
          vacio="Sin acciones en el período."
          barClass="bg-navy-600"
          trackClass="bg-ink-100"
        />
        <ListaBarras
          titulo="Clientes con más operaciones"
          subtitulo="Actividad vinculada a clientes"
          items={topClientes}
          vacio="Sin operaciones asociadas a clientes en el período."
          barClass="bg-navy-500"
          trackClass="bg-ink-100"
        />
        <ListaBarras
          titulo="Adopción de nuevas funcionalidades"
          subtitulo="Actividad del módulo relacionado; no confirma el uso de una funcionalidad individual"
          items={adopcion}
          vacio="No hay funcionalidades publicadas en el alcance para revisar."
          barClass="bg-ok-500"
          trackClass="bg-ok-100"
        />
        <RitmoDiario serie={serieDiaria} />
      </div>
    </section>
  );
}
