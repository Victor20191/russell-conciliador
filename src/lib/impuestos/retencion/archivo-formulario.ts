/**
 * Tipos de archivo que se aceptan para un formulario DIAN (Retención en la fuente e IVA): el PDF
 * que sale de la DIAN o una imagen (foto o escaneo) en un formato que la IA puede leer. El tipo se
 * reconoce por los primeros bytes del archivo, no por su nombre ni por lo que dice el navegador.
 */

export type TipoArchivoFormulario = {
  mime: "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  extension: "pdf" | "jpg" | "png" | "webp" | "gif";
  esImagen: boolean;
  /** Cómo se nombra en los mensajes. */
  nombre: string;
};

const PDF: TipoArchivoFormulario = { mime: "application/pdf", extension: "pdf", esImagen: false, nombre: "PDF" };
const JPEG: TipoArchivoFormulario = { mime: "image/jpeg", extension: "jpg", esImagen: true, nombre: "JPG" };
const PNG: TipoArchivoFormulario = { mime: "image/png", extension: "png", esImagen: true, nombre: "PNG" };
const WEBP: TipoArchivoFormulario = { mime: "image/webp", extension: "webp", esImagen: true, nombre: "WEBP" };
const GIF: TipoArchivoFormulario = { mime: "image/gif", extension: "gif", esImagen: true, nombre: "GIF" };

/** Tamaño máximo de un PDF de formulario (los de la DIAN pesan menos de 200 KB). */
export const MAX_BYTES_PDF_FORMULARIO = 10 * 1024 * 1024;
/** Tamaño máximo de una imagen: el límite de la API de Claude para una imagen. */
export const MAX_BYTES_IMAGEN_FORMULARIO = 5 * 1024 * 1024;

/** Lo que acepta el selector de archivos de la pantalla. */
export const ACEPTA_ARCHIVO_FORMULARIO = "application/pdf,.pdf,image/jpeg,.jpg,.jpeg,image/png,.png,image/webp,.webp,image/gif,.gif";

const empieza = (bytes: Uint8Array, firma: readonly number[], desde = 0) => firma.every((b, i) => bytes[desde + i] === b);
const ascii = (texto: string) => [...texto].map((c) => c.charCodeAt(0));

/** El tipo del archivo por su firma, o null si no es PDF ni una imagen que se pueda leer. */
export function tipoArchivoFormulario(bytes: Uint8Array): TipoArchivoFormulario | null {
  if (empieza(bytes, ascii("%PDF-"))) return PDF;
  if (empieza(bytes, [0xff, 0xd8, 0xff])) return JPEG;
  if (empieza(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return PNG;
  if (empieza(bytes, ascii("RIFF")) && empieza(bytes, ascii("WEBP"), 8)) return WEBP;
  if (empieza(bytes, ascii("GIF87a")) || empieza(bytes, ascii("GIF89a"))) return GIF;
  return null;
}

/** ¿Es una foto HEIC/HEIF (la de los iPhone)? La IA no la lee: hay que convertirla a JPG. */
export function esHeic(bytes: Uint8Array): boolean {
  if (!empieza(bytes, ascii("ftyp"), 4)) return false;
  const marca = String.fromCharCode(...bytes.subarray(8, 12));
  return ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(marca);
}

/**
 * Por qué no se acepta un archivo, o null si se acepta: tipo reconocido y dentro del tamaño de su
 * tipo. El mensaje va después del nombre del archivo («factura.heic: …»).
 */
export function motivoRechazoArchivo(bytes: Uint8Array): string | null {
  const tipo = tipoArchivoFormulario(bytes);
  if (!tipo) {
    return esHeic(bytes)
      ? "es una foto HEIC (iPhone), que la IA no lee: guárdala como JPG o PNG y vuelve a cargarla."
      : "no es un PDF ni una imagen JPG, PNG, WEBP o GIF.";
  }
  if (tipo.esImagen && bytes.byteLength > MAX_BYTES_IMAGEN_FORMULARIO) return "supera 5 MB, el máximo para una imagen.";
  if (!tipo.esImagen && bytes.byteLength > MAX_BYTES_PDF_FORMULARIO) return "supera 10 MB.";
  return null;
}
