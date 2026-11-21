"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Pestana } from "@/components/pestanas";
import { Card } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { notifyActionState } from "@/lib/client-notifications";
import { useAvisoSalidaSinGuardar } from "@/lib/usar-aviso-salida";
import { guardarCalendarioDian, guardarCalendariosDian, leerCalendarioPdf } from "@/app/actions/impuestos-configuracion";
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
  // Un borrador por formulario: «Cargar todos los calendarios» propone todos a la vez desde un solo PDF.
  const [borradores, setBorradores] = useState<Partial<Record<FormularioCalendario, Borrador>>>({});
  const [lecturaState, lecturaAction, leyendo] = useActionState<ResultadoLecturaCalendario, FormData>(leerCalendarioPdf, {});
  const [guardarState, guardarAction, guardando] = useActionState<ActionState, FormData>(guardarCalendarioDian, {});
  const [todosState, todosAction, guardandoTodos] = useActionState<ActionState, FormData>(guardarCalendariosDian, {});
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
  // «Guardar todos»: al guardar, se cierran los borradores que se enviaron.
  const [ultimoTodos, setUltimoTodos] = useState(todosState);
  const [enviadosTodos, setEnviadosTodos] = useState<FormularioCalendario[]>([]);
  if (todosState !== ultimoTodos) {
    setUltimoTodos(todosState);
    if (todosState.ok && enviadosTodos.length) {
      const resto = { ...borradores };
      for (const f of enviadosTodos) delete resto[f];
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
  useEffect(() => {
    notifyActionState(todosState, { success: todosState.message ?? "Calendarios guardados.", error: "No se pudieron guardar los calendarios." });
  }, [todosState]);

  const calendario = calendarios.find((c) => c.formulario === formulario) ?? { anio, formulario, filas: [], actualizadoPor: null, actualizadoEn: null };
  const def = FORMULARIOS_CALENDARIO[formulario];
  const borrador = borradores[formulario] ?? null;
  const pendientes = CLAVES_CALENDARIO.filter((f) => borradores[f]);
  // Cada propuesta pendiente con su validación: las que no tienen errores se guardan juntas.
  const resumen = pendientes.map((f) => ({ formulario: f, ...validarCalendario(anio, f, borradores[f]!.filas) }));
  const listos = resumen.filter((r) => r.errores.length === 0).map((r) => r.formulario);
  const yaGuardados = listos.filter((f) => (calendarios.find((c) => c.formulario === f)?.filas.length ?? 0) > 0).length;
  const ocupado = leyendo || guardando || guardandoTodos;

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

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Formulario del calendario">
          {CLAVES_CALENDARIO.map((f) => (
            <Pestana key={f} activa={f === formulario} onClick={() => setFormulario(f)} label={`${FORMULARIOS_CALENDARIO[f].etiqueta} · ${estadoChip(f)}`} />
          ))}
        </div>
        {/* Un solo PDF de la DIAN trae todas las secciones: se sube una vez y se proponen todos los calendarios del año. */}
        {puedeEditar && (
          <form action={lecturaAction} className="ml-auto flex flex-wrap items-center gap-2">
            <input type="hidden" name="anio" value={anio} />
            <input
              type="file"
              name="archivo"
              accept="application/pdf,.pdf"
              required
              aria-label="PDF del calendario tributario de la DIAN"
              className="max-w-[240px] text-[12px] text-ink-600 file:mr-2 file:rounded-md file:border file:border-ink-200 file:bg-white file:px-2.5 file:py-1 file:text-[12px] file:font-semibold file:text-ink-600"
            />
            <button type="submit" disabled={ocupado} className={BOTON_PRIMARIO} title={`Lee del PDF de la DIAN las ${CLAVES_CALENDARIO.length} secciones del calendario de ${anio}`}>
              {leyendo ? <EstadoProcesando>Leyendo con IA</EstadoProcesando> : "Cargar todos los calendarios"}
            </button>
          </form>
        )}
      </div>

      {puedeEditar && resumen.length > 0 && (
        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[14px] font-semibold text-navy-800">Calendarios por guardar · {anio}</h2>
              <p className="mt-1 text-[12px] text-ink-500">
                Revisa cada pestaña contra el PDF de la DIAN. Los que no tienen errores se guardan juntos{yaGuardados > 0 ? ` y reemplazan los ${yaGuardados === 1 ? "que ya estaba guardado" : `${yaGuardados} que ya estaban guardados`}` : ""}; los que tienen errores se corrigen en su pestaña.
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-[12px]">
                {resumen.map((r) => (
                  <li key={r.formulario} className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setFormulario(r.formulario)} className="font-semibold text-blue-700 hover:underline">
                      {FORMULARIOS_CALENDARIO[r.formulario].etiqueta}
                    </button>
                    {r.errores.length > 0 ? (
                      <span className="font-semibold text-err-700">{r.errores.length === 1 ? "1 error por corregir" : `${r.errores.length} errores por corregir`}</span>
                    ) : (
                      <span className="font-semibold text-ok-700">Listo para guardar</span>
                    )}
                    {r.avisos.length > 0 && <span className="text-warn-700">· {r.avisos.length === 1 ? "1 aviso" : `${r.avisos.length} avisos`}</span>}
                  </li>
                ))}
              </ul>
            </div>
            <form
              action={todosAction}
              onSubmit={() => setEnviadosTodos(listos)}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="anio" value={anio} />
              <input
                type="hidden"
                name="calendarios"
                value={JSON.stringify(listos.map((f) => ({ formulario: f, origen: borradores[f]!.origen, filas: borradores[f]!.filas })))}
              />
              <button type="button" onClick={() => setBorradores({})} disabled={ocupado} className={BOTON_SECUNDARIO}>Descartar todos</button>
              <button type="submit" disabled={ocupado || listos.length === 0} className={BOTON_PRIMARIO}>
                {guardandoTodos ? (
                  <EstadoProcesando>Guardando</EstadoProcesando>
                ) : listos.length === resumen.length ? (
                  "Guardar todos los calendarios"
                ) : (
                  `Guardar los ${listos.length} listos`
                )}
              </button>
            </form>
          </div>
        </Card>
      )}

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
                  : `Sin calendario para ${anio}. Sin él, el indicador de oportunidad de ese año no se puede calcular. Cárgalo con «Cargar todos los calendarios» o escríbelo a mano.`}
            </p>
            {formulario === "IVA_ANUAL" && (
              <p className="mt-1 text-[12px] text-ink-500">
                El calendario de {anio} trae el vencimiento de la declaración anual del año gravable {anio - 1}, en febrero de {anio}, con los dígitos del NIT de a dos.
              </p>
            )}
          </div>
          {puedeEditar && !borrador && (
            <div className="flex flex-wrap items-center gap-2">
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
            <button type="button" onClick={descartar} disabled={ocupado} className={BOTON_SECUNDARIO}>Descartar</button>
            <button type="submit" disabled={ocupado || (validacion?.errores.length ?? 0) > 0} className={BOTON_PRIMARIO}>
              {guardando ? <EstadoProcesando>Guardando</EstadoProcesando> : calendario.filas.length ? `Reemplazar ${def.etiqueta}` : `Guardar ${def.etiqueta}`}
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}
