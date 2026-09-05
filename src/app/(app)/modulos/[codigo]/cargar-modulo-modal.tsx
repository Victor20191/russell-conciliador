"use client";

// Modal de carga del motor genérico de módulos (archivo → mapeo de columnas →
// borrador). Vive aparte del listado, igual que `cargar-balance-modal.tsx` en Balance.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Icon } from "@/components/icons";
import { SelectorClienteBuscable } from "@/components/selector-cliente-buscable";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { columnaLetra } from "@/lib/balance/extraccion/hojas-cliente";
import type { SpecModulo } from "@/lib/modulos/extraccion/esquema";
import type { ModoSubtotales } from "@/lib/modulos/subtotales";
import {
  leerDatosModulo,
  analizarArchivoModulo,
  preferenciasCargaModulo,
  ubicarCeldaArchivoModulo,
  type AnalisisModulo,
  type CeldaMuestra,
} from "@/app/actions/modulos-datos";
import { NotasCargaModulo } from "./notas-carga-modulo";

export type ClienteModulo = { id: number; name: string; nit: string; erp?: string | null };

/**
 * Adición declarada a un cargue existente. Cuando viene, el modal fija cliente y período
 * (el archivo se suma a ESE cargue, no a otro) y solo pide el archivo y su mapeo.
 */
export type AnexoModulo = { encabezadoId: number; clienteId: number; clienteNombre: string; periodo: string };
export type RolModulo = { nombre: string; etiqueta: string; tipo: string; requerido: boolean };

const celdaTxt = (v: CeldaMuestra): string => (v == null ? "" : typeof v === "number" ? String(v) : v);
const formatoNumeroMarca = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 6 });
const celdaTxtVisible = (v: CeldaMuestra): string => (
  typeof v === "number" ? formatoNumeroMarca.format(v) : celdaTxt(v)
);
const sinCoordenadaDeArchivo = (valor: SpecModulo): SpecModulo => ({
  ...valor,
  subtotalesFila: undefined,
});

/**
 * Botón «Agregar archivo» de la columna Acciones: abre el MISMO modal en modo adición.
 * Existe porque anexar o versionar es una decisión del usuario, no algo que el sistema
 * deba inferir de los datos — inferirlo comparando llaves (clasificador, referencia) fue
 * la causa de que un módulo llegara a duplicarse.
 */
export function AgregarArchivoButton(props: {
  moduloCodigo: string;
  moduloLabel: string;
  roles: RolModulo[];
  clasificadorRol: string;
  clientes: ClienteModulo[];
  anexo: AnexoModulo;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title={`Agregar otro archivo al cargue de ${props.anexo.periodo} (no crea versión nueva)`}
        aria-label={`Agregar archivo al cargue de ${props.anexo.periodo}`}
        className={props.className}
      >
        <Icon name="plus" size={15} />
      </button>
      {abierto && <CargarModal {...props} onClose={() => setAbierto(false)} />}
    </>
  );
}

/** Botón «Cargar <módulo>» + su modal. */
export function CargarModuloButton(props: {
  moduloCodigo: string;
  moduloLabel: string;
  roles: RolModulo[];
  clasificadorRol: string;
  clientes: ClienteModulo[];
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-md bg-navy-700 px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600"
      >
        Cargar {props.moduloLabel.toLowerCase()}
      </button>
      {abierto && <CargarModal {...props} onClose={() => setAbierto(false)} />}
    </>
  );
}

function CargarModal({
  moduloCodigo,
  moduloLabel,
  roles,
  clasificadorRol,
  clientes,
  anexo,
  onClose,
}: {
  moduloCodigo: string;
  moduloLabel: string;
  roles: RolModulo[];
  clasificadorRol: string;
  clientes: ClienteModulo[];
  anexo?: AnexoModulo;
  onClose: () => void;
}) {
  const router = useRouter();
  // El archivo se conserva como File sin leer ni descomprimir en el navegador.
  // ExcelJS puede bloquear el hilo principal incluso con XLSX pequeños pero muy
  // comprimibles; la inspección completa pertenece al Server Action.
  const archivoRef = useRef<File | null>(null);
  const [tieneArchivo, setTieneArchivo] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [clienteId, setClienteId] = useState<number | null>(anexo?.clienteId ?? null);
  // El ERP ya forma parte del maestro del cliente: se conserva como metadato sin
  // volver a pedírselo al usuario. La ubicación y el reflejo contable se documentan
  // progresivamente en la Bitácora, donde siguen siendo editables.
  const softwareOrigen = clienteId == null
    ? ""
    : clientes.find((cliente) => cliente.id === clienteId)?.erp ?? "";
  const [fase, setFase] = useState<"archivo" | "mapeo">("archivo");
  const [analisis, setAnalisis] = useState<AnalisisModulo | null>(null);
  const [recepcionLoteId, setRecepcionLoteId] = useState<string | null>(null);
  const [spec, setSpec] = useState<SpecModulo | null>(null);
  const [mes, setMes] = useState(anexo?.periodo ?? "");
  const [analizando, startAnalizar] = useTransition();
  const [leyendo, startLeer] = useTransition();
  const [ubicandoCelda, startUbicarCelda] = useTransition();
  // La fila solo sirve para resolver una coordenada de ESTE archivo (p. ej. M1347).
  // El perfil conserva columna+contenido, nunca la fila, porque cambia en cada cargue.
  const [filaMarcaTotales, setFilaMarcaTotales] = useState("");
  const [direccionMarcaTotales, setDireccionMarcaTotales] = useState<string | null>(null);
  const [valorMarcaTotalesVisible, setValorMarcaTotalesVisible] = useState<CeldaMuestra>(null);
  const [marcaManualLista, setMarcaManualLista] = useState(false);
  const solicitudCeldaRef = useRef(0);
  // Preferencias de carga del cliente en este módulo (Configuración › Perfiles de
  // carga). Las notas se muestran aquí; la hoja preferida la resuelve el servidor
  // durante el análisis, cuando ya conoce las hojas reales del libro.
  type PrefsCarga = { hojaPreferida: string | null; observaciones: string | null };
  const [prefs, setPrefs] = useState<PrefsCarga | null>(null);
  const solicitudPrefsRef = useRef(0);

  const elegirCliente = (id: number | null) => {
    if (id !== clienteId) {
      solicitudCeldaRef.current += 1;
      setAnalisis(null);
      setSpec(null);
      setRecepcionLoteId(null);
      setFilaMarcaTotales("");
      setDireccionMarcaTotales(null);
      setValorMarcaTotalesVisible(null);
      setMarcaManualLista(false);
      setFase("archivo");
    }
    setClienteId(id);
    setPrefs(null);
    const solicitud = ++solicitudPrefsRef.current;
    if (id == null) return;
    preferenciasCargaModulo(id, moduloCodigo)
      .then((r) => {
        if (solicitud !== solicitudPrefsRef.current) return; // llegó tarde: el cliente cambió
        const p: PrefsCarga | null = r.ok ? { hojaPreferida: r.hojaPreferida, observaciones: r.observaciones } : null;
        setPrefs(p);
      })
      .catch(() => { /* las preferencias son informativas; el análisis puede continuar */ });
  };

  const onArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setTieneArchivo(false);
    setAnalisis(null);
    setSpec(null);
    setRecepcionLoteId(null);
    solicitudCeldaRef.current += 1;
    setFilaMarcaTotales("");
    setDireccionMarcaTotales(null);
    setValorMarcaTotalesVisible(null);
    setMarcaManualLista(false);
    setFase("archivo");
    archivoRef.current = f;
    setNombreArchivo(f.name);
    setTieneArchivo(true);
  };

  const analizar = (hojaArg?: string) => {
    if (!archivoRef.current) { notifyError("Adjunta el archivo."); return; }
    if (clienteId == null) { notifyError("Selecciona el cliente."); return; }
    const hojaElegida = hojaArg ?? "";
    startAnalizar(async () => {
      const fd = new FormData();
      fd.set("moduloCodigo", moduloCodigo);
      fd.set("clienteId", String(clienteId));
      if (hojaElegida) fd.set("hoja", hojaElegida);
      if (recepcionLoteId) fd.set("recepcionLoteId", recepcionLoteId);
      fd.set("softwareOrigen", softwareOrigen);
      fd.set("archivo", archivoRef.current!);
      try {
        const r = await analizarArchivoModulo(fd);
        if (r.recepcionLoteId) setRecepcionLoteId(r.recepcionLoteId);
        if (r.ok && r.spec) {
          setAnalisis(r);
          // El perfil recuerda el formato, no una coordenada de un archivo anterior.
          // Incluso si llegara un perfil legado contaminado, este cargue debe ubicarla otra vez.
          setSpec(sinCoordenadaDeArchivo(r.spec));
          solicitudCeldaRef.current += 1;
          setFilaMarcaTotales("");
          setDireccionMarcaTotales(null);
          setValorMarcaTotalesVisible(null);
          setMarcaManualLista(false);
          setFase("mapeo");
          if (r.origen === "perfil") notifySuccess("Se aplicó el perfil guardado de este cliente. Revisa y confirma.");
        } else {
          notifyError(r.message ?? "No se pudo analizar el archivo.");
        }
      } catch {
        notifyError("No se pudo enviar el archivo al servidor. Verifica la conexión e intenta nuevamente.");
      }
    });
  };

  const leer = () => {
    if (!archivoRef.current || !spec) { notifyError("Falta analizar el archivo."); return; }
    if (clienteId == null) { notifyError("Selecciona el cliente."); return; }
    if (!/^\d{4}-\d{2}$/.test(mes)) { notifyError("Selecciona el período del archivo."); return; }
    const faltantes = roles.filter((rc) => rc.requerido && !(rc.nombre === clasificadorRol && modo === "global") && (spec.columnas[rc.nombre] ?? 0) < 1);
    if (faltantes.length) { notifyError("Faltan columnas obligatorias: " + faltantes.map((f) => f.etiqueta).join(", ") + "."); return; }
    const filaManual = Number(filaMarcaTotales);
    if (
      spec.subtotales === "manual"
      && (
        (spec.subtotalesColumna ?? 0) < 1
        || !marcaManualLista
        || !Number.isInteger(filaManual)
        || spec.subtotalesFila !== filaManual
      )
    ) {
      notifyError("Selecciona la columna, escribe la fila y ubica la celda que marca el total.");
      return;
    }
    startLeer(async () => {
      const fd = new FormData();
      fd.set("moduloCodigo", moduloCodigo);
      fd.set("clienteId", String(clienteId));
      fd.set("hoja", spec.hoja);
      fd.set("specJson", JSON.stringify(spec));
      fd.set("periodoInicio", mes ? `${mes}-01` : "");
      fd.set("periodoFin", mes ? `${mes}-01` : "");
      fd.set("softwareOrigen", softwareOrigen);
      if (recepcionLoteId) fd.set("recepcionLoteId", recepcionLoteId);
      if (anexo) fd.set("anexoEncabezadoId", String(anexo.encabezadoId));
      fd.set("archivo", archivoRef.current!);
      try {
        const r = await leerDatosModulo(undefined, fd);
        if (r.ok && r.loteId) {
          notifySuccess("Borrador guardado", "El archivo quedó guardado como borrador. Revisa y confirma la carga para finalizar.");
          router.push(`/modulos/${moduloCodigo.toLowerCase()}/borradores/${r.loteId}`);
        } else {
          notifyError(r.message ?? "No se pudo leer el archivo.");
        }
      } catch {
        notifyError("No se pudo completar la carga. Verifica la conexión e intenta nuevamente.");
      }
    });
  };

  const setCol = (rol: string, col: number) => setSpec((s) => (s ? { ...s, columnas: { ...s.columnas, [rol]: col } } : s));
  const setEnc = (v: number) => setSpec((s) => (s ? { ...s, filaEncabezado: v } : s));
  const setDat = (v: number) => setSpec((s) => (s ? { ...s, primeraFilaDatos: v } : s));
  const modo: "columna" | "arrastrar" | "seccion" | "global" = spec?.clasificadorModo ?? (spec?.arrastrarClasificador ? "arrastrar" : "columna");
  const setModo = (m: "columna" | "arrastrar" | "seccion" | "global") =>
    setSpec((s) => (s ? { ...s, clasificadorModo: m, arrastrarClasificador: m === "arrastrar" ? true : undefined, seccionColumnaVaciaRol: m === "seccion" ? s.seccionColumnaVaciaRol ?? "descripcion" : undefined } : s));
  // Selección del clasificador: -1 = un solo valor global; ≥1 = columna.
  const onSelectClasificador = (v: number) => {
    if (v === -1) { setModo("global"); return; }
    setCol(clasificadorRol, v);
    if (modo === "global") setModo("columna");
  };
  const setSeccionRol = (rol: string) => setSpec((s) => (s ? { ...s, seccionColumnaVaciaRol: rol } : s));
  // Subtotales del archivo: cómo detectarlos (se excluyen del consolidado y se usan de control).
  const modoSubtotales: ModoSubtotales = spec?.subtotales ?? "auto";
  const setModoSubtotales = (m: ModoSubtotales) => {
    solicitudCeldaRef.current += 1;
    setFilaMarcaTotales("");
    setDireccionMarcaTotales(null);
    setValorMarcaTotalesVisible(null);
    setMarcaManualLista(false);
    setSpec((s) =>
      s
        ? {
            ...s,
            subtotales: m === "auto" ? undefined : m,
            // La columna marcadora solo existe en el modo manual; al salir se retira para
            // no dejar basura en el perfil que se guarda por huella.
            subtotalesColumna: m === "manual" ? (s.subtotalesColumna ?? 0) : undefined,
            subtotalesTexto: m === "manual" ? s.subtotalesTexto : undefined,
            subtotalesFila: undefined,
          }
        : s,
    );
  };
  const setColumnaMarcaTotales = (columna: number) => {
    solicitudCeldaRef.current += 1;
    setFilaMarcaTotales("");
    setDireccionMarcaTotales(null);
    setValorMarcaTotalesVisible(null);
    setMarcaManualLista(false);
    setSpec((s) => (s ? {
      ...s,
      subtotalesColumna: columna || undefined,
      subtotalesFila: undefined,
      subtotalesTexto: undefined,
    } : s));
  };
  const cambiarFilaMarcaTotales = (fila: string) => {
    solicitudCeldaRef.current += 1;
    setFilaMarcaTotales(fila);
    setDireccionMarcaTotales(null);
    setValorMarcaTotalesVisible(null);
    setMarcaManualLista(false);
    // Una coordenada modificada todavía no está validada. Retirar el texto evita que
    // «Leer» use accidentalmente el marcador anterior o el comodín «cualquier valor».
    setSpec((s) => (s ? { ...s, subtotalesFila: undefined, subtotalesTexto: undefined } : s));
  };
  const ubicarMarcaTotales = () => {
    const columna = spec?.subtotalesColumna ?? 0;
    const fila = Number(filaMarcaTotales);
    if (columna < 1) { notifyError("Selecciona la columna donde está el dato."); return; }
    if (!Number.isInteger(fila) || fila < 1) { notifyError("Escribe un número de fila válido."); return; }
    if (!analisis?.hoja || !recepcionLoteId || clienteId == null) {
      notifyError("No se puede ubicar la celda sin volver a analizar el archivo.");
      return;
    }
    const solicitud = ++solicitudCeldaRef.current;
    startUbicarCelda(async () => {
      try {
        const resultado = await ubicarCeldaArchivoModulo({
          moduloCodigo,
          clienteId,
          recepcionLoteId,
          hoja: analisis.hoja!,
          columna,
          fila,
        });
        if (solicitud !== solicitudCeldaRef.current) return;
        if (!resultado.ok || resultado.valor == null || !resultado.direccion) {
          notifyError(resultado.message ?? "No se pudo ubicar la celda.");
          return;
        }
        const texto = celdaTxt(resultado.valor);
        setSpec((s) => (s ? {
          ...s,
          subtotalesColumna: columna,
          subtotalesFila: fila,
          subtotalesTexto: texto,
        } : s));
        setDireccionMarcaTotales(resultado.direccion);
        setValorMarcaTotalesVisible(resultado.valor);
        setMarcaManualLista(true);
      } catch {
        if (solicitud === solicitudCeldaRef.current) notifyError("No se pudo ubicar la celda. Verifica la conexión e intenta nuevamente.");
      }
    });
  };

  // Etiqueta de cada columna para los selectores: «C · Encabezado».
  const opcionesColumna = (): { index1: number; label: string }[] => {
    if (!analisis) return [];
    const ancho = analisis.ancho ?? analisis.encabezado?.length ?? 0;
    return Array.from({ length: ancho }, (_, c) => {
      const enc = celdaTxt(analisis.encabezado?.[c] ?? null);
      return { index1: c + 1, label: `${columnaLetra(c)}${enc ? ` · ${enc.slice(0, 28)}` : ""}` };
    });
  };

  const preview = (rol: string): string[] => {
    if (!analisis || !spec) return [];
    const col = spec.columnas[rol] ?? 0;
    if (col < 1) return [];
    return (analisis.muestraFilas ?? []).slice(0, 6).map((f) => celdaTxt(f[col - 1] ?? null));
  };
  // ¿La columna del clasificador viene mayormente vacía? (señal de agrupación → arrastrar).
  const clasifEsparso = (() => {
    if (!analisis || !spec) return false;
    const col = spec.columnas[clasificadorRol] ?? 0;
    if (col < 1) return false;
    const vals = (analisis.muestraFilas ?? []).map((f) => celdaTxt(f[col - 1] ?? null));
    if (vals.length < 3) return false;
    const vacias = vals.filter((v) => !v).length;
    return vacias / vals.length >= 0.3;
  })();
  const clasificadorEtiqueta = roles.find((rol) => rol.nombre === clasificadorRol)?.etiqueta ?? "clasificador";
  // Modo manual de subtotales: columna marcadora elegida en el archivo.
  const colSubtotales = spec?.subtotalesColumna ?? 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={anexo ? `Agregar archivo · ${moduloLabel.toLowerCase()} ${anexo.periodo}` : `Cargar ${moduloLabel.toLowerCase()}`}
      size={fase === "mapeo" ? "2xl" : "lg"}
      footer={
        fase === "archivo" ? (
          <>
            <button type="button" onClick={onClose} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-600 hover:bg-ink-50">Cancelar</button>
            <button type="button" disabled={!tieneArchivo || clienteId == null || analizando} onClick={() => analizar()} className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60">
              {analizando ? "Analizando…" : "Analizar columnas"}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setFase("archivo")} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-600 hover:bg-ink-50">Atrás</button>
            <button type="button" disabled={leyendo || analizando || !mes} onClick={leer} title={!mes ? "Selecciona el período del archivo" : undefined} className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60">
              {leyendo ? "Leyendo…" : "Leer y crear borrador"}
            </button>
          </>
        )
      }
    >
      {fase === "archivo" ? (
        <div className="flex flex-col gap-3.5 text-[12.5px]">
          {anexo ? (
            <div className="rounded-md border border-navy-600 bg-blue-50 px-3 py-2 text-[11.5px] leading-relaxed text-navy-800">
              <span className="font-semibold">Este archivo se AGREGARÁ al cargue existente.</span>
              <span className="ml-1">
                {anexo.clienteNombre} · período {anexo.periodo}. No se crea una versión nueva y el detalle actual se conserva;
                el archivo se suma. Cliente y período quedan fijos.
              </span>
            </div>
          ) : (
            <SelectorClienteBuscable
              clients={clientes}
              value={clienteId}
              onChange={elegirCliente}
            />
          )}

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-600">Archivo (Excel/CSV)</span>
            <input type="file" accept=".xlsx,.xlsm,.xls,.csv,.txt" onChange={onArchivo} className="text-[12px] text-ink-600 file:mr-3 file:rounded-md file:border-0 file:bg-ink-100 file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-ink-700 hover:file:bg-ink-200" />
            {tieneArchivo && <span className="text-[11px] text-ok-700">Listo: {nombreArchivo}</span>}
          </label>

          {prefs?.observaciones && <NotasCargaModulo notas={prefs.observaciones} />}
        </div>
      ) : (
        <div className="flex flex-col gap-4 text-[12.5px]">
          {prefs?.observaciones && <NotasCargaModulo notas={prefs.observaciones} />}
          {analisis?.origen === "perfil" && (
            <p className="rounded-md border border-ok-500 bg-ok-100/40 px-3 py-1.5 text-[11.5px] text-ok-700">Perfil guardado aplicado. Ajusta si hace falta.</p>
          )}
          {/* La reutilización de una parametrización ya conocida es un mecanismo INTERNO:
              se aplica sola cuando el layout coincide. No se le pregunta nada al usuario
              ni se le nombra de qué cliente salió; solo se le pide que la revise. */}
          {analisis?.origen === "sugerido" && (
            <p className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-[11.5px] text-blue-800">
              Mapeo prellenado a partir de un layout ya conocido — revísalo y ajusta si hace falta.
            </p>
          )}
          {analisis?.advertenciaValor && (
            <p className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-[11.5px] font-medium leading-relaxed text-warn-700">
              {analisis.advertenciaValor}
            </p>
          )}

          {(analisis?.hojas?.length ?? 0) > 1 && (
            <label className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="shrink-0 text-[11px] font-medium text-ink-600">Hoja</span>
              <select value={spec?.hoja ?? ""} onChange={(e) => analizar(e.target.value)} className="min-w-0 max-w-full rounded-md border border-ink-200 bg-white px-2 py-1.5 text-ink-700 outline-none focus:border-blue-400">
                {analisis?.hojas?.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <span className="shrink-0 text-[11px] text-ink-400">{analisis?.totalFilas} filas</span>
            </label>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Fila de encabezado</span>
              <input type="number" min={1} value={spec?.filaEncabezado ?? 1} onChange={(e) => setEnc(Math.max(1, Number(e.target.value) || 1))} className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 tabular-nums text-ink-700 outline-none focus:border-blue-400" />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Primera fila de datos</span>
              <input type="number" min={1} value={spec?.primeraFilaDatos ?? 2} onChange={(e) => setDat(Math.max(1, Number(e.target.value) || 1))} className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 tabular-nums text-ink-700 outline-none focus:border-blue-400" />
            </label>
          </div>

          <div className="overflow-hidden rounded-md border border-ink-150">
            <div className="border-b border-ink-100 bg-ink-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Mapeo de columnas</div>
            <div className="flex flex-col divide-y divide-ink-100">
              {roles.map((rc) => {
                const muestras = preview(rc.nombre);
                const muestraTxt = muestras.filter(Boolean).slice(0, 2).join(" · ") || "—";
                return (
                  <div key={rc.nombre} className="flex flex-col gap-1.5 px-3 py-2.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="text-[12px] font-medium leading-snug text-ink-700">
                        {rc.etiqueta}
                        {rc.requerido && <span className="text-err-700"> *</span>}
                      </span>
                      {rc.nombre === clasificadorRol && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-blue-700">
                          clasifica
                        </span>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                      <select
                        value={rc.nombre === clasificadorRol && modo === "global" ? -1 : spec?.columnas[rc.nombre] ?? 0}
                        onChange={(e) => (rc.nombre === clasificadorRol ? onSelectClasificador(Number(e.target.value)) : setCol(rc.nombre, Number(e.target.value)))}
                        className="w-full min-w-0 flex-1 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] text-ink-700 outline-none focus:border-blue-400"
                      >
                        <option value={0}>— sin mapear —</option>
                        {rc.nombre === clasificadorRol && <option value={-1}>🌐 Un único clasificador para todo el archivo</option>}
                        {opcionesColumna().map((o) => (
                          <option key={o.index1} value={o.index1}>{o.label}</option>
                        ))}
                      </select>
                      <span
                        className="min-w-0 truncate text-[11px] leading-snug text-ink-400 sm:w-36 sm:shrink-0"
                        title={muestras.join(" · ")}
                      >
                        {muestraTxt}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-md border border-ink-150 bg-ink-50 px-3 py-2.5">
            {modo === "global" ? (
              <span className="text-[11.5px] leading-snug text-ink-600">🌐 <b>Clasificador global</b>: todo el archivo se carga bajo un único valor de {clasificadorEtiqueta.toLowerCase()}. En el consolidado le asignas una cuenta.</span>
            ) : (
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] font-medium text-ink-600">¿Cómo viene el {roles.find((r) => r.nombre === clasificadorRol)?.etiqueta.toLowerCase() ?? "tipo"}?</span>
                <select value={modo} onChange={(e) => setModo(e.target.value as typeof modo)} className="w-full min-w-0 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] text-ink-700 outline-none focus:border-blue-400">
                  <option value="columna">En su propia columna, en cada fila</option>
                  <option value="arrastrar">Agrupado en su columna (una vez por bloque; se arrastra){clasifEsparso ? " · recomendado" : ""}</option>
                  <option value="seccion">En renglones de sección (encabezados de grupo) intercalados con los ítems</option>
                </select>
              </label>
            )}
            {modo === "seccion" && (
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] font-medium text-ink-600">El renglón de sección se reconoce porque está vacía la columna:</span>
                <select value={spec?.seccionColumnaVaciaRol ?? "descripcion"} onChange={(e) => setSeccionRol(e.target.value)} className="w-full min-w-0 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] text-ink-700 outline-none focus:border-blue-400">
                  {roles.filter((r) => r.nombre !== clasificadorRol).map((r) => <option key={r.nombre} value={r.nombre}>{r.etiqueta}</option>)}
                </select>
                <span className="text-[11px] leading-snug text-ink-500">El tipo va en la misma columna que otro campo (p. ej. el código): mapea ese campo a la misma columna del tipo. Si el archivo trae negrita, también se detecta por negrita.</span>
                {(() => {
                  const rolSenal = spec?.seccionColumnaVaciaRol ?? "descripcion";
                  const colSenal = spec?.columnas[rolSenal] ?? 0;
                  const colTipo = spec?.columnas[clasificadorRol] ?? 0;
                  if (colSenal < 1)
                    return <span className="text-[11px] font-semibold leading-snug text-err-700">⚠ Esa columna está «sin mapear»: mapéala arriba, o elige otra que esté vacía en los renglones de sección. Si no, no se detectaría ninguna sección.</span>;
                  if (colSenal === colTipo)
                    return <span className="text-[11px] font-semibold leading-snug text-err-700">⚠ Esa es la MISMA columna del tipo (nunca está vacía): elige otra —normalmente la Descripción— que sí venga vacía en los renglones de sección.</span>;
                  return null;
                })()}
              </label>
            )}
            <label className="flex min-w-0 flex-col gap-1 border-t border-ink-150 pt-2">
              <span className="text-[11px] font-medium text-ink-600">¿El archivo trae filas de TOTAL (al pie, o por {roles.find((r) => r.nombre === clasificadorRol)?.etiqueta.toLowerCase() ?? "tipo"})?</span>
              <select value={modoSubtotales} onChange={(e) => setModoSubtotales(e.target.value as ModoSubtotales)} className="w-full min-w-0 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] text-ink-700 outline-none focus:border-blue-400">
                <option value="auto">Detectarlas automáticamente (rótulo «Total», cuadro de cierre al pie, o suma del bloque + fila sin detalle / en negrita)</option>
                <option value="rotulo">Solo las que digan «Total» / «Subtotal»</option>
                <option value="nunca">No trae totales: no detectar ninguna</option>
                <option value="manual">Indicarlas yo: señalo la celda del archivo que las marca</option>
              </select>
              <span className="text-[11px] leading-snug text-ink-500">Las filas de total NO se cargan: el borrador las compara con la suma de los movimientos y avisa si no cuadran. El perfil recuerda el modo y la columna; la fila exacta se ubica de nuevo en cada archivo.</span>
            </label>
            {modoSubtotales === "manual" && (
              <div className="flex flex-col gap-2 rounded-md border border-ink-200 bg-white px-3 py-2.5">
                <span className="text-[11px] font-medium text-ink-600">Celda que marca la fila de total <span className="text-err-600">*</span></span>
                <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end">
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-[10.5px] text-ink-500">Columna del dato</span>
                    <select
                      value={colSubtotales}
                      onChange={(e) => setColumnaMarcaTotales(Number(e.target.value))}
                      className="w-full min-w-0 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] text-ink-700 outline-none focus:border-blue-400"
                    >
                      <option value={0}>— elige —</option>
                      {opcionesColumna().map((opcion) => (
                        <option key={opcion.index1} value={opcion.index1}>{opcion.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-[10.5px] text-ink-500">Número de fila</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={filaMarcaTotales}
                      onChange={(e) => cambiarFilaMarcaTotales(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          ubicarMarcaTotales();
                        }
                      }}
                      placeholder="1347"
                      className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 tabular-nums text-[12px] text-ink-700 outline-none focus:border-blue-400"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={ubicarMarcaTotales}
                    disabled={ubicandoCelda || colSubtotales < 1 || !filaMarcaTotales}
                    className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-[12px] font-semibold text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {ubicandoCelda ? "Ubicando…" : "Ubicar celda"}
                  </button>
                </div>
                <span className="text-[11px] leading-snug text-ink-500">
                  Selecciona la columna y escribe la fila. La plataforma leerá la coordenada exacta —por ejemplo, columna M + fila 1347 = M1347— y usará su contenido para reconocer el total.
                </span>
                {!marcaManualLista ? (
                  <span className="text-[11px] font-semibold leading-snug text-err-700">⚠ Ubica una celda con contenido antes de crear el borrador.</span>
                ) : (
                  <span className="rounded-md border border-ok-500 bg-ok-100/40 px-2.5 py-1.5 text-[11px] font-medium leading-snug text-ok-700">
                    {direccionMarcaTotales} ubicada: «{celdaTxtVisible(valorMarcaTotalesVisible)}».
                  </span>
                )}
              </div>
            )}
          </div>

          <label className="flex w-full max-w-xs flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-600">Período de {moduloLabel.toLowerCase()} <span className="text-err-600">*</span></span>
            {anexo ? (
              <span className="w-full rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1.5 font-semibold text-ink-700" title="Fijo: el archivo se agrega a este período">
                {anexo.periodo}
              </span>
            ) : (
              <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-ink-700 outline-none focus:border-blue-400" />
            )}
          </label>
        </div>
      )}
    </Modal>
  );
}
