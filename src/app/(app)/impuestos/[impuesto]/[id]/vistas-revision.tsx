"use client";

import { useState } from "react";
import { Card, Chip } from "@/components/ui";
import { BotonPantallaCompleta, CLASE_TARJETA, claseScrollTabla, propsRegionPantallaCompleta, usePantallaCompletaTabla } from "@/components/tabla-pantalla-completa";
import { faltaDeclaracion, filaConValores, unidadPlural, vistaConPersonas, type FilaPago, type FilaVista, type VistaRevision } from "@/lib/impuestos/retencion/vistas";

const miles = (n: number | null) => (n == null ? "" : Math.round(n).toLocaleString("es-CO"));
const CELDA = "px-2 py-1 text-right tabular-nums whitespace-nowrap";
const PRIMERA = "sticky left-0 z-10 bg-white px-3 py-1 text-left";
// Títulos de «Por meses»: en pantalla completa quedan fijos al desplazarse. Los bordes van con sombra porque
// los de una celda sticky no se pintan; la primera fila tiene alto fijo para que la segunda sepa dónde pegarse.
const LINEA_ABAJO = "shadow-[inset_0_-1px_0_var(--color-ink-150)]";
const LINEA_IZQUIERDA_Y_ABAJO = "shadow-[inset_1px_0_0_var(--color-ink-150),inset_0_-1px_0_var(--color-ink-150)]";
const TITULO_FIJO = "sticky top-0 z-20 bg-ink-50";
const SUBTITULO_FIJO = "sticky top-[3.25rem] z-20 bg-ink-50";

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

/**
 * Vista 1 · Por meses (Retención) o Por períodos (IVA): cada renglón por período y el bloque de pagos
 * del 490. Los conceptos de Retención van por persona jurídica y natural; los renglones del 300, en una
 * sola columna.
 */
export function VistaPorMeses({ vista, onAbrir }: { vista: VistaRevision; onAbrir: (id: number) => void }) {
  const [ocultarCeros, setOcultarCeros] = useState(false);
  const { pantallaCompleta, alternar } = usePantallaCompletaTabla();
  const filas = ocultarCeros ? vista.filas.filter(filaConValores) : vista.filas;
  const personas = vistaConPersonas(vista);
  const ancho = personas ? 2 : 1;
  const filasEncabezado = personas ? 2 : 1;
  const columnas = 3 + vista.meses.length * ancho;
  const unidad = vista.unidad ?? "mes";
  return (
    <div role="region" aria-label={`Valores por ${unidadPlural(vista)}`} {...propsRegionPantallaCompleta(pantallaCompleta, "flex flex-col gap-2")}>
      <div className={`flex shrink-0 flex-wrap items-center justify-between gap-2 ${pantallaCompleta ? "border-b border-ink-100 px-4 py-2.5" : ""}`}>
        <p className="text-[12px] text-ink-500">Valores del {vista.codigo ?? "350"} vigente de cada {unidad} (la última corrección). Los totales se recalculan con los renglones del formulario.</p>
        <div className="flex flex-wrap items-center gap-3">
          <ConmutadorCeros ocultar={ocultarCeros} onCambio={setOcultarCeros} />
          <BotonPantallaCompleta activa={pantallaCompleta} onToggle={alternar} />
        </div>
      </div>
      <div className={`${pantallaCompleta ? "" : CLASE_TARJETA} ${claseScrollTabla(pantallaCompleta, null)}`}>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-ink-50 text-[11px] font-semibold text-ink-600">
              <th rowSpan={filasEncabezado} className={`sticky left-0 top-0 z-30 bg-ink-50 px-3 py-1 text-left align-bottom ${LINEA_ABAJO}`}>Concepto</th>
              <th rowSpan={filasEncabezado} className={`${TITULO_FIJO} ${LINEA_ABAJO} px-2 py-1 text-center align-bottom`}>Renglón</th>
              {vista.meses.map((m) => (
                <th key={m.periodo} colSpan={ancho} className={`${TITULO_FIJO} ${LINEA_IZQUIERDA_Y_ABAJO} ${pantallaCompleta ? "h-[3.25rem]" : ""} px-2 py-1 text-center`}>
                  <div>{m.etiqueta}</div>
                  {m.formulario ? (
                    <button type="button" onClick={() => onAbrir(m.formulario!.id)} className="whitespace-nowrap tabular-nums text-[10.5px] font-semibold text-blue-700 hover:underline">
                      {m.formulario.numero}{m.formulario.esCorreccion ? " · corrección" : ""}
                    </button>
                  ) : (
                    <div className="text-[10.5px] font-normal text-ink-400">{m.causal ? "Sin formulario" : faltaDeclaracion(vista)}</div>
                  )}
                </th>
              ))}
              <th rowSpan={filasEncabezado} className={`${TITULO_FIJO} ${LINEA_IZQUIERDA_Y_ABAJO} px-2 py-1 text-right align-bottom`}>Total</th>
            </tr>
            {personas && (
              <tr className="bg-ink-50 text-[10.5px] font-semibold text-ink-500">
                {vista.meses.map((m) => (
                  <SubEncabezado key={m.periodo} />
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {tramos(filas).map((t) => (
              <TramoMeses key={`${t.seccion}-${t.filas[0]?.clave}`} seccion={t.seccion} filas={t.filas} columnas={columnas} ancho={ancho} completa={pantallaCompleta} />
            ))}
            <tr className="bg-ink-50">
              <td colSpan={columnas} className="sticky left-0 px-3 py-1.5 text-[11.5px] font-semibold text-navy-800">Pagos · formulario 490</td>
            </tr>
            {vista.pagos.map((p) => <FilaPagoMeses key={p.clave} p={p} ancho={ancho} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SubEncabezado() {
  return (
    <>
      <th className={`${SUBTITULO_FIJO} ${LINEA_IZQUIERDA_Y_ABAJO} px-2 py-1 text-right`}>P. jurídica</th>
      <th className={`${SUBTITULO_FIJO} ${LINEA_ABAJO} px-2 py-1 text-right`}>P. natural</th>
    </>
  );
}

function TramoMeses({ seccion, filas, columnas, ancho, completa }: { seccion: string; filas: FilaVista[]; columnas: number; ancho: number; completa: boolean }) {
  return (
    <>
      <tr className="bg-ink-50">
        <td colSpan={columnas} className="sticky left-0 px-3 py-1.5 text-[11.5px] font-semibold text-navy-800">{seccion}</td>
      </tr>
      {filas.map((f) => (
        <tr key={f.clave} className={`border-t border-ink-100 ${f.tipo === "total" ? "font-semibold" : ""}`}>
          <td className={`${PRIMERA} ${f.tipo === "total" ? "font-semibold" : ""} ${completa ? "max-w-[420px]" : "max-w-[280px]"} truncate`} title={f.etiqueta}>{f.etiqueta}</td>
          <td className="whitespace-nowrap px-2 py-1 text-center tabular-nums text-ink-500">{renglones(f)}</td>
          {f.meses.map((m, i) =>
            f.tipo === "concepto" ? (
              <FilaConcepto key={i} pj={m.pj} pn={m.pn} />
            ) : (
              <td key={i} colSpan={ancho} className={`${CELDA} border-l border-ink-100`}>{miles(m.valor)}</td>
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

function FilaPagoMeses({ p, ancho }: { p: FilaPago; ancho: number }) {
  return (
    <tr className={`border-t border-ink-100 ${p.clave === "total_pagado" ? "font-semibold" : ""}`}>
      <td className={PRIMERA}>{p.etiqueta}</td>
      <td className="px-2 py-1" />
      {p.meses.map((v, i) => <td key={i} colSpan={ancho} className={`${CELDA} border-l border-ink-100`}>{miles(v)}</td>)}
      <td className={`${CELDA} border-l border-ink-150 font-semibold`}>{miles(p.total)}</td>
    </tr>
  );
}

/** Vista 2 · Acumulado: la suma de los períodos hasta el corte. */
export function VistaAcumulada({ vista }: { vista: VistaRevision }) {
  const [ocultarCeros, setOcultarCeros] = useState(false);
  const filas = ocultarCeros ? vista.filas.filter(filaConValores) : vista.filas;
  const conFormulario = vista.meses.filter((m) => m.formulario).length;
  const personas = vistaConPersonas(vista);
  const columnas = personas ? 4 : 3;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-ink-500">
          Suma de {conFormulario} de {vista.meses.length} {unidadPlural(vista)} con {vista.codigo ?? "350"} hasta el corte.
          {conFormulario < vista.meses.length && <span className="ml-1"><Chip label={`Faltan ${unidadPlural(vista)}`} tone="warn" /></span>}
        </p>
        <ConmutadorCeros ocultar={ocultarCeros} onCambio={setOcultarCeros} />
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-150 bg-ink-50 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              <th className="px-3 py-2 text-left">Concepto</th>
              {personas ? (
                <>
                  <th className="px-3 py-2 text-center">Renglón P. jurídica</th>
                  <th className="px-3 py-2 text-center">Renglón P. natural</th>
                </>
              ) : (
                <th className="px-3 py-2 text-center">Renglón</th>
              )}
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {tramos(filas).map((t) => (
              <TramoAcumulado key={`${t.seccion}-${t.filas[0]?.clave}`} seccion={t.seccion} filas={t.filas} personas={personas} />
            ))}
            <tr className="bg-ink-50">
              <td colSpan={columnas} className="px-3 py-1.5 text-[11.5px] font-semibold text-navy-800">Pagos · formulario 490</td>
            </tr>
            {vista.pagos.map((p) => (
              <tr key={p.clave} className={`border-t border-ink-100 ${p.clave === "total_pagado" ? "font-semibold" : ""}`}>
                <td className="px-3 py-1" colSpan={columnas - 1}>{p.etiqueta}</td>
                <td className={CELDA}>{miles(p.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function TramoAcumulado({ seccion, filas, personas }: { seccion: string; filas: FilaVista[]; personas: boolean }) {
  return (
    <>
      <tr className="bg-ink-50">
        <td colSpan={personas ? 4 : 3} className="px-3 py-1.5 text-[11.5px] font-semibold text-navy-800">{seccion}</td>
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
            <td colSpan={personas ? 2 : 1} className="px-3 py-1 text-center tabular-nums text-ink-500">{f.renglonPj}</td>
          )}
          <td className={CELDA}>{miles(f.total)}</td>
        </tr>
      ))}
    </>
  );
}
