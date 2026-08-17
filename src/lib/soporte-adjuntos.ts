import { detectarTipoImagen, mimeDeTipo } from "@/lib/avatares";
import { ADJUNTO_MAX_BYTES } from "@/lib/soporte-estados";

export type TipoAdjunto = "jpg" | "png" | "webp" | "gif" | "svg";

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

export function detectarTipoAdjunto(bytes: Uint8Array): TipoAdjunto | null {
  const limpio = sinBom(bytes);
  const raster = detectarTipoImagen(limpio);
  if (raster) return raster;
  if (esGif(limpio)) return "gif";
  if (esSvg(limpio)) return "svg";
  return null;
}

export function mimeDeAdjunto(tipo: TipoAdjunto): string {
  if (tipo === "gif") return "image/gif";
  if (tipo === "svg") return "image/svg+xml";
  return mimeDeTipo(tipo);
}

export function validarAdjuntoTicket(bytes: Uint8Array, nombre = "archivo"): ValidacionAdjunto {
  if (bytes.length === 0) return { ok: false, error: `«${nombre}» está vacío.` };
  if (bytes.length > ADJUNTO_MAX_BYTES) {
    return {
      ok: false,
      error: `«${nombre}» supera ${Math.round(ADJUNTO_MAX_BYTES / 1024 / 1024)} MB.`,
    };
  }
  const tipo = detectarTipoAdjunto(bytes);
  if (!tipo) {
    return {
      ok: false,
      error: `«${nombre}» no es una imagen válida. Usa JPG, PNG, WEBP, GIF o SVG (el nombre no basta).`,
    };
  }
  return { ok: true, tipo, contentType: mimeDeAdjunto(tipo) };
}
