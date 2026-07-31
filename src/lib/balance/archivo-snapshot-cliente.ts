/**
 * Copia estable del archivo seleccionado. El `File` del input puede quedar
 * inutilizable después de enviarlo en un FormData a una Server Action; estos
 * bytes nunca se transfieren y permiten construir un File nuevo en cada envío.
 */
export type ArchivoSnapshotCliente = {
  nombre: string;
  tipo: string;
  ultimaModificacion: number;
  contenido: Uint8Array;
};

export async function capturarArchivoSnapshotCliente(
  archivo: File,
): Promise<ArchivoSnapshotCliente> {
  const contenido = new Uint8Array(await archivo.arrayBuffer());
  return {
    nombre: archivo.name,
    tipo: archivo.type,
    ultimaModificacion: archivo.lastModified,
    contenido,
  };
}

export function reconstruirArchivoDesdeSnapshot(
  snapshot: ArchivoSnapshotCliente,
): File {
  // Copia explícita: el Blob/File construido nunca comparte el buffer que
  // conservamos para reintentos o continuaciones posteriores.
  const contenido = new Uint8Array(snapshot.contenido.byteLength);
  contenido.set(snapshot.contenido);
  return new File([contenido.buffer], snapshot.nombre, {
    type: snapshot.tipo,
    lastModified: snapshot.ultimaModificacion,
  });
}
