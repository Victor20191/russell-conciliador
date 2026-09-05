export type EstadoDeGuardado = "inactivo" | "pendiente" | "guardando" | "guardado" | "error";

export type SnapshotGuardado = {
  estado: EstadoDeGuardado;
  mensaje: string | null;
};

type ResultadoGuardado = { ok?: boolean; message?: string };
type MensajesGuardado = { exito: string; error: string };

/** Solo confirma cuando finalizaron todos los envíos y la edición sigue vigente. */
export function crearEstadoGuardado() {
  let snapshot: SnapshotGuardado = { estado: "inactivo", mensaje: null };
  let revision = 0;
  let enVuelo = 0;
  let error: string | null = null;
  let confirmacion: { revision: number; mensaje: string } | null = null;
  const oyentes = new Set<() => void>();

  function publicar(estado: EstadoDeGuardado, mensaje: string | null = null) {
    snapshot = { estado, mensaje };
    oyentes.forEach((oyente) => oyente());
  }

  function actualizar() {
    if (error) publicar("error", error);
    else if (enVuelo > 0) publicar("guardando");
    else if (confirmacion?.revision === revision) publicar("guardado", confirmacion.mensaje);
    else publicar("pendiente");
  }

  return {
    obtenerSnapshot: () => snapshot,
    suscribir(oyente: () => void) {
      oyentes.add(oyente);
      return () => { oyentes.delete(oyente); };
    },
    descartar() {
      revision++;
      // Un error sigue visible hasta que se intente guardar de nuevo.
      publicar(error ? "error" : "pendiente", error);
    },
    async ejecutar<T extends ResultadoGuardado>(
      operacion: () => Promise<T>,
      mensajes: MensajesGuardado,
    ): Promise<T | null> {
      const revisionEnviada = revision;
      if (enVuelo === 0) {
        error = null;
        confirmacion = null;
      }
      enVuelo++;
      actualizar();
      let resultado: T | null = null;
      try {
        resultado = await operacion();
        if (resultado?.ok === true) {
          if (revisionEnviada === revision) {
            confirmacion = { revision: revisionEnviada, mensaje: mensajes.exito };
          }
        } else {
          error = resultado?.message || mensajes.error;
        }
      } catch {
        error = mensajes.error;
      } finally {
        enVuelo--;
        actualizar();
      }
      return resultado;
    },
  };
}
