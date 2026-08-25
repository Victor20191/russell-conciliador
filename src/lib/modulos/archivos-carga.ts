/**
 * Archivos que componen la versión VIGENTE de un período cargado en un módulo:
 * el archivo principal (el que creó o completó la versión) más, cuando hubo
 * fraccionamiento, los archivos "anexados" que se fueron sumando al mismo
 * encabezado sin abrir una versión nueva.
 *
 * El principal guarda su hoja en `ModuloDatoEncabezado.hoja`. Los anexos NO
 * tienen columna propia: su rastro vive en la línea que `cargarBorradorModulo`
 * agrega a `observaciones` al fusionarlos (ver `marcaAnexoModulo` en
 * `src/app/actions/modulos-datos.ts`). Este módulo es puro (sin BD) para poder
 * parsear esas líneas y ensamblar la lista sin duplicar la lógica en la UI.
 */

/** Un archivo de la versión, con su hoja (si se registró) y si es un anexo. */
export type ArchivoCarga = { archivo: string; hoja: string | null; esAnexo: boolean };

// Formatos que puede tener una línea de anexo en `observaciones`:
//   "Anexo: <archivo> (+N ítems) · <fecha> [— <obs>] [lote:<id>]"                (legado, sin hoja)
//   "Anexo: <archivo> · hoja: <hoja> (+N ítems) · <fecha> [— <obs>] [lote:<id>]" (con hoja)
// El nombre de archivo y la hoja se capturan de forma no-ávida hasta el
// primer "(+N ítems)", que es el ancla fija de la línea.
const RE_LINEA_ANEXO = /^Anexo:\s*(.+?)(?:\s·\shoja:\s(.+?))?\s\(\+\d+\s*ítems?\)/;

/**
 * Extrae los anexos registrados en `observaciones`, en el orden en que se
 * agregaron. Tolera líneas viejas sin hoja (→ `hoja: null`) y cualquier otra
 * línea de observaciones mezclada (la ignora).
 */
export function parsearAnexos(
  observaciones: string | null,
): { archivo: string; hoja: string | null }[] {
  if (!observaciones) return [];
  const resultado: { archivo: string; hoja: string | null }[] = [];
  for (const linea of observaciones.split("\n")) {
    const m = RE_LINEA_ANEXO.exec(linea.trim());
    if (m) resultado.push({ archivo: m[1].trim(), hoja: m[2]?.trim() || null });
  }
  return resultado;
}

/**
 * Lista completa de archivos de una versión: el principal primero (si se
 * conoce su nombre) y luego sus anexos, en el orden en que se agregaron.
 */
export function archivosDeVersion(
  archivoNombre: string | null,
  hoja: string | null,
  observaciones: string | null,
): ArchivoCarga[] {
  const lista: ArchivoCarga[] = [];
  if (archivoNombre) lista.push({ archivo: archivoNombre, hoja: hoja ?? null, esAnexo: false });
  for (const anexo of parsearAnexos(observaciones)) {
    lista.push({ archivo: anexo.archivo, hoja: anexo.hoja, esAnexo: true });
  }
  return lista;
}
