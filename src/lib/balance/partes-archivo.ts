// Balance PARTIDO en varios archivos: cuando el ERP no alcanza a generar el balance
// de un período en un solo archivo (p. ej. SIESA en Zarzal), el usuario sube la
// primera parte y agrega las demás desde el borrador. Todas entran al MISMO staging
// antes de confirmar, de modo que jerarquía, cuadre y validaciones se calculan sobre
// el balance completo y la confirmación produce UNA sola versión.
//
// Lógica PURA (sin BD): registro de partes, desplazamiento de `filaNum`, coherencia
// de NIT/período entre partes y detección de cuentas de movimiento repetidas.
import type { FilaBorrador } from "./borrador";
import { nitCoincide, nucleoNit } from "@/lib/nit";

/** Límite defensivo de archivos por borrador. */
export const MAX_PARTES_BALANCE = 20;

export type ParteArchivoBalance = {
  numero: number;
  /** UUID de la solicitud que agregó la parte (idempotencia). null en la parte 1. */
  solicitudId: string | null;
  archivoNombre: string;
  archivoTam: string | null;
  /** Rango de `filaNum` que ocupa el archivo dentro del staging (inclusivo). */
  filaDesde: number;
  filaHasta: number;
  /** Filas que aportó al staging principal. */
  filas: number;
  agregadoPor: string | null;
  agregadoEn: string | null;
};

function entero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isInteger(valor) ? valor : null;
}

function textoONull(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim().length > 0 ? valor : null;
}

/** Lee el JSON persistido (`partes_archivo`/`archivos_cargue`); descarta entradas inválidas. */
export function leerPartesArchivo(valor: unknown): ParteArchivoBalance[] {
  if (!Array.isArray(valor)) return [];
  const partes: ParteArchivoBalance[] = [];
  for (const bruto of valor) {
    if (bruto == null || typeof bruto !== "object") continue;
    const p = bruto as Record<string, unknown>;
    const numero = entero(p.numero);
    const filaDesde = entero(p.filaDesde);
    const filaHasta = entero(p.filaHasta);
    const archivoNombre = textoONull(p.archivoNombre);
    if (numero == null || filaDesde == null || filaHasta == null || archivoNombre == null) continue;
    partes.push({
      numero,
      solicitudId: textoONull(p.solicitudId),
      archivoNombre,
      archivoTam: textoONull(p.archivoTam),
      filaDesde,
      filaHasta,
      filas: entero(p.filas) ?? 0,
      agregadoPor: textoONull(p.agregadoPor),
      agregadoEn: textoONull(p.agregadoEn),
    });
  }
  return partes.sort((a, b) => a.numero - b.numero);
}

/**
 * Partes vigentes de un borrador. Un lote sin registro (todos los anteriores a esta
 * función, o el que aún no recibe su segunda parte) es UNA parte que ocupa todo el
 * staging actual.
 */
export function partesDelLote(
  registro: unknown,
  lote: {
    archivoNombre: string;
    archivoTam: string | null;
    cargadoPor: string | null;
    creadoEn: Date | string | null;
  },
  staging: { maxFilaNum: number | null; filas: number },
): ParteArchivoBalance[] {
  const partes = leerPartesArchivo(registro);
  if (partes.length > 0) return partes;
  return [{
    numero: 1,
    solicitudId: null,
    archivoNombre: lote.archivoNombre,
    archivoTam: lote.archivoTam,
    filaDesde: 1,
    filaHasta: staging.maxFilaNum ?? 0,
    filas: staging.filas,
    agregadoPor: lote.cargadoPor,
    agregadoEn: lote.creadoEn == null
      ? null
      : typeof lote.creadoEn === "string" ? lote.creadoEn : lote.creadoEn.toISOString(),
  }];
}

/**
 * Desplaza la numeración de una parte nueva para que quede DESPUÉS de todo lo que ya
 * está en el staging. Cada archivo numera desde 1: sin esto chocarían los `filaNum`
 * de los que dependen el orden del árbol, las omisiones y los re-parentados.
 */
export function desplazarFilas<T extends { filaNum: number; padreManual?: number | null }>(
  filas: readonly T[],
  desplazamiento: number,
): T[] {
  return filas.map((fila) => ({
    ...fila,
    filaNum: fila.filaNum + desplazamiento,
    ...(fila.padreManual != null ? { padreManual: fila.padreManual + desplazamiento } : {}),
  }));
}

/** Nombre compuesto del cargue («ESF.xls + ER.xls») para listados y encabezado. */
export function nombreArchivosCargue(partes: readonly Pick<ParteArchivoBalance, "archivoNombre">[]): string {
  return partes.map((p) => p.archivoNombre).join(" + ");
}

/** Tamaños de las partes («6,4 MB + 6,3 MB»); null si ninguna lo registró. */
export function tamanoArchivosCargue(partes: readonly Pick<ParteArchivoBalance, "archivoTam">[]): string | null {
  const tamanos = partes.map((p) => p.archivoTam).filter((t): t is string => t != null);
  return tamanos.length > 0 ? tamanos.join(" + ") : null;
}

/** Número de parte al que pertenece una fila del staging; null si no cae en ninguna. */
export function parteDeFila(
  partes: readonly Pick<ParteArchivoBalance, "numero" | "filaDesde" | "filaHasta">[],
  filaNum: number,
): number | null {
  return partes.find((p) => filaNum >= p.filaDesde && filaNum <= p.filaHasta)?.numero ?? null;
}

export type IdentidadParte = {
  nit: string | null;
  periodoInicial: string | null;
  periodoFinal: string | null;
};

/**
 * Una parte adicional debe ser del MISMO cliente y período que el borrador. Solo se
 * compara lo que ambos lados detectaron: muchos ERP no rotulan el NIT ni el período
 * en el archivo, y su ausencia no es evidencia de que la parte sea ajena.
 * Devuelve el motivo del rechazo o null si es coherente.
 */
export function validarCoherenciaParte(borrador: IdentidadParte, parte: IdentidadParte): string | null {
  if (
    borrador.nit && parte.nit
    && nucleoNit(borrador.nit).length >= 5 && nucleoNit(parte.nit).length >= 5
    && !nitCoincide(borrador.nit, parte.nit)
  ) {
    return `El archivo es del NIT ${parte.nit} y el borrador del NIT ${borrador.nit}: las partes deben ser del mismo cliente.`;
  }
  if (borrador.periodoFinal && parte.periodoFinal && borrador.periodoFinal !== parte.periodoFinal) {
    return `El archivo tiene fecha de corte ${parte.periodoFinal} y el borrador ${borrador.periodoFinal}: las partes deben ser del mismo período.`;
  }
  if (borrador.periodoInicial && parte.periodoInicial && borrador.periodoInicial !== parte.periodoInicial) {
    return `El archivo inicia el ${parte.periodoInicial} y el borrador el ${borrador.periodoInicial}: las partes deben ser del mismo período.`;
  }
  return null;
}

type MovimientoComparable = { codigo: string; debitos: number; creditos: number; saldoFinal: number };

const claveMovimiento = (m: MovimientoComparable) =>
  `${m.codigo}|${Math.round(m.debitos * 100)}|${Math.round(m.creditos * 100)}|${Math.round(m.saldoFinal * 100)}`;

/**
 * ¿La parte nueva es, en esencia, un archivo que YA está en el borrador? Se considera
 * repetida cuando al menos el 90 % de sus cuentas de movimiento con código numérico
 * ya existen con los mismos importes. Evita subir dos veces la misma parte, que
 * duplicaría el balance entero; un solapamiento parcial lo informa el aviso de
 * cuentas repetidas y lo decide el usuario.
 */
export function pareceArchivoRepetido(
  existentes: readonly MovimientoComparable[],
  nuevos: readonly MovimientoComparable[],
): boolean {
  const comparables = nuevos.filter((m) => /^\d+$/.test(m.codigo));
  if (comparables.length === 0) return false;
  const ya = new Set(existentes.filter((m) => /^\d+$/.test(m.codigo)).map(claveMovimiento));
  const coincidencias = comparables.filter((m) => ya.has(claveMovimiento(m))).length;
  return coincidencias / comparables.length >= 0.9;
}

export type OcurrenciaCuentaParte = {
  parte: number;
  filaNum: number;
  saldoInicial: number;
  debitos: number;
  creditos: number;
  saldoFinal: number;
};

export type CuentaRepetidaEntrePartes = {
  codigo: string;
  nombre: string;
  ocurrencias: OcurrenciaCuentaParte[];
  /** true = mismos cuatro importes en todas las partes: probable duplicado. */
  importesIguales: boolean;
};

const TOLERANCIA_CENTAVO = 0.005;

function mismosImportes(a: OcurrenciaCuentaParte, b: OcurrenciaCuentaParte): boolean {
  return Math.abs(a.saldoInicial - b.saldoInicial) < TOLERANCIA_CENTAVO
    && Math.abs(a.debitos - b.debitos) < TOLERANCIA_CENTAVO
    && Math.abs(a.creditos - b.creditos) < TOLERANCIA_CENTAVO
    && Math.abs(a.saldoFinal - b.saldoFinal) < TOLERANCIA_CENTAVO;
}

/**
 * Cuentas de MOVIMIENTO (no omitidas) que aparecen en más de una parte. Las
 * agrupadoras repetidas son normales —cada archivo trae su propio subtotal parcial
 * de la mayor— y no se informan. Con importes idénticos es un probable duplicado
 * (el usuario decide cuál omitir); con importes distintos la carga los suma.
 */
export function detectarCuentasRepetidasEntrePartes(
  filas: readonly Pick<FilaBorrador, "filaNum" | "codigo" | "nombre" | "tipoFila" | "tipoFilaForzado" | "omitida" | "saldoInicial" | "debitos" | "creditos" | "saldoFinal">[],
  partes: readonly Pick<ParteArchivoBalance, "numero" | "filaDesde" | "filaHasta">[],
): CuentaRepetidaEntrePartes[] {
  if (partes.length < 2) return [];
  const porCodigo = new Map<string, { nombre: string; ocurrencias: OcurrenciaCuentaParte[] }>();
  for (const fila of filas) {
    if ((fila.tipoFilaForzado ?? fila.tipoFila) !== "movimiento" || fila.omitida === true) continue;
    if (!/^\d+$/.test(fila.codigo)) continue;
    const parte = parteDeFila(partes, fila.filaNum);
    if (parte == null) continue;
    const grupo = porCodigo.get(fila.codigo) ?? { nombre: fila.nombre, ocurrencias: [] };
    grupo.ocurrencias.push({
      parte,
      filaNum: fila.filaNum,
      saldoInicial: fila.saldoInicial,
      debitos: fila.debitos,
      creditos: fila.creditos,
      saldoFinal: fila.saldoFinal,
    });
    porCodigo.set(fila.codigo, grupo);
  }
  const repetidas: CuentaRepetidaEntrePartes[] = [];
  for (const [codigo, grupo] of porCodigo) {
    if (new Set(grupo.ocurrencias.map((o) => o.parte)).size < 2) continue;
    const [primera, ...resto] = grupo.ocurrencias;
    repetidas.push({
      codigo,
      nombre: grupo.nombre,
      ocurrencias: grupo.ocurrencias,
      importesIguales: resto.every((o) => mismosImportes(primera, o)),
    });
  }
  return repetidas.sort((a, b) => a.codigo.localeCompare(b.codigo));
}
