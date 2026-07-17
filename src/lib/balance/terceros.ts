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

// Código con el NIT en el sufijo: cuenta + tramos con guiones + un ÚLTIMO tramo de ≥7
// dígitos (NIT/cédula). Un sufijo corto («-0-00») o de guiones («1105-05-04») NO cumple.
const SUFIJO_NIT = /^\d+(?:-[\dA-Za-z]*)*-\d{7,}$/;

/** ¿Fila de detalle de tercero con el NIT en el sufijo del código crudo? */
export function esFilaTerceroSufijo(f: Pick<FilaBorrador, "tipoFila" | "codigoCrudo">): boolean {
  if (f.tipoFila === "agrupadora") return false;
  return SUFIJO_NIT.test((f.codigoCrudo ?? "").trim());
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
 * CONSOLIDA (suma) las filas de tercero-con-NIT-en-sufijo por CUENTA: una sola fila por
 * código (el crudo pasa a ser el código de la cuenta, sin NIT) con la suma de los cuatro
 * importes. Las filas que no son tercero-sufijo pasan tal cual. Devuelve un array NUEVO.
 */
export function consolidarTercerosPorSufijo(filas: FilaBorrador[]): FilaBorrador[] {
  const out: FilaBorrador[] = [];
  const porCuenta = new Map<string, FilaBorrador>();
  for (const f of filas) {
    if (!esFilaTerceroSufijo(f)) {
      out.push(f);
      continue;
    }
    const acc = porCuenta.get(f.codigo);
    if (!acc) {
      // Primera fila de la cuenta → fila consolidada (crudo = la cuenta, sin el NIT).
      const consol: FilaBorrador = { ...f, codigoCrudo: f.codigo };
      porCuenta.set(f.codigo, consol);
      out.push(consol);
    } else {
      acc.saldoInicial += f.saldoInicial;
      acc.debitos += f.debitos;
      acc.creditos += f.creditos;
      acc.saldoFinal += f.saldoFinal;
    }
  }
  return out;
}
