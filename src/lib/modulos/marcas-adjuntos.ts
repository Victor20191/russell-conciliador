/**
 * SOPORTES de una marca de auditoría del cruce contable: el anexo digital que respalda
 * la observación (el PDF del proveedor, el Excel del conteo físico, la foto del acta).
 *
 * Lógica PURA (sin BD ni S3), como `soporte-adjuntos.ts` para los tickets: valida por
 * MAGIC BYTES y no por la extensión, porque el nombre lo pone el usuario. La excepción es
 * el CSV, que no tiene firma: se acepta por extensión siempre que el contenido sea texto
 * legible, que es lo que un CSV es.
 */
import { detectarTipoImagen, mimeDeTipo } from "@/lib/avatares";

export type TipoSoporteMarca = "pdf" | "xlsx" | "xls" | "csv" | "jpg" | "png" | "webp";

export type ValidacionSoporteMarca =
  | { ok: true; tipo: TipoSoporteMarca; contentType: string }
  | { ok: false; error: string };

/** Tope por archivo: un anexo de auditoría cabe de sobra en 10 MB. */
export const SOPORTE_MARCA_MAX_BYTES = 10 * 1024 * 1024;
/** Tope de soportes por marca: la marca explica una cifra, no es un repositorio. */
export const SOPORTES_MARCA_MAX = 5;

const MIME_POR_TIPO: Record<TipoSoporteMarca, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  jpg: mimeDeTipo("jpg"),
  png: mimeDeTipo("png"),
  webp: mimeDeTipo("webp"),
};

export function mimeDeSoporteMarca(tipo: TipoSoporteMarca): string {
  return MIME_POR_TIPO[tipo];
}

export function extensionDeNombre(nombre: string): string {
  const base = (nombre ?? "").trim().toLowerCase();
  const punto = base.lastIndexOf(".");
  return punto >= 0 ? base.slice(punto + 1) : "";
}

function esPdf(bytes: Uint8Array): boolean {
  // "%PDF-"
  return (
    bytes.length >= 5
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
    && bytes[4] === 0x2d
  );
}

/** ZIP ("PK\x03\x04"): contenedor de xlsx (y de docx, pptx…). */
function esZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** Documento compuesto OLE2: el .xls clásico (y también .doc/.ppt antiguos). */
function esOle2(bytes: Uint8Array): boolean {
  const firma = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return bytes.length >= 8 && firma.every((b, i) => bytes[i] === b);
}

/**
 * ¿El contenido es texto plano razonable (un CSV)? Rechaza binarios disfrazados: basta un
 * byte NUL en la cabecera para descartarlo.
 */
function pareceTexto(bytes: Uint8Array): boolean {
  const cabeza = bytes.subarray(0, 4096);
  if (cabeza.length === 0) return false;
  return !cabeza.includes(0x00);
}

/**
 * Detecta el tipo real del soporte. `extension` solo desempata lo que los magic bytes no
 * pueden distinguir (xlsx vs. otro ZIP de Office) y habilita el CSV, que no tiene firma.
 */
export function detectarTipoSoporteMarca(bytes: Uint8Array, extension: string): TipoSoporteMarca | null {
  if (esPdf(bytes)) return "pdf";
  if (esZip(bytes)) return extension === "xlsx" || extension === "xlsm" ? "xlsx" : null;
  if (esOle2(bytes)) return extension === "xls" ? "xls" : null;

  const imagen = detectarTipoImagen(bytes);
  if (imagen) return imagen;

  if ((extension === "csv" || extension === "txt") && pareceTexto(bytes)) return "csv";
  return null;
}

/** Valida un soporte por tamaño y contenido real. */
export function validarSoporteMarca(bytes: Uint8Array, nombre = "archivo"): ValidacionSoporteMarca {
  if (bytes.length === 0) return { ok: false, error: `«${nombre}» está vacío.` };
  if (bytes.length > SOPORTE_MARCA_MAX_BYTES) {
    return {
      ok: false,
      error: `«${nombre}» supera ${Math.round(SOPORTE_MARCA_MAX_BYTES / 1024 / 1024)} MB.`,
    };
  }
  const tipo = detectarTipoSoporteMarca(bytes, extensionDeNombre(nombre));
  if (!tipo) {
    return {
      ok: false,
      error: `«${nombre}» no es un soporte admitido. Usa PDF, Excel (XLSX/XLS), CSV o una imagen (JPG, PNG, WEBP).`,
    };
  }
  return { ok: true, tipo, contentType: mimeDeSoporteMarca(tipo) };
}

/** Nombre de archivo saneado para guardar (sin rutas y acotado). */
export function nombreArchivoSeguro(nombre: string, tipo: TipoSoporteMarca): string {
  return (nombre ?? "").replace(/[/\\]/g, "").trim().slice(0, 180) || `soporte.${tipo}`;
}

/** Clave del objeto en el almacenamiento. Agrupa por marca para poder barrer una marca. */
export function claveSoporteMarca(marcaId: number, sufijo: string, tipo: TipoSoporteMarca): string {
  return `soportes-marcas/${marcaId}/${sufijo}.${tipo}`;
}

export function urlSoporteMarca(id: number): string {
  return `/api/modulos/marcas/soportes/${id}`;
}

/** Tamaño legible para la UI («1,2 MB»). */
export function tamanoLegible(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1).replace(".", ",")} MB`;
}

/**
 * Prefiere el MIME validado al subir: el almacenamiento a veces devuelve octet-stream y,
 * con `nosniff`, el navegador no sabe qué hacer con el archivo.
 */
export function tipoContenidoSoporte(
  tipoAlmacenamiento: string | undefined,
  tipoRegistro: string | undefined,
): string {
  return tipoRegistro || tipoAlmacenamiento || "application/octet-stream";
}
