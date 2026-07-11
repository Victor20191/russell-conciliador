// HUELLA DIAGNÓSTICA de la lectura de un balance. Observacional: se arma con los
// conteos que las pasadas del pipeline YA calculan (no cambia el comportamiento de
// lectura). Sirve para MEDIR, reporte a reporte, qué heurística se disparó, si el
// balance cuadró solo y —en la toma final— cuánta intervención manual necesitó, y
// así decidir con datos si la cola de heurísticas converge o hay que rediseñar.
import type { FilaBorrador, NodoBorrador } from "./borrador";

export type DiagnosticoLectura = {
  // Tamaño y composición del reporte
  filas: number;
  movimientos: number;
  agrupadoras: number;
  totales: number;
  // Señales heurísticas (estructurales y re-detectables, salvo `huerfanas` que es el
  // delta fresco de reclasificación; 0 = no se disparó). Se miden así —y no como delta
  // de re-ejecución— porque varias pasadas se aplican también en la extracción, y un
  // segundo pase daría 0 aunque la heurística SÍ se haya disparado en el reporte.
  porTercero: boolean;
  terceros: number; // filas que son detalle de tercero (NIT/RFC)
  relistadoGuiones: number; // filas de re-listado con guiones redundante
  huerfanas: number; // agrupadoras sin hijos con saldo rescatadas a movimiento
  repetidos: number; // códigos numéricos que aparecen en >1 fila
  subtotalesDuplicados: number; // subtotales 6 díg duplicados de su detalle 8 díg
  descuadres: number; // nodos del árbol con Δ real
  // Forma del código crudo (diversidad de formato)
  codigoDigitos: number;
  codigoGuiones: number;
  codigoLetras: number;
  // Cuadre AUTOMÁTICO (antes de edición manual)
  cuadrado: boolean;
  partidaDobleDiff: number;
  ecuacionDiff: number;
};

const CODIGO_SOLO_DIGITOS = /^\d+$/;
const CODIGO_CON_GUIONES = /^\d+(?:-\d+)+$/;
const CODIGO_CON_LETRAS = /[A-Za-z]/;

/** Distribución de la forma del `codigoCrudo` (dígitos puros / con guiones / con letras). */
export function contarFormasCodigo(filas: Array<Pick<FilaBorrador, "codigoCrudo">>): {
  digitos: number;
  guiones: number;
  letras: number;
} {
  let digitos = 0, guiones = 0, letras = 0;
  for (const f of filas) {
    const c = (f.codigoCrudo ?? "").trim();
    if (CODIGO_SOLO_DIGITOS.test(c)) digitos++;
    if (CODIGO_CON_GUIONES.test(c)) guiones++;
    if (CODIGO_CON_LETRAS.test(c)) letras++;
  }
  return { digitos, guiones, letras };
}

/** Nº de códigos numéricos que aparecen en MÁS de una fila (proxy del quirk de código
 *  repetido: el ERP reusa el mismo código para un encabezado y un movimiento). */
export function contarCodigosRepetidos(filas: Array<Pick<FilaBorrador, "codigo">>): number {
  const veces = new Map<string, number>();
  for (const f of filas) {
    if (!CODIGO_SOLO_DIGITOS.test(f.codigo)) continue;
    veces.set(f.codigo, (veces.get(f.codigo) ?? 0) + 1);
  }
  let n = 0;
  for (const v of veces.values()) if (v > 1) n++;
  return n;
}

/** Nº de nodos del árbol con descuadre real (`descuadre` ≠ 0 y ≠ null). */
export function contarDescuadres(arbol: NodoBorrador[]): number {
  let n = 0;
  const rec = (nodo: NodoBorrador) => {
    if (nodo.descuadre != null && nodo.descuadre !== 0) n++;
    nodo.hijos.forEach(rec);
  };
  arbol.forEach(rec);
  return n;
}
