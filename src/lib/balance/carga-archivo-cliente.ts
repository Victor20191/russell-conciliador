type RespuestaCarga = {
  ok: boolean;
  message?: string;
  tamanoParte?: number;
  totalPartes?: number;
};

async function respuestaJson(response: Response): Promise<RespuestaCarga> {
  const data = await response.json().catch(() => ({})) as RespuestaCarga;
  if (!response.ok || !data.ok) {
    throw new Error(data.message ?? "No se pudo transferir el archivo del balance.");
  }
  return data;
}

/**
 * ¿El fallo viene de un `AbortController` (el usuario canceló) y no de la red?
 * Se distingue para NO mostrar el aviso de error de una cancelación deliberada.
 */
export function esCancelacionCarga(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

/**
 * Sube el archivo en fragmentos pequeños y reintentables. Ninguna petición lleva
 * el balance completo, por lo que funciona detrás del límite de payload de Vercel.
 *
 * `signal` permite CANCELAR la subida en curso: aborta las peticiones vivas y
 * lanza `AbortError` (reconocible con `esCancelacionCarga`).
 */
export async function cargarArchivoBalanceTemporal(
  archivo: File,
  loteId: string,
  onProgress?: (porcentaje: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const inicio = await respuestaJson(await fetch("/api/balance/archivo-temporal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      operacion: "iniciar",
      loteId,
      nombreArchivo: archivo.name,
      tipoContenido: archivo.type || "application/octet-stream",
      tamanoBytes: archivo.size,
    }),
  }));
  const tamanoParte = inicio.tamanoParte ?? 0;
  const totalPartes = inicio.totalPartes ?? 0;
  if (tamanoParte <= 0 || totalPartes <= 0) {
    throw new Error("El servidor no pudo preparar los fragmentos del archivo.");
  }

  let siguiente = 1;
  let completadas = 0;
  const subirSiguiente = async (): Promise<void> => {
    while (true) {
      const numero = siguiente++;
      if (numero > totalPartes) return;
      const desde = (numero - 1) * tamanoParte;
      const hasta = Math.min(archivo.size, desde + tamanoParte);
      const response = await fetch(
        `/api/balance/archivo-temporal/${encodeURIComponent(loteId)}/${numero}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          signal,
          body: archivo.slice(desde, hasta),
        },
      );
      await respuestaJson(response);
      completadas += 1;
      onProgress?.(Math.round((completadas / totalPartes) * 100));
    }
  };

  // Tres fragmentos simultáneos reducen la latencia sin saturar PostgreSQL.
  await Promise.all(Array.from({ length: Math.min(3, totalPartes) }, subirSiguiente));
  await respuestaJson(await fetch("/api/balance/archivo-temporal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ operacion: "completar", loteId }),
  }));
}

/**
 * Libera el archivo temporal de una lectura cancelada. Best-effort: si falla, el
 * purgado por vigencia (2 h) lo recoge igual, así que NUNCA lanza ni interrumpe
 * la cancelación. `keepalive` la deja terminar aunque la pestaña se cierre.
 */
export async function cancelarArchivoBalanceTemporal(loteId: string): Promise<void> {
  try {
    await fetch("/api/balance/archivo-temporal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ operacion: "cancelar", loteId }),
    });
  } catch {
    /* el archivo temporal expira solo; la cancelación no depende de esto */
  }
}
