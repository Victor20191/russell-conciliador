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
 * Sube el archivo en fragmentos pequeños y reintentables. Ninguna petición lleva
 * el balance completo, por lo que funciona detrás del límite de payload de Vercel.
 */
export async function cargarArchivoBalanceTemporal(
  archivo: File,
  loteId: string,
  onProgress?: (porcentaje: number) => void,
): Promise<void> {
  const inicio = await respuestaJson(await fetch("/api/balance/archivo-temporal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    body: JSON.stringify({ operacion: "completar", loteId }),
  }));
}
