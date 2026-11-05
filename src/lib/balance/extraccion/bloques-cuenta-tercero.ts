// Balance por tercero con la CUENTA RE-LISTADA antes de sus terceros (QUIFARMA, 2026):
// cada cuenta imputable viene con su código plano («11050501 CAJA GENERAL», el total),
// luego REPETIDA en notación de guiones con los mismos importes («1105-05-01 CAJA
// GENERAL») y debajo sus terceros con ese mismo código: los que traen NIT y, a veces,
// uno SIN documento («*SIN NOMBRE*») que también es parte del saldo de la cuenta.
// Algunas cuentas no traen la fila plana: ahí la fila con guiones ES la cuenta.
//
// Sin esta pasada, todas las filas sin NIT de un código se tomaban como «la cuenta» y se
// sumaban: la cuenta salía doble (plana + repetición) más el tercero sin documento, y ese
// tercero faltaba en el detalle, así que los terceros no sumaban el total de la cuenta.
//
// Módulo PURO: decide por fila (índice) sin tocar la transformación.
import { toleranciaRedondeoTerceros } from "@/lib/balance/staging-tercero";

/** Fila con código numérico de la hoja, con sus importes tal como se leen. */
export type FilaBloque = {
  indice: number;
  codigo: string; // normalizado («1105-05-01» → «11050501»)
  crudo: string; // como viene en el archivo (la notación)
  conIdentidad: boolean; // trae documento (o nombre) del tercero en su columna
  nombre: string;
  saldoInicial: number;
  debitos: number;
  creditos: number;
  saldoFinal: number;
};

export type ClasificacionBloques = {
  /** Filas que REPITEN la cuenta en otra notación con los mismos importes: no se suman. */
  repeticiones: Set<number>;
  /** Filas sin documento que son TERCEROS de la cuenta (p. ej. «*SIN NOMBRE*»). */
  tercerosSinDocumento: Set<number>;
  /** Nombre de la cuenta por código: el de su primera fila sin tercero. */
  nombreCuenta: Map<string, string>;
  /** Códigos cuyo bloque se confirmó (cuenta + repetición y/o terceros sin documento). */
  codigos: Set<string>;
};

const IMPORTES = ["saldoInicial", "debitos", "creditos", "saldoFinal"] as const;

const mismosImportes = (a: FilaBloque, b: FilaBloque): boolean =>
  IMPORTES.every((c) => Math.abs(a[c] - b[c]) < 0.005);

/**
 * Por cada código, la PRIMERA fila sin tercero es la cuenta. De las demás filas sin
 * tercero del mismo código, la primera de cada notación nueva (crudo distinto) con los
 * mismos importes de la cuenta es una REPETICIÓN; el resto son terceros sin documento.
 *
 * Solo se aplica si el bloque lo confirma: los terceros con identidad más los terceros
 * sin documento deben sumar EXACTAMENTE la cuenta en los cuatro importes (tolerancia de
 * redondeo). Si no cuadra —p. ej. el mismo código repetido por sucursal— el código no se
 * toca y sigue el tratamiento anterior. Un código sin terceros y solo repeticiones en
 * otra notación con importes idénticos es la misma cuenta listada dos veces.
 */
export function clasificarBloquesCuentaTercero(filas: readonly FilaBloque[]): ClasificacionBloques {
  const repeticiones = new Set<number>();
  const tercerosSinDocumento = new Set<number>();
  const nombreCuenta = new Map<string, string>();
  const codigos = new Set<string>();
  const porCodigo = new Map<string, FilaBloque[]>();
  for (const f of filas) {
    const grupo = porCodigo.get(f.codigo);
    if (grupo) grupo.push(f);
    else porCodigo.set(f.codigo, [f]);
  }
  for (const [codigo, grupo] of porCodigo) {
    const sinIdentidad = grupo.filter((f) => !f.conIdentidad);
    const cuenta = sinIdentidad[0];
    if (!cuenta) continue;
    nombreCuenta.set(codigo, cuenta.nombre);
    if (sinIdentidad.length < 2) continue;
    const notaciones = new Set([cuenta.crudo]);
    const reps: FilaBloque[] = [];
    const sinDocumento: FilaBloque[] = [];
    for (const f of sinIdentidad.slice(1)) {
      if (!notaciones.has(f.crudo) && mismosImportes(f, cuenta)) reps.push(f);
      else sinDocumento.push(f);
      notaciones.add(f.crudo);
    }
    const detalle = [...grupo.filter((f) => f.conIdentidad), ...sinDocumento];
    if (detalle.length > 0) {
      const tolerancia = Math.max(1, toleranciaRedondeoTerceros(detalle.length));
      const cuadra = IMPORTES.every((c) => Math.abs(detalle.reduce((s, f) => s + f[c], 0) - cuenta[c]) <= tolerancia);
      if (!cuadra) continue;
    }
    codigos.add(codigo);
    for (const f of reps) repeticiones.add(f.indice);
    for (const f of sinDocumento) tercerosSinDocumento.add(f.indice);
  }
  return { repeticiones, tercerosSinDocumento, nombreCuenta, codigos };
}

/** ¿Dos nombres son el mismo, sin importar mayúsculas ni espacios? */
export function mismoNombre(a: string, b: string): boolean {
  const n = (s: string) => s.replace(/\s+/g, " ").trim().toLocaleUpperCase("es");
  return n(a) === n(b);
}
