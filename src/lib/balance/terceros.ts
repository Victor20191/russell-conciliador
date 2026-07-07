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

/**
 * ¿Fila de DETALLE DE TERCERO? Movimiento cuyo código es numérico (un NIT/cédula) y
 * cuyo nombre es EXACTAMENTE ese mismo número — así lo exporta el ERP. Distingue con
 * fiabilidad un tercero de una cuenta real (una cuenta siempre tiene nombre
 * descriptivo ≠ su código), incluso si el NIT/cédula tiene 8 dígitos como una cuenta.
 */
export function esFilaTercero(f: Pick<FilaBorrador, "tipoFila" | "codigo" | "nombre">): boolean {
  return f.tipoFila === "movimiento" && /^\d+$/.test(f.codigo) && (f.nombre ?? "").trim() === f.codigo;
}

/**
 * ¿El archivo viene ABIERTO POR TERCERO? La gran mayoría de sus movimientos son
 * filas de tercero. Umbral holgado (>20 %) para no confundir con un informe normal
 * (que no tiene ninguna), y mínimo de filas para no dispararse en archivos diminutos.
 */
export function esBalancePorTercero(filas: Array<Pick<FilaBorrador, "tipoFila" | "codigo" | "nombre">>): boolean {
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
