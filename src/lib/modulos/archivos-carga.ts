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

import type { ContenidoArchivo, ContenidoArchivoCargue } from "./ingresos/contenido-archivo";

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

// ===== Con lo que traía cada archivo (Ingresos: facturas / notas crédito) =====

const RE_MARCA_LOTE = /\[lote:([^\]]+)\]/;

/** Como `parsearAnexos`, más el lote de cada anexo (la marca `[lote:<id>]` de su línea). */
export function parsearAnexosConLote(
  observaciones: string | null,
): { archivo: string; hoja: string | null; loteId: string | null }[] {
  if (!observaciones) return [];
  const resultado: { archivo: string; hoja: string | null; loteId: string | null }[] = [];
  for (const linea of observaciones.split("\n")) {
    const texto = linea.trim();
    const m = RE_LINEA_ANEXO.exec(texto);
    if (!m) continue;
    resultado.push({ archivo: m[1].trim(), hoja: m[2]?.trim() || null, loteId: RE_MARCA_LOTE.exec(texto)?.[1] ?? null });
  }
  return resultado;
}

/** Un archivo de la versión con lo que traía; `contenido` null = no se registró (cargue anterior). */
export type ArchivoCargaRotulado = ArchivoCarga & { contenido: ContenidoArchivo | null; signoInvertido: boolean };

/**
 * `archivosDeVersion` con lo que traía cada archivo (`modulo_dato_encabezado.contenido_archivos`).
 * El principal se empareja por el lote del encabezado (o por la entrada «previo», que resume lo
 * cargado antes de registrar el contenido) y cada anexo por su marca de lote.
 */
export function archivosRotuladosDeVersion(
  archivoNombre: string | null,
  hoja: string | null,
  observaciones: string | null,
  contenidos: readonly ContenidoArchivoCargue[] | null,
  loteIdPrincipal: string | null,
): ArchivoCargaRotulado[] {
  const porLote = new Map<string, ContenidoArchivoCargue>();
  for (const c of contenidos ?? []) if (c.loteId && !c.previo) porLote.set(c.loteId, c);
  const rotulo = (c: ContenidoArchivoCargue | undefined) => ({ contenido: c?.contenido ?? null, signoInvertido: c?.signoInvertido === true });
  const lista: ArchivoCargaRotulado[] = [];
  if (archivoNombre) {
    const principal = (loteIdPrincipal ? porLote.get(loteIdPrincipal) : undefined) ?? contenidos?.find((c) => c.previo);
    lista.push({ archivo: archivoNombre, hoja: hoja ?? null, esAnexo: false, ...rotulo(principal) });
  }
  for (const anexo of parsearAnexosConLote(observaciones)) {
    lista.push({ archivo: anexo.archivo, hoja: anexo.hoja, esAnexo: true, ...rotulo(anexo.loteId ? porLote.get(anexo.loteId) : undefined) });
  }
  return lista;
}
