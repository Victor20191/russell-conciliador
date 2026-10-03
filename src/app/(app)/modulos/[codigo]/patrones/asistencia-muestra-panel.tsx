"use client";

import { useId, useState } from "react";
import type { LecturaMuestraInventario } from "@/lib/modulos/patrones/asistencia-muestra";
import { CeldasOrigen, EjemplosLectura, ResumenAsistencia } from "../lectura-inventario-vista";

const campo = "w-full min-w-0 rounded-md border border-ink-200 bg-white px-3 py-2 text-[12px] text-ink-700 outline-none focus:border-blue-400";

export function AsistenciaMuestraPanel({ lectura, trabajando, pendiente, error, onPendiente, onRevisar, onReiniciar }: {
  lectura?: LecturaMuestraInventario;
  trabajando: boolean;
  pendiente: boolean;
  error?: string;
  onPendiente: () => void;
  onRevisar: (instrucciones: string, respuestas: Record<string, string>) => void;
  onReiniciar: () => void;
}) {
  const id = useId();
  const [instrucciones, setInstrucciones] = useState("");
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const preguntas = lectura?.preguntas ?? [];
  // Una corrección puede cuestionar los ejemplos: no exigir aceptarlos para corregirlos.
  const faltanRespuestas = !instrucciones.trim() && preguntas.some((p) => !respuestas[p.id]?.trim());
  return <section aria-label="Asistencia para crear el patrón" className="flex min-w-0 flex-col gap-4 text-[12px]" aria-busy={trabajando}>
    <div>
      <h2 className="font-semibold text-ink-800">Reconocer el formato de la muestra</h2>
      <p className="mt-1 leading-relaxed text-ink-500">Revisamos el archivo y, si hace falta, usamos IA para separar datos mezclados o reunir las filas de cada producto. Comprueba la lectura antes de guardar el patrón.</p>
    </div>
    {trabajando && <p role="status" className="text-navy-700">Interpretando la muestra y comprobando todos sus registros…</p>}
    {error && <p role="alert" className="rounded-md bg-err-50 p-3 text-err-700">{error}</p>}
    {!!lectura?.errores.length && <ul role="alert" className="list-disc space-y-1 rounded-md bg-err-50 py-3 pl-7 pr-3 text-err-700">{lectura.errores.map((e, i) => <li key={i}>{e}</li>)}</ul>}
    {!!lectura?.advertencias.length && <ul className="list-disc space-y-1 rounded-md bg-warn-100/40 py-3 pl-7 pr-3 text-warn-700">{lectura.advertencias.map((e, i) => <li key={i}>{e}</li>)}</ul>}
    {lectura?.resumen.hoja && <ResumenAsistencia actual={lectura.resumen} />}
    <EjemplosLectura ejemplos={lectura?.ejemplosLectura ?? []} />
    <fieldset disabled={trabajando} className="flex min-w-0 flex-col gap-3 disabled:opacity-60">
      {preguntas.map((p) => <label key={p.id} className="flex min-w-0 flex-col gap-1.5">
        <span className="font-medium text-ink-800">{p.etiqueta}</span>
        {!!p.evidencia?.length && <CeldasOrigen celdas={p.evidencia} />}
        {p.opciones?.length ? <select className={campo} value={respuestas[p.id] ?? ""} onChange={(e) => { setRespuestas((prev) => ({ ...prev, [p.id]: e.target.value })); onPendiente(); }}>
          <option value="">Selecciona una respuesta</option>
          {p.opciones.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
        </select> : <input className={campo} maxLength={1000} value={respuestas[p.id] ?? ""} onChange={(e) => { setRespuestas((prev) => ({ ...prev, [p.id]: e.target.value })); onPendiente(); }} />}
      </label>)}
      <label htmlFor={id} className="flex flex-col gap-1.5">
        <span className="font-medium text-ink-800">Explica cómo se lee el archivo <span className="font-normal text-ink-400">(opcional)</span></span>
        <textarea id={id} rows={3} maxLength={4000} className={campo} value={instrucciones} onChange={(e) => { setInstrucciones(e.target.value); onPendiente(); }} placeholder="Por ejemplo: todo está en la columna A; cada producto empieza con Ref: y ocupa cuatro filas. El tipo está en el título de cada sección." />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-ink-600">{lectura?.listoParaBorrador && !pendiente ? "La lectura está lista. Puedes guardar el patrón con los botones de abajo." : "Resuelve las dudas o explica un ajuste para revisar la lectura."}</p>
        <button type="button" disabled={trabajando || faltanRespuestas} onClick={() => onRevisar(instrucciones, respuestas)} className="rounded-md bg-navy-700 px-3.5 py-2 font-semibold text-white hover:bg-navy-600 disabled:opacity-50">
          {trabajando ? "Revisando…" : instrucciones.trim() ? "Revisar interpretación" : preguntas.length ? "Validar respuestas" : lectura?.errorProveedorIA || error ? "Reintentar lectura" : pendiente && lectura ? "Validar ajustes" : "Analizar muestra"}
        </button>
      </div>
      {error && <button type="button" onClick={onReiniciar} className="self-start text-blue-700 underline">Volver a analizar la muestra desde el inicio</button>}
    </fieldset>
  </section>;
}
