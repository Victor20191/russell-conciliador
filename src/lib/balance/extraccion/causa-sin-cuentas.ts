// Causa de una lectura que NO produjo ninguna cuenta. Es pura (sin BD ni IA) y
// SOLO describe lo ocurrido: no decide qué archivos se aceptan ni cuáles se
// rechazan (eso lo siguen decidiendo el modelo y `transformar.ts`).
//
// Existe porque el rechazo del modelo (`importable=false`) llegaba al usuario como
// «No se leyó ninguna cuenta del archivo. Revisa las excepciones.», y el motivo
// real quedaba en la última fila de una tabla con scroll. Sin ese dato el usuario
// toma el fallo por temporal o por el peso del archivo y reintenta la lectura.
//
// Sin dependencias en tiempo de ejecución: lo importa también el modal (cliente).
import type { Excepcion, MappingSpec } from "./esquema";

/** Regla de la excepción FINAL que `transformar.ts` añade cuando el archivo no es importable. */
export const REGLA_ARCHIVO_NO_IMPORTABLE = "Archivo no importable";
/**
 * Texto de respaldo de esa excepción cuando el modelo no dio motivo. Es una
 * recomendación genérica, NO la causa: no debe presentarse como motivo.
 */
export const ACCION_RESPALDO_NO_IMPORTABLE = "Solicitar un balance con saldos.";
/** La hoja del plan no existe en el archivo: única excepción de archivo que por sí sola deja 0 cuentas. */
export const REGLA_HOJA_NO_ENCONTRADA = "Hoja no encontrada";

/** Excepciones a nivel de archivo (`fila == null`) que explican por sí solas un resultado vacío. */
const REGLAS_QUE_EXPLICAN_SIN_CUENTAS: readonly string[] = [REGLA_HOJA_NO_ENCONTRADA];

export const MENSAJE_SIN_CUENTAS = "No se leyó ninguna cuenta del archivo.";
const PREFIJO_RECHAZO = "No se cargó el archivo:";
const SIN_MOTIVO_NI_COLUMNAS = "no se pudo tomar como balance de prueba.";

/** Lo que el usuario necesita saber de un archivo que el modelo marcó como no importable. */
export type RechazoLectura = {
  /** Motivo que dio el modelo; `null` si no dio ninguno (el texto de respaldo no cuenta). */
  motivo: string | null;
  /** Columnas de montos que el mapa de la lectura no trae, con su nombre para el usuario. */
  columnasFaltantes: string[];
};

export type CausaSinCuentas = {
  /** Frase que dice la causa por sí sola: se usa donde solo se pinta `message`. */
  mensaje: string;
  /** Presente solo cuando el modelo rechazó el archivo. */
  rechazo: RechazoLectura | null;
};

type ColumnasMonto = Partial<Pick<
  MappingSpec["columnas"],
  "saldoInicial" | "debitos" | "creditos" | "saldoFinal" | "saldoFinalDebito" | "saldoFinalCredito"
>>;

const noMapeada = (columna: number | undefined): boolean => !(typeof columna === "number" && columna > 0);

/**
 * Columnas de montos que el mapa no trae (índice 0 = «la columna no existe»).
 * El saldo final falta solo si no hay ni la columna única ni el par débito/crédito.
 */
export function columnasFaltantesDelMapa(columnas: ColumnasMonto | null | undefined): string[] {
  if (!columnas) return [];
  const faltantes: string[] = [];
  if (noMapeada(columnas.saldoInicial)) faltantes.push("Saldo inicial");
  if (noMapeada(columnas.debitos)) faltantes.push("Débitos");
  if (noMapeada(columnas.creditos)) faltantes.push("Créditos");
  if (noMapeada(columnas.saldoFinal) && noMapeada(columnas.saldoFinalDebito) && noMapeada(columnas.saldoFinalCredito)) {
    faltantes.push("Saldo final");
  }
  return faltantes;
}

/** «A», «A y B», «A, B y C». */
function enumerar(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

const conPuntoFinal = (texto: string): string => (/[.!?]$/.test(texto) ? texto : `${texto}.`);

/** ¿Es la excepción final que marca el archivo como no importable? */
export function esExcepcionDeRechazo(e: Excepcion): boolean {
  return e.fila == null && e.regla === REGLA_ARCHIVO_NO_IMPORTABLE;
}

/** Excepciones sin la del rechazo (el panel ya la muestra aparte). */
export function excepcionesSinRechazo(excepciones: Excepcion[]): Excepcion[] {
  return excepciones.filter((e) => !esExcepcionDeRechazo(e));
}

/**
 * Explica por qué un resultado quedó con 0 cuentas. `spec` es el plan tabular
 * usado (null en PDF o documento: ahí no hay columnas que revisar).
 */
export function causaSinCuentas(
  resultado: { excepciones: Excepcion[] },
  spec: { columnas: ColumnasMonto } | null | undefined,
): CausaSinCuentas {
  const excepcionRechazo = [...resultado.excepciones].reverse().find(esExcepcionDeRechazo);
  if (excepcionRechazo) {
    const accion = excepcionRechazo.accion.trim();
    const motivo = accion !== "" && accion !== ACCION_RESPALDO_NO_IMPORTABLE ? accion : null;
    const columnasFaltantes = columnasFaltantesDelMapa(spec?.columnas);
    const detalle = columnasFaltantes.length > 0
      ? `${columnasFaltantes.length === 1 ? "le falta la columna" : "le faltan las columnas"} ${enumerar(columnasFaltantes)}.`
      : (motivo ?? SIN_MOTIVO_NI_COLUMNAS);
    return { mensaje: `${PREFIJO_RECHAZO} ${detalle}`, rechazo: { motivo, columnasFaltantes } };
  }

  const explicacion = [...resultado.excepciones]
    .reverse()
    .find((e) => e.fila == null && REGLAS_QUE_EXPLICAN_SIN_CUENTAS.includes(e.regla));
  if (explicacion) {
    const regla = explicacion.regla.trim().replace(/[.!?]+$/, "");
    const accion = explicacion.accion.trim();
    return { mensaje: `${MENSAJE_SIN_CUENTAS} Causa: ${regla}.${accion ? ` ${conPuntoFinal(accion)}` : ""}`, rechazo: null };
  }
  return { mensaje: `${MENSAJE_SIN_CUENTAS} Revisa las excepciones.`, rechazo: null };
}
