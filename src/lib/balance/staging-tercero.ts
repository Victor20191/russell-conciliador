// Staging PARALELO del detalle por tercero (cuenta × NIT) de un lote de importación.
//
// El staging principal NO conserva el tercero (en el camino «columna tercero mapeada»
// la transformación agrega por cuenta ANTES de persistir, y en los formatos con la
// fila NIT embebida el pipeline del borrador las colapsa al leer). Este módulo deriva
// ese detalle en el ÚNICO momento en que existe completo — la lectura del archivo — y
// lo prepara para persistirse en `balance_importacion_staging_tercero`, de donde la
// promoción lo captura hacia `balance_tercero_*` cuando la apertura declarada es
// «por terceros».
//
// Módulo PURO (sin BD ni `server-only`); reusa los detectores de `terceros.ts` (mismos
// gates battle-tested: no se dispara en informes normales) y la clave canónica de NIT
// de `normalizarTerceroModulo` (la misma bajo la que cruzan los módulos CAR/CXP/…).
import type { FilaBorrador } from "./borrador";
import type { FilaDetalle } from "./calcular";
import { descomponerCuenta } from "./calcular";
import {
  esBalancePorTercero,
  esBalancePorTerceroSufijo,
  esFilaConSufijo,
  esFilaGenericoTercero,
  esFilaTercero,
  esFilaTerceroSufijo,
} from "./terceros";
import { normalizarTerceroModulo } from "@/lib/modulos/tercero";
import { nucleoNit } from "@/lib/nit";
import { reconocerIdentidadTercero, type IdentidadTercero } from "./identidad-tercero";

/** Fila del staging paralelo: UNA por (cuenta, tercero) tal como vino en el archivo. */
export type FilaTerceroCruda = {
  identidadTercero?: IdentidadTercero;
  filaNum: number;
  /** Código NORMALIZADO de la cuenta a la que pertenece el tercero (ancla de herencia). */
  codigo: string;
  codigoCrudo: string | null;
  nombreCuenta: string | null;
  /** Clave canónica del NIT (`nucleoNit`, sin DV); null = tercero genérico/sin NIT. */
  nitTercero: string | null;
  nombreTercero: string | null;
  saldoInicial: number;
  debitos: number;
  creditos: number;
  saldoFinal: number;
};

/** Fila lista para insertar en `balance_tercero_detalle` al capturar. */
export type FilaCapturaTercero = {
  identidadTercero?: IdentidadTercero;
  cuenta2: string;
  cuenta4: string;
  cuenta6: string;
  cuenta8: string;
  nombreCuenta: string;
  cuenta6Russell: string | null;
  coincidencia: number | null;
  nitTercero: string | null;
  nombreTercero: string | null;
  saldoInicial: number;
  debitos: number;
  creditos: number;
  saldoFinal: number;
};

type FilaStagingEntrada = Pick<
  FilaBorrador,
  "filaNum" | "codigo" | "codigoCrudo" | "nombre" | "tipoFila" | "saldoInicial" | "debitos" | "creditos" | "saldoFinal"
>;

const NOMBRE_GENERICO = "Genérico";
// NIT/cédula pegado como ÚLTIMO tramo del código con sufijos (`120520-0-00-800011002`).
const SUFIJO_NIT_FINAL = /-(\d{7,})$/;

/**
 * Deriva el staging paralelo del lote. La fuente con PRIORIDAD son las filas que la
 * transformación capturó del spec (camino «columna tercero mapeada»): si las hay,
 * mandan y NO se corre la heurística (evita doble captura). Sin ellas se derivan los
 * formatos con la fila NIT embebida en el código: A (fila de tercero aparte, anclada
 * por adyacencia a la última cuenta previa) y B (NIT en el sufijo del código, ya
 * truncado por `normalizarCodigo`). Un informe normal devuelve `[]`.
 */
export function derivarStagingTercero(
  filasCrudas: readonly FilaStagingEntrada[],
  filasTerceroSpec: readonly FilaTerceroCruda[],
): FilaTerceroCruda[] {
  if (filasTerceroSpec.length > 0) return [...filasTerceroSpec];
  if (esBalancePorTercero([...filasCrudas])) return derivarFormatoFilaAparte(filasCrudas);
  if (esBalancePorTerceroSufijo([...filasCrudas])) return derivarFormatoSufijo(filasCrudas);
  return [];
}

/** Formato «fila NIT aparte»: cada fila de tercero cuelga (por adyacencia) de la
 *  última fila previa con código de cuenta. Sin cuenta previa no hay ancla y la
 *  fila se descarta (pasa p. ej. con un encabezado repetido al inicio). */
function derivarFormatoFilaAparte(filas: readonly FilaStagingEntrada[]): FilaTerceroCruda[] {
  const out: FilaTerceroCruda[] = [];
  let cuentaActual: FilaStagingEntrada | null = null;
  for (const f of filas) {
    const esGenerico = esFilaGenericoTercero(f);
    if (esFilaTercero(f) || esGenerico) {
      if (!cuentaActual) continue;
      const t = esGenerico
        ? { nitCanonico: null, nombre: NOMBRE_GENERICO }
        : normalizarTerceroModulo(f.codigoCrudo || f.codigo);
      out.push({
        filaNum: f.filaNum,
        codigo: cuentaActual.codigo,
        codigoCrudo: f.codigoCrudo || null,
        nombreCuenta: cuentaActual.nombre || null,
        nitTercero: t.nitCanonico,
        nombreTercero: t.nombre,
        identidadTercero: reconocerIdentidadTercero({ documento: esGenerico ? "" : f.codigoCrudo || f.codigo, nombre: t.nombre || (f.nombre !== cuentaActual.nombre && f.nombre !== f.codigoCrudo && f.nombre !== f.codigo ? f.nombre : null) }),
        saldoInicial: f.saldoInicial,
        debitos: f.debitos,
        creditos: f.creditos,
        saldoFinal: f.saldoFinal,
      });
      continue;
    }
    // Nueva cuenta de contexto: cualquier fila con código numérico que no sea un
    // pie/total. Una agrupadora también corta el bloque (sus terceros no existen).
    if (f.tipoFila !== "total" && /^\d+$/.test(f.codigo) && f.codigo !== "") cuentaActual = f;
  }
  return out;
}

/** Formato «NIT en el sufijo»: el código normalizado ya es el de la cuenta (truncado
 *  en el primer guion); el NIT es el último tramo del crudo. El sufijo genérico
 *  (`-0-00` sin NIT) es el tercero «genérico». */
function derivarFormatoSufijo(filas: readonly FilaStagingEntrada[]): FilaTerceroCruda[] {
  const out: FilaTerceroCruda[] = [];
  for (const f of filas) {
    if (!esFilaConSufijo(f) || f.codigo === "") continue;
    let nit: string | null = null;
    let nombre: string | null = null;
    if (esFilaTerceroSufijo(f)) {
      const m = SUFIJO_NIT_FINAL.exec((f.codigoCrudo ?? "").trim());
      nit = m ? nucleoNit(m[1]) : null;
      if (nit !== null && nit.length < 5) nit = null;
    }
    if (nit === null) nombre = NOMBRE_GENERICO;
    out.push({
      filaNum: f.filaNum,
      codigo: f.codigo,
      codigoCrudo: f.codigoCrudo || null,
      nombreCuenta: f.nombre || null,
      nitTercero: nit,
      nombreTercero: nombre,
      identidadTercero: reconocerIdentidadTercero({ documento: nit ? SUFIJO_NIT_FINAL.exec((f.codigoCrudo ?? "").trim())?.[1] : "" }),
      saldoInicial: f.saldoInicial,
      debitos: f.debitos,
      creditos: f.creditos,
      saldoFinal: f.saldoFinal,
    });
  }
  return out;
}

/**
 * Prepara la CAPTURA hacia `balance_tercero_detalle` al promover el borrador,
 * heredando los ajustes: solo entran los terceros cuya cuenta QUEDÓ en el balance
 * promovido (`filasDet` — una cuenta omitida o reclasificada excluye a sus terceros)
 * y que no fueron tachados fila a fila; cada tercero copia la homologación
 * (`cuenta6Russell`/`coincidencia`) de su cuenta. Además SINTETIZA la fila «propia»
 * de CADA cuenta del balance (sin NIT ni nombre de tercero, montos oficiales): así el
 * dataset cubre TODAS las cuentas (una 14xx sin terceros existe para el cruce de
 * Inventarios) y el árbol por tercero puede exponer el descuadre declarado − Σ.
 */
export function prepararCapturaTercero(
  stagingTercero: readonly FilaTerceroCruda[],
  filasDet: readonly FilaDetalle[],
  filaNumsOmitidas: ReadonlySet<number>,
): { filas: FilaCapturaTercero[]; terceros: number; cuentasConDetalle: number } {
  const tercerosPorCuenta = new Map<string, FilaTerceroCruda[]>();
  for (const t of stagingTercero) {
    if (filaNumsOmitidas.has(t.filaNum)) continue;
    const cuenta8 = descomponerCuenta(t.codigo).cuenta8;
    if (cuenta8 === "") continue;
    const lista = tercerosPorCuenta.get(cuenta8);
    if (lista) lista.push(t);
    else tercerosPorCuenta.set(cuenta8, [t]);
  }

  const filas: FilaCapturaTercero[] = [];
  const nits = new Set<string>();
  let cuentasConDetalle = 0;
  for (const det of filasDet) {
    // Fila «propia» de la cuenta: el saldo oficial declarado, sin tercero.
    filas.push({
      cuenta2: det.cuenta2,
      cuenta4: det.cuenta4,
      cuenta6: det.cuenta6,
      cuenta8: det.cuenta8,
      nombreCuenta: det.nombreCuenta,
      cuenta6Russell: det.cuenta6Russell,
      coincidencia: det.coincidencia,
      nitTercero: null,
      nombreTercero: null,
      saldoInicial: det.saldoInicial,
      debitos: det.debitos,
      creditos: det.creditos,
      saldoFinal: det.saldoFinal,
    });
    const terceros = tercerosPorCuenta.get(det.cuenta8);
    if (!terceros) continue;
    cuentasConDetalle++;
    for (const t of terceros) {
      if (t.nitTercero) nits.add(t.nitTercero);
      filas.push({
        cuenta2: det.cuenta2,
        cuenta4: det.cuenta4,
        cuenta6: det.cuenta6,
        cuenta8: det.cuenta8,
        nombreCuenta: det.nombreCuenta,
        cuenta6Russell: det.cuenta6Russell,
        coincidencia: det.coincidencia,
        nitTercero: t.nitTercero,
        // El genérico conserva su rótulo; sin nombre, el NIT ya identifica.
        nombreTercero: t.nombreTercero,
        ...(t.identidadTercero ? { identidadTercero: t.identidadTercero } : {}),
        saldoInicial: t.saldoInicial,
        debitos: t.debitos,
        creditos: t.creditos,
        saldoFinal: t.saldoFinal,
      });
    }
  }
  return { filas, terceros: nits.size, cuentasConDetalle };
}

/**
 * Fila «propia» de una cuenta en `balance_tercero_detalle`: sin NIT ni nombre de
 * tercero. En los cargues CAPTURADOS del borrador es el saldo oficial declarado
 * de la cuenta (existe para TODAS las cuentas del balance); el tercero «Genérico»
 * (nit null, nombre «Genérico») NO es fila propia.
 */
export function esFilaPropiaDeCuenta(fila: { nitTercero: string | null; nombreTercero: string | null }): boolean {
  return !fila.nitTercero?.trim() && !fila.nombreTercero?.trim();
}

/**
 * Deduplica la fila propia al consumir el dataset por tercero: por cuenta, si hay
 * filas de TERCERO se usan solo esas (la propia repite su total y sumarla lo
 * doblaría); una cuenta SIN detalle conserva su(s) fila(s) propia(s). Los cargues
 * legados sin filas propias pasan intactos. Preserva el orden original.
 */
export function filasEfectivasTercero<T extends { cuenta8: string; nitTercero: string | null; nombreTercero: string | null }>(
  filas: readonly T[],
): T[] {
  const cuentasConDetalle = new Set<string>();
  for (const f of filas) if (!esFilaPropiaDeCuenta(f)) cuentasConDetalle.add(f.cuenta8);
  return filas.filter((f) => !esFilaPropiaDeCuenta(f) || !cuentasConDetalle.has(f.cuenta8));
}
