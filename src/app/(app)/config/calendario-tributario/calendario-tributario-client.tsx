"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Pestana } from "@/components/pestanas";
import { Card } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { notifyActionState } from "@/lib/client-notifications";
import { useAvisoSalidaSinGuardar } from "@/lib/usar-aviso-salida";
import { guardarCalendarioDian, leerCalendarioPdf } from "@/app/actions/impuestos-configuracion";
import type { ActionState } from "@/lib/definitions";
import {
  CLAVES_CALENDARIO,
  FORMULARIOS_CALENDARIO,
  ORDEN_DIGITOS,
  grillaCalendario,
  validarCalendario,
  type FormularioCalendario,
  type ResultadoLecturaCalendario,
  type VencimientoDian,
} from "@/lib/impuestos/calendario";
import type { CalendarioVista } from "@/lib/impuestos/configuracion-servidor";

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const BOTON_PRIMARIO = "rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60";
const BOTON_SECUNDARIO = "rounded-md border border-ink-200 px-3 py-1.5 text-[12px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-60";

/** «12 feb» (y el año si no es el del calendario: el último período vence en enero del siguiente). */
function fechaCorta(iso: string | null, anio: number): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES_CORTOS[m - 1] ?? "?"}${a !== anio ? ` ${a}` : ""}`;
}

type Borrador = { filas: VencimientoDian[]; origen: "pdf" | "manual"; avisosLectura: string[] };

export default function CalendarioTributarioClient({
  anio,
  calendarios,
  formularioInicial,
  opcionesAnio,
  puedeEditar,
}: {
  anio: number;
  calendarios: CalendarioVista[];
  formularioInicial: FormularioCalendario;
  opcionesAnio: number[];
  puedeEditar: boolean;
}) {
  const [formulario, setFormulario] = useState<FormularioCalendario>(formularioInicial);
  // Un borrador por formulario: la importación del PDF propone los cuatro a la vez.
  const [borradores, setBorradores] = useState<Partial<Record<FormularioCalendario, Borrador>>>({});
  const [lecturaState, lecturaAction, leyendo] = useActionState<ResultadoLecturaCalendario, FormData>(leerCalendarioPdf, {});
  const [guardarState, guardarAction, guardando] = useActionState<ActionState, FormData>(guardarCalendarioDian, {});
  // Las propuestas solo viven en esta pantalla: si se sale mientras la IA lee, la lectura se cobra y se pierde sin aviso.
  useAvisoSalidaSinGuardar(leyendo, "La IA está leyendo el calendario: espera a que termine. Si sales, se pierde la lectura.");

  // Respuestas del servidor (ajuste en render): las propuestas del PDF abren un borrador por formulario; guardar cierra el del formulario guardado.
  const [ultimaLectura, setUltimaLectura] = useState(lecturaState);
  if (lecturaState !== ultimaLectura) {
    setUltimaLectura(lecturaState);
    if (lecturaState.ok && lecturaState.propuestas?.length) {
      const nuevos: Partial<Record<FormularioCalendario, Borrador>> = {};
      for (const p of lecturaState.propuestas) {
        nuevos[p.formulario] = { filas: p.filas, origen: "pdf", avisosLectura: p.avisos.filter((a) => a.startsWith("El documento parece")) };
      }
      setBorradores(nuevos);
    }
  }
  const [ultimoGuardado, setUltimoGuardado] = useState(guardarState);
  const [guardandoFormulario, setGuardandoFormulario] = useState<FormularioCalendario | null>(null);
  if (guardarState !== ultimoGuardado) {
    setUltimoGuardado(guardarState);
    if (guardarState.ok && guardandoFormulario) {
      const resto = { ...borradores };
      delete resto[guardandoFormulario];
      setBorradores(resto);
    }
  }
  // Cambiar de año descarta lo que no se guardó.
  const [anioPrevio, setAnioPrevio] = useState(anio);
  if (anio !== anioPrevio) {
    setAnioPrevio(anio);
    setBorradores({});
  }

  useEffect(() => {
    notifyActionState(lecturaState, { success: lecturaState.message ?? "Propuestas listas para revisar.", error: "No se pudo leer el calendario." });
  }, [lecturaState]);
  useEffect(() => {
    notifyActionState(guardarState, { success: "Calendario guardado.", error: "No se pudo guardar el calendario." });
  }, [guardarState]);

  const calendario = calendarios.find((c) => c.formulario === formulario) ?? { anio, formulario, filas: [], actualizadoPor: null, actualizadoEn: null };
  const def = FORMULARIOS_CALENDARIO[formulario];
  const borrador = borradores[formulario] ?? null;
  const pendientes = CLAVES_CALENDARIO.filter((f) => borradores[f]);

  const guardadas = useMemo(() => new Map(calendario.filas.map((f) => [`${f.periodo}:${f.ultimoDigito}`, f.fecha])), [calendario.filas]);
  const validacion = useMemo(() => (borrador ? validarCalendario(anio, formulario, borrador.filas) : null), [borrador, anio, formulario]);
  const grilla = grillaCalendario(formulario, borrador?.filas ?? calendario.filas, anio);
  const cambios = borrador ? borrador.filas.filter((f) => guardadas.size > 0 && guardadas.get(`${f.periodo}:${f.ultimoDigito}`) !== f.fecha).length : 0;

  function cambiarFecha(periodo: number, ultimoDigito: number, fecha: string) {
    setBorradores((todos) => {
      const b = todos[formulario];
      if (!b) return todos;
      const resto = b.filas.filter((f) => !(f.periodo === periodo && f.ultimoDigito === ultimoDigito));
      return { ...todos, [formulario]: { ...b, filas: fecha ? [...resto, { periodo, ultimoDigito, fecha }] : resto } };
    });
  }
  function descartar() {
    const resto = { ...borradores };
    delete resto[formulario];
    setBorradores(resto);
  }

  const estadoChip = (f: FormularioCalendario) => {
    if (borradores[f]) return "propuesta";
    return (calendarios.find((c) => c.formulario === f)?.filas.length ?? 0) > 0 ? "cargado" : "sin cargar";
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold text-ink-500">Año</span>
        {opcionesAnio.map((a) => (
          <Link
            key={a}
            href={`/config/calendario-tributario?anio=${a}&formulario=${formulario}`}
            className={`rounded-md border px-2.5 py-1 text-[12px] font-semibold tabular-nums ${a === anio ? "border-navy-700 bg-navy-700 text-white" : "border-ink-200 text-ink-600 hover:bg-ink-50"}`}
          >
            {a}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Formulario del calendario">
        {CLAVES_CALENDARIO.map((f) => (
          <Pestana key={f} activa={f === formulario} onClick={() => setFormulario(f)} label={`${FORMULARIOS_CALENDARIO[f].etiqueta} · ${estadoChip(f)}`} />
        ))}
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-navy-800">{def.etiqueta} · {anio}</h2>
            <p className="mt-1 text-[12px] text-ink-500">
              {borrador
                ? borrador.origen === "pdf"
                  ? "Propuesta leída del PDF de la DIAN. Revisa cada fecha contra el documento antes de guardar."
                  : "Editando a mano. Guarda cuando la grilla esté completa."
                : calendario.filas.length
                  ? `Cargado${calendario.actualizadoEn ? ` · ${fmtDateTime(calendario.actualizadoEn)}` : ""}${calendario.actualizadoPor ? ` · ${calendario.actualizadoPor}` : ""}`
                  : `Sin calendario para ${anio}. Sin él, el indicador de oportunidad de ese año no se puede calcular.`}
            </p>
            {formulario === "IVA_ANUAL" && (
              <p className="mt-1 text-[12px] text-ink-500">
                El calendario de {anio} trae el vencimiento de la declaración anual del año gravable {anio - 1}, en febrero de {anio}, con los dígitos del NIT de a dos.
              </p>
            )}
            {pendientes.length > 0 && (
              <p className="mt-1 text-[12px] font-semibold text-warn-700">
                Sin guardar: {pendientes.map((f) => FORMULARIOS_CALENDARIO[f].etiqueta).join(", ")}. Cada formulario se guarda desde su pestaña.
              </p>
            )}
          </div>
          {puedeEditar && !borrador && (
            <div className="flex flex-wrap items-center gap-2">
              <form action={lecturaAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="anio" value={anio} />
                <input
                  type="file"
                  name="archivo"
                  accept="application/pdf,.pdf"
                  required
                  aria-label="PDF del calendario tributario de la DIAN"
                  className="max-w-[240px] text-[12px] text-ink-600 file:mr-2 file:rounded-md file:border file:border-ink-200 file:bg-white file:px-2.5 file:py-1 file:text-[12px] file:font-semibold file:text-ink-600"
                />
                <button type="submit" disabled={leyendo} className={BOTON_PRIMARIO}>
                  {leyendo ? <EstadoProcesando>Leyendo con IA</EstadoProcesando> : "Importar desde el PDF de la DIAN"}
                </button>
              </form>
              <button
                type="button"
                onClick={() => setBorradores((todos) => ({ ...todos, [formulario]: { filas: calendario.filas, origen: "manual", avisosLectura: [] } }))}
                className={BOTON_SECUNDARIO}
              >
                {calendario.filas.length ? "Editar a mano" : "Escribir a mano"}
              </button>
            </div>
          )}
        </div>

        {((borrador?.avisosLectura.length ?? 0) > 0 || (validacion && (validacion.errores.length > 0 || validacion.avisos.length > 0))) && (
          <div className="mt-3 flex flex-col gap-2">
            {validacion && validacion.errores.length > 0 && (
              <div className="rounded-md border border-err-100 bg-err-100 px-3 py-2 text-[12px] text-err-700">
                <div className="font-semibold">Para guardar falta corregir {validacion.errores.length === 1 ? "esto" : `${validacion.errores.length} cosas`}:</div>
                <ul className="mt-1 list-disc pl-4">{validacion.errores.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul>
                {validacion.errores.length > 8 && <div className="mt-1">… y {validacion.errores.length - 8} más.</div>}
              </div>
            )}
            {[...(borrador?.avisosLectura ?? []), ...(validacion?.avisos ?? [])].length > 0 && (
              <div className="rounded-md border border-warn-100 bg-warn-100 px-3 py-2 text-[12px] text-warn-700">
                <ul className="list-disc pl-4">{[...(borrador?.avisosLectura ?? []), ...(validacion?.avisos ?? [])].map((a) => <li key={a}>{a}</li>)}</ul>
              </div>
            )}
          </div>
        )}

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[820px] text-[12px]">
            <thead>
              <tr className="border-b border-ink-150 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                <th className="px-2 py-1.5 text-left">Período</th>
                {ORDEN_DIGITOS.map((d) => <th key={d} className="px-2 py-1.5 text-center">Dígito {d}</th>)}
              </tr>
            </thead>
            <tbody>
              {grilla.map((fila) => (
                <tr key={fila.periodo} className="border-b border-ink-100 last:border-0">
                  <td className="whitespace-nowrap px-2 py-1.5 font-semibold text-navy-800">{fila.etiqueta}</td>
                  {fila.fechas.map((fecha, i) => {
                    const digito = ORDEN_DIGITOS[i];
                    const cambiada = borrador && guardadas.size > 0 && guardadas.get(`${fila.periodo}:${digito}`) !== (fecha ?? undefined);
                    return (
                      <td key={digito} className={`px-1 py-1 text-center tabular-nums ${cambiada ? "bg-ai-100" : ""}`}>
                        {borrador ? (
                          <input
                            type="date"
                            value={fecha ?? ""}
                            onChange={(e) => cambiarFecha(fila.periodo, digito, e.target.value)}
                            aria-label={`${fila.etiqueta}, dígito ${digito}`}
                            className={`w-[124px] rounded border bg-white px-1 py-0.5 text-[11.5px] text-ink-800 ${fecha ? "border-ink-200" : "border-err-500"}`}
                          />
                        ) : (
                          <span className={fecha ? "text-ink-800" : "text-ink-300"}>{fechaCorta(fecha, anio)}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {borrador && (
          <form action={guardarAction} onSubmit={() => setGuardandoFormulario(formulario)} className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <input type="hidden" name="anio" value={anio} />
            <input type="hidden" name="formulario" value={formulario} />
            <input type="hidden" name="origen" value={borrador.origen} />
            <input type="hidden" name="filas" value={JSON.stringify(borrador.filas)} />
            {cambios > 0 && <span className="text-[11.5px] text-ink-500">{cambios} fecha(s) distintas de las guardadas</span>}
            <button type="button" onClick={descartar} disabled={guardando} className={BOTON_SECUNDARIO}>Descartar</button>
            <button type="submit" disabled={guardando || (validacion?.errores.length ?? 0) > 0} className={BOTON_PRIMARIO}>
              {guardando ? <EstadoProcesando>Guardando</EstadoProcesando> : calendario.filas.length ? `Reemplazar ${def.etiqueta}` : `Guardar ${def.etiqueta}`}
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}
