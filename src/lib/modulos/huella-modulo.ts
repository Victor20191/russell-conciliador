// Huella del layout de un archivo de MÓDULO. Envuelve la del balance
// (`src/lib/balance/extraccion/huella.ts`) sin modificarla: la comparten los perfiles de
// balance y cualquier cambio allí invalidaría los de todos los clientes.
//
// Por qué hace falta una variante: la huella es el sha256 del encabezado normalizado, y en
// cartera parte del encabezado son los RANGOS DE VENCIMIENTO, que el mismo ERP rotula
// distinto entre versiones o parametrizaciones («1-30» / «1 A 30» / «De 1 a 30») y cuya
// CANTIDAD cambia de un cliente a otro. Con la huella cruda, cada variación estrena perfil
// y el usuario vuelve a mapear columnas que ya había mapeado.
//
// La variante ESTABILIZADA reemplaza cada rótulo de familia por un token fijo, de modo que
// los dos archivos comparten huella. Se buscan SIEMPRE las dos (cruda y estabilizada) para
// no perder los perfiles guardados antes de este cambio.
import type { CeldaCruda, GridHoja } from "@/lib/balance/extraccion/ingesta";
import { calcularHuella, huellasCandidatas, type HuellaCandidata } from "@/lib/balance/extraccion/huella";
import type { DescriptorModulo } from "./descriptores";

/** Token que sustituye al rótulo literal de una columna de familia (también lo usan los patrones). */
export const TOKEN_FAMILIA = "«familia»";

/** ¿El descriptor tiene columnas cuyo rótulo cambia entre archivos del mismo formato? */
export function usaHuellaEstabilizada(descriptor: DescriptorModulo): boolean {
  return (descriptor.familiasDinamicas?.length ?? 0) > 0;
}

/** Encabezado con los rótulos de familia sustituidos por un token fijo. */
export function estabilizarEncabezado(descriptor: DescriptorModulo, celdas: readonly CeldaCruda[]): CeldaCruda[] {
  const familias = descriptor.familiasDinamicas ?? [];
  if (familias.length === 0) return [...celdas];
  return celdas.map((celda) => (familias.some((f) => f.detector(celda)) ? TOKEN_FAMILIA : celda));
}

/**
 * Huellas de una fila de encabezado para un módulo: la cruda siempre, y la estabilizada
 * cuando el descriptor declara familias y esta difiere de aquella. El orden importa: la
 * PRIMERA es la que se guarda al memorizar el perfil.
 */
export function huellasDeEncabezado(
  descriptor: DescriptorModulo,
  nombreHoja: string,
  filaEncabezado: readonly CeldaCruda[],
): string[] {
  const cruda = calcularHuella(nombreHoja, [...filaEncabezado]);
  if (!usaHuellaEstabilizada(descriptor)) return cruda ? [cruda] : [];
  const estable = calcularHuella(nombreHoja, estabilizarEncabezado(descriptor, filaEncabezado));
  // La estabilizada manda al GUARDAR: es la que sobrevive a un cambio de rótulos.
  const orden = [estable, cruda].filter((h): h is string => h != null);
  return [...new Set(orden)];
}

/**
 * Huella con la que se PERSISTE el perfil de este encabezado (la primera de la lista), o
 * `null` si la fila no tiene contenido utilizable.
 */
export function huellaParaGuardar(
  descriptor: DescriptorModulo,
  nombreHoja: string,
  filaEncabezado: readonly CeldaCruda[],
): string | null {
  return huellasDeEncabezado(descriptor, nombreHoja, filaEncabezado)[0] ?? null;
}

/**
 * Candidatas para BUSCAR un perfil guardado sin conocer aún la fila de encabezado. Amplía
 * las del balance con la variante estabilizada de cada fila, deduplicando por huella y
 * conservando la primera aparición (igual que `huellasCandidatas`).
 */
export function huellasCandidatasModulo(
  descriptor: DescriptorModulo,
  hojas: readonly GridHoja[],
  maxFilas = 15,
): HuellaCandidata[] {
  const base = huellasCandidatas([...hojas], maxFilas);
  if (!usaHuellaEstabilizada(descriptor)) return base;
  const vistas = new Set(base.map((c) => c.huella));
  const extra: HuellaCandidata[] = [];
  for (const hoja of hojas) {
    hoja.filas.slice(0, maxFilas).forEach((fila, i) => {
      const huella = calcularHuella(hoja.nombre, estabilizarEncabezado(descriptor, fila));
      if (!huella || vistas.has(huella)) return;
      vistas.add(huella);
      extra.push({ hoja: hoja.nombre, fila: i + 1, huella });
    });
  }
  return [...base, ...extra];
}
