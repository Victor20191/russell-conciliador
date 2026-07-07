// Lógica SEPARADA para balances «abiertos por tercero» (detalle de tercero).
//
// Algunos ERP exportan la balanza con cada cuenta PUC DESGLOSADA por tercero: bajo
// la cuenta (p. ej. `11051010 CAJA MENOR BOGOTA`) vienen filas cuyo código es un
// NIT/cédula (`890903938`, `901427659`) y cuyo NOMBRE es ese mismo número. Esas
// filas NO son cuentas contables: son el detalle por tercero, y la cuenta padre ya
// trae el total (= Σ de sus terceros).
//
// Si se dejan pasar rompen toda la lógica normal: se cuentan como movimientos con
// código de clase "9" (cuentas de orden), inflan y descuadran. La solución es
// DETECTAR el patrón y COLAPSAR el detalle de tercero, conciliando por CUENTA. Al
// quitar los terceros, las cuentas PUC quedan sin hijos y la lógica existente
// (`reclasificarHuerfanas`) las vuelve movimiento imputable con su saldo por cuenta.
//
// Solo se activa cuando el archivo viene por tercero; el resto de informes NO se toca.
import type { FilaBorrador } from "./borrador";

// Identificador tributario de un tercero al inicio del crudo: NIT/cédula colombiana
// (solo dígitos) o RFC mexicano (empieza por letras + dígitos, p. ej. `AME880912189`,
// `AAQA9401125U2`). Token alfanumérico de ≥7 chars que CONTIENE algún dígito (así se
// descarta un rótulo de sección como «Generico» o «NOMINAS», que no trae dígitos).
const TAX_ID_CON_NOMBRE = /^(?=[A-Za-z0-9.\-]*\d)[A-Za-z0-9.\-]{7,}\s+.*[A-Za-zÁÉÍÓÚÑ]/;

/**
 * ¿Fila de DETALLE DE TERCERO? Dos formas en que el ERP las trae:
 *  1. LIMPIA: su nombre es EXACTAMENTE su código (el NIT/cédula/RFC), p. ej. código
 *     `901427659` / `AME880912189` con ese mismo nombre.
 *  2. PEGADA: el ID viene junto al nombre en una sola celda y el crudo queda
 *     «<tax-id> <nombre>» (`901114801 D2 WORK SAS`, `AAQA9401125U2 Adrián Ayala`).
 *     `normalizarCodigo` deja el código NO numérico o vacío, así que se detecta por
 *     el crudo (ID alfanumérico con dígitos + nombre).
 *
 * Distingue con fiabilidad de una CUENTA real: una cuenta tiene código NUMÉRICO
 * LIMPIO y su crudo es el código a secas («22359501»), sin nombre pegado — por eso la
 * rama «pegada» exige código NO numérico. Nombre === código nunca pasa en una cuenta.
 */
export function esFilaTercero(f: Pick<FilaBorrador, "tipoFila" | "codigo" | "nombre" | "codigoCrudo">): boolean {
  if (f.tipoFila === "agrupadora") return false;
  if ((f.nombre ?? "").trim() === f.codigo && f.codigo.length >= 5) return true;
  return !/^\d+$/.test(f.codigo) && TAX_ID_CON_NOMBRE.test((f.codigoCrudo ?? "").trim());
}

/**
 * ¿El archivo viene ABIERTO POR TERCERO? La gran mayoría de sus movimientos son
 * filas de tercero. Umbral holgado (>20 %) para no confundir con un informe normal
 * (que no tiene ninguna), y mínimo de filas para no dispararse en archivos diminutos.
 */
export function esBalancePorTercero(filas: Array<Pick<FilaBorrador, "tipoFila" | "codigo" | "nombre" | "codigoCrudo">>): boolean {
  let mov = 0;
  let ter = 0;
  for (const f of filas) {
    if (f.tipoFila === "movimiento") {
      mov++;
      if (esFilaTercero(f)) ter++;
    }
  }
  return mov >= 20 && ter / mov > 0.2;
}

/**
 * Quita las filas de detalle de tercero, dejando la estructura por CUENTA. Devuelve
 * un array NUEVO (no muta el original) con las mismas filas menos los terceros.
 */
export function colapsarTerceros(filas: FilaBorrador[]): FilaBorrador[] {
  return filas.filter((f) => !esFilaTercero(f));
}
