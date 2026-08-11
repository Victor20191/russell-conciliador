/**
 * Tope funcional del archivo de balance.
 *
 * Next acepta 64 MiB por Server Action (ver next.config.ts). Dejamos 4 MiB de
 * margen para el multipart, campos del formulario y cabeceras del transporte.
 */
export const MAX_BALANCE_TABULAR_BYTES = 60 * 1024 * 1024;
export const MAX_BALANCE_PDF_BYTES = 20 * 1024 * 1024;

// Cada PUT queda por debajo del límite de 4,5 MB de Vercel Functions.
export const BALANCE_UPLOAD_CHUNK_BYTES = 3 * 1024 * 1024;

export function maximoArchivoBalance(nombreArchivo: string): number {
  return /\.pdf$/i.test(nombreArchivo.trim())
    ? MAX_BALANCE_PDF_BYTES
    : MAX_BALANCE_TABULAR_BYTES;
}

export function mensajeTamanoBalanceNoPermitido(
  nombreArchivo: string,
  bytes: number,
): string | null {
  const maximo = maximoArchivoBalance(nombreArchivo);
  if (bytes <= maximo) return null;
  if (maximo === MAX_BALANCE_PDF_BYTES) {
    return "El PDF supera 20 MB y excedería el payload seguro del proveedor de IA. Divídelo o exporta el balance a Excel/CSV.";
  }
  return "El archivo tabular supera 60 MB. Exporta únicamente la hoja del balance o divídelo por período antes de cargarlo.";
}
