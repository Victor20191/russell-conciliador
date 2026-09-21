// Cabeceras de DESCARGA de un archivo del almacén (original de un cargue, muestra de un patrón):
// nombre seguro para Content-Disposition y tipo de contenido validado. Puro, sin BD.
import { nombreArchivoOriginalSeguro, tipoContenidoArchivo } from "@/lib/modulos/archivo-original";

/** Copia propia del binario para que `Response` no reciba un buffer compartido. */
export function cuerpoBinario(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

function codificarRfc5987(valor: string): string {
  return encodeURIComponent(valor).replace(/[!'()*]/g, (caracter) =>
    `%${caracter.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function contentDispositionSeguro(nombreOriginal: string): string {
  const nombreSeguro = nombreArchivoOriginalSeguro(nombreOriginal);
  const nombreAscii = nombreSeguro
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_")
    .trim() || "archivo-original";

  return `attachment; filename="${nombreAscii}"; filename*=UTF-8''${codificarRfc5987(nombreSeguro)}`;
}

export function tipoContenidoRespuesta(
  nombreArchivo: string,
  almacenado: string | null,
  objeto: string,
): string {
  const candidatos = [almacenado, objeto, tipoContenidoArchivo(nombreArchivo)];
  const tipoValido = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*(?:;\s*charset=[a-z0-9._-]+)?$/i;
  return candidatos.find((tipo) => tipo && tipoValido.test(tipo.trim()))?.trim()
    ?? "application/octet-stream";
}
