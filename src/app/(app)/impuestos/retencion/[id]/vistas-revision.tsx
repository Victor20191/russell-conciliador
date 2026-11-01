"use client";

import { useState } from "react";
import { Card, Chip } from "@/components/ui";
import { filaConValores, type FilaPago, type FilaVista, type VistaRevision } from "@/lib/impuestos/retencion/vistas";

const miles = (n: number | null) => (n == null ? "" : Math.round(n).toLocaleString("es-CO"));
const CELDA = "px-2 py-1 text-right tabular-nums whitespace-nowrap";
const PRIMERA = "sticky left-0 z-10 bg-white px-3 py-1 text-left";

export function ConmutadorCeros({ ocultar, onCambio }: { ocultar: boolean; onCambio: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-[11.5px] text-ink-500">
      <input type="checkbox" checked={ocultar} onChange={(e) => onCambio(e.target.checked)} />
      Ocultar los renglones en cero
    </label>
  );
}

/** Agrupa las filas en tramos seguidos de la misma sección (el orden del formulario). */
function tramos<T extends { seccion: string }>(filas: readonly T[]): { seccion: string; filas: T[] }[] {
  return filas.reduce<{ seccion: string; filas: T[] }[]>((g, f) => {
    const ultimo = g[g.length - 1];
    if (ultimo && ultimo.seccion === f.seccion) ultimo.filas.push(f);
    else g.push({ seccion: f.seccion, filas: [f] });
    return g;
  }, []);
}

const renglones = (f: FilaVista) => (f.tipo === "concepto" ? [f.renglonPj, f.renglonPn].map((r) => r ?? "—").join(" · ") : String(f.renglonPj));

/** Vista 1 · Por meses: cada renglón por mes (persona jurídica y natural) y el bloque de pagos del 490. */
export function VistaPorMeses({ vista, onAbrir }: { vista: VistaRevision; onAbrir: (id: number) => void }) {
  const [ocultarCeros, setOcultarCeros] = useState(false);
  const filas = ocultarCeros ? vista.filas.filter(filaConValores) : vista.filas;
  const columnas = 3 + vista.meses.length * 2;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-ink-500">Valores del 350 vigente de cada mes (la última corrección). Los totales se recalculan con los renglones del formulario.</p>
        <ConmutadorCeros ocultar={ocultarCeros} onCambio={setOcultarCeros} />
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="text-[12px]">
          <thead>
            <tr className="border-b border-ink-150 bg-ink-50 text-[11px] font-semibold text-ink-600">
              <th rowSpan={2} className={`${PRIMERA} bg-ink-50 align-bottom`}>Concepto</th>
              <th rowSpan={2} className="px-2 py-1 text-center align-bottom">Renglón</th>
              {vista.meses.map((m) => (
                <th key={m.periodo} colSpan={2} className="border-l border-ink-150 px-2 py-1 text-center">
                  <div>{m.etiqueta}</div>
                  {m.formulario ? (
                    <button type="button" onClick={() => onAbrir(m.formulario!.id)} className="tabular-nums text-[10.5px] font-semibold text-blue-700 hover:underline">
                      {m.formulario.numero}{m.formulario.esCorreccion ? " · corrección" : ""}
                    </button>
                  ) : (
                    <div className="text-[10.5px] font-normal text-ink-400">{m.causal ? "Sin formulario" : "Falta el 350"}</div>
                  )}
                </th>
              ))}
              <th rowSpan={2} className="border-l border-ink-150 px-2 py-1 text-right align-bottom">Total</th>
            </tr>
            <tr className="border-b border-ink-150 bg-ink-50 text-[10.5px] font-semibold text-ink-500">
              {vista.meses.map((m) => (
                <SubEncabezado key={m.periodo} />
              ))}
            </tr>
          </thead>
          <tbody>
            {tramos(filas).map((t) => (
              <TramoMeses key={`${t.seccion}-${t.filas[0]?.clave}`} seccion={t.seccion} filas={t.filas} columnas={columnas} />
            ))}
            <tr className="bg-ink-50">
              <td colSpan={columnas} className="sticky left-0 px-3 py-1.5 text-[11.5px] font-semibold text-navy-800">Pagos · formulario 490</td>
            </tr>
            {vista.pagos.map((p) => <FilaPagoMeses key={p.clave} p={p} />)}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function SubEncabezado() {
  return (
    <>
      <th className="border-l border-ink-150 px-2 py-1 text-right">P. jurídica</th>
      <th className="px-2 py-1 text-right">P. natural</th>
    </>
  );
}

function TramoMeses({ seccion, filas, columnas }: { seccion: string; filas: FilaVista[]; columnas: number }) {
  return (
    <>
      <tr className="bg-ink-50">
        <td colSpan={columnas} className="sticky left-0 px-3 py-1.5 text-[11.5px] font-semibold text-navy-800">{seccion}</td>
      </tr>
      {filas.map((f) => (
        <tr key={f.clave} className={`border-t border-ink-100 ${f.tipo === "total" ? "font-semibold" : ""}`}>
          <td className={`${PRIMERA} ${f.tipo === "total" ? "font-semibold" : ""} max-w-[280px] truncate`} title={f.etiqueta}>{f.etiqueta}</td>
          <td className="px-2 py-1 text-center tabular-nums text-ink-500">{renglones(f)}</td>
          {f.meses.map((m, i) =>
            f.tipo === "concepto" ? (
              <FilaConcepto key={i} pj={m.pj} pn={m.pn} />
            ) : (
              <td key={i} colSpan={2} className={`${CELDA} border-l border-ink-100`}>{miles(m.valor)}</td>
            ),
          )}
          <td className={`${CELDA} border-l border-ink-150 font-semibold`}>{miles(f.total)}</td>
        </tr>
      ))}
    </>
  );
}

function FilaConcepto({ pj, pn }: { pj: number | null; pn: number | null }) {
  return (
    <>
      <td className={`${CELDA} border-l border-ink-100`}>{pj == null ? "" : miles(pj)}</td>
      <td className={CELDA}>{pn == null ? "" : miles(pn)}</td>
    </>
  );
}

function FilaPagoMeses({ p }: { p: FilaPago }) {
  return (
    <tr className={`border-t border-ink-100 ${p.clave === "total_pagado" ? "font-semibold" : ""}`}>
      <td className={PRIMERA}>{p.etiqueta}</td>
      <td className="px-2 py-1" />
      {p.meses.map((v, i) => <td key={i} colSpan={2} className={`${CELDA} border-l border-ink-100`}>{miles(v)}</td>)}
      <td className={`${CELDA} border-l border-ink-150 font-semibold`}>{miles(p.total)}</td>
    </tr>
  );
}

/** Vista 2 · Acumulado: la suma de los meses hasta el corte. */
export function VistaAcumulada({ vista }: { vista: VistaRevision }) {
  const [ocultarCeros, setOcultarCeros] = useState(false);
  const filas = ocultarCeros ? vista.filas.filter(filaConValores) : vista.filas;
  const conFormulario = vista.meses.filter((m) => m.formulario).length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-ink-500">
          Suma de {conFormulario} de {vista.meses.length} meses con 350 hasta el corte.
          {conFormulario < vista.meses.length && <span className="ml-1"><Chip label="Faltan meses" tone="warn" /></span>}
        </p>
        <ConmutadorCeros ocultar={ocultarCeros} onCambio={setOcultarCeros} />
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-150 bg-ink-50 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              <th className="px-3 py-2 text-left">Concepto</th>
              <th className="px-3 py-2 text-center">Renglón P. jurídica</th>
              <th className="px-3 py-2 text-center">Renglón P. natural</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {tramos(filas).map((t) => (
              <TramoAcumulado key={`${t.seccion}-${t.filas[0]?.clave}`} seccion={t.seccion} filas={t.filas} />
            ))}
            <tr className="bg-ink-50">
              <td colSpan={4} className="px-3 py-1.5 text-[11.5px] font-semibold text-navy-800">Pagos · formulario 490</td>
            </tr>
            {vista.pagos.map((p) => (
              <tr key={p.clave} className={`border-t border-ink-100 ${p.clave === "total_pagado" ? "font-semibold" : ""}`}>
                <td className="px-3 py-1" colSpan={3}>{p.etiqueta}</td>
                <td className={CELDA}>{miles(p.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function TramoAcumulado({ seccion, filas }: { seccion: string; filas: FilaVista[] }) {
  return (
    <>
      <tr className="bg-ink-50">
        <td colSpan={4} className="px-3 py-1.5 text-[11.5px] font-semibold text-navy-800">{seccion}</td>
      </tr>
      {filas.map((f) => (
        <tr key={f.clave} className={`border-t border-ink-100 ${f.tipo === "total" ? "font-semibold" : ""}`}>
          <td className="px-3 py-1">{f.etiqueta}</td>
          {f.tipo === "concepto" ? (
            <>
              <td className="px-3 py-1 text-center tabular-nums text-ink-500">{f.renglonPj ?? "—"}</td>
              <td className="px-3 py-1 text-center tabular-nums text-ink-500">{f.renglonPn ?? "—"}</td>
            </>
          ) : (
            <td colSpan={2} className="px-3 py-1 text-center tabular-nums text-ink-500">{f.renglonPj}</td>
          )}
          <td className={CELDA}>{miles(f.total)}</td>
        </tr>
      ))}
    </>
  );
}
