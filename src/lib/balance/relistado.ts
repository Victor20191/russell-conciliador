// Colapso del «re-listado con guiones»: algunos ERP exportan cada cuenta DOS veces —
// una con su código PLANO («11050504 DOLARES EN CAJA», correcto y que cuadra) y otra
// RE-LISTADA con el código en notación de guiones («1105-05-04 …» + filas «*SIN
// NOMBRE*»). `normalizarCodigo` trunca los guiones («1105-05-04» → «1105»), así que ese
// re-listado pierde su identidad y crea agrupadoras FANTASMA «1105» con Δ falsos.
//
// La solución (espejo del colapso de terceros) quita del cálculo/árbol únicamente las
// filas con guiones que YA tienen su equivalente plano presente en el archivo —
// duplicados exactos redundantes—, conservando el código plano que cuadra. Es
// inherentemente seguro: sin fila plana gemela no se toca nada (no necesita compuerta).
import type { FilaBorrador } from "./borrador";

// Código en notación de guiones: grupos de dígitos separados por guiones («1105-05-04»).
const CODIGO_CON_GUIONES = /^\d+(?:-\d+)+$/;

/** Conjunto de `codigoCrudo` PLANOS (solo dígitos) presentes en el archivo. */
export function codigosPlanos(filas: Array<Pick<FilaBorrador, "codigoCrudo">>): Set<string> {
  const s = new Set<string>();
  for (const f of filas) {
    const c = (f.codigoCrudo ?? "").trim();
    if (/^\d+$/.test(c)) s.add(c);
  }
  return s;
}

/**
 * ¿Fila del re-listado con guiones REDUNDANTE? Su `codigoCrudo` es un código con
 * guiones y su versión sin guiones ya existe como fila plana en el archivo. Una fila
 * plana o un «código-nombre» (`11050501-CAJA`) no cumplen el patrón → nunca se tocan.
 */
export function esFilaGuionRedundante(f: Pick<FilaBorrador, "codigoCrudo">, planos: Set<string>): boolean {
  const c = (f.codigoCrudo ?? "").trim();
  return CODIGO_CON_GUIONES.test(c) && planos.has(c.replace(/-/g, ""));
}

/**
 * MARCA como `omitida` (no las quita) las filas del re-listado con guiones redundante,
 * conservando el código plano que cuadra. Así el usuario las sigue VIENDO (tachadas) y
 * puede RESCATAR alguna con «Incluir». MUTA `filas` (`omitida`) y devuelve cuántas marcó.
 *
 * Respeta el rescate del usuario: solo marca filas cuyo `omitida` está SIN definir
 * (`undefined`); si el usuario la incluyó a mano (`omitida === false`), no se re-marca.
 * La columna de BD es TRI-ESTADO (`Boolean?`): null = sin tocar, true = omitida,
 * false = rescatada. Los cargadores deben mapear `omitida: f.omitida ?? undefined` para
 * que esta distinción funcione. Las filas con guiones SIN equivalente plano no se tocan.
 */
export function marcarRelistadoGuiones(filas: FilaBorrador[]): number {
  const planos = codigosPlanos(filas);
  let n = 0;
  for (const f of filas) {
    if (f.omitida === undefined && esFilaGuionRedundante(f, planos)) {
      f.omitida = true;
      n++;
    }
  }
  return n;
}
