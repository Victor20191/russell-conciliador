"use client";

// Modal de carga del motor genérico de módulos. El analista confirma de qué APLICATIVO es el
// archivo (o elige otro, o «Archivo manual») y el período; el servidor compara el archivo con los
// patrones de ese aplicativo:
//  - coincide ≥ 80 %: confirmación breve (solo datos del cargue) y borrador, sin mapear columnas;
//  - no coincide: la carga se detiene hasta que un administrador cree el patrón;
//  - «Archivo manual»: mapeo de columnas a mano, memorizado por cliente.

import { useEffect, useRef, useState, useTransition, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { unstable_isUnrecognizedActionError, useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Icon } from "@/components/icons";
import { SelectorClienteBuscable } from "@/components/selector-cliente-buscable";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import type { SpecModulo } from "@/lib/modulos/extraccion/esquema";
import { finDePeriodo } from "@/lib/modulos/cartera/fecha-corte";
import { letraColumnaModulo } from "@/lib/modulos/perfil-modulo";
import { INFO_TIPO_FORMATO, tipoFormatoCartera } from "@/lib/modulos/cartera/tipo-formato";
import {
  leerDatosModulo,
  analizarArchivoModulo,
  preferenciasCargaModulo,
  ubicarCeldaArchivoModulo,
  type AnalisisModulo,
} from "@/app/actions/modulos-datos";
import type { CeldaMuestra } from "@/lib/modulos/extraccion/vista-analisis";
import {
  confirmarAplicativoCargaModulo,
  listarAplicativosCargaModulo,
  type AplicativoOpcion,
} from "@/app/actions/aplicativos-cliente";
import { NotasCargaModulo } from "./notas-carga-modulo";
import { CamposCargueCartera, EditorMapeoModulo, celdaTxt, opcionesColumnaAnalisis, type RolModulo } from "./editor-mapeo-modulo";

export type { RolModulo };
export type ClienteModulo = { id: number; name: string; nit: string };

/**
 * Adición declarada a un cargue existente. Cuando viene, el modal fija cliente y período
 * (el archivo se suma a ESE cargue, no a otro) y solo pide el aplicativo y el archivo.
 */
export type AnexoModulo = { encabezadoId: number; clienteId: number; clienteNombre: string; periodo: string };

type PropsCarga = {
  moduloCodigo: string;
  moduloLabel: string;
  roles: RolModulo[];
  clasificadorRol: string;
  conNivelCartera: boolean;
  clientes: ClienteModulo[];
  /** Muestra «Crear patrón» cuando un archivo no coincide (Administrador). */
  puedeAdministrarPatrones: boolean;
  /** Con patrón, pide confirmar la columna del clasificador en cada cargue (Inventarios). */
  confirmarClasificador: boolean;
  /**
   * Con patrón, pregunta en cada cargue si el archivo trae el valor total (Inventarios); con
   * «Sí» propone la columna del rol de valor. null = no se pregunta.
   */
  confirmarTotal: { rolValor: string } | null;
};

type ModoClasificador = NonNullable<SpecModulo["clasificadorModo"]>;
type ClasificadorPatron = { columna: number; modo: ModoClasificador };
const modoClasificadorSpec = (s: SpecModulo): ModoClasificador => s.clasificadorModo ?? (s.arrastrarClasificador ? "arrastrar" : "columna");
/** Valor del selector para «un único valor para todo el archivo» (el servidor lo lee igual). */
const CLASIFICADOR_GLOBAL = -1;

/**
 * Confirmación del clasificador en una carga con patrón (Inventarios: «Tipo de inventario»).
 * Viene con lo que dice el patrón; lo que el analista cambie vale solo para este cargue.
 */
function ConfirmarClasificadorCarga({
  analisis,
  spec,
  setSpec,
  clasificadorRol,
  etiqueta,
  patron,
  confirmado,
  onConfirmar,
}: {
  analisis: AnalisisModulo;
  spec: SpecModulo;
  setSpec: Dispatch<SetStateAction<SpecModulo | null>>;
  clasificadorRol: string;
  etiqueta: string;
  patron: ClasificadorPatron;
  confirmado: boolean;
  onConfirmar: (valor: boolean) => void;
}) {
  const modo = modoClasificadorSpec(spec);
  const columna = spec.columnas[clasificadorRol] ?? 0;
  const letra = (c: number) => letraColumnaModulo(c + (analisis.columnaInicial ?? 0));
  const describir = ({ columna: c, modo: m }: ClasificadorPatron) =>
    m === "global"
      ? "un único valor para todo el archivo"
      : `la columna ${c > 0 ? letra(c) : "sin definir"}${m === "arrastrar" ? " (agrupado, se arrastra)" : m === "seccion" ? " (renglones de sección)" : ""}`;
  const cambiado = modo !== patron.modo || (modo !== "global" && columna !== patron.columna);
  const valores = modo === "global" || columna < 1
    ? []
    : [...new Set((analisis.muestraFilas ?? []).map((f) => celdaTxt(f[columna - 1] ?? null).trim()).filter(Boolean))];
  const elegirColumna = (valor: number) => {
    onConfirmar(true);
    setSpec((s) => {
      if (!s) return s;
      if (valor === CLASIFICADOR_GLOBAL) return { ...s, clasificadorModo: "global", arrastrarClasificador: undefined };
      const actual = modoClasificadorSpec(s);
      const modoNuevo = actual !== "global" ? actual : patron.modo !== "global" ? patron.modo : "columna";
      return { ...s, columnas: { ...s.columnas, [clasificadorRol]: valor }, clasificadorModo: modoNuevo, arrastrarClasificador: undefined };
    });
  };
  const elegirModo = (valor: ModoClasificador) => {
    onConfirmar(true);
    setSpec((s) => (s ? { ...s, clasificadorModo: valor, arrastrarClasificador: undefined } : s));
  };
  const usarDelPatron = () => {
    onConfirmar(true);
    setSpec((s) => (s ? {
      ...s,
      columnas: { ...s.columnas, [clasificadorRol]: patron.columna },
      clasificadorModo: patron.modo,
      arrastrarClasificador: undefined,
    } : s));
  };
  const campo = "w-full min-w-0 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] text-ink-700 outline-none focus:border-blue-400";
  const nombre = etiqueta.toLowerCase();

  return (
    <div className="flex flex-col gap-2 rounded-md border border-blue-300 bg-blue-50/40 px-3 py-2.5">
      <span className="text-[11px] font-medium text-ink-600">
        {etiqueta} <span className="text-err-600">*</span> · el patrón lo lee en {describir(patron)}
      </span>
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
        <select
          aria-label={`Columna de ${nombre}`}
          value={modo === "global" ? CLASIFICADOR_GLOBAL : columna}
          onChange={(e) => elegirColumna(Number(e.target.value))}
          className={campo}
        >
          {modo !== "global" && columna < 1 && <option value={0}>— elige la columna —</option>}
          <option value={CLASIFICADOR_GLOBAL}>🌐 Un único {nombre} para todo el archivo</option>
          {opcionesColumnaAnalisis(analisis).map((o) => <option key={o.index1} value={o.index1}>{o.label}</option>)}
        </select>
        {modo !== "global" && (
          <select
            aria-label={`Cómo viene el ${nombre}`}
            value={modo}
            onChange={(e) => elegirModo(e.target.value as ModoClasificador)}
            className={campo}
          >
            <option value="columna">Con valor en cada fila</option>
            <option value="arrastrar">Agrupado: una vez por bloque (se arrastra)</option>
            {patron.modo === "seccion" && <option value="seccion">En renglones de sección</option>}
          </select>
        )}
      </div>
      {valores.length > 0 && (
        <span className="min-w-0 break-words text-[11px] leading-snug text-ink-500">
          En las primeras filas: {valores.slice(0, 5).join(" · ")}{valores.length > 5 ? " …" : ""}
        </span>
      )}
      {modo !== "global" && modo !== "seccion" && columna >= 1 && valores.length === 0 && (
        <span className="text-[11px] font-medium leading-snug text-warn-700">Esa columna viene vacía en las primeras filas de datos.</span>
      )}
      <label className="flex items-start gap-2 text-[12px] text-ink-700">
        <input type="checkbox" checked={confirmado} onChange={(e) => onConfirmar(e.target.checked)} className="mt-0.5" />
        <span>Confirmo el {nombre} de este archivo.</span>
      </label>
      <span className="text-[11px] leading-snug text-ink-500">
        {cambiado ? (
          <>
            Cambiado solo para este cargue: el patrón del aplicativo no se modifica.{" "}
            <button type="button" onClick={usarDelPatron} className="font-semibold text-blue-700 hover:underline">Usar el del patrón</button>
          </>
        ) : (
          "Si lo cambias, el cambio vale solo para este cargue: el patrón del aplicativo no se modifica."
        )}
      </span>
    </div>
  );
}

const formatoNumeroMarca = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 6 });
const celdaTxtVisible = (v: CeldaMuestra): string => (
  typeof v === "number" ? formatoNumeroMarca.format(v) : celdaTxt(v)
);
const sinCoordenadaDeArchivo = (valor: SpecModulo): SpecModulo => ({ ...valor, subtotalesFila: undefined });

/** «NIT / cédula C · Saldo Q · rangos de vencimiento L–P (5)», con letras de Excel. */
function resumenMapeo(spec: SpecModulo, roles: RolModulo[], clasificadorRol: string, columnaInicial: number): string {
  const letra = (columna: number) => letraColumnaModulo(columna + columnaInicial);
  const partes = roles.flatMap((rol) => {
    if (rol.nombre === clasificadorRol && spec.clasificadorModo === "global") return [`${rol.etiqueta} global`];
    const columna = spec.columnas[rol.nombre] ?? 0;
    return columna > 0 ? [`${rol.etiqueta} ${letra(columna)}`] : [];
  });
  const edades = spec.familias?.edades ?? [];
  if (edades.length > 0) {
    const rango = edades.length === 1 ? letra(edades[0].columna) : `${letra(edades[0].columna)}–${letra(edades[edades.length - 1].columna)}`;
    partes.push(`rangos de vencimiento ${rango} (${edades.length})`);
  }
  return partes.join(" · ");
}

/**
 * Botón «Agregar archivo» de la columna Acciones: abre el MISMO modal en modo adición.
 * Existe porque anexar o versionar es una decisión del usuario, no algo que el sistema
 * deba inferir de los datos — inferirlo comparando llaves (clasificador, referencia) fue
 * la causa de que un módulo llegara a duplicarse.
 */
export function AgregarArchivoButton(props: PropsCarga & { anexo: AnexoModulo; className?: string }) {
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
export function CargarModuloButton(props: PropsCarga) {
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

type Fase = "archivo" | "patron" | "sin_patron" | "mapeo";
type AplicativosCliente = { campoNombre: string; delCliente: AplicativoOpcion[]; catalogo: AplicativoOpcion[] };
type PrefsCarga = { hojaPreferida: string | null; observaciones: string | null };
/** Elección del aplicativo: el id de uno del cliente, u «otro» (del catálogo o nuevo). */
const OTRO = "otro";
const NUEVO = "nuevo";

function CargarModal({
  moduloCodigo,
  moduloLabel,
  roles,
  conNivelCartera,
  clasificadorRol,
  clientes,
  puedeAdministrarPatrones,
  confirmarClasificador,
  confirmarTotal,
  anexo,
  onClose,
}: PropsCarga & { anexo?: AnexoModulo; onClose: () => void }) {
  const router = useRouter();
  // El archivo se conserva como File sin leer ni descomprimir en el navegador.
  // ExcelJS puede bloquear el hilo principal incluso con XLSX pequeños pero muy
  // comprimibles; la inspección completa pertenece al Server Action.
  const archivoRef = useRef<File | null>(null);
  const [tieneArchivo, setTieneArchivo] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [clienteId, setClienteId] = useState<number | null>(anexo?.clienteId ?? null);
  const [fase, setFase] = useState<Fase>("archivo");
  const [analisis, setAnalisis] = useState<AnalisisModulo | null>(null);
  const [recepcionLoteId, setRecepcionLoteId] = useState<string | null>(null);
  const [spec, setSpec] = useState<SpecModulo | null>(null);
  const [mes, setMes] = useState(anexo?.periodo ?? "");
  const [analizando, startAnalizar] = useTransition();
  const [leyendo, startLeer] = useTransition();
  const [ubicandoCelda, startUbicarCelda] = useTransition();
  // Aplicativo del archivo: el analista lo confirma entre los del cliente o elige otro.
  const [aplicativos, setAplicativos] = useState<AplicativosCliente | null>(null);
  const [eleccion, setEleccion] = useState("");
  const [otroElegido, setOtroElegido] = useState("");
  const [nombreNuevo, setNombreNuevo] = useState("");
  // La fila solo sirve para resolver una coordenada de ESTE archivo (p. ej. M1347).
  const [filaMarcaTotales, setFilaMarcaTotales] = useState("");
  const [direccionMarcaTotales, setDireccionMarcaTotales] = useState<string | null>(null);
  const [valorMarcaTotalesVisible, setValorMarcaTotalesVisible] = useState<CeldaMuestra>(null);
  const [marcaManualLista, setMarcaManualLista] = useState(false);
  const solicitudCeldaRef = useRef(0);
  // Clasificador que trae el patrón y la confirmación del analista (solo para este cargue).
  const [clasificadorPatron, setClasificadorPatron] = useState<ClasificadorPatron | null>(null);
  const [clasificadorConfirmado, setClasificadorConfirmado] = useState(false);
  // «¿El archivo trae el valor total?» (solo este cargue): sin respuesta hasta que el analista elija.
  const [totalArchivo, setTotalArchivo] = useState<"si" | "no" | null>(null);
  const etiquetaClasificador = roles.find((rol) => rol.nombre === clasificadorRol)?.etiqueta ?? "Clasificador";
  // Preferencias de carga del cliente (Configuración › Perfiles de carga): se muestran las notas.
  const [prefs, setPrefs] = useState<PrefsCarga | null>(null);
  const solicitudClienteRef = useRef(0);

  const reiniciarMarcaTotales = () => {
    solicitudCeldaRef.current += 1;
    setFilaMarcaTotales("");
    setDireccionMarcaTotales(null);
    setValorMarcaTotalesVisible(null);
    setMarcaManualLista(false);
  };
  const reiniciarAnalisis = () => {
    reiniciarMarcaTotales();
    setAnalisis(null);
    setSpec(null);
    setRecepcionLoteId(null);
    setClasificadorPatron(null);
    setClasificadorConfirmado(false);
    setTotalArchivo(null);
    setFase("archivo");
  };

  /** Consulta notas y aplicativos del cliente; solo actualiza el estado cuando responden. */
  const pedirDatosCliente = (id: number) => {
    const solicitud = ++solicitudClienteRef.current;
    preferenciasCargaModulo(id, moduloCodigo)
      .then((r) => {
        if (solicitud === solicitudClienteRef.current && r.ok) setPrefs({ hojaPreferida: r.hojaPreferida, observaciones: r.observaciones });
      })
      .catch(() => { /* las preferencias son informativas */ });
    listarAplicativosCargaModulo(id, moduloCodigo)
      .then((r) => {
        if (solicitud !== solicitudClienteRef.current) return;
        if (!r.ok) { notifyError(r.message ?? "No se pudieron consultar los aplicativos del cliente."); return; }
        setAplicativos({ campoNombre: r.campoNombre ?? "", delCliente: r.delCliente, catalogo: r.catalogo });
        // Sin aplicativos registrados no hay nada que confirmar: se elige directamente.
        if (r.delCliente.length === 0) setEleccion(OTRO);
      })
      .catch((e) => {
        // Pestaña abierta con un build anterior al del servidor: la acción ya no existe con ese ID.
        if (unstable_isUnrecognizedActionError(e)) { notifyError("La plataforma se actualizó. Recarga la página (Ctrl+Shift+R) e intenta de nuevo."); return; }
        console.error("listarAplicativosCargaModulo", e);
        notifyError("No se pudieron consultar los aplicativos del cliente.");
      });
  };
  const cargarDatosCliente = (id: number) => {
    setPrefs(null);
    setAplicativos(null);
    setEleccion("");
    setOtroElegido("");
    setNombreNuevo("");
    pedirDatosCliente(id);
  };

  // En «Agregar archivo» el cliente viene fijo: sus datos se piden al abrir.
  const clienteAnexo = anexo?.clienteId ?? null;
  useEffect(() => {
    if (clienteAnexo != null) pedirDatosCliente(clienteAnexo);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir el modal
  }, [clienteAnexo]);

  const elegirCliente = (id: number | null) => {
    if (id !== clienteId) reiniciarAnalisis();
    setClienteId(id);
    if (id == null) {
      solicitudClienteRef.current += 1;
      setPrefs(null);
      setAplicativos(null);
      return;
    }
    cargarDatosCliente(id);
  };

  const onArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    reiniciarAnalisis();
    archivoRef.current = f;
    setNombreArchivo(f.name);
    setTieneArchivo(true);
  };

  const cambiarEleccion = (valor: string) => {
    reiniciarAnalisis();
    setEleccion(valor);
  };

  const eleccionLista = eleccion !== "" && (eleccion !== OTRO || (otroElegido !== "" && (otroElegido !== NUEVO || nombreNuevo.trim().length >= 2)));
  const periodoListo = anexo != null || /^\d{4}-\d{2}$/.test(mes);

  /** El aplicativo elegido; si no estaba en la ficha del cliente, se agrega (o se crea) primero. */
  const resolverAplicativo = async (): Promise<AplicativoOpcion | null> => {
    if (!aplicativos || clienteId == null) return null;
    if (eleccion !== OTRO) return aplicativos.delCliente.find((a) => String(a.id) === eleccion) ?? null;
    const entrada = otroElegido === NUEVO ? { erpNuevo: nombreNuevo.trim() } : { erpId: Number(otroElegido) };
    const r = await confirmarAplicativoCargaModulo({ clienteId, moduloCodigo, ...entrada });
    if (!r.ok || !r.aplicativo) {
      notifyError(r.message ?? "No se pudo registrar el aplicativo del archivo.");
      return null;
    }
    const nuevo = r.aplicativo;
    if (r.agregado) notifySuccess(`${nuevo.nombre} se agregó a los aplicativos de ${aplicativos.campoNombre} del cliente.`);
    setAplicativos((a) => a && {
      ...a,
      delCliente: a.delCliente.some((x) => x.id === nuevo.id) ? a.delCliente : [...a.delCliente, nuevo],
      catalogo: a.catalogo.some((x) => x.id === nuevo.id) ? a.catalogo : [...a.catalogo, nuevo],
    });
    setEleccion(String(nuevo.id));
    setOtroElegido("");
    setNombreNuevo("");
    return nuevo;
  };

  const analizar = (hojaArg?: string) => {
    if (!archivoRef.current) { notifyError("Adjunta el archivo."); return; }
    if (clienteId == null) { notifyError("Selecciona el cliente."); return; }
    if (!periodoListo) { notifyError("Selecciona el período del archivo."); return; }
    if (!eleccionLista) { notifyError("Confirma de qué aplicativo es el archivo."); return; }
    startAnalizar(async () => {
      try {
        const aplicativo = await resolverAplicativo();
        if (!aplicativo) return;
        const fd = new FormData();
        fd.set("moduloCodigo", moduloCodigo);
        fd.set("clienteId", String(clienteId));
        fd.set("erpId", String(aplicativo.id));
        if (hojaArg) fd.set("hoja", hojaArg);
        if (recepcionLoteId) fd.set("recepcionLoteId", recepcionLoteId);
        fd.set("softwareOrigen", aplicativo.nombre);
        fd.set("archivo", archivoRef.current!);
        const r = await analizarArchivoModulo(fd);
        if (r.recepcionLoteId) setRecepcionLoteId(r.recepcionLoteId);
        if (!r.ok) {
          notifyError(r.message ?? "No se pudo analizar el archivo.");
          return;
        }
        reiniciarMarcaTotales();
        setAnalisis(r);
        if (r.modo === "sin_patron" || !r.spec) {
          setSpec(null);
          setFase("sin_patron");
          return;
        }
        // Ni el perfil ni el patrón traen la fila del total: se ubica de nuevo en cada archivo.
        setSpec(sinCoordenadaDeArchivo(r.spec));
        // Cada análisis (también al cambiar de hoja) vuelve a pedir la confirmación del clasificador.
        setClasificadorPatron({ columna: r.spec.columnas[clasificadorRol] ?? 0, modo: modoClasificadorSpec(r.spec) });
        setClasificadorConfirmado(false);
        setTotalArchivo(null);
        setFase(r.modo === "patron" ? "patron" : "mapeo");
        if (r.origen === "perfil") notifySuccess("Se aplicó el perfil guardado de este cliente. Revisa y confirma.");
      } catch {
        notifyError("No se pudo enviar el archivo al servidor. Verifica la conexión e intenta nuevamente.");
      }
    });
  };

  const leer = () => {
    const aplicativo = analisis?.aplicativo;
    if (!archivoRef.current || !spec || !analisis || !aplicativo) { notifyError("Falta analizar el archivo."); return; }
    if (clienteId == null) { notifyError("Selecciona el cliente."); return; }
    if (!/^\d{4}-\d{2}$/.test(mes)) { notifyError("Selecciona el período del archivo."); return; }
    const porPatron = analisis.modo === "patron" && analisis.coincidencia != null;
    const pedirClasificador = porPatron && confirmarClasificador;
    const modoClasificadorCargue = modoClasificadorSpec(spec);
    if (pedirClasificador) {
      if (modoClasificadorCargue !== "global" && (spec.columnas[clasificadorRol] ?? 0) < 1) {
        notifyError(`Elige la columna de ${etiquetaClasificador.toLowerCase()} de este archivo.`);
        return;
      }
      if (!clasificadorConfirmado) {
        notifyError(`Confirma el ${etiquetaClasificador.toLowerCase()} de este archivo.`);
        return;
      }
    }
    if (!porPatron) {
      const modoClasificador = spec.clasificadorModo ?? (spec.arrastrarClasificador ? "arrastrar" : "columna");
      const faltantes = roles.filter((rc) => rc.requerido && !(rc.nombre === clasificadorRol && modoClasificador === "global") && (spec.columnas[rc.nombre] ?? 0) < 1);
      if (faltantes.length) { notifyError("Faltan columnas obligatorias: " + faltantes.map((f) => f.etiqueta).join(", ") + "."); return; }
    }
    if (conNivelCartera && spec.monedaArchivo && spec.monedaArchivo !== "COP" && !(spec.trmCierre && spec.trmCierre > 0)) {
      notifyError(`Indica la TRM de cierre: los importes están en ${spec.monedaArchivo}.`);
      return;
    }
    const filaManual = Number(filaMarcaTotales);
    const celdaTotalLista = (spec.subtotalesColumna ?? 0) >= 1 && marcaManualLista && Number.isInteger(filaManual) && spec.subtotalesFila === filaManual;
    const pedirTotal = porPatron && confirmarTotal != null;
    if (pedirTotal) {
      if (totalArchivo == null) { notifyError("Indica si el archivo trae el valor total."); return; }
      if (totalArchivo === "si" && !celdaTotalLista) { notifyError("Ubica la celda del valor total: columna y fila."); return; }
    } else if (spec.subtotales === "manual" && !celdaTotalLista) {
      notifyError("Escribe la fila y ubica la celda que marca el total.");
      return;
    }
    startLeer(async () => {
      const fd = new FormData();
      fd.set("moduloCodigo", moduloCodigo);
      fd.set("clienteId", String(clienteId));
      fd.set("erpId", String(aplicativo.id));
      fd.set("hoja", spec.hoja);
      if (porPatron) {
        // Con patrón el mapeo lo arma el servidor: solo viajan los datos de ESTE cargue.
        fd.set("patronVersionId", String(analisis.coincidencia!.versionId));
        fd.set("fechaCorte", spec.fechaCorte ?? (finDePeriodo(mes) ?? ""));
        if (spec.trmCierre) fd.set("trmCierre", String(spec.trmCierre));
        if (pedirTotal) {
          fd.set("totalArchivo", totalArchivo!);
          if (totalArchivo === "si") {
            fd.set("subtotalesColumna", String(spec.subtotalesColumna));
            fd.set("subtotalesFila", String(spec.subtotalesFila));
          }
        } else if (spec.subtotalesFila) fd.set("subtotalesFila", String(spec.subtotalesFila));
        if (pedirClasificador) {
          fd.set("clasificadorColumna", String(modoClasificadorCargue === "global" ? CLASIFICADOR_GLOBAL : spec.columnas[clasificadorRol] ?? 0));
          fd.set("clasificadorModo", modoClasificadorCargue);
        }
      } else {
        fd.set("specJson", JSON.stringify(spec));
      }
      fd.set("periodoInicio", `${mes}-01`);
      fd.set("periodoFin", `${mes}-01`);
      fd.set("softwareOrigen", aplicativo.nombre);
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

  const cambiarFilaMarcaTotales = (fila: string) => {
    solicitudCeldaRef.current += 1;
    setFilaMarcaTotales(fila);
    setDireccionMarcaTotales(null);
    setValorMarcaTotalesVisible(null);
    setMarcaManualLista(false);
    // Una coordenada modificada todavía no está validada: sin texto, «Leer» no usa el anterior.
    setSpec((s) => (s ? { ...s, subtotalesFila: undefined, subtotalesTexto: analisis?.modo === "patron" ? s.subtotalesTexto : undefined } : s));
  };
  /** «¿El archivo trae el valor total?»: con Sí propone la columna; con No no queda coordenada. */
  const responderTotal = (respuesta: "si" | "no") => {
    reiniciarMarcaTotales();
    setTotalArchivo(respuesta);
    setSpec((s) => {
      if (!s) return s;
      if (respuesta === "no") return { ...s, subtotalesFila: undefined };
      // La columna que el patrón ya usaba para marcar el total; si no, la del valor.
      const propuesta = s.subtotales === "manual" && (s.subtotalesColumna ?? 0) >= 1
        ? s.subtotalesColumna
        : (s.columnas[confirmarTotal?.rolValor ?? ""] ?? 0) || undefined;
      return { ...s, subtotalesColumna: propuesta, subtotalesFila: undefined };
    });
  };
  const cambiarColumnaTotal = (columna: number) => {
    reiniciarMarcaTotales();
    setSpec((s) => (s ? { ...s, subtotalesColumna: columna >= 1 ? columna : undefined, subtotalesFila: undefined } : s));
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
          columnaInicial: analisis.columnaInicial ?? 0,
          fila,
        });
        if (solicitud !== solicitudCeldaRef.current) return;
        if (!resultado.ok || resultado.valor == null || !resultado.direccion) {
          notifyError(resultado.message ?? "No se pudo ubicar la celda.");
          return;
        }
        const texto = celdaTxt(resultado.valor);
        // Con patrón el texto del marcador es del formato: la celda solo confirma la fila.
        setSpec((s) => (s ? {
          ...s,
          subtotalesColumna: columna,
          subtotalesFila: fila,
          subtotalesTexto: analisis.modo === "patron" ? s.subtotalesTexto : texto,
        } : s));
        setDireccionMarcaTotales(resultado.direccion);
        setValorMarcaTotalesVisible(resultado.valor);
        setMarcaManualLista(true);
      } catch {
        if (solicitud === solicitudCeldaRef.current) notifyError("No se pudo ubicar la celda. Verifica la conexión e intenta nuevamente.");
      }
    });
  };

  const colSubtotales = spec?.subtotalesColumna ?? 0;
  const marcaTotalesCarga = (
    <div className="flex flex-col gap-2">
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[10rem_auto] sm:items-end">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[10.5px] text-ink-500">Número de fila del total en este archivo</span>
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
          className="justify-self-start rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-[12px] font-semibold text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {ubicandoCelda ? "Ubicando…" : "Ubicar celda"}
        </button>
      </div>
      <span className="text-[11px] leading-snug text-ink-500">
        La plataforma lee la coordenada exacta —por ejemplo, columna M + fila 1347 = M1347— y la usa para reconocer el total.
      </span>
      {!marcaManualLista ? (
        <span className="text-[11px] font-semibold leading-snug text-err-700">⚠ Ubica una celda con contenido antes de crear el borrador.</span>
      ) : (
        <span className="rounded-md border border-ok-500 bg-ok-100/40 px-2.5 py-1.5 text-[11px] font-medium leading-snug text-ok-700">
          {direccionMarcaTotales} ubicada: «{celdaTxtVisible(valorMarcaTotalesVisible)}».
        </span>
      )}
    </div>
  );

  const fechaCorteSugerida = mes ? finDePeriodo(mes) ?? "" : "";
  const botonSecundario = "rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-600 hover:bg-ink-50";
  const botonPrimario = "rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60";
  const aplicativoAnalizado = analisis?.aplicativo;
  const rutaPatrones = `/modulos/${moduloCodigo.toLowerCase()}/patrones`;

  const footer = fase === "archivo" ? (
    <>
      <button type="button" onClick={onClose} className={botonSecundario}>Cancelar</button>
      <button
        type="button"
        disabled={!tieneArchivo || clienteId == null || !eleccionLista || !periodoListo || analizando}
        onClick={() => analizar()}
        className={botonPrimario}
      >
        {analizando ? "Analizando…" : "Analizar archivo"}
      </button>
    </>
  ) : fase === "sin_patron" ? (
    <button type="button" onClick={() => setFase("archivo")} className={botonSecundario}>Atrás</button>
  ) : (
    <>
      <button type="button" onClick={() => setFase("archivo")} className={botonSecundario}>Atrás</button>
      <button type="button" disabled={leyendo || analizando} onClick={leer} className={botonPrimario}>
        {leyendo ? "Leyendo…" : fase === "patron" ? "Crear borrador" : "Leer y crear borrador"}
      </button>
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={anexo ? `Agregar archivo · ${moduloLabel.toLowerCase()} ${anexo.periodo}` : `Cargar ${moduloLabel.toLowerCase()}`}
      size={fase === "mapeo" ? "2xl" : "lg"}
      footer={footer}
    >
      {fase === "archivo" && (
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
            <SelectorClienteBuscable clients={clientes} value={clienteId} onChange={elegirCliente} />
          )}

          {clienteId != null && (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-[11px] font-medium text-ink-600">
                ¿De qué aplicativo es este archivo? <span className="text-err-600">*</span>
              </legend>
              {aplicativos == null ? (
                <span className="text-[11px] text-ink-400">Consultando los aplicativos del cliente…</span>
              ) : (
                <>
                  {aplicativos.delCliente.length === 0 ? (
                    <p className="rounded-md border border-warn-500 bg-warn-100/30 px-2.5 py-1.5 text-[11px] leading-snug text-warn-700">
                      El cliente no tiene aplicativo de {aplicativos.campoNombre.toLowerCase()} registrado. El que elijas se agregará a su ficha.
                    </p>
                  ) : (
                    <p className="text-[11px] text-ink-400">Aplicativos de {aplicativos.campoNombre.toLowerCase()} registrados para el cliente. Confirma el de este archivo.</p>
                  )}
                  {aplicativos.delCliente.map((a) => (
                    <label key={a.id} className="flex items-center gap-2 text-[12.5px] text-ink-700">
                      <input type="radio" name="aplicativo-archivo" checked={eleccion === String(a.id)} onChange={() => cambiarEleccion(String(a.id))} />
                      {a.nombre}{a.manual ? <span className="text-[11px] text-ink-400">(se mapea a mano)</span> : null}
                    </label>
                  ))}
                  {aplicativos.delCliente.length > 0 && (
                    <label className="flex items-center gap-2 text-[12.5px] text-ink-700">
                      <input type="radio" name="aplicativo-archivo" checked={eleccion === OTRO} onChange={() => cambiarEleccion(OTRO)} />
                      Otro aplicativo…
                    </label>
                  )}
                  {eleccion === OTRO && (
                    <div className="flex flex-col gap-1.5 sm:ml-6">
                      <select
                        value={otroElegido}
                        onChange={(e) => { reiniciarAnalisis(); setOtroElegido(e.target.value); }}
                        className="w-full min-w-0 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] text-ink-700 outline-none focus:border-blue-400"
                      >
                        <option value="">— elige el aplicativo —</option>
                        {aplicativos.catalogo
                          .filter((a) => !a.manual && !aplicativos.delCliente.some((d) => d.id === a.id))
                          .map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                        <option value={NUEVO}>Otro (escribir el nombre)…</option>
                        {aplicativos.catalogo
                          .filter((a) => a.manual && !aplicativos.delCliente.some((d) => d.id === a.id))
                          .map((a) => <option key={a.id} value={a.id}>{a.nombre} (se mapea a mano)</option>)}
                      </select>
                      {otroElegido === NUEVO && (
                        <input
                          type="text"
                          value={nombreNuevo}
                          maxLength={80}
                          onChange={(e) => setNombreNuevo(e.target.value)}
                          placeholder="Nombre del aplicativo"
                          className="w-full min-w-0 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] text-ink-700 outline-none focus:border-blue-400"
                        />
                      )}
                    </div>
                  )}
                </>
              )}
            </fieldset>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-600">Archivo (Excel/CSV)</span>
            <span className="text-[11px] text-ink-500">Selecciónalo con el botón o arrástralo y suéltalo sobre este campo.</span>
            <input type="file" accept=".xlsx,.xlsm,.xls,.xlsb,.csv,.txt" onChange={onArchivo} className="text-[12px] text-ink-600 file:mr-3 file:rounded-md file:border-0 file:bg-ink-100 file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-ink-700 hover:file:bg-ink-200" />
            {tieneArchivo && <span className="text-[11px] text-ok-700">Listo: {nombreArchivo}</span>}
          </label>

          {!anexo && (
            <label className="flex w-full max-w-xs flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Período de {moduloLabel.toLowerCase()} <span className="text-err-600">*</span></span>
              <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-ink-700 outline-none focus:border-blue-400" />
            </label>
          )}

          {prefs?.observaciones && <NotasCargaModulo notas={prefs.observaciones} />}
        </div>
      )}

      {fase === "sin_patron" && analisis && (
        <div className="flex flex-col gap-3 text-[12.5px]">
          <div className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2.5 text-[12px] leading-relaxed text-warn-700">
            <p className="font-semibold">
              Este archivo no coincide con ningún patrón de {aplicativoAnalizado?.nombre ?? "este aplicativo"} para {moduloLabel.toLowerCase()}.
            </p>
            {analisis.sinPatron?.mejor ? (
              <p className="mt-1">
                La mejor coincidencia fue la versión {analisis.sinPatron.mejor.version} con {analisis.sinPatron.mejor.porcentaje} % (hoja «{analisis.sinPatron.mejor.hoja}»). Se necesita 80 % o más
                {analisis.sinPatron.mejor.faltantesRequeridos.length > 0 ? " y todas las columnas obligatorias" : ""}.
              </p>
            ) : (
              <p className="mt-1">
                {(analisis.sinPatron?.totalVersiones ?? 0) === 0
                  ? `Todavía no hay patrones de ${aplicativoAnalizado?.nombre ?? "este aplicativo"} para este módulo.`
                  : "Ninguna versión del patrón se parece a este archivo."}
              </p>
            )}
            {(analisis.sinPatron?.mejor?.faltantesRequeridos.length ?? 0) > 0 && (
              <p className="mt-1">Columnas obligatorias que no aparecen: {analisis.sinPatron!.mejor!.faltantesRequeridos.join(", ")}.</p>
            )}
            {(analisis.sinPatron?.mejor?.faltantes.length ?? 0) > 0 && (
              <p className="mt-1">Rótulos del patrón que no están en el archivo: {analisis.sinPatron!.mejor!.faltantes.join(", ")}.</p>
            )}
            <p className="mt-1.5">
              Un administrador debe crear el patrón para este formato; después vuelve a cargar el archivo. No se creó ningún borrador
              y el original quedó conservado.
            </p>
          </div>
          {analisis.advertenciaValor && (
            <p className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-[11.5px] font-medium leading-relaxed text-warn-700">{analisis.advertenciaValor}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Link href={rutaPatrones} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-50">
              Ver patrones de archivo
            </Link>
            {puedeAdministrarPatrones && aplicativoAnalizado && (
              <Link
                href={`${rutaPatrones}/nueva?erp=${aplicativoAnalizado.id}${recepcionLoteId ? `&recepcion=${recepcionLoteId}` : ""}`}
                className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600"
              >
                Crear patrón
              </Link>
            )}
          </div>
        </div>
      )}

      {fase === "patron" && analisis?.coincidencia && spec && (
        <div className="flex flex-col gap-3 text-[12.5px]">
          {prefs?.observaciones && <NotasCargaModulo notas={prefs.observaciones} />}
          <div className="rounded-md border border-ok-500 bg-ok-100/40 px-3 py-2.5 text-ok-700">
            <p className="text-[12.5px] font-semibold">
              Patrón {aplicativoAnalizado?.nombre} · versión {analisis.coincidencia.version} · {analisis.coincidencia.porcentaje} % de coincidencia
            </p>
            <p className="mt-0.5 text-[11.5px] leading-snug">
              El archivo se leerá con este patrón, sin configurar columnas.
              {analisis.coincidencia.estado === "pendiente" ? " Es una versión pendiente de aprobación: por ahora solo sirve para este cliente." : ""}
            </p>
          </div>
          {analisis.coincidencia.advertencias.length > 0 && (
            <ul className="list-disc rounded-md border border-warn-500 bg-warn-100/30 py-2 pl-7 pr-3 text-[11.5px] leading-relaxed text-warn-700">
              {analisis.coincidencia.advertencias.map((a) => <li key={a}>{a}</li>)}
            </ul>
          )}
          {analisis.advertenciaHojas && (
            <p className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-[11.5px] leading-relaxed text-warn-700">{analisis.advertenciaHojas}</p>
          )}
          {(analisis.hojas?.length ?? 0) > 1 && (
            <label className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="shrink-0 text-[11px] font-medium text-ink-600">Hoja</span>
              <select value={spec.hoja} onChange={(e) => analizar(e.target.value)} className="min-w-0 max-w-full rounded-md border border-ink-200 bg-white px-2 py-1.5 text-ink-700 outline-none focus:border-blue-400">
                {analisis.hojas?.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
          )}
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-md border border-ink-150 bg-ink-50 px-3 py-2 text-[11.5px] text-ink-600 sm:grid-cols-[auto_1fr]">
            <dt className="font-medium text-ink-700">Hoja</dt>
            <dd>«{spec.hoja}» · encabezado en la fila {spec.filaEncabezado} · datos desde la fila {spec.primeraFilaDatos} · {analisis.totalFilas} filas</dd>
            <dt className="font-medium text-ink-700">Columnas</dt>
            <dd>{resumenMapeo(spec, roles, clasificadorRol, analisis.columnaInicial ?? 0) || "—"}</dd>
            {conNivelCartera && (() => {
              const { tipo, declarado } = tipoFormatoCartera(spec);
              return (
                <>
                  <dt className="font-medium text-ink-700">Formato</dt>
                  <dd>
                    {INFO_TIPO_FORMATO[tipo].etiqueta}
                    {declarado ? "" : " (deducido: el patrón no lo declara)"} · se validará{" "}
                    {INFO_TIPO_FORMATO[tipo].controles.join(" y ").toLowerCase()}
                  </dd>
                </>
              );
            })()}
          </dl>
          {analisis.periodosDetectados && analisis.periodosDetectados.length > 0 && (
            <p className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-[11.5px] leading-relaxed text-blue-800">
              <b>Períodos en el archivo:</b>{" "}
              {analisis.periodosDetectados.map((p) => `${p.periodo} (${p.filas.toLocaleString("es-CO")} filas)`).join(" · ")}.
              {analisis.periodosDetectados.length > 1 && ` Solo entran las filas de ${mes}.`}
            </p>
          )}
          {confirmarClasificador && clasificadorPatron && (
            <ConfirmarClasificadorCarga
              analisis={analisis}
              spec={spec}
              setSpec={setSpec}
              clasificadorRol={clasificadorRol}
              etiqueta={etiquetaClasificador}
              patron={clasificadorPatron}
              confirmado={clasificadorConfirmado}
              onConfirmar={setClasificadorConfirmado}
            />
          )}
          {conNivelCartera && <CamposCargueCartera spec={spec} setSpec={setSpec} fechaCorteSugerida={fechaCorteSugerida} />}
          {confirmarTotal ? (
            <div className="flex flex-col gap-2 rounded-md border border-blue-300 bg-blue-50/40 px-3 py-2.5">
              <span className="text-[11px] font-medium text-ink-600">
                ¿El archivo trae el valor total? <span className="text-err-600">*</span>
              </span>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-700" role="radiogroup" aria-label="¿El archivo trae el valor total?">
                <label className="inline-flex items-center gap-1.5">
                  <input type="radio" name="total-archivo" checked={totalArchivo === "si"} onChange={() => responderTotal("si")} />
                  Sí, confirmo su ubicación
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input type="radio" name="total-archivo" checked={totalArchivo === "no"} onChange={() => responderTotal("no")} />
                  No trae total
                </label>
              </div>
              {totalArchivo === "si" && (
                <>
                  <label className="flex min-w-0 flex-col gap-1 sm:max-w-xs">
                    <span className="text-[10.5px] text-ink-500">Columna del valor total</span>
                    <select
                      aria-label="Columna del valor total"
                      value={colSubtotales}
                      onChange={(e) => cambiarColumnaTotal(Number(e.target.value))}
                      className="w-full min-w-0 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] text-ink-700 outline-none focus:border-blue-400"
                    >
                      {colSubtotales < 1 && <option value={0}>— elige la columna —</option>}
                      {opcionesColumnaAnalisis(analisis).map((o) => <option key={o.index1} value={o.index1}>{o.label}</option>)}
                    </select>
                  </label>
                  {marcaTotalesCarga}
                </>
              )}
              {totalArchivo === "no" && (
                <span className="text-[11px] leading-snug text-ink-500">
                  El borrador no tendrá control del total del archivo.
                  {spec.subtotales !== "nunca" && " Las filas rotuladas «Total» o «Subtotal» igual se excluyen del detalle."}
                </span>
              )}
              <span className="text-[11px] leading-snug text-ink-500">Vale solo para este cargue: el patrón del aplicativo no se modifica.</span>
            </div>
          ) : spec.subtotales === "manual" && (
            <div className="flex flex-col gap-2 rounded-md border border-ink-200 bg-white px-3 py-2.5">
              <span className="text-[11px] font-medium text-ink-600">
                Fila del total <span className="text-err-600">*</span> · el patrón lo marca en la columna {letraColumnaModulo(colSubtotales + (analisis.columnaInicial ?? 0))}
                {spec.subtotalesTexto ? ` con «${spec.subtotalesTexto}»` : ""}
              </span>
              {marcaTotalesCarga}
            </div>
          )}
        </div>
      )}

      {fase === "mapeo" && analisis && spec && (
        <div className="flex flex-col gap-3 text-[12.5px]">
          {prefs?.observaciones && <NotasCargaModulo notas={prefs.observaciones} />}
          <p className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-[11.5px] text-blue-800">
            Archivo manual: indica qué es cada columna. El mapeo se recuerda para los próximos archivos manuales de este cliente.
            {analisis.origen === "perfil" ? " Se aplicó el mapeo guardado; ajústalo si hace falta." : ""}
          </p>
          <EditorMapeoModulo
            analisis={analisis}
            spec={spec}
            setSpec={setSpec}
            roles={roles}
            clasificadorRol={clasificadorRol}
            conNivelCartera={conNivelCartera}
            modo="carga"
            onCambiarHoja={(hoja) => analizar(hoja)}
            fechaCorteSugerida={fechaCorteSugerida}
            onCambioMarcaTotales={reiniciarMarcaTotales}
            marcaTotalesCarga={marcaTotalesCarga}
          />
        </div>
      )}
    </Modal>
  );
}
