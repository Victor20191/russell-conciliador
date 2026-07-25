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

// El «tercero GENÉRICO»: cuando un movimiento de la cuenta no tiene tercero asignado,
// el ERP lo agrupa bajo un placeholder cuya celda de CÓDIGO trae el rótulo literal
// «Generico Genérico» (no un código de cuenta). Es una fila de tercero más — pero sin
// dígitos, así que `esFilaTercero` la descarta a propósito (para no falsear informes
// normales). Se detecta aparte y SOLO se colapsa dentro del flujo por-tercero.
const ES_GENERICO = /gen[eé]rico/i;

/** ¿Fila del tercero GENÉRICO (placeholder «Generico Genérico»)? Su crudo NO empieza
 *  por dígito (una cuenta real sí) y contiene «generico»/«genérico». */
export function esFilaGenericoTercero(f: Pick<FilaBorrador, "tipoFila" | "codigoCrudo">): boolean {
  if (f.tipoFila === "agrupadora") return false;
  const crudo = (f.codigoCrudo ?? "").trim();
  return !/^\d/.test(crudo) && ES_GENERICO.test(crudo);
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
 * Quita las filas de detalle de tercero (incluido el tercero GENÉRICO), dejando la
 * estructura por CUENTA. Devuelve un array NUEVO (no muta el original).
 */
export function colapsarTerceros(filas: FilaBorrador[]): FilaBorrador[] {
  return filas.filter((f) => !esFilaTercero(f) && !esFilaGenericoTercero(f));
}

// ===== Detalle por tercero con el NIT PEGADO en el sufijo del código =====
//
// Otros ERP (p. ej. SAP/BO «Balance por tercero») NO traen una fila consolidada por
// cuenta: cada cuenta viene REPETIDA por tercero, con el NIT PEGADO como último tramo
// del código: `120520-0-00-800011002` (cuenta `120520` + tercero `800011002`). Aquí NO se
// puede solo QUITAR el detalle (no hay fila consolidada que quede): hay que CONSOLIDAR
// (sumar) los terceros de cada cuenta en una sola fila. `normalizarCodigo` ya trunca en el
// primer guion → todas caen al mismo código de cuenta; la carga oficial ya suma por código,
// pero en la VISTA se verían miles de filas repetidas — por eso se consolidan también aquí.

// Código de cuenta con un SUFIJO por guiones: `11100501-0-00` (fila consolidada, sin NIT)
// o `120520-0-00-800011002` (detalle por tercero, termina en un NIT de ≥7 dígitos).
const CON_SUFIJO = /^\d+-/; // cuenta (dígitos) seguida de un guion
const SUFIJO_NIT = /^\d+(?:-[\dA-Za-z]*)*-\d{7,}$/; // …y termina en NIT/cédula

/** ¿Fila de cuenta con sufijo por guiones (genérico `-0-00` o detalle `-…-NIT`)? NO se
 *  excluye la agrupadora: un padre PUC real trae el código LIMPIO (sin `-0-00`), así que
 *  cualquier `código-0-00…` es detalle por tercero aunque la extracción lo haya rotulado
 *  agrupadora (lo hace de forma inconsistente cuando los saldos están en cero). */
export function esFilaConSufijo(f: Pick<FilaBorrador, "codigoCrudo">): boolean {
  return CON_SUFIJO.test((f.codigoCrudo ?? "").trim());
}

/** ¿Fila de DETALLE de tercero (el sufijo termina en NIT/cédula de ≥7 dígitos)? */
export function esFilaTerceroSufijo(f: Pick<FilaBorrador, "tipoFila" | "codigoCrudo">): boolean {
  return f.tipoFila !== "agrupadora" && SUFIJO_NIT.test((f.codigoCrudo ?? "").trim());
}

/** ¿El archivo viene por tercero con el NIT en el sufijo? Mayoría de los movimientos. */
export function esBalancePorTerceroSufijo(filas: Array<Pick<FilaBorrador, "tipoFila" | "codigoCrudo">>): boolean {
  let mov = 0;
  let ter = 0;
  for (const f of filas) {
    if (f.tipoFila === "movimiento") {
      mov++;
      if (esFilaTerceroSufijo(f)) ter++;
    }
  }
  return mov >= 20 && ter / mov > 0.2;
}

/**
 * Colapsa las cuentas con SUFIJO por guiones a UNA fila por código, SUMANDO todos sus
 * terceros (incluido el genérico `-0-00`) y dejando SIEMPRE el código limpio de la cuenta
 * (sin `-0-00` ni NIT). El `-0-00` NO es un total consolidado: es el tercero «genérico»,
 * un tercero más; el saldo de la cuenta = Σ de TODOS sus terceros. Las filas sin sufijo
 * pasan tal cual. Devuelve un array NUEVO (clona la primera fila de cada cuenta).
 */
export function consolidarTercerosPorSufijo(filas: FilaBorrador[]): FilaBorrador[] {
  const out: FilaBorrador[] = [];
  const porCuenta = new Map<string, FilaBorrador>();
  for (const f of filas) {
    if (!esFilaConSufijo(f)) {
      out.push(f);
      continue;
    }
    const acc = porCuenta.get(f.codigo);
    if (!acc) {
      // crudo = solo la cuenta; y SIEMPRE movimiento: la cuenta con terceros es una hoja
      // imputable (la extracción a veces rotula agrupadora una fila NIT con saldo cero).
      const consol: FilaBorrador = { ...f, codigoCrudo: f.codigo, tipoFila: "movimiento" };
      out.push(consol);
      porCuenta.set(f.codigo, consol);
    } else {
      acc.saldoInicial += f.saldoInicial;
      acc.debitos += f.debitos;
      acc.creditos += f.creditos;
      acc.saldoFinal += f.saldoFinal;
    }
  }
  return out;
}

// ===== «Balance por cuenta» con la fila NIT que REPITE su cuenta (SIIGO) =====
//
// Otro formato (SIIGO «balance por cuenta», columna «Rompimiento»): por cada cuenta
// imputable viene una fila «Cuenta» (el total CONSOLIDADO) SEGUIDA de sus filas «NIT»
// (detalle por tercero) con el MISMO código y cuyos saldos SUMAN la cuenta (verificado:
// Cuenta == Σ NIT, 0 mismatches). La fila «Cuenta» ya trae el total; las «NIT» lo
// duplican. Se TACHAN las repeticiones (se conserva la primera de cada bloque = la
// «Cuenta») para no doble-contar. Se detecta por el patrón —código que repite el de la
// fila anterior— sin depender de leer la columna «Rompimiento».

/**
 * TACHA (omitida, respeta el tri-estado) las filas «NIT» de un bloque «Cuenta+NIT»:
 * MOVIMIENTOS consecutivos con el MISMO código, conservando la primera (la «Cuenta»).
 * MUTA `filas` (`omitida`), devuelve cuántas tachó.
 *
 * DISCRIMINADOR CLAVE (solo tacha si de verdad son NIT que duplican la cuenta): la
 * «Cuenta» (primera del bloque) debe ser el TOTAL = Σ de las filas que repiten su código
 * (REPLAST: `Cuenta == Σ NIT`). Si NO cuadra, son cuentas INDEPENDIENTES que colapsan al
 * mismo código tras `normalizarCodigo` (sufijos alfabéticos INAC / variantes `A`, p. ej.
 * `11100502` y `11100502INAC`, o `23703021` y `23703021A`): cada una aporta su propio
 * saldo, así que NO se tachan (tacharlas perdería plata).
 *
 * Seguro por sí solo (sin umbral): solo mira MOVIMIENTOS y RESETEA en cualquier fila que
 * no lo sea (agrupadora/total). Así NO rompe «encabezado repetido» (dos agrupadoras) ni
 * multi-sucursal (la agrupadora de clase entre sucursales corta el bloque).
 */
// ===== «Balance por tercero» por AUXILIAR (mismo código repetido, sin NIT) =====
//
// Otro formato: el ERP repite la MISMA cuenta auxiliar (mismo código Y mismo nombre,
// p. ej. `13050501 Clientes nacionales`) una vez por tercero, SIN traer el NIT en el
// código y SIN una fila «Cuenta» consolidada. Se ven N renglones idénticos por
// auxiliar; el saldo real de la cuenta = Σ de todos. Para la VISTA del borrador se
// consolidan en UNA fila por auxiliar (suma) — es SOLO presentación (el staging, la
// carga oficial y la exportación no cambian; se activan con la opción del cliente).

/**
 * Consolida corridas CONSECUTIVAS de ≥2 movimientos NO omitidos con el MISMO código en
 * una sola fila (suma saldos/débitos/créditos), conservando la primera. NO consolida un
 * bloque «Cuenta + NIT» donde la primera fila YA es el total (guarda `primera ≈ Σ resto`):
 * eso lo maneja `marcarCuentaNit`, que tacha las repeticiones. Se llama DESPUÉS de
 * `marcarCuentaNit`, así los NIT ya tachados (omitidos) no entran en el bloque. Devuelve
 * un array NUEVO (clona la primera fila de cada bloque) y cuántos bloques consolidó.
 */
export function consolidarAuxiliaresRepetidos(filas: FilaBorrador[]): { filas: FilaBorrador[]; consolidados: number } {
  const out: FilaBorrador[] = [];
  let consolidados = 0;
  let i = 0;
  while (i < filas.length) {
    const f = filas[i];
    if (f.tipoFila !== "movimiento" || !/^\d+$/.test(f.codigo) || f.omitida) { out.push(f); i++; continue; }
    let j = i + 1;
    while (j < filas.length && filas[j].tipoFila === "movimiento" && filas[j].codigo === f.codigo && !filas[j].omitida) j++;
    const bloque = filas.slice(i, j);
    if (bloque.length >= 2) {
      const sumaResto = bloque.slice(1).reduce((s, r) => s + r.saldoFinal, 0);
      // Si la PRIMERA ya es el total (bloque «Cuenta + NIT»), NO consolidar (lo tacha
      // `marcarCuentaNit`); solo se consolida el detalle por auxiliar sin fila total.
      if (Math.abs(f.saldoFinal - sumaResto) > 1) {
        const consol: FilaBorrador = { ...f };
        for (const r of bloque.slice(1)) {
          consol.saldoInicial += r.saldoInicial;
          consol.debitos += r.debitos;
          consol.creditos += r.creditos;
          consol.saldoFinal += r.saldoFinal;
        }
        out.push(consol);
        consolidados++;
      } else {
        for (const r of bloque) out.push(r); // «Cuenta + NIT»: intacto
      }
      i = j;
      continue;
    }
    out.push(f);
    i++;
  }
  return { filas: out, consolidados };
}

export function marcarCuentaNit(filas: FilaBorrador[]): number {
  let n = 0;
  let i = 0;
  while (i < filas.length) {
    const f = filas[i];
    if (f.tipoFila !== "movimiento" || !/^\d+$/.test(f.codigo)) { i++; continue; }
    // Bloque de MOVIMIENTOS consecutivos con el mismo código: la «Cuenta» + sus repeticiones.
    let j = i + 1;
    while (j < filas.length && filas[j].tipoFila === "movimiento" && filas[j].codigo === f.codigo) j++;
    const nits = filas.slice(i + 1, j);
    if (nits.length > 0) {
      const sumaNits = nits.reduce((s, r) => s + r.saldoFinal, 0);
      // Solo son «NIT» (duplican la cuenta) si la «Cuenta» es su total exacto.
      if (Math.abs(f.saldoFinal - sumaNits) <= 1) {
        for (const r of nits) if (r.omitida === undefined) { r.omitida = true; n++; }
      }
    }
    i = j;
  }
  return n;
}
