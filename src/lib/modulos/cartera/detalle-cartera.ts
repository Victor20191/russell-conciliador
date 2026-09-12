// CONTRATO del JSON `datos` para las filas de cartera — puro, sin BD.
//
// El motor de módulos lleva las filas del archivo al staging y de ahí al detalle oficial
// pasando SIEMPRE por el mismo campo: `datos`, un JSON llaveado por el nombre del rol. Lo
// que el transform calcula aparte de los roles —los baldes de vencimiento, la suma de esos
// baldes, el saldo que declaraba la columna de total, el saldo que una cabecera declara
// para todo su tercero— no cabe en ese esquema y se perdería en la frontera.
//
// En vez de esparcir claves sueltas por la Server Action, el contrato vive aquí: una
// función lo escribe y otra lo lee. Así el borrador puede editar la fila, la promoción
// puede moverla y la materialización puede reconstruir el saldo por tercero sin que nadie
// tenga que acordarse de qué claves eran.
//
// Las claves llevan el prefijo `_` para no chocar nunca con el nombre de un rol del
// descriptor (los roles son identificadores legibles: `nit`, `documento`, `total`…).
import type { FilaCarteraDetalle, NivelCartera } from "./saldos-tercero";
import type { OrigenCartera } from "./tercero-cartera";

/** Claves reservadas dentro de `datos`. No son roles: las calcula el motor. */
export const CLAVE_EDADES = "_edades";
export const CLAVE_SUMA_EDADES = "_sumaEdades";
export const CLAVE_SALDO_REPORTADO = "_saldoReportado";
export const CLAVE_ORIGEN_VALOR = "_origenValor";
export const CLAVE_SALDO_DECLARADO = "_saldoDeclarado";

export const CLAVES_CARTERA = [
  CLAVE_EDADES,
  CLAVE_SUMA_EDADES,
  CLAVE_SALDO_REPORTADO,
  CLAVE_ORIGEN_VALOR,
  CLAVE_SALDO_DECLARADO,
] as const;

/** Lo que el transform produce además de los roles. */
export type ExtrasCartera = {
  familias?: Record<string, Record<string, number>>;
  sumaFamilia?: number;
  valorReportado?: number | null;
  origenValor?: "columna" | "familia" | "columna_y_familia";
  saldoDeclarado?: number;
};

/**
 * Añade a `datos` lo que el transform calculó aparte de los roles. Devuelve el mismo objeto
 * cuando no hay nada que añadir, para que los módulos sin familias escriban exactamente el
 * JSON de siempre.
 */
export function datosConExtrasCartera(
  datos: Record<string, unknown>,
  extras: ExtrasCartera,
): Record<string, unknown> {
  const edades = extras.familias?.edades;
  const hayAlgo = edades != null
    || extras.sumaFamilia != null
    || extras.valorReportado != null
    || extras.origenValor != null
    || extras.saldoDeclarado != null;
  if (!hayAlgo) return datos;

  const salida: Record<string, unknown> = { ...datos };
  if (edades != null) salida[CLAVE_EDADES] = edades;
  if (extras.sumaFamilia != null) salida[CLAVE_SUMA_EDADES] = extras.sumaFamilia;
  if (extras.valorReportado != null) salida[CLAVE_SALDO_REPORTADO] = extras.valorReportado;
  if (extras.origenValor != null) salida[CLAVE_ORIGEN_VALOR] = extras.origenValor;
  if (extras.saldoDeclarado != null) salida[CLAVE_SALDO_DECLARADO] = extras.saldoDeclarado;
  return salida;
}

const numero = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};

/** Los baldes guardados, saneados: solo pares rótulo → número. */
export function leerEdades(datos: Record<string, unknown>): Record<string, number> | null {
  const crudo = datos[CLAVE_EDADES];
  if (crudo == null || typeof crudo !== "object" || Array.isArray(crudo)) return null;
  const salida: Record<string, number> = {};
  for (const [etiqueta, valor] of Object.entries(crudo as Record<string, unknown>)) {
    const n = numero(valor);
    if (n != null) salida[etiqueta] = n;
  }
  return Object.keys(salida).length > 0 ? salida : null;
}

/** El saldo que una cabecera declara para todo su tercero, si esta fila es una cabecera. */
export function leerSaldoDeclarado(datos: Record<string, unknown>): number | null {
  return numero(datos[CLAVE_SALDO_DECLARADO]);
}

/**
 * Reconstruye la fila que necesita la materialización a partir de lo persistido. Es la
 * INVERSA de `datosConExtrasCartera`: junta los roles y las claves reservadas.
 *
 * `nivel` e `imputable` no viven en el JSON sino en columnas propias del detalle, porque
 * son lo que se consulta y se indexa; llegan por parámetro.
 */
export function filaCarteraDesdeDetalle(
  fila: {
    filaNum: number;
    valor: number;
    datos: Record<string, unknown>;
    nivel?: string | null;
    imputable?: boolean | null;
    cuentaCliente?: string | null;
    origenCartera?: string | null;
  },
  nivelPorDefecto: NivelCartera,
): FilaCarteraDetalle {
  const datos = fila.datos ?? {};
  const nivel: NivelCartera = fila.nivel === "tercero" || fila.nivel === "documento" ? fila.nivel : nivelPorDefecto;
  const origen = fila.origenCartera === "nacional" || fila.origenCartera === "exterior"
    ? (fila.origenCartera as OrigenCartera)
    : null;
  return {
    filaNum: fila.filaNum,
    valor: fila.valor,
    imputable: fila.imputable !== false,
    nivel,
    saldoDeclarado: leerSaldoDeclarado(datos),
    cuentaCliente: fila.cuentaCliente ?? (typeof datos.cuenta === "string" ? datos.cuenta : null),
    origenCartera: origen,
    edades: leerEdades(datos),
    sumaEdades: numero(datos[CLAVE_SUMA_EDADES]),
    saldoReportado: numero(datos[CLAVE_SALDO_REPORTADO]),
    diasVencidos: numero(datos.diasVencidos),
    nit: datos.nit,
    dv: datos.dv,
    nombre: datos.nombre,
    sucursal: datos.sucursal,
  };
}

/**
 * Rótulos de los baldes presentes en un conjunto de filas, en el orden en que aparecen.
 * Es lo que se congela en `modulo_dato_encabezado.rangos_edades` para que la pantalla sepa
 * qué columnas pintar sin abrir el JSON de cada fila.
 */
export function rotulosDeEdades(filas: readonly { datos: Record<string, unknown> }[]): string[] {
  const vistos = new Set<string>();
  for (const f of filas) {
    for (const etiqueta of Object.keys(leerEdades(f.datos ?? {}) ?? {})) vistos.add(etiqueta);
  }
  return [...vistos];
}
