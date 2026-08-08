// Lógica PURA del inventario FRACCIONADO en varios archivos (sin BD).
//
// Un cliente puede subir su inventario de un período en varios archivos. Regla:
//  - Si la carga NO repite ningún ítem ya cargado → se AGREGA al inventario del período
//    (misma versión, no versiona).
//  - Si repite algún ítem → se VERSIONA (nueva versión con solo el archivo re-subido; las
//    anteriores quedan como histórico).
// El «ítem» se identifica por el par (clasificador, referencia). Si no hay referencia
// (p. ej. inventario globalizado), la llave es (clasificador, "") → re-subir ese tipo versiona.
import type { DescriptorModulo } from "./descriptores";

/** Rol de la columna REFERENCIA del descriptor (o null si el módulo no la tiene). */
export function refRolDe(descriptor: DescriptorModulo): string | null {
  return descriptor.columnas.find((c) => /ref/i.test(c.nombre))?.nombre ?? null;
}

const texto = (v: unknown): string => (v == null ? "" : String(v).replace(/\s+/g, " ").trim());

/** Llave del ítem: `${clasificador}∷${referencia}` (ambos normalizados). */
export function llaveItem(clasificador: string | null, referencia: unknown): string {
  return `${texto(clasificador)}∷${texto(referencia)}`;
}

export type FilaClave = { clasificador: string | null; datos: Record<string, unknown> };

/** Conjunto de llaves (clasificador, referencia) de un detalle. */
export function clavesDeDetalle(refRol: string | null, filas: FilaClave[]): Set<string> {
  const set = new Set<string>();
  for (const f of filas) set.add(llaveItem(f.clasificador, refRol ? f.datos[refRol] : ""));
  return set;
}

/** ¿Cuántas llaves de `nuevas` ya están en `existentes`? (ítems re-subidos). */
export function itemsRepetidos(existentes: Set<string>, nuevas: Set<string>): number {
  let n = 0;
  for (const k of nuevas) if (existentes.has(k)) n++;
  return n;
}

/** Decisión de carga cuando YA existe un inventario oficial del período. */
export function decidirCarga(existentes: Set<string>, nuevas: Set<string>): "agregar" | "versionar" {
  return itemsRepetidos(existentes, nuevas) > 0 ? "versionar" : "agregar";
}

/**
 * Reindexa las filas de una fracción para AGREGARLAS a un encabezado existente sin colisionar
 * `filaNum` ni anclas de comentarios: nuevaFila = maxFilaExistente + k (en el orden dado).
 * Devuelve el map `filaNum staging → filaNum nueva` (para reanclar comentarios).
 */
export function remapFilas(maxFilaExistente: number, filaNumsStaging: number[]): Map<number, number> {
  const map = new Map<number, number>();
  let k = 1;
  for (const fn of filaNumsStaging) map.set(fn, maxFilaExistente + k++);
  return map;
}
