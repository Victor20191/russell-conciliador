"use client";

import { useCallback, useId, useRef, useState, useTransition, type Dispatch, type SetStateAction } from "react";
import { conservarLecturaInventario, consultarAsistenciaInventario, prepararBorradorInventario, ventanaOriginalInventario } from "@/app/actions/asistencia-inventario";
import type { AnalisisModulo } from "@/app/actions/modulos-datos";
import { CeldasOrigen, EjemplosLectura, ResumenAsistencia } from "./lectura-inventario-vista";
import type { SpecModulo } from "@/lib/modulos/extraccion/esquema";
import type { EjemploLecturaInventario, PreguntaAsistenciaInventario, ResumenLecturaInventario } from "@/lib/modulos/asistencia/tipos";
import type { EstadoAsistenciaInventario } from "@/lib/modulos/asistencia-inventario-estado";
import { EditorMapeoModulo, type RolModulo } from "./editor-mapeo-modulo";
import { abrirDisenadorTrasLectura, hojaInicialEjemplo } from "@/lib/modulos/asistencia/constructor-estado";
import { modeloVacio, type ModeloUsuarioInventario } from "@/lib/modulos/asistencia/modelo-usuario";
import { ConstructorLectura, type ConsultaVentana } from "./constructor-lectura/constructor-lectura";

/** Sólo datos serializables de la asistencia: nunca el archivo completo. */
export type ResultadoAsistenciaVista = {
  ok: boolean;
  estado: EstadoAsistenciaInventario;
  revision?: number;
  resumen?: ResumenLecturaInventario | null;
  resumenAnterior?: ResumenLecturaInventario | null;
  preguntas?: PreguntaAsistenciaInventario[];
  ejemplosLectura?: EjemploLecturaInventario[];
  advertencias?: string[];
  spec?: SpecModulo | null;
  analisis?: AnalisisModulo;
  loteId?: string;
  message?: string;
  edicionesManuales?: number;
  hayEdicionesIncompatibles?: boolean;
  /** Lectura por ejemplo: lo entendido, como ejemplo editable sobre la grilla. */
  modeloSugerido?: ModeloUsuarioInventario;
  filasSugeridas?: { fila: number; mensaje: string }[];
  /** La hoja que el usuario ya eligió, aunque la lectura de esa hoja no haya salido. */
  hojaElegida?: string;
  /** Las pestañas del archivo, para poder cambiar de hoja aunque la lectura no haya salido. */
  hojasArchivo?: { nombre: string; oculta: boolean }[];
};

const campo = "w-full min-w-0 rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12px] text-ink-700 outline-none focus:border-blue-400 disabled:bg-ink-50";
const primario = "rounded-md bg-navy-700 px-3.5 py-2 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60";
const secundario = "rounded-md border border-ink-200 bg-white px-3 py-2 text-[12px] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-60";

/** La carga y la corrección usan la misma recepción, preguntas y comparación. */
export function AsistenciaInventarioPanel({
  recepcionLoteId,
  periodo,
  erpId,
  anexoEncabezadoId,
  resultadoInicial,
  analisisInicial,
  roles,
  correccion = false,
  onPreparado,
  onConstructorAbierto,
}: {
  recepcionLoteId: string;
  periodo: string;
  erpId?: number;
  anexoEncabezadoId?: number;
  resultadoInicial: ResultadoAsistenciaVista;
  analisisInicial?: AnalisisModulo | null;
  roles: RolModulo[];
  correccion?: boolean;
  onPreparado: (loteId: string) => void;
  /** El ejemplo sobre la grilla necesita ancho: el modal que contiene el panel puede ampliarse. */
  onConstructorAbierto?: (abierto: boolean) => void;
}) {
  const id = useId();
  const [resultado, setResultado] = useState(resultadoInicial);
  const [analisisVista, setAnalisisVista] = useState(resultadoInicial.analisis ?? analisisInicial);
  const [spec, setSpec] = useState<SpecModulo | null>(resultadoInicial.spec ?? analisisInicial?.spec ?? null);
  const [specEditado, setSpecEditado] = useState(false);
  // Si el ajuste de filas o columnas no se puede leer, el motivo va junto al botón (no se abre el
  // Diseñador) y «Deshacer mis ajustes» vuelve a la última lectura que sí salió.
  const [falloAjuste, setFalloAjuste] = useState<string | null>(null);
  const [lecturaValida, setLecturaValida] = useState<{ resultado: ResultadoAsistenciaVista; spec: SpecModulo | null; analisis: AnalisisModulo | null | undefined }>(() => ({
    resultado: resultadoInicial, spec: resultadoInicial.spec ?? analisisInicial?.spec ?? null, analisis: resultadoInicial.analisis ?? analisisInicial,
  }));
  const [hoja, setHoja] = useState<string | undefined>();
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [instrucciones, setInstrucciones] = useState("");
  const [cambioPendiente, setCambioPendiente] = useState(false);
  const [descartarIncompatibles, setDescartarIncompatibles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, startTrabajo] = useTransition();
  // Lectura por ejemplo: el producto armado sobre la grilla sobrevive a cada revisión.
  const [modeloEjemplo, setModeloEjemplo] = useState<ModeloUsuarioInventario | null>(resultadoInicial.modeloSugerido ?? null);
  const [modeloEditado, setModeloEditado] = useState(false);
  const [constructorAbierto, setConstructorAbiertoEstado] = useState(false);
  const abrirConstructor = (abierto: boolean) => { setConstructorAbiertoEstado(abierto); onConstructorAbierto?.(abierto); };
  const cargarVentana = useCallback((consulta: ConsultaVentana) => ventanaOriginalInventario({ recepcionLoteId, hoja: consulta.hoja, filaDesde: consulta.filaDesde, spec: consulta.spec }), [recepcionLoteId]);
  const enCurso = useRef(false);
  const analisis = analisisVista;
  // La hoja de la lectura vigente; `hoja` solo tiene valor si el usuario escogió otra.
  const hojaLeida = hojaInicialEjemplo({ lectura: resultado.resumen?.hoja, guardada: resultado.hojaElegida, spec: resultado.spec?.hoja, analisis: analisis?.hoja });
  const eligioOtraHoja = !!hoja && hoja !== hojaLeida;
  // Las dudas eran sobre la hoja anterior: no detienen la lectura de la nueva.
  const preguntas = eligioOtraHoja ? [] : resultado.preguntas ?? [];
  const hojasArchivo = resultado.hojasArchivo ?? [];
  // Una explicación puede corregir una interpretación incorrecta sin obligar a
  // aceptarla primero. El servidor volverá a pedir confirmación para la regla nueva.
  const pideReinterpretar = instrucciones.trim().length > 0;
  const faltanRespuestas = !pideReinterpretar && preguntas.some((p) => !respuestas[p.id]?.trim());
  const propuesta = resultado.estado === "propuesta_lista";
  const consultando = resultado.estado === "analizando";
  const confirmado = resultado.estado === "confirmado";
  const necesitaCorreccion = correccion && resultado.estado === "borrador_preparado";
  const propuestaVigente = propuesta && !cambioPendiente;

  const actualizarSpec: Dispatch<SetStateAction<SpecModulo | null>> = (cambio) => {
    setSpec(cambio);
    setSpecEditado(true);
    setCambioPendiente(true);
    setDescartarIncompatibles(false);
  };

  const cambiarHoja = (nombre: string) => {
    setHoja(nombre === hojaLeida ? undefined : nombre);
    setRespuestas({});
    setSpecEditado(false);
    setSpec((previa) => {
      if (nombre === hojaLeida && resultado.spec) return resultado.spec;
      return previa ? { ...previa, hoja: nombre } : previa;
    });
    setCambioPendiente(true);
    setDescartarIncompatibles(false);
  };
  // El Diseñador trae su propio selector: mientras está abierto, ese es el que se ve.
  const mostrarSelectorHoja = hojasArchivo.length > 1 && !constructorAbierto && !confirmado && !consultando
    && !resultado.preguntas?.some((p) => p.id === "hoja");

  // Vuelve a la última lectura que salió (su resumen, sus avisos y su mapa), con la revisión vigente.
  // El mapa va como manual: la lectura guardada ahora es la del ajuste que falló, y releer sin mapa
  // partiría de ella.
  const deshacerAjustes = () => {
    if (!lecturaValida.spec) return;
    setResultado((actual) => ({ ...lecturaValida.resultado, revision: actual.revision }));
    setSpec(lecturaValida.spec);
    if (lecturaValida.analisis) setAnalisisVista(lecturaValida.analisis);
    setSpecEditado(true);
    setCambioPendiente(true);
    setFalloAjuste(null);
  };

  const puedeConservarActual = correccion &&resultado.resumenAnterior != null && resultado.revision != null && !consultando && !confirmado && resultado.estado !== "borrador_preparado";

  const ejecutar = (accion: "preparar" | "aplicar" | "conservar" = "preparar", modelo?: ModeloUsuarioInventario) => {
    const aplicar = accion === "aplicar";
    const conservar = accion === "conservar";
    if (enCurso.current || confirmado || (conservar && !puedeConservarActual) || (aplicar && (!propuestaVigente || (resultado.hayEdicionesIncompatibles && !descartarIncompatibles)))) return;
    // Lo que se envía como mapa manual: las filas y columnas que la persona ajustó a mano.
    const ajusteManual = !aplicar && !conservar && !consultando && !modelo && specEditado && spec != null;
    enCurso.current = true;
    setError(null);
    setFalloAjuste(null);
    startTrabajo(async () => {
      try {
        const siguiente = conservar
          ? await conservarLecturaInventario({ recepcionLoteId, revisionEsperada: resultado.revision! })
          : consultando
            ? await consultarAsistenciaInventario({ recepcionLoteId })
            : await prepararBorradorInventario({
              recepcionLoteId,
              periodo,
              erpId,
              anexoEncabezadoId,
              revisionEsperada: resultado.revision,
              ...(aplicar
                ? { aplicarPropuesta: true, descartarEdicionesIncompatibles: descartarIncompatibles }
                : modelo
                  ? { modelo, instrucciones: instrucciones.trim() || undefined }
                  : { hoja, instrucciones: instrucciones.trim() || undefined, respuestas, ...(specEditado && spec ? { specManual: spec } : {}) }),
            });
        setResultado((previa) => siguiente.ok ? siguiente : { ...previa, ...siguiente, revision: siguiente.revision ?? previa.revision });
        if ("analisis" in siguiente && siguiente.analisis) setAnalisisVista(siguiente.analisis);
        if ("spec" in siguiente && siguiente.spec) setSpec(siguiente.spec);
        // Mientras el usuario no haya armado nada, el ejemplo muestra lo último que se entendió.
        if (!modelo && !modeloEditado && "modeloSugerido" in siguiente) setModeloEjemplo(siguiente.modeloSugerido ?? null);
        if ("preguntas" in siguiente && abrirDisenadorTrasLectura(siguiente, ajusteManual)) abrirConstructor(true);
        if (ajusteManual && siguiente.estado === "error_recuperable") {
          setFalloAjuste(siguiente.message || "La lectura necesita otro ajuste de filas o columnas.");
        }
        if (siguiente.ok && "spec" in siguiente && siguiente.spec) {
          setLecturaValida({ resultado: siguiente, spec: siguiente.spec, analisis: ("analisis" in siguiente ? siguiente.analisis : undefined) ?? analisis });
        }
        if (siguiente.ok) {
          // El servidor ya guardó estas indicaciones. Volver a enviarlas al responder una
          // pregunta forzaría otra llamada IA aunque solo falte resolver esa ambigüedad.
          setInstrucciones("");
          setRespuestas({});
          setHoja(undefined);
          setSpecEditado(false);
          setCambioPendiente(false);
          setDescartarIncompatibles(false);
        }
        if (siguiente.ok && siguiente.estado === "borrador_preparado" && siguiente.loteId && (!correccion || aplicar || conservar)) {
          onPreparado(siguiente.loteId);
        }
      } catch {
        setError("No pudimos completar la lectura. El original y el último borrador siguen guardados; puedes reintentar.");
      } finally {
        enCurso.current = false;
      }
    });
  };

  return (
    <div className="flex flex-col gap-4 text-[12px]" aria-busy={trabajando}>
      <div className="border-l-2 border-navy-700 pl-3">
        <p className="font-semibold text-ink-800">{correccion ? "Ajustar la lectura desde el original" : "Preparar tu inventario"}</p>
        <p className="mt-1 leading-relaxed text-ink-500">{correccion
          ? "Describe el ajuste. Verás el resultado antes de reemplazar la lectura del borrador."
          : "Reconocemos el formato y preparamos el borrador. Solo necesitamos tu ayuda si algún dato admite más de una interpretación."}</p>
      </div>

      {resultado.message && !falloAjuste && <p role={resultado.ok ? "status" : "alert"} className={`rounded-md border px-3 py-2.5 leading-relaxed ${resultado.ok ? "border-blue-200 bg-blue-100 text-navy-800" : "border-err-200 bg-err-50 text-err-700"}`}>{resultado.message}</p>}
      {error && <p role="alert" className="rounded-md border border-err-200 bg-err-50 px-3 py-2 text-err-700">{error}</p>}
      {mostrarSelectorHoja && (
        <div className="flex min-w-0 flex-col gap-1.5">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="font-medium text-ink-800">Hoja del archivo</span>
            <select
              className={campo}
              value={hoja ?? hojaLeida}
              disabled={trabajando}
              onChange={(e) => {
                const nombre = e.target.value;
                cambiarHoja(nombre);
                // Con este selector a la vista el Diseñador sigue cerrado: no hay nada armado que perder.
                setModeloEjemplo(resultado.modeloSugerido?.hoja === nombre ? resultado.modeloSugerido : null);
              }}
            >
              {!hoja && !hojaLeida && <option value="">Selecciona la hoja</option>}
              {hojasArchivo.map((h) => <option key={h.nombre} value={h.nombre}>{h.nombre}{h.oculta ? " (oculta)" : ""}</option>)}
            </select>
          </label>
          {eligioOtraHoja && (
            <p role="status" className="text-[11px] leading-relaxed text-warn-700">
              {resultado.resumen?.hoja
                ? `Escogiste «${hoja}». La tabla sigue mostrando la lectura de «${resultado.resumen.hoja}» hasta que pulses «Leer esta hoja».`
                : `Escogiste «${hoja}». Pulsa «Leer esta hoja» para leerla.`}
            </p>
          )}
        </div>
      )}
      {/* Sin hoja aún no se ha leído nada: una tabla en ceros parecería un archivo vacío. */}
      {resultado.resumen?.hoja && <ResumenAsistencia actual={resultado.resumen} anterior={propuesta ? resultado.resumenAnterior : null} />}
      {(resultado.advertencias?.length ?? 0) > 0 && (
        <ul className="list-disc space-y-1 rounded-md border border-warn-300 bg-warn-100 py-2 pl-7 pr-3 text-[11.5px] leading-relaxed text-warn-700">
          {resultado.advertencias?.map((aviso, index) => <li key={`${index}-${aviso}`}>{aviso}</li>)}
        </ul>
      )}
      <EjemplosLectura ejemplos={resultado.ejemplosLectura ?? []} />

      <fieldset disabled={trabajando || consultando || confirmado} className="flex min-w-0 flex-col gap-3 disabled:opacity-80">
        {preguntas.map((pregunta) => (
          <label key={pregunta.id} className="flex min-w-0 flex-col gap-1.5">
            <span className="font-medium text-ink-800">{pregunta.etiqueta}</span>
            {!!pregunta.evidencia?.length && <CeldasOrigen celdas={pregunta.evidencia} />}
            {pregunta.opciones?.length ? (
              <select className={campo} value={respuestas[pregunta.id] ?? ""} onChange={(e) => { setRespuestas((previas) => ({ ...previas, [pregunta.id]: e.target.value })); setCambioPendiente(true); }}>
                <option value="">Selecciona una respuesta</option>
                {pregunta.opciones.map((opcion) => <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>)}
              </select>
            ) : (
              <input className={campo} value={respuestas[pregunta.id] ?? ""} maxLength={1000} onChange={(e) => { setRespuestas((previas) => ({ ...previas, [pregunta.id]: e.target.value })); setCambioPendiente(true); }} />
            )}
          </label>
        ))}
        <label htmlFor={`${id}-indicaciones`} className="flex flex-col gap-1.5">
          <span className="font-medium text-ink-800">Explica qué debemos corregir <span className="font-normal text-ink-400">{correccion ? "" : "(opcional)"}</span></span>
          <textarea id={`${id}-indicaciones`} rows={3} maxLength={4000} value={instrucciones} onChange={(e) => { setInstrucciones(e.target.value); setCambioPendiente(true); }} placeholder="Por ejemplo: referencia, tipo y cantidad están juntos; cada producto ocupa tres filas; el costo corresponde al total." className={`${campo} resize-y`} />
        </label>
        {spec?.lecturaEstructurada && <p className="rounded-md bg-ink-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-600">Este formato combina datos dentro de celdas o entre filas. Para corregirlo, explica cómo deben interpretarse —o arma un producto de ejemplo sobre el archivo— y revisa los ejemplos de la nueva propuesta.</p>}
        {spec && !spec.lecturaEstructurada && analisis && (
          <details className="rounded-md border border-ink-150 bg-ink-50/40">
            <summary className="cursor-pointer px-3 py-2.5 text-[11.5px] font-medium text-ink-600">Ajustes avanzados de lectura</summary>
            <div className="border-t border-ink-150 p-3">
              {hoja && analisis.hoja !== hoja ? <p className="text-[11.5px] text-ink-600">Escogiste «{hoja}». Primero léela para poder ajustar sus columnas.</p> : (
                <EditorMapeoModulo
                  analisis={analisis}
                  spec={spec}
                  setSpec={actualizarSpec}
                  roles={roles}
                  clasificadorRol="tipo"
                  rolValor="valorTotal"
                  confirmarValorSinImpuestos={false}
                  cuentaEnClasificador={false}
                  conNivelCartera={false}
                  modo="carga"
                  marcaTotalesCarga={(
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-medium text-ink-600">Fila del total en el archivo original</span>
                      <input type="number" min={1} step={1} value={spec.subtotalesFila ?? ""} onChange={(e) => actualizarSpec((previa) => previa ? { ...previa, subtotalesFila: Number(e.target.value) > 0 ? Number(e.target.value) : undefined } : previa)} className={campo} />
                      <span className="text-[11px] text-ink-500">La revisión comprobará la celda contra el original antes de aplicar la lectura.</span>
                    </label>
                  )}
                />
              )}
            </div>
          </details>
        )}
      </fieldset>

      {!confirmado && !consultando && (constructorAbierto ? (
        <ConstructorLectura
          modelo={modeloEjemplo ?? modeloVacio(hojaInicialEjemplo({ respuesta: respuestas.hoja, ajustes: hoja, lectura: resultado.resumen?.hoja, guardada: resultado.hojaElegida, spec: spec?.hoja, analisis: analisis?.hoja }))}
          onModelo={(m) => {
            setModeloEjemplo(m);
            setModeloEditado(true);
            setCambioPendiente(true);
            // La hoja escogida en el Diseñador también es la que relee el botón de abajo.
            if (m.hoja && m.hoja !== (hoja ?? hojaLeida)) cambiarHoja(m.hoja);
          }}
          spec={resultado.spec ?? null}
          filasSugeridas={resultado.filasSugeridas}
          trabajando={trabajando}
          cargarVentana={cargarVentana}
          onReprocesar={(m) => ejecutar("preparar", m)}
        />
      ) : (
        <button type="button" onClick={() => abrirConstructor(true)} disabled={trabajando} className="self-start rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-[12px] font-semibold text-navy-700 hover:bg-blue-200 disabled:opacity-60">
          Diseñador de formato
        </button>
      ))}

      {(resultado.edicionesManuales ?? 0) > 0 && <p className="text-[11px] leading-relaxed text-ink-500">El borrador tiene {resultado.edicionesManuales} cambio(s) manual(es). La nueva lectura conservará los que se puedan aplicar a las mismas filas.</p>}
      {propuestaVigente && resultado.hayEdicionesIncompatibles && (
        <label className="flex items-start gap-2 rounded-md border border-warn-300 bg-warn-100 px-3 py-2.5 text-[11.5px] leading-relaxed text-warn-700">
          <input type="checkbox" className="mt-0.5" checked={descartarIncompatibles} disabled={trabajando} onChange={(e) => setDescartarIncompatibles(e.target.checked)} />
          <span>Revisé la comparación y acepto descartar los cambios manuales que ya no correspondan a la nueva lectura.</span>
        </label>
      )}
      {propuesta && cambioPendiente && <p role="status" className="text-[11px] text-warn-700">Hay nuevas indicaciones. Revisa otra vez la propuesta antes de aplicarla.</p>}
      {falloAjuste && (
        <div role="alert" className="flex flex-col gap-2 rounded-md border border-err-200 bg-err-50 px-3 py-2.5 leading-relaxed text-err-700">
          <p><span className="font-semibold">Con tus ajustes no se pudo leer el archivo:</span> {falloAjuste}</p>
          <p className="text-[11.5px]">Corrige las filas o columnas en «Ajustes avanzados de lectura» y vuelve a continuar, o deshaz tus ajustes para seguir con la lectura sugerida.</p>
          {lecturaValida.spec && (
            <button type="button" className={`${secundario} self-start`} disabled={trabajando} onClick={deshacerAjustes}>Deshacer mis ajustes</button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-100 pt-3">
        {trabajando && <span role="status" className="mr-auto text-[11.5px] text-ink-500">{consultando ? "Consultando…" : "Revisando el archivo completo…"}</span>}
        {puedeConservarActual && <button type="button" className={secundario} disabled={trabajando} onClick={() => ejecutar("conservar")} title="Descartar esta propuesta y conservar la lectura y los cambios ya guardados en el borrador.">Conservar lectura actual</button>}
        {!confirmado && (!propuestaVigente || consultando) && (
          <button type="button" className={primario} disabled={trabajando || (!consultando && faltanRespuestas) || (necesitaCorreccion && !cambioPendiente)} onClick={() => ejecutar()}>
            {consultando ? "Consultar avance" : eligioOtraHoja ? "Leer esta hoja" : pideReinterpretar ? "Revisar interpretación" : resultado.estado === "error_recuperable" && !specEditado ? "Reintentar lectura" : correccion ? "Revisar propuesta" : "Continuar al borrador"}
          </button>
        )}
        {propuestaVigente && (
          <>
            <span className="mr-auto text-[11px] text-ink-500">La propuesta todavía no reemplaza el borrador.</span>
            <button type="button" className={secundario} disabled={trabajando} onClick={() => setCambioPendiente(true)}>Ajustar propuesta</button>
            <button type="button" className={primario} disabled={trabajando || (resultado.hayEdicionesIncompatibles && !descartarIncompatibles)} onClick={() => ejecutar("aplicar")}>Aplicar nueva lectura</button>
          </>
        )}
      </div>
    </div>
  );
}
