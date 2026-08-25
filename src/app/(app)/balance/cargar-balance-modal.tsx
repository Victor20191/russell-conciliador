"use client";

import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { fmt } from "@/lib/format";
import {
  actualizarAperturaBorrador,
  asignarClienteBorrador,
  cargarBalancePorTercero,
  continuarBalanceTransitorioConSpec,
  descartarBorrador,
  leerBalance,
  reprocesarBalanceConSpec,
  guardarPerfilDesdeEditor,
  type LeerBalanceState,
  type ResultadoCargaTercero,
  type SugerenciaBalance,
} from "@/app/actions/balance";
import { type AperturaBalance } from "@/lib/balance/apertura-balance";
import { SelectorAperturaBalance } from "@/app/(app)/balance/selector-apertura-balance";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { leerHojasParaPreview, columnaLetra, type CeldaCruda, type HojaPreview } from "@/lib/balance/extraccion/hojas-cliente";
import type { SpecCarga } from "@/lib/balance/extraccion/esquema";
import { PromptClientePerfil } from "@/app/(app)/balance/prompt-cliente-perfil";
import { SelectorClienteBuscable } from "@/components/selector-cliente-buscable";
import { nitCoincide } from "@/lib/nit";
import { EstadoProcesando } from "@/components/estado-procesando";
import type { ImportBalanceState } from "@/lib/import/balance";
import type { ConfiguracionIABalanceUI, ProveedorIABalance } from "@/lib/ia/proveedor-balance";
import {
  completarFormularioLectura,
  esFalloTransporteCarga,
  MENSAJE_RECUPERAR_LECTURA,
} from "@/lib/balance/recuperacion-red";
import {
  generarUuidV4Cliente,
  MENSAJE_UUID_CLIENTE_NO_DISPONIBLE,
} from "@/lib/balance/uuid-cliente";
import {
  capturarArchivoSnapshotCliente,
  reconstruirArchivoDesdeSnapshot,
  type ArchivoSnapshotCliente,
} from "@/lib/balance/archivo-snapshot-cliente";
import { chevronDivulgacion } from "@/lib/ui/chevron-divulgacion";
import { mensajeTamanoBalanceNoPermitido } from "@/lib/balance/limites-archivo";
import { cargarArchivoBalanceTemporal } from "@/lib/balance/carga-archivo-cliente";

/** Extensiones de Excel que pueden traer varias hojas (inspeccionables en cliente). */
const esExcel = (name: string) => /\.(xlsx|xlsm|xls)$/i.test(name);

/**
 * Umbral para NO inspeccionar el Excel en el navegador. Un xlsx comprime ~6×, así que un
 * archivo de ~500 KB en disco ya trae miles de filas; parsear el libro COMPLETO en el hilo
 * principal (`leerHojasParaPreview`) congela la página. Por encima de esto se omite la vista
 * previa de hojas: el servidor lee el archivo y la IA/perfil elige la hoja (los balances
 * grandes suelen ser de una sola hoja, así que no se pierde nada útil).
 */
const MAX_PREVIEW_BYTES = 500 * 1024;

export type ClienteOpcion = { id: number; name: string; nit: string };

type Excepcion = NonNullable<ImportBalanceState["excepciones"]>[number];

function generarUuidLecturaOAvisar(): string | null {
  try {
    return generarUuidV4Cliente();
  } catch {
    notifyError(MENSAJE_UUID_CLIENTE_NO_DISPONIBLE);
    return null;
  }
}

async function leerBalanceRecuperable(
  previo: LeerBalanceState,
  formData: FormData,
): Promise<LeerBalanceState> {
  try {
    return await leerBalance(previo, formData);
  } catch (error) {
    if (esFalloTransporteCarga(error)) {
      return { ok: false, message: MENSAJE_RECUPERAR_LECTURA };
    }
    throw error;
  }
}

export function CargarBalanceButton({
  clients,
  configuracionIA,
}: {
  clients: ClienteOpcion[];
  configuracionIA: ConfiguracionIABalanceUI | null;
}) {
  const [open, setOpen] = useState(false);
  // `instancia` reinicia el asistente por completo (incluye los useActionState).
  const [instancia, setInstancia] = useState(0);
  const reiniciar = () => setInstancia((n) => n + 1);
  return (
    <>
      <button
        onClick={() => { reiniciar(); setOpen(true); }}
        className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-navy-600"
      >
        <Icon name="upload" size={14} /> Cargar balance
      </button>
      {open && (
        <CargarBalanceModal
          key={instancia}
          clients={clients}
          configuracionIA={configuracionIA}
          onClose={() => setOpen(false)}
          onReiniciar={reiniciar}
        />
      )}
    </>
  );
}

function CargarBalanceModal({
  clients,
  configuracionIA,
  onClose,
  onReiniciar,
}: {
  clients: ClienteOpcion[];
  configuracionIA: ConfiguracionIABalanceUI | null;
  onClose: () => void;
  onReiniciar: () => void;
}) {
  const [leerState, leerAction, leyendo] = useActionState<LeerBalanceState, FormData>(
    leerBalanceRecuperable,
    {},
  );
  const [fileName, setFileName] = useState("");
  // UUID estable mientras el usuario conserva el mismo archivo. Si se pierde la
  // respuesta, el reintento llega al servidor con la misma identidad y recupera
  // el borrador ya creado en vez de generar otro.
  const [loteIdSolicitud, setLoteIdSolicitud] = useState("");
  // Solo se solicita cuando la lectura no logra reconocer un NIT asociado a la
  // cartera autorizada. El snapshot permanece en memoria para continuar sin adjuntar.
  const [clienteCarga, setClienteCarga] = useState<number | null>(null);
  // Copia binaria estable del archivo. El File creado por el input puede quedar
  // consumido tras una Server Action; de este snapshot nace un File NUEVO para
  // cada lectura, vinculación o reproceso.
  const archivoSnapshotRef = useRef<ArchivoSnapshotCliente | null>(null);
  // Sugerencia REPROCESADA con el editor (pisa a la de la lectura inicial).
  const [sugLocal, setSugLocal] = useState<SugerenciaBalance | null>(null);
  const [reprocesando, startReproceso] = useTransition();
  const [asignandoCliente, startAsignarCliente] = useTransition();
  const [clienteManual, setClienteManual] = useState<{ loteId: string; clientId: number } | null>(null);
  // APERTURA declarada en la revisión (`cuenta` | `tercero`). Se guarda suelta —no
  // atada a un lote— porque la revisión puede ser TRANSITORIA (aún sin lote en BD)
  // y porque un reproceso crea un lote nuevo: en ambos casos la declaración del
  // analista debe sobrevivir. Quien la baja a BD es el efecto de más abajo.
  const [aperturaRevision, setAperturaRevision] = useState<AperturaBalance | null>(null);
  const [guardandoApertura, startGuardarApertura] = useTransition();
  // Último `loteId|valor` ya persistido: evita reenviar la misma declaración en
  // cada render y permite re-persistirla cuando cambia el lote.
  const aperturaPersistidaRef = useRef<string | null>(null);
  // Hojas detectadas en el cliente (solo Excel con 2+ hojas) y la elegida por el
  // usuario. Mientras `hojas` esté presente, la elección es obligatoria.
  const [hojas, setHojas] = useState<HojaPreview[] | null>(null);
  const [hojaElegida, setHojaElegida] = useState<string | null>(null);
  const [inspeccionando, setInspeccionando] = useState(false);
  // Excel demasiado grande para inspeccionar en el navegador sin congelar: se omite la vista
  // previa de hojas y lo lee el servidor.
  const [archivoGrande, setArchivoGrande] = useState(false);
  const [progresoSubida, setProgresoSubida] = useState<number | null>(null);
  const [proveedorCarga, setProveedorCarga] = useState<ProveedorIABalance | undefined>(
    configuracionIA?.predeterminado,
  );
  const [mensajeLecturaDesactualizado, setMensajeLecturaDesactualizado] = useState(false);
  const [seleccionClienteActiva, setSeleccionClienteActiva] = useState(false);
  // Modo "por tercero" (CxC/CxP): NO cambia la lectura/detección del archivo (se
  // reusa tal cual), solo el destino de la confirmación — ver `FormRevisarTercero`.
  const [modoTercero, setModoTercero] = useState(false);
  // Identifica el análisis en curso: si el usuario cambia de archivo mientras se
  // lee el anterior, descartamos el resultado tardío (no pisa el estado nuevo).
  const seqRef = useRef(0);
  const reprocesoSolicitudRef = useRef<string | null>(null);
  const lecturaIniciadaRef = useRef(false);
  const clienteEnviadoRef = useRef<number | null>(null);

  const reconstruirArchivoRetenido = (): File | null => {
    const snapshot = archivoSnapshotRef.current;
    return snapshot ? reconstruirArchivoDesdeSnapshot(snapshot) : null;
  };

  const prepararArchivoTemporal = async (
    formData: FormData,
    archivo: File,
    loteId: string,
  ): Promise<boolean> => {
    setProgresoSubida(0);
    try {
      await cargarArchivoBalanceTemporal(archivo, loteId, setProgresoSubida);
      formData.delete("archivo");
      return true;
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "No se pudo subir el archivo del balance.");
      return false;
    } finally {
      setProgresoSubida(null);
    }
  };

  const obtenerSolicitudReproceso = (): string | null => {
    if (reprocesoSolicitudRef.current) return reprocesoSolicitudRef.current;
    const nuevaSolicitud = generarUuidLecturaOAvisar();
    if (nuevaSolicitud) reprocesoSolicitudRef.current = nuevaSolicitud;
    return nuevaSolicitud;
  };

  // Un cambio de archivo, hoja o proveedor define una operación nueva.
  // Si ya hubo un envío, rotamos el UUID; mientras el contexto no cambie, el
  // botón de reintento conserva exactamente la identidad y los bytes originales.
  const renovarSolicitudTrasCambio = () => {
    if (!lecturaIniciadaRef.current || !archivoSnapshotRef.current) return;
    const nuevaSolicitud = generarUuidLecturaOAvisar();
    setLoteIdSolicitud(nuevaSolicitud ?? "");
    setClienteCarga(null);
    setSeleccionClienteActiva(false);
    clienteEnviadoRef.current = null;
    lecturaIniciadaRef.current = false;
    setMensajeLecturaDesactualizado(true);
  };

  // Al elegir archivo: si es Excel compatible, leemos sus hojas en el navegador
  // para que el usuario elija cuál cargar cuando haya 2+. Cualquier
  // fallo degrada al flujo normal (la IA elige) sin bloquear.
  async function onArchivoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0] ?? null;
    const seq = ++seqRef.current;
    const nuevaSolicitud = file ? generarUuidLecturaOAvisar() : null;
    archivoSnapshotRef.current = null;
    setFileName("");
    setLoteIdSolicitud("");
    setClienteCarga(null);
    setSeleccionClienteActiva(false);
    clienteEnviadoRef.current = null;
    lecturaIniciadaRef.current = false;
    setMensajeLecturaDesactualizado(true);
    reprocesoSolicitudRef.current = null;
    setHojas(null);
    setHojaElegida(null);
    setArchivoGrande(false);
    setInspeccionando(false);

    if (file && !nuevaSolicitud) {
      // No dejamos un archivo visible sin identidad: ese estado habilitaba el
      // submit y terminaba en el aviso genérico antes de llegar al servidor.
      input.value = "";
      return;
    }
    if (!file || !nuevaSolicitud) {
      return;
    }
    const errorTamano = mensajeTamanoBalanceNoPermitido(file.name, file.size);
    if (errorTamano) {
      notifyError(errorTamano);
      input.value = "";
      return;
    }

    let snapshot: ArchivoSnapshotCliente;
    try {
      snapshot = await capturarArchivoSnapshotCliente(file);
    } catch {
      if (seqRef.current !== seq) return;
      notifyError("No pudimos copiar el archivo seleccionado. Ciérralo en Excel, espera a que termine de sincronizar y vuelve a intentarlo.");
      input.value = "";
      return;
    }
    if (seqRef.current !== seq) return;

    archivoSnapshotRef.current = snapshot;
    setFileName(snapshot.nombre);
    setLoteIdSolicitud(nuevaSolicitud);
    const archivoEstable = reconstruirArchivoDesdeSnapshot(snapshot);
    if (!esExcel(snapshot.nombre)) return;
    if (snapshot.contenido.byteLength > MAX_PREVIEW_BYTES) {
      // Grande: NO se parsea en el navegador (congelaría). Lo lee el servidor.
      setArchivoGrande(true);
      return;
    }
    setInspeccionando(true);
    try {
      const detectadas = await leerHojasParaPreview(archivoEstable);
      if (seqRef.current !== seq) return; // otro archivo se eligió mientras tanto
      // Con 2+ hojas el usuario elige; con una sola la fijamos directamente. En
      // ambos casos la IA recibe SIEMPRE una hoja ya validada aquí, nunca asume.
      if (detectadas.length >= 2) setHojas(detectadas);
      else if (detectadas.length === 1) setHojaElegida(detectadas[0].nombre);
    } catch {
      /* archivo ilegible en el cliente: seguimos el flujo normal (la IA lee el archivo) */
    } finally {
      if (seqRef.current === seq) setInspeccionando(false);
    }
  }

  // Reproceso determinista (editor de estructura / preferencias del cliente):
  // reenvía el archivo con el spec ajustado; la sugerencia nueva pisa la anterior.
  const reprocesar = (
    spec: SpecCarga,
    loteIdAnterior: string,
    proveedorIA?: ProveedorIABalance,
    clientId?: number | null,
  ) => {
    const archivoFile = reconstruirArchivoRetenido();
    if (!archivoFile) return;
    startReproceso(async () => {
      const fd = new FormData();
      fd.set("archivo", archivoFile);
      fd.set("spec", JSON.stringify(spec));
      fd.set("loteIdAnterior", loteIdAnterior);
      const loteIdSolicitudReproceso = obtenerSolicitudReproceso();
      if (!loteIdSolicitudReproceso) return;
      fd.set("loteIdSolicitud", loteIdSolicitudReproceso);
      if (proveedorIA) fd.set("modeloIA", proveedorIA);
      if (clientId != null) fd.set("clienteId", String(clientId));
      if (!await prepararArchivoTemporal(fd, archivoFile, loteIdSolicitudReproceso)) return;
      let res: LeerBalanceState;
      try {
        res = await reprocesarBalanceConSpec({}, fd);
      } catch (error) {
        if (esFalloTransporteCarga(error)) {
          notifyError(MENSAJE_RECUPERAR_LECTURA);
          return;
        }
        throw error;
      }
      if (res.ok && res.sugerencia) {
        reprocesoSolicitudRef.current = null;
        setSugLocal(res.sugerencia);
        notifySuccess("Archivo reprocesado con la estructura ajustada (sin IA).");
      } else if (res.errorProveedorIA && res.message) {
        notifyError(`${res.message} Es un inconveniente del proveedor de IA, no del aplicativo.`);
      } else {
        notifyError(res.message ?? "No se pudo reprocesar el archivo.");
      }
    });
  };

  // La copia estable permite reintentar la carga fragmentada aunque el input haya
  // sido limpiado o una respuesta anterior se pierda durante el procesamiento.
  const onLeerSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const archivoFile = reconstruirArchivoRetenido();
    if (!archivoFile || archivoFile.size === 0) {
      notifyError("No se encontró el archivo original. Vuelve a seleccionarlo.");
      return;
    }
    if (!loteIdSolicitud) {
      notifyError("No se pudo identificar esta lectura. Vuelve a seleccionar el archivo.");
      return;
    }
    completarFormularioLectura(formData, {
      archivo: archivoFile,
      loteIdSolicitud,
      clienteId: clienteCarga,
      hoja: hojaElegida,
      proveedorIA: proveedorCarga,
    });
    if (!await prepararArchivoTemporal(formData, archivoFile, loteIdSolicitud)) return;
    lecturaIniciadaRef.current = true;
    clienteEnviadoRef.current = clienteCarga;
    setMensajeLecturaDesactualizado(false);
    startTransition(() => leerAction(formData));
  };

  const sug = sugLocal ?? leerState?.sugerencia;
  const fase: "revisar" | "archivo" = sug ? "revisar" : "archivo";
  const clienteDetectadoId =
    sug?.render.clienteDetectadoId != null && clients.some((cliente) => cliente.id === sug.render.clienteDetectadoId)
      ? sug.render.clienteDetectadoId
      : null;
  const clienteRevisionId =
    sug && clienteManual?.loteId === sug.payload.loteId
      ? clienteManual.clientId
      : clienteDetectadoId;

  // La apertura solo puede bajar a BD cuando la revisión YA tiene lote (`persistida`).
  // Mientras sea transitoria, la elección espera en memoria; en cuanto se vincula el
  // cliente —o un reproceso crea otro lote— este efecto la deja guardada sin que el
  // analista tenga que volver a declararla.
  const loteRevisionPersistido = sug?.persistida ? sug.payload.loteId : null;
  useEffect(() => {
    if (!loteRevisionPersistido || !aperturaRevision) return;
    const marca = `${loteRevisionPersistido}|${aperturaRevision}`;
    if (aperturaPersistidaRef.current === marca) return;
    aperturaPersistidaRef.current = marca;
    startGuardarApertura(async () => {
      const resultado = await actualizarAperturaBorrador(loteRevisionPersistido, aperturaRevision);
      if (!resultado.ok) {
        // Se libera la marca para que un reintento (o el propio borrador) pueda
        // volver a guardarla; la elección permanece visible en el selector.
        aperturaPersistidaRef.current = null;
        notifyError(resultado.message ?? "No se pudo guardar el tipo de balance.");
      }
    });
  }, [loteRevisionPersistido, aperturaRevision]);

  const asignarClienteRevision = (clientId: number) => {
    if (!sug) return;
    const loteId = sug.payload.loteId;
    startAsignarCliente(async () => {
      const archivoFile = reconstruirArchivoRetenido();
      // La primera revisión sin cliente es solo memoria de React: su UUID aún
      // no existe en BD. Si es tabular, reutilizamos el spec ya detectado para
      // transformar de forma determinista y crear lote + staging sin repetir IA.
      if (!sug.persistida) {
        if (!archivoFile) {
          notifyError("No se encontró el archivo original. Vuelve a seleccionarlo.");
          return;
        }
        let persistido: LeerBalanceState;
        try {
          if (sug.render.spec) {
            const fd = new FormData();
            fd.set("archivo", archivoFile);
            fd.set("loteIdSolicitud", loteId);
            fd.set("clienteId", String(clientId));
            fd.set("spec", JSON.stringify(sug.render.spec));
            const proveedor = sug.payload.proveedorIA ?? proveedorCarga;
            if (proveedor) fd.set("modeloIA", proveedor);
            if (!await prepararArchivoTemporal(fd, archivoFile, loteId)) return;
            persistido = await continuarBalanceTransitorioConSpec({}, fd);
          } else {
            // Plantilla determinista sin proveedor disponible: no existe spec que
            // reutilizar, pero tampoco IA que podamos repetir. Conserva el fallback
            // anterior con el mismo File + UUID + cliente.
            const fd = completarFormularioLectura(new FormData(), {
              archivo: archivoFile,
              loteIdSolicitud: loteId,
              clienteId: clientId,
              hoja: hojaElegida,
              proveedorIA: sug.payload.proveedorIA ?? proveedorCarga,
            });
            if (!await prepararArchivoTemporal(fd, archivoFile, loteId)) return;
            persistido = await leerBalance({}, fd);
          }
        } catch (error) {
          if (esFalloTransporteCarga(error)) {
            notifyError(MENSAJE_RECUPERAR_LECTURA);
            return;
          }
          throw error;
        }
        if (
          !persistido.ok
          || !persistido.sugerencia
          || !persistido.sugerencia.persistida
        ) {
          notifyError(persistido.message ?? "No se pudo vincular el cliente y crear el borrador.");
          return;
        }
        setClienteCarga(clientId);
        setSugLocal(persistido.sugerencia);
        setClienteManual({
          loteId: persistido.sugerencia.payload.loteId,
          clientId,
        });
        notifySuccess("Cliente vinculado. El borrador quedó listo para continuar.");
        return;
      }

      // Si conservamos el archivo y su mapa tabular, reprocesamos de forma
      // determinista con el cliente elegido. Así sus preferencias (signo,
      // tercero, solo-hojas) se aplican también a ESTA primera carga, no solo a
      // las futuras. PDF/plantilla sin spec usan la vinculación directa.
      if (archivoFile && sug.render.spec) {
        const fd = new FormData();
        fd.set("archivo", archivoFile);
        fd.set("spec", JSON.stringify(sug.render.spec));
        fd.set("loteIdAnterior", loteId);
        fd.set("clienteId", String(clientId));
        const loteIdSolicitudReproceso = obtenerSolicitudReproceso();
        if (!loteIdSolicitudReproceso) return;
        fd.set("loteIdSolicitud", loteIdSolicitudReproceso);
        if (sug.payload.proveedorIA) fd.set("modeloIA", sug.payload.proveedorIA);
        if (!await prepararArchivoTemporal(fd, archivoFile, loteIdSolicitudReproceso)) return;
        let reprocesado: LeerBalanceState;
        try {
          reprocesado = await reprocesarBalanceConSpec({}, fd);
        } catch (error) {
          if (esFalloTransporteCarga(error)) {
            notifyError(MENSAJE_RECUPERAR_LECTURA);
            return;
          }
          throw error;
        }
        if (!reprocesado.ok || !reprocesado.sugerencia) {
          notifyError(reprocesado.message ?? "No se pudo aplicar el perfil del cliente al borrador.");
          return;
        }
        reprocesoSolicitudRef.current = null;
        setSugLocal(reprocesado.sugerencia);
        setClienteManual({ loteId: reprocesado.sugerencia.payload.loteId, clientId });
        notifySuccess("Cliente y perfil asociados. Sus preferencias se aplicaron al borrador.");
        return;
      }
      if (archivoFile) {
        const fd = new FormData();
        fd.set("archivo", archivoFile);
        fd.set("clienteId", String(clientId));
        fd.set("loteIdAnterior", loteId);
        const loteIdSolicitudReproceso = obtenerSolicitudReproceso();
        if (!loteIdSolicitudReproceso) return;
        fd.set("loteIdSolicitud", loteIdSolicitudReproceso);
        if (hojaElegida) fd.set("hoja", hojaElegida);
        if (sug.payload.proveedorIA) fd.set("modeloIA", sug.payload.proveedorIA);
        if (!await prepararArchivoTemporal(fd, archivoFile, loteIdSolicitudReproceso)) return;
        let releido: LeerBalanceState;
        try {
          releido = await leerBalance({}, fd);
        } catch (error) {
          if (esFalloTransporteCarga(error)) {
            notifyError(MENSAJE_RECUPERAR_LECTURA);
            return;
          }
          throw error;
        }
        if (!releido.ok || !releido.sugerencia) {
          notifyError(releido.message ?? "No se pudo releer el archivo con las preferencias del cliente.");
          return;
        }
        reprocesoSolicitudRef.current = null;
        setSugLocal(releido.sugerencia);
        setClienteManual({ loteId: releido.sugerencia.payload.loteId, clientId });
        notifySuccess("Cliente y perfil asociados. Sus preferencias se aplicaron al borrador.");
        return;
      }

      const res = await asignarClienteBorrador(loteId, clientId);
      if (!res.ok) {
        notifyError(res.message ?? "No se pudo vincular el cliente al borrador.");
        return;
      }
      setClienteManual({ loteId, clientId });
      notifySuccess(res.message ?? "Cliente vinculado al borrador.");
    });
  };

  // Con Excel multi-hoja no se puede leer hasta elegir una hoja. El cliente solo
  // se vuelve obligatorio si el servidor no logró reconocerlo por el NIT.
  const requiereHoja = !!hojas && hojas.length >= 2;
  const requiereSeleccionCliente =
    !leyendo
    && !mensajeLecturaDesactualizado
    && leerState.requiereCliente === true;
  // Una vez elegido manualmente, el cliente sigue montado en el formulario
  // durante errores/reintentos para que el próximo envío no pierda `clienteId`.
  const mostrarSelectorCliente =
    requiereSeleccionCliente || seleccionClienteActiva || clienteCarga != null;
  const segundoPasoCliente = mostrarSelectorCliente;
  const leerDeshabilitado =
    leyendo
    || progresoSubida != null
    || inspeccionando
    || !fileName
    || !loteIdSolicitud
    || clients.length === 0
    || (segundoPasoCliente && clienteCarga == null)
    || (requiereHoja && !hojaElegida);
  const reintentoLecturaPendiente =
    !leyendo &&
    !mensajeLecturaDesactualizado &&
    leerState.message === MENSAJE_RECUPERAR_LECTURA;

  const footer =
    fase === "revisar" ? (
      <div className="flex w-full items-center gap-2">
        <button type="button" onClick={onReiniciar} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-600 hover:bg-ink-50">
          ← Otro archivo
        </button>
        {modoTercero ? null : sug && (asignandoCliente || progresoSubida != null) ? (
          <button
            type="button"
            disabled
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white opacity-60"
          >
            <Icon name="doc" size={13} />
            <EstadoProcesando>
              {progresoSubida != null ? `Subiendo ${progresoSubida}%` : "Vinculando cliente"}
            </EstadoProcesando>
          </button>
        ) : sug && clienteRevisionId != null ? (
          <Link
            href={`/balance/borradores/${sug.payload.loteId}`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600"
          >
            <Icon name="doc" size={13} /> Ir al borrador
          </Link>
        ) : sug ? (
          <button
            type="button"
            disabled
            title="Selecciona y confirma el cliente para continuar"
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white opacity-60"
          >
            <Icon name="doc" size={13} /> Selecciona el cliente
          </button>
        ) : null}
      </div>
    ) : (
      <button
        type="submit"
        form="leer-form"
        disabled={leerDeshabilitado}
        aria-busy={leyendo || progresoSubida != null}
        title={
          segundoPasoCliente && clienteCarga == null
            ? "Selecciona el cliente reconocido en el archivo para continuar"
            : undefined
        }
        className="ml-auto rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
      >
        {progresoSubida != null
          ? (
            <EstadoProcesando etiqueta="Subiendo archivo">
              Subiendo {progresoSubida}%
            </EstadoProcesando>
          )
          : leyendo
            ? <EstadoProcesando etiqueta="Leyendo archivo">Leyendo</EstadoProcesando>
          : inspeccionando
            ? <EstadoProcesando>Analizando hojas</EstadoProcesando>
            : reintentoLecturaPendiente
              ? "Reintentar lectura"
              : segundoPasoCliente
                ? "Continuar con cliente"
                : requiereHoja && hojaElegida
                  ? `Leer hoja «${recortar(hojaElegida, 22)}»`
                  : "Leer archivo"}
      </button>
    );

  return (
    <Modal open onClose={onClose} title="Cargar balance de comprobación" size="2xl" footer={footer}>
      {fase === "revisar" && sug && modoTercero ? (
        <FormRevisarTercero
          key={sug.payload.loteId}
          sug={sug}
          clients={clients}
          clienteId={clienteRevisionId}
          asignandoCliente={asignandoCliente || progresoSubida != null}
          onAsignarCliente={asignarClienteRevision}
          archivoDisponible={fileName.length > 0}
          reconstruirArchivo={reconstruirArchivoRetenido}
          prepararArchivoTemporal={prepararArchivoTemporal}
          onCargado={(mensaje) => {
            notifySuccess(mensaje);
            // Limpieza best-effort: la lectura reusada creó un borrador NORMAL
            // (staging) solo para detectar la estructura; en modo tercero no se
            // promueve, así que se descarta para no dejar un borrador huérfano
            // en /balance/borradores.
            descartarBorrador(sug.payload.loteId).catch(() => {});
            onClose();
          }}
        />
      ) : fase === "revisar" && sug ? (
        <FormRevisar
          key={sug.payload.loteId}
          sug={sug}
          clients={clients}
          excepciones={leerState?.excepciones ?? []}
          archivoDisponible={fileName.length > 0}
          reprocesando={reprocesando || progresoSubida != null}
          clienteId={clienteRevisionId}
          asignandoCliente={asignandoCliente || progresoSubida != null}
          onAsignarCliente={asignarClienteRevision}
          onReprocesar={reprocesar}
          apertura={aperturaRevision}
          guardandoApertura={guardandoApertura}
          onElegirApertura={setAperturaRevision}
        />
      ) : (
        <form id="leer-form" onSubmit={onLeerSubmit} className="flex flex-col gap-3.5">
          {!segundoPasoCliente && (
            <p className="text-[12.5px] leading-relaxed text-ink-600">
              Adjunta el balance en <span className="font-semibold">Excel (.xlsx/.xlsm/.xls), CSV, TXT (plano), JSON o PDF</span>. Russell
              escanea el archivo, reconoce el NIT e intenta asociarlo con uno de tus clientes. Si no puede reconocerlo,
              te pedirá seleccionar el cliente antes de crear el borrador. El archivo permanece adjunto durante todo el proceso.
            </p>
          )}

          {!segundoPasoCliente && configuracionIA && (
            <div className="rounded-md border border-ai-100 bg-ai-100/30 px-3 py-2.5">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-medium text-ink-700">Proveedor de IA para esta carga</span>
                <select
                  name="modeloIA"
                  value={proveedorCarga}
                  onChange={(event) => {
                    renovarSolicitudTrasCambio();
                    setProveedorCarga(event.target.value as ProveedorIABalance);
                  }}
                  className="rounded-md border border-ai-100 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-ai-700"
                >
                  {configuracionIA.opciones.map((opcion) => (
                    <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {clients.length === 0 ? (
            <div className="rounded-md border border-warn-100 bg-warn-100/40 px-3 py-2.5 text-[12.5px] text-warn-700">
              No tienes clientes asignados con alcance para cargar balances.
            </div>
          ) : (
            <>
              {!segundoPasoCliente && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11.5px] font-medium text-ink-600">Archivo (Excel, CSV, TXT, JSON o PDF)</span>
                  <input
                    type="file"
                    name="archivo"
                    accept=".xlsx,.xlsm,.xls,.csv,.txt,.json,.pdf,text/plain,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    required
                    onChange={onArchivoChange}
                    className="rounded-md border border-ink-200 bg-white text-[12.5px] text-ink-700 file:mr-3 file:cursor-pointer file:border-0 file:bg-navy-700 file:px-3 file:py-2 file:text-[12.5px] file:font-semibold file:text-white"
                  />
                </label>
              )}

              {!segundoPasoCliente && (
                <label className="flex items-start gap-2 rounded-md border border-ink-150 bg-ink-50/60 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={modoTercero}
                    onChange={(e) => setModoTercero(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="text-[12px] leading-relaxed text-ink-600">
                    <span className="font-semibold text-ink-700">Abrir por tercero (CxC/CxP).</span> Conserva el NIT de
                    cada tercero y carga solo las cuentas de cartera (clientes y proveedores); el resto del balance se
                    descarta. Útil para cruzar contra los auxiliares de los módulos de Cartera.
                  </span>
                </label>
              )}

              {mostrarSelectorCliente && (
                <div className="rounded-md border border-warn-100 bg-warn-100/40 px-3 py-2.5">
                  <SelectorClienteBuscable
                    clients={clients}
                    value={clienteCarga}
                    onChange={(clientId) => {
                      if (
                        clientId != null
                        && clienteEnviadoRef.current != null
                        && clientId !== clienteEnviadoRef.current
                      ) {
                        renovarSolicitudTrasCambio();
                      }
                      setSeleccionClienteActiva(true);
                      setClienteCarga(clientId);
                    }}
                    name="clienteId"
                  />
                  <p className="mt-1.5 text-[11.5px] text-warn-700">
                    {requiereSeleccionCliente ? (
                      <>
                        <span className="font-semibold">Selección necesaria.</span> {leerState.message}
                        <span className="mt-1 block">Elige el cliente y pulsa «Continuar con cliente».</span>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold">Cliente conservado.</span> Russell mantendrá esta selección y el
                        archivo original cuando compruebes o reintentes la lectura.
                      </>
                    )}
                  </p>
                </div>
              )}

              {/* Hoja elegida en Excel multi-hoja; vacío en archivos de una sola hoja, CSV o PDF. */}
              <input type="hidden" name="hoja" value={hojaElegida ?? ""} />
              <input type="hidden" name="loteIdSolicitud" value={loteIdSolicitud} />

              {!segundoPasoCliente && inspeccionando && <p className="text-[12px] text-ink-500"><EstadoProcesando>Analizando las hojas del archivo</EstadoProcesando></p>}
              {!segundoPasoCliente && archivoGrande && (
                <p className="rounded-md border border-err-200 bg-err-50 px-3 py-2.5 text-[12px] font-medium text-err-700">
                  <span className="font-semibold">⚠️ ¡Archivo muy pesado!</span> Su carga toma más tiempo de lo normal. Puedes cambiar de pestaña; si la conexión se interrumpe, Russell comprobará el mismo intento sin duplicar el borrador.
                </p>
              )}
              {!segundoPasoCliente && requiereHoja && hojas && (
                <SelectorHojas
                  hojas={hojas}
                  elegida={hojaElegida}
                  onElegir={(hoja) => {
                    renovarSolicitudTrasCambio();
                    setHojaElegida(hoja);
                  }}
                />
              )}
            </>
          )}

          {!segundoPasoCliente &&
            leerState?.message &&
            !leerState.requiereCliente &&
            (leerState.message !== MENSAJE_RECUPERAR_LECTURA || reintentoLecturaPendiente) &&
            (leerState.errorProveedorIA ? (
              <div className="rounded-md border border-warn-100 bg-warn-100/40 px-3 py-2.5 text-[12px] text-warn-700">
                <p className="font-semibold">⚠️ Inconveniente temporal del proveedor de IA</p>
                <p className="mt-1 font-medium">{leerState.message}</p>
                <p className="mt-1">
                  Es una falla del servicio externo de IA, <span className="font-semibold">no del aplicativo ni de tu archivo</span>. Espera unos minutos y vuelve a intentar la lectura.
                </p>
              </div>
            ) : (
              <p
                role="alert"
                aria-live="assertive"
                className="rounded-md border border-err-200 bg-err-50 px-3 py-2.5 text-[12px] font-medium text-err-700"
              >
                {leerState.message}
              </p>
            ))}
          {!segundoPasoCliente && leerState?.errores && leerState.errores.length > 0 && (
            <ErroresTabla errores={leerState.errores} />
          )}
          {!segundoPasoCliente && leerState?.excepciones && leerState.excepciones.length > 0 && (
            <ExcepcionesTabla excepciones={leerState.excepciones} />
          )}
        </form>
      )}
    </Modal>
  );
}

function FormRevisar({
  sug,
  clients,
  excepciones,
  archivoDisponible,
  reprocesando,
  clienteId,
  asignandoCliente,
  onAsignarCliente,
  onReprocesar,
  apertura,
  guardandoApertura,
  onElegirApertura,
}: {
  sug: SugerenciaBalance;
  clients: ClienteOpcion[];
  excepciones: Excepcion[];
  archivoDisponible: boolean;
  reprocesando: boolean;
  clienteId: number | null;
  asignandoCliente: boolean;
  onAsignarCliente: (clientId: number) => void;
  onReprocesar: (
    spec: SpecCarga,
    loteIdAnterior: string,
    proveedorIA?: ProveedorIABalance,
    clientId?: number | null,
  ) => void;
  apertura: AperturaBalance | null;
  guardandoApertura: boolean;
  onElegirApertura: (apertura: AperturaBalance) => void;
}) {
  // El editor de estructura solo aplica si conservamos el snapshot (reproceso) y
  // la lectura produjo un spec (tabular). PDF/plantilla no traen spec.
  const puedeEditar = sug.persistida && archivoDisponible && !!sug.render.spec;

  // Guardar el spec ajustado como PERFIL del cliente SIN reprocesar (para futuras cargas).
  // Si no hay cliente (ni por NIT ni en el lote), se pide elegirlo para concluir el guardado.
  const [guardandoPerfil, startGuardarPerfil] = useTransition();
  const [promptPerfilSpec, setPromptPerfilSpec] = useState<SpecCarga | null>(null);
  const onGuardarPerfil = (spec: SpecCarga) => {
    startGuardarPerfil(async () => {
      const r = await guardarPerfilDesdeEditor(sug.payload.loteId, spec);
      if (r.ok) { notifySuccess(r.message ?? "Perfil guardado."); return; }
      if (r.needsClient) { setPromptPerfilSpec(spec); return; }
      notifyError(r.message ?? "No se pudo guardar el perfil.");
    });
  };
  const guardarPerfilConCliente = (clientId: number) => {
    const spec = promptPerfilSpec;
    if (!spec) return;
    startGuardarPerfil(async () => {
      const r = await guardarPerfilDesdeEditor(sug.payload.loteId, spec, clientId);
      if (r.ok) { notifySuccess(r.message ?? "Perfil guardado."); setPromptPerfilSpec(null); }
      else notifyError(r.message ?? "No se pudo guardar el perfil.");
    });
  };

  return (
    <div className="flex flex-col gap-3.5">
      <IdentificacionCliente
        nitDetectado={sug.payload.nitDetectado}
        clients={clients}
        clienteId={clienteId}
        asignando={asignandoCliente}
        onAsignar={onAsignarCliente}
      />

      <TipoBalanceRevision
        apertura={apertura}
        guardando={guardandoApertura}
        onElegir={onElegirApertura}
      />

      <DetalleMovimiento
        cuentas={sug.render.importReady}
        totalCuentas={sug.render.totalCuentas}
      />

      {puedeEditar && sug.render.spec && (
        <EditorEstructura
          spec={sug.render.spec}
          encabezados={sug.render.encabezados}
          hojas={sug.render.hojas}
          reprocesando={reprocesando}
          onAplicar={(s) => onReprocesar(s, sug.payload.loteId, sug.payload.proveedorIA, clienteId)}
          onGuardar={onGuardarPerfil}
          guardando={guardandoPerfil}
        />
      )}

      {promptPerfilSpec && (
        <PromptClientePerfil clientes={clients} guardando={guardandoPerfil} onElegir={guardarPerfilConCliente} onClose={() => setPromptPerfilSpec(null)} />
      )}
      {excepciones.length > 0 && <ExcepcionesTabla excepciones={excepciones} />}
    </div>
  );
}

/**
 * Revisión del modo "por tercero" (CxC/CxP): reusa la IDENTIFICACIÓN de cliente
 * y el EDITOR DE ESTRUCTURA ya construidos para el balance normal, pero NO
 * promueve el borrador normal. "Aplicar" del editor solo ajusta el spec en
 * memoria (sin llamar al servidor); al confirmar, el archivo original se reenvía
 * junto al spec y al período a `cargarBalancePorTercero`, que hace su propia
 * ingesta/extracción/filtro/homologación aislados del balance normal.
 */
function FormRevisarTercero({
  sug,
  clients,
  clienteId,
  asignandoCliente,
  onAsignarCliente,
  archivoDisponible,
  reconstruirArchivo,
  prepararArchivoTemporal,
  onCargado,
}: {
  sug: SugerenciaBalance;
  clients: ClienteOpcion[];
  clienteId: number | null;
  asignandoCliente: boolean;
  onAsignarCliente: (clientId: number) => void;
  archivoDisponible: boolean;
  reconstruirArchivo: () => File | null;
  prepararArchivoTemporal: (formData: FormData, archivo: File, loteId: string) => Promise<boolean>;
  onCargado: (mensaje: string, resultado?: ResultadoCargaTercero) => void;
}) {
  const [ed, setEd] = useState<SpecCarga | null>(sug.render.spec);
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFin, setPeriodoFin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [cargando, startCargando] = useTransition();

  const tieneColumnaTercero = !!ed && ed.columnas.tercero > 0;
  const puedeCargar =
    !!ed && tieneColumnaTercero && clienteId != null && !!periodoInicio && !!periodoFin && archivoDisponible;

  const onConfirmar = () => {
    if (!ed || clienteId == null) return;
    const archivoFile = reconstruirArchivo();
    if (!archivoFile) {
      setError("No se encontró el archivo original. Vuelve a seleccionarlo.");
      return;
    }
    const loteIdCarga = generarUuidLecturaOAvisar();
    if (!loteIdCarga) return;
    setError(null);
    startCargando(async () => {
      const fd = new FormData();
      fd.set("archivo", archivoFile);
      fd.set("loteIdSolicitud", loteIdCarga);
      fd.set("clienteId", String(clienteId));
      fd.set("periodoInicio", periodoInicio);
      fd.set("periodoFin", periodoFin);
      fd.set("spec", JSON.stringify(ed));
      setProgreso(0);
      const subido = await prepararArchivoTemporal(fd, archivoFile, loteIdCarga);
      setProgreso(null);
      if (!subido) return;
      let res: Awaited<ReturnType<typeof cargarBalancePorTercero>>;
      try {
        res = await cargarBalancePorTercero(fd);
      } catch (err) {
        if (esFalloTransporteCarga(err)) {
          setError(MENSAJE_RECUPERAR_LECTURA);
          return;
        }
        throw err;
      }
      if (!res.ok) {
        setError(res.message ?? "No se pudo cargar el balance por tercero.");
        return;
      }
      onCargado(res.message ?? "Balance por tercero cargado.", res.resultado);
    });
  };

  return (
    <div className="flex flex-col gap-3.5">
      <IdentificacionCliente
        nitDetectado={sug.payload.nitDetectado}
        clients={clients}
        clienteId={clienteId}
        asignando={asignandoCliente}
        onAsignar={onAsignarCliente}
      />

      {!ed ? (
        <p className="rounded-md border border-err-200 bg-err-50 px-3 py-2.5 text-[12px] font-medium text-err-700">
          El modo «por tercero» requiere un archivo tabular con columnas identificables (Excel/CSV/TXT delimitado o
          JSON). Este archivo no produjo una estructura editable.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Período desde</span>
              <input
                type="date"
                value={periodoInicio}
                onChange={(e) => setPeriodoInicio(e.target.value)}
                className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Período hasta</span>
              <input
                type="date"
                value={periodoFin}
                onChange={(e) => setPeriodoFin(e.target.value)}
                className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700"
              />
            </label>
          </div>

          <EditorEstructura
            spec={ed}
            encabezados={sug.render.encabezados}
            hojas={sug.render.hojas}
            reprocesando={false}
            onAplicar={(s) => setEd(s)}
          />

          {!tieneColumnaTercero && (
            <p className="rounded-md border border-warn-200 bg-warn-100/50 px-3 py-2.5 text-[11.5px] text-warn-700">
              Abre «Ajustar estructura del archivo» y mapea la columna <span className="font-semibold">Tercero / NIT</span>{" "}
              para poder cargar por tercero.
            </p>
          )}

          {error && (
            <p role="alert" aria-live="assertive" className="rounded-md border border-err-200 bg-err-50 px-3 py-2.5 text-[12px] font-medium text-err-700">
              {error}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              disabled={!puedeCargar || cargando}
              onClick={onConfirmar}
              className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
            >
              {progreso != null ? (
                <EstadoProcesando>Subiendo {progreso}%</EstadoProcesando>
              ) : cargando ? (
                <EstadoProcesando>Cargando</EstadoProcesando>
              ) : (
                "Cargar por tercero"
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function IdentificacionCliente({
  nitDetectado,
  clients,
  clienteId,
  asignando,
  onAsignar,
}: {
  nitDetectado: string | null;
  clients: ClienteOpcion[];
  clienteId: number | null;
  asignando: boolean;
  onAsignar: (clientId: number) => void;
}) {
  const [seleccion, setSeleccion] = useState<number | null>(clienteId);
  const cliente = clients.find((opcion) => opcion.id === clienteId) ?? null;

  if (cliente) {
    // El NIT del archivo solo CONTRASTA con el del cliente elegido (el DV puede
    // venir o no): si difieren, se avisa sin bloquear — puede ser un balance
    // consolidado o un export sin NIT, pero suele ser un cliente equivocado.
    const discrepa = nitDetectado != null && !nitCoincide(nitDetectado, cliente.nit);
    return (
      <section className="rounded-lg border border-ok-100 bg-ok-100/55 px-3.5 py-3" aria-label="Cliente identificado">
        <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-ok-700">
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-white/80" aria-hidden="true">✓</span>
          Cliente identificado
        </div>
        {discrepa && (
          <p className="mb-2 rounded-md border border-warn-200 bg-warn-100/70 px-2.5 py-2 text-[11.5px] font-medium text-warn-700">
            ⚠️ El NIT leído del archivo no coincide con el del cliente seleccionado. Verifica que sea la empresa correcta antes de cargar.
          </p>
        )}
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_2fr]">
          <div>
            <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">NIT leído del archivo</dt>
            <dd className="mt-0.5 font-mono text-[12.5px] font-semibold text-ink-800">{nitDetectado ?? "No detectado"}</dd>
          </div>
          <div>
            <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">NIT del cliente</dt>
            <dd className="mt-0.5 font-mono text-[12.5px] font-semibold text-ink-800">{cliente.nit}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">Razón social</dt>
            <dd className="mt-0.5 truncate text-[12.5px] font-semibold text-ink-800" title={cliente.name}>{cliente.name}</dd>
          </div>
        </dl>
        {nitDetectado == null && (
          <div className="mt-3 border-t border-ok-200/80 pt-3">
            <p className="mb-2 text-[11.5px] text-ink-600">
              El archivo no traía NIT. Confirma este cliente o busca otro por razón social o NIT antes de continuar.
            </p>
            <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <SelectorClienteBuscable clients={clients} value={seleccion} onChange={setSeleccion} />
              <button
                type="button"
                disabled={seleccion == null || seleccion === clienteId || asignando}
                onClick={() => seleccion != null && onAsignar(seleccion)}
                className="h-[37px] rounded-md bg-navy-700 px-3 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
              >
                {asignando
                  ? <EstadoProcesando>Cambiando</EstadoProcesando>
                  : seleccion === clienteId
                    ? "Cliente actual"
                    : "Cambiar cliente"}
              </button>
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-warn-200 bg-warn-100/55 px-3.5 py-3" aria-label="Cliente pendiente por identificar">
      <div className="mb-2">
        <div className="text-[12px] font-semibold text-warn-700">Cliente pendiente por identificar</div>
        <p className="mt-0.5 text-[11.5px] text-ink-600">
          {nitDetectado ? (
            <>El archivo se leyó con el NIT <span className="font-mono font-semibold text-ink-800">{nitDetectado}</span>, pero no coincide con un cliente disponible.</>
          ) : (
            <>No se encontró un NIT de cliente en el archivo.</>
          )}{" "}
          Busca la empresa por razón social o NIT y confírmala para continuar.
        </p>
      </div>
      <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <SelectorClienteBuscable clients={clients} value={seleccion} onChange={setSeleccion} />
        <button
          type="button"
          disabled={seleccion == null || asignando}
          onClick={() => seleccion != null && onAsignar(seleccion)}
          className="h-[37px] rounded-md bg-navy-700 px-3 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
        >
          {asignando ? <EstadoProcesando>Vinculando</EstadoProcesando> : "Vincular cliente"}
        </button>
      </div>
    </section>
  );
}

/**
 * APERTURA del informe DECLARADA en la revisión: ¿el archivo viene por cuenta o
 * desglosado por tercero? Se pregunta aquí —junto a la identificación del cliente—
 * porque es el momento en que el analista tiene el archivo a la vista. La lectura
 * solo SUGIERE el valor; la respuesta la da la persona. Sigue siendo editable en la
 * pantalla del borrador (ahí es donde se vuelve obligatoria para promover).
 */
function TipoBalanceRevision({
  apertura,
  guardando,
  onElegir,
}: {
  apertura: AperturaBalance | null;
  guardando: boolean;
  onElegir: (apertura: AperturaBalance) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Tipo de balance">
      <span className="text-[12px] font-semibold text-ink-700">
        Tipo de balance <span className="text-warn-700">*</span>
      </span>
      <SelectorAperturaBalance
        value={apertura}
        onChange={onElegir}
        disabled={guardando}
      />
      {guardando ? <EstadoProcesando>Guardando</EstadoProcesando> : null}
    </div>
  );
}

// Roles de columna del editor (0 = la columna no existe en el archivo).
type RolColumna = Exclude<keyof SpecCarga["columnas"], "codigoFragmentos">;
const ROLES_COLUMNA: { key: RolColumna; label: string; requerida?: boolean }[] = [
  { key: "codigo", label: "Código de cuenta", requerida: true },
  { key: "nombre", label: "Nombre de la cuenta" },
  { key: "saldoInicial", label: "Saldo inicial" },
  { key: "debitos", label: "Débitos" },
  { key: "creditos", label: "Créditos" },
  { key: "saldoFinal", label: "Saldo final (una columna)" },
  { key: "saldoFinalDebito", label: "Saldo final · débito" },
  { key: "saldoFinalCredito", label: "Saldo final · crédito" },
  { key: "tercero", label: "Tercero / NIT" },
];

/**
 * Editor de ESTRUCTURA del archivo: muestra el mapa aplicado (hoja, filas,
 * columnas por rol, signo, regla de detalle) y permite corregirlo. «Aplicar»
 * reprocesa el archivo de forma DETERMINISTA (sin IA) con el spec ajustado.
 */
export function EditorEstructura({
  spec,
  encabezados,
  hojas,
  reprocesando,
  onAplicar,
  onGuardar,
  guardando,
  notasCliente,
  onGuardarNotas,
  guardandoNotas,
}: {
  spec: SpecCarga;
  encabezados: string[];
  hojas: string[];
  reprocesando: boolean;
  onAplicar: (spec: SpecCarga) => void;
  onGuardar?: (spec: SpecCarga) => void;
  guardando?: boolean;
  // Notas / observaciones de carga del cliente (per-cliente, no del formato). El
  // padre resuelve el cliente y persiste; aquí solo se edita y se dispara el guardado.
  notasCliente?: string | null;
  onGuardarNotas?: (texto: string) => void;
  guardandoNotas?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [ayudaAbierta, setAyudaAbierta] = useState(false);
  const [ed, setEd] = useState<SpecCarga>(spec);
  const [fragmentosTexto, setFragmentosTexto] = useState(spec.columnas.codigoFragmentos.join(", "));
  const [notas, setNotas] = useState(notasCliente ?? "");
  // Sincroniza las notas locales cuando cambia el cliente (o tras guardar/refrescar).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setNotas(notasCliente ?? ""); }, [notasCliente]);

  // Opciones de columna: hasta donde llegue el encabezado o la columna más alta ya asignada.
  const columnasAsignadas = Object.values(ed.columnas).flatMap((v) => Array.isArray(v) ? v : [v]);
  const maxCol = Math.max(encabezados.length, ...columnasAsignadas, ed.reglaDetalle.columna ?? 0, 6);
  const opciones = Array.from({ length: maxCol }, (_, i) => i + 1);
  const etiquetaCol = (n: number) => {
    const enc = encabezados[n - 1];
    return enc ? `${columnaLetra(n - 1)} — ${recortar(enc, 24)}` : columnaLetra(n - 1);
  };

  const setCol = (key: RolColumna, v: number) => {
    if (key === "codigo" && v > 0) setFragmentosTexto("");
    setEd((s) => ({
      ...s,
      columnas: {
        ...s.columnas,
        [key]: v,
        ...(key === "codigo" && v > 0 ? { codigoFragmentos: [] } : {}),
      },
    }));
  };
  const setCodigoFragmentos = (texto: string) => {
    setFragmentosTexto(texto);
    const fragmentos = [...new Set(texto.split(/[\s,;]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    setEd((s) => ({
      ...s,
      columnas: { ...s.columnas, codigo: fragmentos.length > 0 ? 0 : s.columnas.codigo, codigoFragmentos: fragmentos },
    }));
  };
  const sinCambios = JSON.stringify(ed) === JSON.stringify(spec);

  return (
    <div className="rounded-md border border-ink-150">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls="ajustes-estructura-balance"
        className="flex w-full items-center justify-between px-3 py-2 text-[12px] font-semibold text-ink-600 hover:bg-ink-50"
      >
        <span className="inline-flex items-center gap-1.5">
          <Icon name="doc" size={13} /> Ajustar estructura del archivo
        </span>
        <Icon name={chevronDivulgacion(abierto)} size={12} className="text-ink-400" />
      </button>
      {abierto && (
        <div id="ajustes-estructura-balance" className="flex flex-col gap-3 border-t border-ink-100 px-3 py-3">
          <p className="text-[11.5px] leading-relaxed text-ink-500">
            Corrige qué columna corresponde a cada dato y reprocesa al instante — <span className="font-semibold">sin IA</span>.
            Marca «no existe» cuando el archivo no trae esa columna.
          </p>

          <button
            type="button"
            onClick={() => setAyudaAbierta((v) => !v)}
            aria-expanded={ayudaAbierta}
            aria-controls="guia-campos-balance"
            className="inline-flex w-fit items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11.5px] font-semibold text-blue-700 hover:bg-blue-100"
          >
            <Icon name="doc" size={12} /> Guía detallada de los campos
            <Icon name={chevronDivulgacion(ayudaAbierta)} size={12} />
          </button>
          {ayudaAbierta && (
            <div id="guia-campos-balance" className="flex flex-col gap-3 rounded-md border border-blue-100 bg-blue-50/40 px-3 py-3 text-[11.5px] leading-relaxed text-ink-600">
              <div>
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-blue-700">Para qué sirve</div>
                <p>Reprocesa el archivo con el mapa de columnas corregido, <span className="font-semibold">sin IA y al instante</span>. Úsalo cuando la lectura automática asignó mal una columna, la fila del encabezado, el signo del crédito o cómo se detecta el detalle. No modifica el archivo original: genera una lectura nueva que reemplaza a la anterior.</p>
              </div>
              <div>
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-blue-700">Dónde están los datos</div>
                <dl className="flex flex-col gap-1">
                  <div><dt className="inline font-semibold">Hoja:</dt> <dd className="inline">la pestaña del Excel donde está el balance. En archivos con varias hojas, elige la correcta.</dd></div>
                  <div><dt className="inline font-semibold">Fila del encabezado:</dt> <dd className="inline">número de fila (empezando en 1) donde están los <span className="italic">títulos</span> de las columnas («Código», «Nombre», «Débito»…). Si el archivo trae logo o título arriba, no es la fila 1.</dd></div>
                  <div><dt className="inline font-semibold">Primera fila de datos:</dt> <dd className="inline">la primera fila con una cuenta real, justo debajo del encabezado.</dd></div>
                </dl>
              </div>
              <div>
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-blue-700">Columnas por rol (elige la letra, o «no existe»)</div>
                <dl className="flex flex-col gap-1">
                  <div><dt className="inline font-semibold">Código de cuenta *:</dt> <dd className="inline">(obligatoria) la columna con el código PUC (<span className="font-mono">1105</span>, <span className="font-mono">110505</span>…). Si el código viene partido en varias columnas, déjala en «usa columnas fragmentadas» y usa el campo de más abajo.</dd></div>
                  <div><dt className="inline font-semibold">Nombre de la cuenta:</dt> <dd className="inline">la descripción de la cuenta («CAJA GENERAL»).</dd></div>
                  <div><dt className="inline font-semibold">Saldo inicial:</dt> <dd className="inline">el saldo anterior, al inicio del período.</dd></div>
                  <div><dt className="inline font-semibold">Débitos / Créditos:</dt> <dd className="inline">los movimientos débito y crédito del período.</dd></div>
                  <div><dt className="inline font-semibold">Saldo final (una columna):</dt> <dd className="inline">úsala cuando el saldo final viene en <span className="font-semibold">una sola</span> columna. En ese caso deja «no existe» las dos de abajo.</dd></div>
                  <div><dt className="inline font-semibold">Saldo final · débito / · crédito:</dt> <dd className="inline">úsalas cuando el saldo final viene en <span className="font-semibold">dos</span> columnas separadas (una para saldos débito y otra para crédito). Entonces deja «no existe» el «saldo final (una columna)».</dd></div>
                  <div><dt className="inline font-semibold">Tercero / NIT:</dt> <dd className="inline">la columna del NIT/cédula del tercero (en balances por tercero). «no existe» si el archivo no la trae.</dd></div>
                </dl>
              </div>
              <div>
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-blue-700">Casos especiales</div>
                <dl className="flex flex-col gap-1">
                  <div><dt className="inline font-semibold">Columnas del código fragmentado:</dt> <dd className="inline">cuando el código no está en una columna, sino repartido (col 1 = «11», col 2 = «05», col 3 = «05»). Escribe los números de columna separados por coma (<span className="font-mono">1, 2, 3</span>): se concatenan en orden para formar el código.</dd></div>
                  <div><dt className="inline font-semibold">Convención del crédito:</dt> <dd className="inline"><span className="font-semibold">Magnitud</span> = débitos y créditos vienen como positivos (lo normal). <span className="font-semibold">Firmado</span> = el archivo trae los créditos con signo negativo.</dd></div>
                  <div><dt className="inline font-semibold">Detección de cuentas de detalle:</dt> <dd className="inline"><span className="font-semibold">Por jerarquía de códigos (auto)</span> decide qué cuenta es de movimiento por la longitud/jerarquía del código PUC. <span className="font-semibold">Por columna marcadora</span> se usa cuando el archivo tiene una columna que marca el detalle (p. ej. «I» o «1»): eliges la columna y el valor que lo marca. <span className="font-semibold">Todas son movimiento</span> cuando el archivo trae una lista plana de cuentas imputables sin agrupadoras (ninguna se agrupa).</dd></div>
                  <div><dt className="inline font-semibold">Agregar por tercero:</dt> <dd className="inline">en balances abiertos por tercero, suma los terceros y deja el saldo a nivel de cuenta.</dd></div>
                </dl>
              </div>
              <div>
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-blue-700">Cómo aplicarlo</div>
                <p>Ajusta lo que esté mal y pulsa <span className="font-semibold">«Reprocesar sin IA»</span>: el resultado se recalcula al instante, sin costo de IA. <span className="font-semibold">«Guardar perfil (sin reprocesar)»</span> memoriza esta estructura como perfil del cliente para futuras cargas del mismo layout, sin volver a leer el archivo (útil cuando el resultado ya está bien y solo quieres dejar el ajuste). <span className="font-semibold">«Restablecer»</span> vuelve al mapa detectado originalmente. En la página del borrador, además debes <span className="font-semibold">re-adjuntar el archivo original</span> antes de reprocesar (esa página no conserva el archivo).</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Hoja</span>
              <select
                value={ed.hoja}
                onChange={(e) => setEd((s) => ({ ...s, hoja: e.target.value }))}
                className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px] text-ink-700"
              >
                {(hojas.length > 0 ? hojas : [ed.hoja]).map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Fila del encabezado</span>
              <input
                type="number" min={1} value={ed.filaEncabezado}
                onChange={(e) => setEd((s) => ({ ...s, filaEncabezado: Math.max(1, Number(e.target.value) || 1) }))}
                className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px] text-ink-700"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Primera fila de datos</span>
              <input
                type="number" min={2} value={ed.primeraFilaDatos}
                onChange={(e) => setEd((s) => ({ ...s, primeraFilaDatos: Math.max(1, Number(e.target.value) || 1) }))}
                className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px] text-ink-700"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {ROLES_COLUMNA.map((rol) => (
              <label key={rol.key} className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-ink-600">
                  {rol.label}
                  {rol.requerida && <span className="text-err-600"> *</span>}
                </span>
                <select
                  value={ed.columnas[rol.key]}
                  onChange={(e) => setCol(rol.key, Number(e.target.value))}
                  className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px] text-ink-700"
                >
                  {(!rol.requerida || rol.key === "codigo") && (
                    <option value={0}>{rol.key === "codigo" ? "— usa columnas fragmentadas —" : "— no existe —"}</option>
                  )}
                  {opciones.map((n) => (
                    <option key={n} value={n}>{etiquetaCol(n)}</option>
                  ))}
                </select>
              </label>
            ))}
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[11px] font-medium text-ink-600">Columnas del código fragmentado</span>
              <input
                type="text"
                value={fragmentosTexto}
                onChange={(e) => setCodigoFragmentos(e.target.value)}
                placeholder="Ej.: 1, 2, 3, 4, 5"
                className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px] text-ink-700"
              />
              <span className="text-[10.5px] text-ink-400">Úsalo cuando GRUPO, CUENTA, SUBCUENTA y AUXILIAR vienen en columnas separadas.</span>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Convención del crédito</span>
              <select
                value={ed.signoCredito}
                onChange={(e) => setEd((s) => ({ ...s, signoCredito: e.target.value === "magnitud" ? "magnitud" : "firmado" }))}
                className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px] text-ink-700"
              >
                <option value="firmado">Firmado (crédito negativo)</option>
                <option value="magnitud">Magnitud (todo positivo)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Detección de cuentas de detalle</span>
              <select
                value={ed.reglaDetalle.tipo}
                onChange={(e) => setEd((s) => {
                  const v = e.target.value;
                  const reglaDetalle = v === "columna"
                    ? { tipo: "columna" as const, columna: s.reglaDetalle.columna ?? 1, valor: s.reglaDetalle.valor ?? "" }
                    : v === "movimiento"
                      ? { tipo: "movimiento" as const, columna: null, valor: null }
                      : { tipo: "prefijo" as const, columna: null, valor: null };
                  return { ...s, reglaDetalle };
                })}
                className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px] text-ink-700"
              >
                <option value="prefijo">Por jerarquía de códigos (auto)</option>
                <option value="columna">Por columna marcadora</option>
                <option value="movimiento">Todas son movimiento (lista plana, sin agrupadoras)</option>
              </select>
            </label>
            <label className="flex items-end gap-2 pb-1.5">
              <input
                type="checkbox"
                checked={ed.agregarPorTercero}
                onChange={(e) => setEd((s) => ({ ...s, agregarPorTercero: e.target.checked }))}
              />
              <span className="text-[11.5px] text-ink-600">Agregar por tercero (sumar por cuenta)</span>
            </label>
          </div>

          {ed.reglaDetalle.tipo === "columna" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-ink-600">Columna marcadora</span>
                <select
                  value={ed.reglaDetalle.columna ?? 1}
                  onChange={(e) => setEd((s) => ({ ...s, reglaDetalle: { ...s.reglaDetalle, columna: Number(e.target.value) } }))}
                  className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px] text-ink-700"
                >
                  {opciones.map((n) => (
                    <option key={n} value={n}>{etiquetaCol(n)}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-ink-600">Valor que marca el detalle (p. ej. «I», «1»)</span>
                <input
                  type="text" value={ed.reglaDetalle.valor ?? ""}
                  onChange={(e) => setEd((s) => ({ ...s, reglaDetalle: { ...s.reglaDetalle, valor: e.target.value } }))}
                  className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px] text-ink-700"
                />
              </label>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={reprocesando || sinCambios}
              onClick={() => onAplicar(ed)}
              className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
            >
              {reprocesando ? <EstadoProcesando>Reprocesando</EstadoProcesando> : "Reprocesar sin IA"}
            </button>
            {onGuardar && (
              <button
                type="button"
                disabled={guardando || reprocesando}
                onClick={() => onGuardar(ed)}
                title="Guarda esta estructura como perfil del cliente (para futuras cargas del mismo layout), sin reprocesar el archivo."
                className="rounded-md border border-ok-300 bg-ok-100/40 px-3 py-1.5 text-[12px] font-semibold text-ok-700 hover:bg-ok-100 disabled:opacity-60"
              >
                {guardando ? <EstadoProcesando>Guardando</EstadoProcesando> : "Guardar perfil (sin reprocesar)"}
              </button>
            )}
            <button
              type="button"
              disabled={reprocesando || sinCambios}
              onClick={() => setEd(spec)}
              className="rounded-md border border-ink-200 px-3 py-1.5 text-[12px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-60"
            >
              Restablecer
            </button>
          </div>

          {onGuardarNotas && (
            <div className="mt-3 border-t border-ink-100 pt-3">
              <div className="text-[12px] font-semibold text-ink-700">Notas / observaciones de carga del cliente</div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500">
                Particularidades del formato de este cliente para recordar en cada carga (p. ej. «duplica renglones UC/CU — se omite uno»). Se guardan por cliente y aparecen al cargar y revisar; no cambian el cálculo.
              </p>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Sin notas para este cliente."
                className="mt-1.5 w-full resize-y rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] leading-relaxed text-ink-700 outline-none focus:border-blue-400"
              />
              <button
                type="button"
                disabled={guardandoNotas || notas.trim() === (notasCliente ?? "").trim()}
                onClick={() => onGuardarNotas(notas.trim())}
                className="mt-2 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-[12px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
              >
                {guardandoNotas ? <EstadoProcesando>Guardando</EstadoProcesando> : "Guardar notas del cliente"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Muestra compacta; el borrador persistido conserva todas las cuentas. */
function DetalleMovimiento({
  cuentas,
  totalCuentas,
}: {
  cuentas: SugerenciaBalance["render"]["importReady"];
  totalCuentas: number;
}) {
  const esMuestra = cuentas.length < totalCuentas;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
        Movimiento en borrador · {totalCuentas} cuenta(s)
        {esMuestra ? ` · muestra de ${cuentas.length}` : ""}
      </div>
      <div className="max-h-72 overflow-auto rounded-md border border-ink-150">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-ink-50 text-ink-500">
            <tr className="text-left">
              <th className="px-2 py-1.5 font-semibold">Código</th>
              <th className="px-2 py-1.5 font-semibold">Cuenta</th>
              <th className="px-2 py-1.5 text-right font-semibold">Saldo ant.</th>
              <th className="px-2 py-1.5 text-right font-semibold">Débito</th>
              <th className="px-2 py-1.5 text-right font-semibold">Crédito</th>
              <th className="px-2 py-1.5 text-right font-semibold">Saldo act.</th>
            </tr>
          </thead>
          <tbody>
            {cuentas.map((c, i) => (
              <tr key={`${c.code}-${i}`} className="border-t border-ink-100">
                <td className="whitespace-nowrap px-2 py-1 font-mono text-ink-500">{c.code}</td>
                <td className="max-w-[220px] truncate px-2 py-1 text-ink-700" title={c.name}>{c.name}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-ink-600">{fmt(c.prevBalance)}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-ink-600">{fmt(c.debitos ?? 0)}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-ink-600">{fmt(c.creditos ?? 0)}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right font-medium tabular-nums text-ink-800">{fmt(c.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExcepcionesTabla({ excepciones }: { excepciones: Excepcion[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-semibold text-warn-700">{excepciones.length} excepción(es) — filas/datos que la lectura marcó para revisar:</span>
      <div className="max-h-60 overflow-y-auto rounded-md border border-ink-150">
        <table className="w-full text-[11.5px]">
          <thead className="sticky top-0 bg-ink-50 text-ink-500">
            <tr className="text-left">
              <th className="px-2.5 py-1.5 font-semibold">Fila</th>
              <th className="px-2.5 py-1.5 font-semibold">Regla / conflicto</th>
              <th className="px-2.5 py-1.5 font-semibold">Acción</th>
            </tr>
          </thead>
          <tbody>
            {excepciones.map((e, i) => (
              <tr key={i} className="border-t border-ink-100 align-top">
                <td className="px-2.5 py-1.5 font-mono text-ink-500">{e.fila ?? "—"}</td>
                <td className="px-2.5 py-1.5 text-ink-700">
                  {e.regla}
                  {e.valor && <span className="block font-mono text-[10.5px] text-ink-400">{e.valor}</span>}
                </td>
                <td className="px-2.5 py-1.5 text-ink-500">{e.accion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ErroresTabla({ errores }: { errores: NonNullable<ImportBalanceState["errores"]> }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-semibold text-err-700">{errores.length} problema(s) en el archivo — nada se leyó:</span>
      <div className="max-h-60 overflow-y-auto rounded-md border border-ink-150">
        <table className="w-full text-[11.5px]">
          <thead className="sticky top-0 bg-ink-50 text-ink-500">
            <tr className="text-left">
              <th className="px-2.5 py-1.5 font-semibold">Fila</th>
              <th className="px-2.5 py-1.5 font-semibold">Problema</th>
            </tr>
          </thead>
          <tbody>
            {errores.map((e, i) => (
              <tr key={i} className="border-t border-ink-100">
                <td className="px-2.5 py-1.5 font-mono text-ink-500">{e.fila || "—"}</td>
                <td className="px-2.5 py-1.5 text-ink-700">{e.mensaje}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Selector de hoja (Excel multi-hoja): pestañas + vista previa de la elegida. */
function SelectorHojas({
  hojas,
  elegida,
  onElegir,
}: {
  hojas: HojaPreview[];
  elegida: string | null;
  onElegir: (nombre: string) => void;
}) {
  const activa = hojas.find((h) => h.nombre === elegida) ?? null;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-warn-100 bg-warn-100/30 px-3 py-2.5">
      <p className="text-[12px] leading-relaxed text-warn-700">
        Este archivo tiene <span className="font-semibold">{hojas.length} hojas</span>. Selecciona cuál es el balance
        que quieres cargar — <span className="font-semibold">la IA no elegirá por ti</span>.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {hojas.map((h) => {
          const on = h.nombre === elegida;
          return (
            <button
              key={h.nombre}
              type="button"
              onClick={() => onElegir(h.nombre)}
              className={`rounded-md border px-2.5 py-1 text-[11.5px] font-medium transition ${
                on ? "border-navy-700 bg-navy-700 text-white" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
              }`}
            >
              {h.nombre} <span className={on ? "text-white/90" : "text-ink-400"}>· {h.totalFilas} fila(s)</span>
            </button>
          );
        })}
      </div>
      {activa ? (
        <PreviewHoja hoja={activa} />
      ) : (
        <p className="rounded-md border border-dashed border-ink-200 bg-white px-3 py-4 text-center text-[11.5px] text-ink-400">
          Elige una hoja para ver su contenido y poder cargarla.
        </p>
      )}
    </div>
  );
}

/** Mini-tabla tipo Excel: primeras filas × columnas (A, B, C…) de la hoja. */
function PreviewHoja({ hoja }: { hoja: HojaPreview }) {
  const numCols = Math.min(8, Math.max(1, hoja.totalColumnas));
  const cols = Array.from({ length: numCols }, (_, j) => j);
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">Vista previa de «{hoja.nombre}»</div>
      <div className="max-h-56 overflow-auto rounded-md border border-ink-150 bg-white">
        <table className="border-collapse text-[11px]">
          <thead className="sticky top-0 z-10 bg-ink-50 text-ink-400">
            <tr>
              <th className="border-b border-r border-ink-100 px-2 py-1 text-right font-semibold">#</th>
              {cols.map((j) => (
                <th key={j} className="border-b border-ink-100 px-2 py-1 text-left font-semibold">{columnaLetra(j)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hoja.muestra.map((fila, i) => (
              <tr key={i} className="even:bg-ink-50/40">
                <td className="border-r border-ink-100 px-2 py-1 text-right font-mono text-ink-400">{i + 1}</td>
                {cols.map((j) => (
                  <td key={j} className="whitespace-nowrap px-2 py-1 text-ink-700">{celdaTexto(fila[j] ?? null)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[10.5px] text-ink-400">
        Mostrando {hoja.muestra.length} de {hoja.totalFilas} fila(s)
        {hoja.totalColumnas > numCols && ` · ${hoja.totalColumnas} columnas en total`}
      </div>
    </div>
  );
}

function celdaTexto(c: CeldaCruda): string {
  if (c == null || c === "") return "";
  const s = String(c).replace(/\s+/g, " ").trim();
  return s.length > 28 ? `${s.slice(0, 28)}…` : s;
}

function recortar(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
