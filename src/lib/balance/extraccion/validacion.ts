// Criterios de ACEPTACIÓN de una extracción/transformación (puros, sin IA/BD).
//
// Deciden dos cosas en el pipeline:
//   1. Si el resultado de aplicar un PERFIL guardado es utilizable (si no, se
//      descarta el perfil y se cae a la cascada de IA).
//   2. Si el intento de un tier de la cascada de extracción amerita ESCALAR al
//      modelo siguiente (confianza baja, no importable o resultado inutilizable).
import type { MappingSpec } from "./esquema";
import type { ResultadoTransform } from "./transformar";
import { veredictoOrientacion, fraccionNaturalezaPUC, UMBRAL_NATURALEZA_PUC } from "./verificacion";

/**
 * ¿El resultado de la transformación es utilizable? Debe traer cuentas de
 * movimiento y cuadrar: contra la fila TOTALES si se detectó una; si no, al
 * menos la partida doble de los movimientos (Σ débitos = Σ créditos).
 * Además, señales que el cuadre NO detecta (por simetría):
 *  - votación de orientación «invertida» → débitos↔créditos intercambiados;
 *  - casi ninguna hoja respeta la naturaleza de su clase PUC (solo «firmado»)
 *    → columnas de saldo corridas o signo mal mapeado.
 */
// Fracción máxima tolerable de cuentas que quedaron en DESCUADRE de control
// (no se importan). Más que esto delata un mapeo de columnas equivocado — el
// resultado no es aceptable y la cascada escala al modelo mayor.
export const MAX_FRACCION_DESCUADRE = 0.1;

export function esTransformacionAceptable(res: ResultadoTransform): boolean {
  if (res.importReady.length === 0) return false;
  if (veredictoOrientacion(res.orientacionControl) === "invertida") return false;
  const naturaleza = fraccionNaturalezaPUC(res.importReady, res.resumen.convencionCredito);
  if (naturaleza != null && naturaleza < UMBRAL_NATURALEZA_PUC) return false;
  const { filasImportables, filasDescuadre } = res.resumen;
  if (filasDescuadre / (filasImportables + filasDescuadre) > MAX_FRACCION_DESCUADRE) return false;
  return res.cuadre.detectado ? res.cuadre.cuadra : res.cuadre.partidaDobleCuadra;
}

/**
 * ¿Hay que escalar al siguiente tier de la cascada de extracción? Sí cuando el
 * modelo no devolvió spec, el spec dice que el archivo no es importable, la
 * confianza quedó bajo el umbral (0..1), o la transformación no es aceptable.
 * En el ÚLTIMO tier no se escala: se usa el mejor intento aunque no sea
 * aceptable (el descuadre no bloquea el cargue, solo lo marca — igual que hoy).
 */
export function debeEscalarExtraccion(spec: MappingSpec | null, res: ResultadoTransform | null, umbral: number): boolean {
  if (!spec) return true;
  if (!spec.importable) return true;
  if (spec.confianza < umbral) return true;
  return !res || !esTransformacionAceptable(res);
}
