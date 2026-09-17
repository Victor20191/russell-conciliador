// Rótulos del encabezado tal como los compara un PATRÓN DE ARCHIVO — puro.
//
// El patrón reconoce un archivo por los rótulos de su encabezado, sin importar en qué columna
// estén. Se comparan normalizados (sin tildes, mayúsculas, signos ni espacios de más) y los
// rangos de vencimiento se reemplazan por un token fijo: el mismo ERP los rotula distinto
// («1-30», «De 1 a 30») y su cantidad cambia de un cliente a otro.
import type { DescriptorModulo } from "../descriptores";
import { norm } from "../extraccion/sugerir";
import { TOKEN_FAMILIA } from "../huella-modulo";

/** Rótulo normalizado: «Código » y «CODIGO» son el mismo; «#Ter.» queda «ter». */
export function normalizarRotulo(celda: unknown): string {
  return norm(celda);
}

/** ¿El rótulo es una columna de familia dinámica (p. ej. un rango de vencimiento)? */
export function esRotuloFamilia(descriptor: DescriptorModulo, celda: unknown): boolean {
  if (normalizarRotulo(celda) === "") return false;
  return (descriptor.familiasDinamicas ?? []).some((familia) => familia.detector(celda));
}

/** Clave con que se compara una celda del encabezado ("" = columna sin rótulo). */
export function claveRotulo(descriptor: DescriptorModulo, celda: unknown): string {
  const texto = normalizarRotulo(celda);
  if (!texto) return "";
  return esRotuloFamilia(descriptor, celda) ? TOKEN_FAMILIA : texto;
}

/** Claves de una fila de encabezado, 1:1 con sus columnas. */
export function clavesEncabezado(descriptor: DescriptorModulo, fila: readonly unknown[]): string[] {
  // Array.from recorre también los huecos de una fila dispersa (celdas nunca escritas).
  return Array.from(fila, (celda) => claveRotulo(descriptor, celda));
}

/** Rótulos CRUDOS que se guardan con la versión: texto recortado, "" en las celdas vacías. */
export function encabezadoParaGuardar(fila: readonly unknown[]): string[] {
  // Una fila dispersa trae huecos que `map` conservaría como `undefined` (Prisma no los acepta).
  const salida = Array.from(fila, (celda) => (celda == null ? "" : String(celda).replace(/\s+/g, " ").trim().slice(0, 200)));
  while (salida.length > 0 && salida[salida.length - 1] === "") salida.pop();
  return salida;
}
