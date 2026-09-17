// TIPO DE FORMATO de un archivo de Cartera o CxP — puro.
//
// La firma distingue cuatro formatos y cada uno se valida distinto:
//  - por documento: cada fila es un documento; el control es que la Σ de los documentos de un
//    cliente dé el total que el archivo declara para ese cliente;
//  - por edades: cada fila es un tercero con su deuda repartida por edades; el control es que la
//    Σ de las edades dé el total de la fila;
//  - por documento y edades: documentos con sus edades; aplican los dos controles;
//  - por cuenta y NIT: cada fila es un tercero con su saldo, colgando de la cuenta que lo
//    agrupa, sin documento ni edades (SIESA «Reporte de estado de cuentas»); el control es que
//    la Σ de los terceros de cada cuenta dé el total que el archivo imprime para esa cuenta.
// El administrador lo declara en el patrón (`SpecModulo.tipoFormato`). Los specs anteriores no lo
// traen: se DEDUCE del nivel de la fila y de los rangos de edades, y se rotula como deducido.
import type { SpecModulo } from "../extraccion/esquema";
import type { NivelCartera } from "./saldos-tercero";

export type TipoFormatoCartera = NonNullable<SpecModulo["tipoFormato"]>;

export const TIPOS_FORMATO_CARTERA: readonly TipoFormatoCartera[] = ["documento", "edades", "documento_edades", "cuenta_tercero"];

export const INFO_TIPO_FORMATO: Record<TipoFormatoCartera, { etiqueta: string; fila: string; controles: string[] }> = {
  documento: {
    etiqueta: "Por documento",
    fila: "Cada fila es un documento (factura, nota) del tercero",
    controles: ["La suma de los documentos de cada cliente contra el total del cliente"],
  },
  edades: {
    etiqueta: "Por edades",
    fila: "Cada fila es un tercero con su saldo repartido por edades",
    controles: ["La suma de las edades contra el total de cada fila"],
  },
  documento_edades: {
    etiqueta: "Por documento y edades",
    fila: "Cada fila es un documento con su saldo repartido por edades",
    controles: [
      "La suma de los documentos de cada cliente contra el total del cliente",
      "La suma de las edades contra el total de cada documento",
    ],
  },
  cuenta_tercero: {
    etiqueta: "Por cuenta y NIT",
    fila: "Cada fila es un tercero con su saldo, bajo la cuenta que lo agrupa; sin documento ni edades",
    controles: ["La suma de los terceros de cada cuenta contra el total de la cuenta"],
  },
};

export function esTipoFormatoCartera(valor: unknown): valor is TipoFormatoCartera {
  return typeof valor === "string" && (TIPOS_FORMATO_CARTERA as readonly string[]).includes(valor);
}

/** ¿El tipo trae un documento por fila? */
export const tipoConDocumento = (tipo: TipoFormatoCartera): boolean => tipo === "documento" || tipo === "documento_edades";
/** ¿El tipo reparte el saldo por edades? */
export const tipoConEdades = (tipo: TipoFormatoCartera): boolean => tipo === "edades" || tipo === "documento_edades";
/** ¿El tipo cuelga los terceros de la cuenta que los agrupa (su control es por cuenta)? */
export const tipoPorCuentaYTercero = (tipo: TipoFormatoCartera): boolean => tipo === "cuenta_tercero";

/** Nivel de la fila que corresponde al tipo. */
export function nivelDeTipoFormato(tipo: TipoFormatoCartera): NivelCartera {
  return tipoConDocumento(tipo) ? "documento" : "tercero";
}

type SpecFormato = Pick<SpecModulo, "tipoFormato" | "nivel" | "columnas" | "familias" | "edadesModo">;

/** ¿El mapeo lee la antigüedad? En columnas (rangos) o como rótulo de una columna. */
export function specConEdades(spec: SpecFormato): boolean {
  if ((spec.familias?.edades?.length ?? 0) > 0) return true;
  return spec.edadesModo === "largo" && (spec.columnas.edadEtiqueta ?? 0) >= 1;
}

/**
 * Nivel de la fila de un spec: el del tipo declarado; si no, el que se declaró; y, sin nada, el
 * que sugiere el mapeo (una columna de documento → cada fila es un documento).
 */
export function nivelCarteraDeSpec(spec: Partial<SpecFormato>): NivelCartera {
  if (esTipoFormatoCartera(spec.tipoFormato)) return nivelDeTipoFormato(spec.tipoFormato);
  if (spec.nivel === "tercero" || spec.nivel === "documento") return spec.nivel;
  return (spec.columnas?.documento ?? 0) >= 1 ? "documento" : "tercero";
}

/**
 * Tipo que sugiere el mapeo (para specs sin tipo y para proponerlo en el editor). Sin documento,
 * lo que separa «por edades» de «por cuenta y NIT» es que el mapeo lea la antigüedad: un archivo
 * que solo trae cuenta, NIT y saldo no es un reporte de edades sin baldes, es otro formato.
 */
export function tipoFormatoSugerido(spec: SpecFormato): TipoFormatoCartera {
  const documento = nivelCarteraDeSpec({ ...spec, tipoFormato: undefined }) === "documento";
  if (!documento) return specConEdades(spec) ? "edades" : "cuenta_tercero";
  return specConEdades(spec) ? "documento_edades" : "documento";
}

/** El tipo del spec y si lo declaró el administrador o se dedujo. */
export function tipoFormatoCartera(spec: SpecFormato): { tipo: TipoFormatoCartera; declarado: boolean } {
  if (esTipoFormatoCartera(spec.tipoFormato)) return { tipo: spec.tipoFormato, declarado: true };
  return { tipo: tipoFormatoSugerido(spec), declarado: false };
}

/** Formato de un archivo del cargue, como se congela en `modulo_dato_encabezado.formatos_cartera`. */
export type FormatoArchivoCartera = {
  loteId: string;
  archivo: string;
  tipo: TipoFormatoCartera;
  declarado: boolean;
  /** ¿El archivo trae una columna de total con que comparar las edades? */
  conColumnaTotal: boolean;
};

/** Formato del archivo de un lote a partir de su spec (tal como quedó en `specJson`). */
export function formatoArchivoCartera(
  spec: Partial<SpecFormato> & { columnas?: Record<string, number> },
  datos: { loteId: string; archivo: string; rolTotal: string },
): FormatoArchivoCartera {
  const columnas = spec.columnas ?? {};
  const { tipo, declarado } = tipoFormatoCartera({ ...spec, columnas });
  return { loteId: datos.loteId, archivo: datos.archivo, tipo, declarado, conColumnaTotal: (columnas[datos.rolTotal] ?? 0) >= 1 };
}

/** Lee `formatos_cartera`; null si el cargue es anterior o el JSON no es legible. */
export function leerFormatosCartera(json: unknown): FormatoArchivoCartera[] | null {
  if (!Array.isArray(json)) return null;
  const salida: FormatoArchivoCartera[] = [];
  for (const item of json) {
    if (!item || typeof item !== "object") return null;
    const f = item as Record<string, unknown>;
    if (typeof f.loteId !== "string" || typeof f.archivo !== "string" || !esTipoFormatoCartera(f.tipo)) return null;
    salida.push({ loteId: f.loteId, archivo: f.archivo, tipo: f.tipo, declarado: f.declarado === true, conColumnaTotal: f.conColumnaTotal === true });
  }
  return salida;
}

/**
 * Lo que el tipo exige del mapeo, además de las columnas obligatorias del módulo (el tercero y el
 * saldo ya lo son), con el mensaje para quien configura el patrón. El formato por cuenta y NIT no
 * pide nada más: es el archivo que no trae ni documento ni edades.
 */
export function faltantesTipoFormato(spec: SpecFormato): string[] {
  if (!esTipoFormatoCartera(spec.tipoFormato)) return [];
  const faltan: string[] = [];
  const nombre = INFO_TIPO_FORMATO[spec.tipoFormato].etiqueta.toLowerCase();
  if (tipoConDocumento(spec.tipoFormato) && (spec.columnas.documento ?? 0) < 1) {
    faltan.push(`El formato ${nombre} necesita la columna del documento.`);
  }
  if (tipoConEdades(spec.tipoFormato) && !specConEdades(spec)) {
    faltan.push(`El formato ${nombre} necesita los rangos de vencimiento.`);
  }
  return faltan;
}
