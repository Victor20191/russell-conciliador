"use client";

// Crear o editar una versión de patrón de archivo. El mapeo se hace sobre la MUESTRA del
// aplicativo (obligatoria para guardar); puede partir del archivo de un cliente que no coincidió
// o de otra versión, y se traslada por rótulo a las columnas de la muestra.
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SelectBuscable } from "@/components/select-buscable";
import { BannerProcesando } from "@/components/banner-procesando";
import { Icon } from "@/components/icons";
import { Card } from "@/components/ui";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import type { SpecModulo } from "@/lib/modulos/extraccion/esquema";
import {
  actualizarVersionPatron,
  asistirMuestraPatronInventario,
  type AsistenciaMuestraPatron,
  analizarMuestraDeVersion,
  analizarMuestraPatron,
  analizarOriginalParaPatron,
  crearVersionPatron,
  ventanaMuestraPatron,
  type AnalisisPatron,
} from "@/app/actions/patrones-modulo";
import { modeloVacio, type ModeloUsuarioInventario } from "@/lib/modulos/asistencia/modelo-usuario";
import { ConstructorLectura, type ConsultaVentana } from "../constructor-lectura/constructor-lectura";
import { AsistenciaMuestraPanel } from "./asistencia-muestra-panel";
import { MENSAJE_TIPO_FORMATO_EDITOR } from "../campo-error-mapeo";
import { EditorMapeoModulo, type EditorMapeoModuloHandle, type RolModulo } from "../editor-mapeo-modulo";
import { PruebaMapeoPatron, type FuentePrueba } from "./prueba-mapeo-patron";
import { ResumenLecturaEstructurada } from "../resumen-lectura-estructurada";

export type BasePatron = { version: number; specJson: string; encabezadoJson: string };
export type EdicionPatron = { id: number; version: number; erpNombre: string; nota: string; actualizadoEn: string; muestraNombre: string };

const claseCampo = "w-full min-w-0 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] text-ink-700 outline-none focus:border-blue-400";

export default function EditorPatronClient({
  moduloCodigo,
  moduloLabel,
  roles,
  clasificadorRol,
  rolValor,
  confirmarValorSinImpuestos,
  conNivelCartera,
  erps,
  erpInicial,
  recepcionLoteId,
  base,
  edicion,
}: {
  moduloCodigo: string;
  moduloLabel: string;
  roles: RolModulo[];
  clasificadorRol: string;
  rolValor: string;
  confirmarValorSinImpuestos: boolean;
  conNivelCartera: boolean;
  erps: { id: number; nombre: string }[];
  erpInicial?: number | null;
  /** Archivo de un cliente que no coincidió: prellena el mapeo (no es la muestra). */
  recepcionLoteId?: string | null;
  /** Otra versión de la que se parte («Nueva a partir de esta»). */
  base?: BasePatron | null;
  edicion?: EdicionPatron | null;
}) {
  const router = useRouter();
  const ruta = `/modulos/${moduloCodigo.toLowerCase()}/patrones`;
  const [erpId, setErpId] = useState<number | null>(edicion ? null : (erpInicial ?? null));
  const [analisis, setAnalisis] = useState<AnalisisPatron | null>(null);
  const [spec, setSpec] = useState<SpecModulo | null>(null);
  const [nota, setNota] = useState(edicion?.nota ?? "");
  const [muestraLista, setMuestraLista] = useState(edicion != null);
  const muestraRef = useRef<File | null>(null);
  // El editor del mapeo de ESTA pantalla: a él se le pide llevar el foco al campo que un error reclama.
  const editorRef = useRef<EditorMapeoModuloHandle>(null);
  const [analizando, startAnalizar] = useTransition();
  const [guardando, startGuardar] = useTransition();
  // Remonta el panel de la prueba al cambiar el archivo o la hoja (descarta su resultado).
  const [pruebaId, setPruebaId] = useState(0);
  const esNuevoInventario = moduloCodigo === "INV" && !edicion;
  const [hayMuestra, setHayMuestra] = useState(false);
  const [nombreMuestra, setNombreMuestra] = useState("");
  const [asistencia, setAsistencia] = useState<AsistenciaMuestraPatron | null>(null);
  const [asistenciaPendiente, setAsistenciaPendiente] = useState(false);
  const [mapeoEditado, setMapeoEditado] = useState(false);
  const [errorAsistencia, setErrorAsistencia] = useState("");
  // Lectura por ejemplo: el producto armado sobre la grilla sobrevive a cada reprocesamiento.
  const [modeloEjemplo, setModeloEjemplo] = useState<ModeloUsuarioInventario | null>(null);
  const [modeloEditado, setModeloEditado] = useState(false);
  const [constructorAbierto, setConstructorAbierto] = useState(false);
  const secuencia = useRef(0);
  // Tarjeta de aplicativo + muestra: ancla del botón flotante «Ir al aplicativo y muestra».
  const cabeceraRef = useRef<HTMLDivElement>(null);
  const [cabeceraVisible, setCabeceraVisible] = useState(true);
  const reiniciarEjemplo = () => { setModeloEjemplo(null); setModeloEditado(false); setConstructorAbierto(false); };

  const aplicar = (r: AnalisisPatron, esMuestra: boolean) => {
    if (!r.ok || !r.spec) {
      notifyError(r.message ?? "No se pudo analizar el archivo.");
      return;
    }
    setPruebaId((n) => n + 1); // otro archivo u otra hoja: la prueba anterior ya no corresponde
    setAnalisis(r);
    setSpec({ ...r.spec, subtotalesFila: undefined, fechaCorte: undefined, trmCierre: undefined });
    setMuestraLista(esMuestra);
  };

  // Edición: el mapeo se muestra sobre la muestra guardada. Nueva desde un archivo de cliente:
  // se prellena con ese archivo mientras llega la muestra.
  const idEdicion = edicion?.id ?? null;
  useEffect(() => {
    let vivo = true;
    const peticion = ++secuencia.current;
    if (idEdicion != null) {
      startAnalizar(async () => {
        const r = await analizarMuestraDeVersion({ id: idEdicion });
        if (vivo && secuencia.current === peticion) aplicar(r, true);
      });
    } else if (recepcionLoteId) {
      startAnalizar(async () => {
        const r = await analizarOriginalParaPatron({ recepcionLoteId, moduloCodigo });
        if (vivo && secuencia.current === peticion) aplicar(r, false);
      });
    }
    return () => { vivo = false; };
  }, [idEdicion, recepcionLoteId, moduloCodigo]);

  const analizarMuestra = (archivo: File, hoja?: string, opciones?: {
    erp?: number | null; continuar?: boolean; instrucciones?: string; respuestas?: Record<string, string>; modelo?: ModeloUsuarioInventario;
  }) => {
    const peticion = ++secuencia.current;
    const aplicativo = opciones?.erp ?? erpId;
    setAsistenciaPendiente(esNuevoInventario);
    setErrorAsistencia("");
    startAnalizar(async () => {
      try {
        const fd = new FormData();
        fd.set("moduloCodigo", moduloCodigo);
        fd.set("archivo", archivo);
        if (hoja) fd.set("hoja", hoja);
        if (!hoja && analisis && spec && !muestraLista) {
          fd.set("baseSpecJson", JSON.stringify(spec));
          fd.set("baseEncabezadoJson", JSON.stringify(analisis.encabezado ?? []));
        } else if (!hoja && base && !analisis) {
          fd.set("baseSpecJson", base.specJson);
          fd.set("baseEncabezadoJson", base.encabezadoJson);
        }
        if (esNuevoInventario) {
          if (aplicativo == null) { setErrorAsistencia("Elige el aplicativo para reconocer esta muestra."); return; }
          fd.set("erpId", String(aplicativo));
          if (opciones?.continuar && asistencia?.asistenciaJson) fd.set("asistenciaJson", asistencia.asistenciaJson);
          if (opciones?.continuar && mapeoEditado && spec) fd.set("specManualJson", JSON.stringify(spec));
          fd.set("instrucciones", opciones?.instrucciones ?? "");
          fd.set("respuestasJson", JSON.stringify(opciones?.respuestas ?? {}));
          if (opciones?.modelo) fd.set("modeloJson", JSON.stringify(opciones.modelo));
          const r = await asistirMuestraPatronInventario(fd);
          if (secuencia.current !== peticion) return;
          if (!r.ok) { setErrorAsistencia(r.message ?? "No se pudo interpretar la muestra. Puedes reintentar."); return; }
          if (r.analisis) aplicar(r.analisis, true);
          // Mientras el usuario no haya armado nada, el ejemplo muestra lo último que se entendió.
          if (!opciones?.modelo && !modeloEditado) setModeloEjemplo(r.lectura?.modeloSugerido ?? null);
          const lectura = r.lectura;
          if (lectura && (!lectura.spec || lectura.errores.length > 0 || lectura.preguntas.some((p) => p.id.startsWith("ia_")))) setConstructorAbierto(true);
          setAsistencia(r);
          setAsistenciaPendiente(false);
          setMapeoEditado(false);
          return;
        }
        const r = await analizarMuestraPatron(fd);
        if (secuencia.current !== peticion) return;
        aplicar(r, true);
        if (r.ok && r.coincidenciaBase != null) {
          notifySuccess(`El mapeo de partida se trasladó a la muestra (${r.coincidenciaBase} % de coincidencia). Revísalo.`);
        }
      } catch {
        if (secuencia.current !== peticion) return;
        const mensaje = "No pudimos analizar la muestra. Conservamos el archivo seleccionado para que puedas reintentar.";
        setErrorAsistencia(mensaje);
        notifyError(mensaje);
      }
    });
  };

  const onMuestra = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    muestraRef.current = archivo;
    setNombreMuestra(archivo.name);
    setHayMuestra(true);
    setAsistencia(null);
    setMuestraLista(false);
    setMapeoEditado(false);
    reiniciarEjemplo();
    if (esNuevoInventario) { setSpec(null); setAnalisis(null); }
    analizarMuestra(archivo);
  };

  const cambiarAplicativo = (valor: string) => {
    const nuevo = valor ? Number(valor) : null;
    setErpId(nuevo);
    if (!esNuevoInventario) return;
    ++secuencia.current;
    setAsistencia(null);
    setAsistenciaPendiente(true);
    setMapeoEditado(false);
    reiniciarEjemplo();
    setSpec(null);
    setAnalisis(null);
    if (muestraRef.current && nuevo) analizarMuestra(muestraRef.current, undefined, { erp: nuevo });
  };

  const cambiarHoja = (hoja: string) => {
    if (edicion) {
      startAnalizar(async () => aplicar(await analizarMuestraDeVersion({ id: edicion.id, hoja }), true));
      return;
    }
    if (!muestraRef.current) {
      notifyError("Sube la muestra del aplicativo para elegir otra hoja.");
      return;
    }
    setAsistencia(null);
    setMapeoEditado(false);
    reiniciarEjemplo();
    analizarMuestra(muestraRef.current, hoja);
  };

  // La grilla del archivo para armar el ejemplo: se relee del servidor por tramos.
  const cargarVentana = useCallback(async (consulta: ConsultaVentana) => {
    if (!muestraRef.current) return { ok: false as const, message: "Sube la muestra del aplicativo." };
    const fd = new FormData();
    fd.set("moduloCodigo", moduloCodigo);
    fd.set("archivo", muestraRef.current);
    fd.set("hoja", consulta.hoja);
    fd.set("filaDesde", String(consulta.filaDesde));
    if (consulta.spec) fd.set("specJson", JSON.stringify(consulta.spec));
    return ventanaMuestraPatron(fd);
  }, [moduloCodigo]);

  // Un error de guardado: el toast de siempre y, si el mensaje reclama un campo del mapeo (una
  // columna obligatoria, el tipo de formato), el foco va a ese campo. El editor decide si lo es.
  const avisarErrorGuardado = (mensaje: string) => {
    notifyError(mensaje);
    editorRef.current?.enfocarError(mensaje);
  };

  const guardar = (aprobar: boolean) => {
    if (!spec) return;
    if (esNuevoInventario && (analizando || asistenciaPendiente || !asistencia?.lectura?.listoParaBorrador)) {
      notifyError("Revisa la interpretación de la muestra antes de guardar el patrón.");
      return;
    }
    // Cartera y CxP: el tipo de formato decide qué se valida en cada cargue (el servidor también lo exige).
    if (conNivelCartera && !spec.tipoFormato) {
      avisarErrorGuardado(MENSAJE_TIPO_FORMATO_EDITOR);
      return;
    }
    startGuardar(async () => {
      if (edicion) {
        const r = await actualizarVersionPatron({ id: edicion.id, actualizadoEn: edicion.actualizadoEn, specJson: JSON.stringify(spec), nota });
        if (!r.ok) { avisarErrorGuardado(r.message ?? "No se pudo guardar la versión."); return; }
        notifySuccess(r.message ?? "Versión actualizada.");
        router.push(ruta);
        return;
      }
      if (erpId == null) { notifyError("Elige el aplicativo del patrón."); return; }
      if (!muestraRef.current || !muestraLista) { notifyError("Sube el archivo de muestra del aplicativo."); return; }
      const fd = new FormData();
      fd.set("moduloCodigo", moduloCodigo);
      fd.set("erpId", String(erpId));
      fd.set("specJson", JSON.stringify(spec));
      fd.set("archivo", muestraRef.current);
      fd.set("nota", nota);
      if (esNuevoInventario && asistencia?.asistenciaJson) fd.set("asistenciaJson", asistencia.asistenciaJson);
      if (aprobar) fd.set("aprobar", "1");
      const r = await crearVersionPatron(fd);
      if (!r.ok) { avisarErrorGuardado(r.message ?? "No se pudo guardar la versión."); return; }
      notifySuccess(r.message ?? "Versión guardada.");
      router.push(ruta);
    });
  };

  // Con qué archivo se prueba el mapeo: la muestra ya subida manda; si no, la guardada de la
  // versión que se edita o, mientras no haya muestra, el archivo del cliente que lo prellenó.
  // Se resuelve AL PULSAR: el archivo vive en un ref y no se lee durante el render.
  const fuentePrueba = (): FuentePrueba | null => (
    muestraRef.current
      ? { tipo: "muestra", archivo: muestraRef.current }
      : edicion
        ? { tipo: "version", id: edicion.id }
        : recepcionLoteId
          ? { tipo: "original", recepcionLoteId }
          : null
  );

  // Lo que la prueba del mapeo devolvió (error o primer impedimento): igual que al guardar, pero
  // sin toast, porque el panel de la prueba ya lo muestra. Se llama al terminar la prueba, nunca al pintar.
  const enfocarErrorPrueba = (mensaje: string) => {
    editorRef.current?.enfocarError(mensaje);
  };

  useEffect(() => {
    const el = cabeceraRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(([e]) => setCabeceraVisible(e.isIntersecting));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const opcionesErp = useMemo(() => erps.map((e) => ({ value: String(e.id), label: e.nombre })), [erps]);
  const erpNombre = edicion?.erpNombre ?? erps.find((e) => e.id === erpId)?.nombre ?? "";
  const puedeGuardar = spec != null && muestraLista && (edicion != null || erpId != null) && !analizando && !guardando
    && (!esNuevoInventario || (!asistenciaPendiente && asistencia?.lectura?.listoParaBorrador === true));

  return (
    <div className="flex flex-col gap-4">
      <div ref={cabeceraRef} className="scroll-mt-2">
      <Card className="flex flex-col gap-3 p-4 text-[12.5px]">
        <fieldset disabled={analizando || guardando} className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 disabled:opacity-60">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-600">Aplicativo <span className="text-err-600">*</span></span>
            {edicion ? (
              <span className="break-words rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1.5 font-semibold text-ink-700">{edicion.erpNombre} · versión {edicion.version}</span>
            ) : (
              <SelectBuscable
                opciones={opcionesErp}
                value={erpId == null ? "" : String(erpId)}
                onChange={cambiarAplicativo}
                placeholder="Buscar aplicativo…"
                sinResultados="No se encontraron aplicativos."
                ariaLabel="Aplicativo"
                className="min-w-0"
              />
            )}
          </div>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-600">Archivo de muestra {edicion ? "" : <span className="text-err-600">*</span>}</span>
            {edicion ? (
              <span className="break-words rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1.5 text-ink-700">{edicion.muestraNombre}</span>
            ) : (
              <input type="file" accept=".xlsx,.xlsm,.xls,.xlsb,.csv,.txt" onChange={onMuestra} className="min-w-0 max-w-full text-[12px] text-ink-600 file:mr-3 file:rounded-md file:border-0 file:bg-ink-100 file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-ink-700 hover:file:bg-ink-200" />
            )}
            {!edicion && (
              <span className="text-[11px] leading-snug text-ink-400">
                Un archivo del aplicativo con el formato de {moduloLabel.toLowerCase()}. Queda guardado con la versión y lo ven los demás administradores: usa uno sin datos sensibles si es posible.
              </span>
            )}
          </label>
        </fieldset>
        {analizando && (
          <BannerProcesando
            titulo={nombreMuestra ? `Cargando y analizando «${nombreMuestra}»…` : "Cargando y analizando la muestra…"}
            detalle={esNuevoInventario
              ? "Estamos leyendo todas las filas y reconociendo el formato; si hace falta, consultamos la IA. Puede tardar hasta un minuto: no cierres ni recargues la página."
              : "Estamos leyendo las hojas y columnas del archivo. No cierres ni recargues la página."}
          />
        )}
        {analisis?.referencia && !muestraLista && (
          <p className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-[11.5px] leading-relaxed text-blue-800">
            Mapeo prellenado con «{analisis.referencia.nombreArchivo}» de {analisis.referencia.cliente}. Ese archivo no se guarda: sube la muestra
            del aplicativo y el mapeo se trasladará a sus columnas.
          </p>
        )}
        {base && !analisis && (
          <p className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-[11.5px] leading-relaxed text-blue-800">
            Se parte de la versión {base.version}. Sube la muestra del nuevo formato y su mapeo se trasladará a las columnas de la muestra.
          </p>
        )}
        {!edicion && !analisis && !base && !recepcionLoteId && !hayMuestra && (
          <p className="text-[11.5px] text-ink-500">{esNuevoInventario ? "Elige el aplicativo y sube la muestra. Reconoceremos el formato y te mostraremos cómo se lee." : "Sube la muestra para ver sus columnas y configurar cómo se lee."}</p>
        )}
      </Card>
      </div>

      {esNuevoInventario && hayMuestra && (
        <Card className="p-4">
          <AsistenciaMuestraPanel
            key={pruebaId}
            lectura={asistencia?.lectura}
            trabajando={analizando || guardando}
            pendiente={asistenciaPendiente}
            error={errorAsistencia}
            onPendiente={() => setAsistenciaPendiente(true)}
            onRevisar={(instrucciones, respuestas) => {
              if (muestraRef.current) analizarMuestra(muestraRef.current, undefined, { continuar: true, instrucciones, respuestas });
            }}
            onReiniciar={() => {
              setAsistencia(null);
              setMapeoEditado(false);
              reiniciarEjemplo();
              if (muestraRef.current) analizarMuestra(muestraRef.current);
            }}
            onArmarEjemplo={asistencia?.lectura && !constructorAbierto ? () => setConstructorAbierto(true) : undefined}
          />
        </Card>
      )}

      {esNuevoInventario && hayMuestra && asistencia?.lectura && constructorAbierto && (
        <ConstructorLectura
          modelo={modeloEjemplo ?? modeloVacio(asistencia.lectura.resumen.hoja ?? analisis?.hoja ?? "")}
          onModelo={(m) => { setModeloEjemplo(m); setModeloEditado(true); setAsistenciaPendiente(true); }}
          spec={asistencia.lectura.spec}
          filasSugeridas={asistencia.lectura.filasSugeridas}
          trabajando={analizando || guardando}
          cargarVentana={cargarVentana}
          onReprocesar={(m) => { if (muestraRef.current) analizarMuestra(muestraRef.current, undefined, { continuar: true, modelo: m }); }}
        />
      )}

      {analisis && spec && (
        <Card className="p-4 text-[12.5px]">
          <fieldset disabled={analizando || guardando} className="min-w-0 disabled:opacity-60">
          {spec.lecturaEstructurada ? <>
            <ResumenLecturaEstructurada reglas={spec.lecturaEstructurada} />
            <p className="mt-3 text-[11.5px] text-ink-500">Prueba estas reglas con la muestra antes de guardarlas. {esNuevoInventario ? "Para corregir cómo se separan los datos, explica el ajuste en la asistencia de esta pantalla." : "Para cambiar cómo se separan los datos, usa la asistencia de lectura al cargar el inventario; al confirmar se conservará una nueva versión."}</p>
          </> : <details open={!esNuevoInventario}><summary className="mb-3 cursor-pointer font-medium text-ink-600">Ajustes de columnas y filas</summary><EditorMapeoModulo
            ref={editorRef}
            analisis={analisis}
            spec={spec}
            setSpec={(cambio) => {
              setSpec(cambio);
              if (esNuevoInventario) { setMapeoEditado(true); setAsistenciaPendiente(true); }
            }}
            roles={roles}
            clasificadorRol={clasificadorRol}
            rolValor={rolValor}
            confirmarValorSinImpuestos={confirmarValorSinImpuestos}
            conNivelCartera={conNivelCartera}
            modo="patron"
            onCambiarHoja={cambiarHoja}
          /></details>}
          <label className="mt-4 flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-600">Nota (opcional)</span>
            <textarea value={nota} maxLength={2000} rows={3} onChange={(e) => setNota(e.target.value)} placeholder="Versión del ERP, informe del que sale el archivo, particularidades…" className={claseCampo} />
          </label>
          </fieldset>
        </Card>
      )}

      {analisis && spec && (
        <PruebaMapeoPatron
          key={pruebaId}
          moduloCodigo={moduloCodigo}
          clasificadorEtiqueta={roles.find((r) => r.nombre === clasificadorRol)?.etiqueta ?? "grupo"}
          spec={spec}
          fuente={fuentePrueba}
          puedeProbar={muestraLista || edicion != null || recepcionLoteId != null}
          onError={enfocarErrorPrueba}
        />
      )}

      <div className="pointer-events-none sticky bottom-4 z-10 -mb-4 h-0">
        {!cabeceraVisible && (
          <button
            type="button"
            onClick={() => cabeceraRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="pointer-events-auto absolute bottom-0 right-0 inline-flex items-center gap-1.5 rounded-full border border-navy-700 bg-white px-3.5 py-2 text-[12px] font-semibold text-navy-700 shadow-md hover:bg-blue-50"
          >
            <Icon name="chev-d" size={14} className="rotate-180" /> Ir al aplicativo y muestra
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link href={ruta} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-600 hover:bg-ink-50">Volver a patrones</Link>
        <button type="button" disabled={!puedeGuardar} onClick={() => guardar(false)} className="rounded-md border border-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-navy-700 hover:bg-blue-50 disabled:opacity-50">
          {guardando ? "Guardando…" : edicion ? "Guardar cambios" : "Guardar como pendiente"}
        </button>
        {!edicion && (
          <button type="button" disabled={!puedeGuardar} onClick={() => guardar(true)} className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-50">
            {guardando ? "Guardando…" : `Guardar y aprobar${erpNombre ? ` para ${erpNombre}` : ""}`}
          </button>
        )}
      </div>
    </div>
  );
}
