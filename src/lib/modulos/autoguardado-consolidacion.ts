// Autoguardado del Consolidado de módulos (hoy solo Inventarios). Controlador PURO
// (sin BD, sin React, sin `fetch`): recibe una función `guardarLote` inyectada y decide
// CUÁNDO y QUÉ enviar. La UI solo llama `programar()` en cada edición explícita del
// usuario y se suscribe al snapshot para pintar Guardando/Guardado/Error.
//
// Reglas de diseño (todas verificadas en el test):
//  - Debounce: cada `programar()` reinicia una pausa corta; solo al vencer sin nuevas
//    ediciones se arma UN lote con TODO lo pendiente (batching → menos peticiones).
//  - Una sola solicitud en vuelo: si llega una edición mientras el lote viaja, NO se
//    pisa ni se pierde — queda en `pendientes` y sale en cuanto la solicitud actual
//    termina (sin esperar otra pausa).
//  - Si el usuario reeditó el MISMO clasificador durante el viaje, se conserva y
//    reenvía su valor más reciente (nunca el que ya quedó obsoleto).
//  - En error, las ediciones NO se descartan: quedan pendientes para `intentarAhora()`
//    (reintento explícito) o se combinan solas con la próxima edición del usuario.
//  - Nunca se dispara nada al programar el conjunto vacío inicial: `programar()` es
//    la ÚNICA puerta de entrada y la UI decide cuándo llamarla (nunca al montar).

export type FilaConsolidacion = { clasificador: string; cuentas4: string[] };

export type ResultadoGuardarLoteConsolidacion = { ok: boolean; message?: string };

export type GuardarLoteConsolidacion = (
  filas: FilaConsolidacion[],
) => Promise<ResultadoGuardarLoteConsolidacion>;

export type EstadoAutoguardadoConsolidacion = "inactivo" | "pendiente" | "guardando" | "guardado" | "error";

export type SnapshotAutoguardadoConsolidacion = {
  estado: EstadoAutoguardadoConsolidacion;
  mensaje: string | null;
  /** Clasificadores con un valor aún no confirmado por el servidor. */
  pendientes: number;
};

export type TemporizadorAutoguardado = {
  fijar: (cb: () => void, ms: number) => number;
  cancelar: (id: number) => void;
};

export type OpcionesAutoguardadoConsolidacion = {
  guardarLote: GuardarLoteConsolidacion;
  /** Pausa antes de armar el lote, en ms. Fábrica: 1200. */
  debounceMs?: number;
  /** Inyectable en pruebas para no depender de temporizadores reales del entorno. */
  temporizador?: TemporizadorAutoguardado;
};

export type ControladorAutoguardadoConsolidacion = {
  /** Registra el valor DESEADO final de un clasificador (no incremental) y reinicia la pausa. */
  programar(clasificador: string, cuentas4: string[]): void;
  actualizarGuardado(guardarLote: GuardarLoteConsolidacion): void;
  /**
   * Cancela la pausa pendiente y envía de inmediato lo que haya en `pendientes`, si no hay
   * ya una solicitud en vuelo. Es el mismo mecanismo para el botón «Reintentar» (tras un
   * error) y para el guardián de navegación (pestaña oculta / a punto de cerrarse).
   */
  intentarAhora(): void;
  suscribir(oyente: () => void): () => void;
  obtenerSnapshot(): SnapshotAutoguardadoConsolidacion;
  /** Cancela el temporizador pendiente. No cancela una solicitud ya en vuelo. */
  destruir(): void;
};

const DEBOUNCE_MS_FABRICA = 1200;

const temporizadorGlobal: TemporizadorAutoguardado = {
  fijar: (cb, ms) => setTimeout(cb, ms) as unknown as number,
  cancelar: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
};

function mismasCuentas(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const oa = [...a].sort();
  const ob = [...b].sort();
  return oa.every((v, i) => v === ob[i]);
}

export function crearAutoguardadoConsolidacion(
  opciones: OpcionesAutoguardadoConsolidacion,
): ControladorAutoguardadoConsolidacion {
  let guardarLote = opciones.guardarLote;
  const debounceMs = opciones.debounceMs ?? DEBOUNCE_MS_FABRICA;
  const temporizador = opciones.temporizador ?? temporizadorGlobal;

  /** clasificador → última cuentas4 deseada, aún NO confirmada por el servidor. */
  const pendientes = new Map<string, string[]>();
  /** Instantánea exacta que viaja en la solicitud actual (null = nada en vuelo). */
  let enVuelo: Map<string, string[]> | null = null;
  let timerId: number | null = null;
  let estado: EstadoAutoguardadoConsolidacion = "inactivo";
  let mensaje: string | null = null;
  let destruido = false;
  const oyentes = new Set<() => void>();

  let snapshot: SnapshotAutoguardadoConsolidacion = { estado, mensaje, pendientes: 0 };
  const notificar = () => {
    snapshot = { estado, mensaje, pendientes: pendientes.size };
    for (const oyente of oyentes) oyente();
  };

  const limpiarTemporizador = () => {
    if (timerId != null) { temporizador.cancelar(timerId); timerId = null; }
  };

  function reiniciarPausa() {
    limpiarTemporizador();
    timerId = temporizador.fijar(() => {
      timerId = null;
      intentarEnviar();
    }, debounceMs);
  }

  function intentarEnviar() {
    if (destruido) return;
    if (enVuelo != null) return; // ya hay una solicitud en curso: se reintenta sola al terminar
    if (pendientes.size === 0) return;

    const lote = new Map(pendientes);
    enVuelo = lote;
    estado = "guardando";
    mensaje = null;
    notificar();

    const filas: FilaConsolidacion[] = [...lote.entries()].map(([clasificador, cuentas4]) => ({ clasificador, cuentas4 }));

    guardarLote(filas)
      .then((resultado) => {
        if (destruido) return;
        enVuelo = null;
        if (resultado.ok) {
          // Confirma SOLO lo que no cambió mientras viajaba; lo reeditado durante el
          // viaje se conserva con su valor MÁS RECIENTE para el siguiente envío. En un
          // error NO se toca `pendientes`: nada de lo enviado quedó guardado.
          for (const [clasificador, enviadas] of lote) {
            const actual = pendientes.get(clasificador);
            if (actual && mismasCuentas(actual, enviadas)) pendientes.delete(clasificador);
          }
          if (pendientes.size > 0) {
            estado = "pendiente";
            notificar();
            intentarEnviar(); // lo acumulado durante el viaje sale ya, sin esperar otra pausa
          } else {
            estado = "guardado";
            mensaje = resultado.message ?? null;
            notificar();
          }
        } else {
          estado = "error";
          mensaje = resultado.message ?? "No se pudo guardar.";
          notificar();
        }
      })
      .catch((error: unknown) => {
        if (destruido) return;
        enVuelo = null;
        estado = "error";
        mensaje = error instanceof Error ? error.message : "No se pudo guardar.";
        notificar();
      });
  }

  return {
    actualizarGuardado(nuevoGuardarLote) { guardarLote = nuevoGuardarLote; },
    programar(clasificador, cuentas4) {
      if (destruido) return;
      pendientes.set(clasificador, [...cuentas4]);
      estado = "pendiente";
      mensaje = null;
      notificar();
      reiniciarPausa();
    },
    intentarAhora() {
      if (destruido) return;
      limpiarTemporizador();
      intentarEnviar();
    },
    suscribir(oyente) {
      oyentes.add(oyente);
      return () => { oyentes.delete(oyente); };
    },
    obtenerSnapshot() {
      return snapshot;
    },
    destruir() {
      destruido = true;
      limpiarTemporizador();
      oyentes.clear();
    },
  };
}
