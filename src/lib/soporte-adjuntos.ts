import { detectarTipoImagen, mimeDeTipo } from "@/lib/avatares";
import { ADJUNTO_DOCUMENTO_MAX_BYTES, ADJUNTO_MAX_BYTES } from "@/lib/soporte-estados";
import { detectarTipoSoporteMarca, extensionDeNombre } from "@/lib/modulos/marcas-adjuntos";

export type TipoImagenAdjunto = "jpg" | "png" | "webp" | "gif" | "svg";
export type TipoDocumentoAdjunto = "pdf" | "xlsx" | "xls" | "txt";
export type TipoAdjunto = TipoImagenAdjunto | TipoDocumentoAdjunto;

const MIME_DOCUMENTO: Record<TipoDocumentoAdjunto, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  txt: "text/plain; charset=utf-8",
};

export function esDocumentoAdjunto(tipo: TipoAdjunto): tipo is TipoDocumentoAdjunto {
  return tipo in MIME_DOCUMENTO;
}

export type ValidacionAdjunto =
  | { ok: true; tipo: TipoAdjunto; contentType: string }
  | { ok: false; error: string };

function sinBom(bytes: Uint8Array): Uint8Array {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.subarray(3);
  }
  return bytes;
}

function esGif(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  );
}

function esSvg(bytes: Uint8Array): boolean {
  const cabeza = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 512)).trim();
  return /<svg[\s>]/i.test(cabeza) || /<\?xml[\s\S]{0,200}<svg[\s>]/i.test(cabeza);
}

export function detectarTipoAdjunto(bytes: Uint8Array, nombre = ""): TipoAdjunto | null {
  // PDF y Excel se reconocen por su firma (el Excel desempata con la extensión);
  // el texto plano no tiene firma y se acepta por extensión si el contenido es texto.
  const extension = extensionDeNombre(nombre);
  const documento = detectarTipoSoporteMarca(bytes, extension === "txt" ? "txt" : extension);
  if (documento === "pdf" || documento === "xlsx" || documento === "xls") return documento;
  if (documento === "csv" && extension === "txt") return "txt";
  const limpio = sinBom(bytes);
  const raster = detectarTipoImagen(limpio);
  if (raster) return raster;
  if (esGif(limpio)) return "gif";
  if (esSvg(limpio)) return "svg";
  return null;
}

export function urlAdjuntoTicket(id: number): string {
  return `/api/soporte/adjuntos/${id}`;
}

export function mimeDeAdjunto(tipo: TipoAdjunto): string {
  if (esDocumentoAdjunto(tipo)) return MIME_DOCUMENTO[tipo];
  if (tipo === "gif") return "image/gif";
  if (tipo === "svg") return "image/svg+xml";
  return mimeDeTipo(tipo);
}

/** Prefiere el MIME validado al subir. S3 a veces devuelve octet-stream y,
 *  con nosniff, el navegador no pinta la imagen. */
export function tipoContenidoAdjunto(
  tipoAlmacenamiento: string | undefined,
  tipoRegistro: string | undefined,
): string {
  if (tipoRegistro && tipoRegistro !== "application/octet-stream") return tipoRegistro;
  if (tipoAlmacenamiento?.startsWith("image/")) return tipoAlmacenamiento;
  return tipoRegistro || tipoAlmacenamiento || "application/octet-stream";
}

/**
 * Nombre a guardar: sin rutas, acotado y, para documentos, terminado en la
 * extensión del tipo validado (así la galería sabe que no es una imagen).
 */
export function nombreAdjuntoTicket(nombre: string, tipo: TipoAdjunto): string {
  const limpio = (nombre ?? "").replace(/[/\\]/g, "").trim().slice(0, 180);
  if (!limpio) return esDocumentoAdjunto(tipo) ? `archivo.${tipo}` : `captura.${tipo}`;
  if (esDocumentoAdjunto(tipo) && extensionDeNombre(limpio) !== tipo) return `${limpio}.${tipo}`;
  return limpio;
}

/** Copia propia del binario para `Response` (evita SharedArrayBuffer / buffer pooled). */
export function cuerpoBinarioRespuesta(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

export function validarAdjuntoTicket(bytes: Uint8Array, nombre = "archivo"): ValidacionAdjunto {
  if (bytes.length === 0) return { ok: false, error: `«${nombre}» está vacío.` };
  const tipo = detectarTipoAdjunto(bytes, nombre);
  if (!tipo) {
    return {
      ok: false,
      error: `«${nombre}» no es un archivo admitido. Usa una imagen (JPG, PNG, WEBP, GIF o SVG), PDF, Excel (XLSX/XLS) o TXT (el nombre no basta).`,
    };
  }
  const tope = esDocumentoAdjunto(tipo) ? ADJUNTO_DOCUMENTO_MAX_BYTES : ADJUNTO_MAX_BYTES;
  if (bytes.length > tope) {
    return {
      ok: false,
      error: `«${nombre}» supera ${Math.round(tope / 1024 / 1024)} MB.`,
    };
  }
  return { ok: true, tipo, contentType: mimeDeAdjunto(tipo) };
}
