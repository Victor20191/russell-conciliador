// Extracción PURA "conservar tercero" del balance de comprobación (sin BD, sin Excel).
//
// El pipeline normal (`transformar.ts`) detecta la columna de tercero pero la COLAPSA
// por cuenta (`agregarPorCuenta`) para producir el balance resumido que consume el
// resto de la plataforma. Aquí se hace lo contrario: por cada renglón de detalle se
// emite UNA fila (cuenta + tercero + montos), SIN sumar, para alimentar el dataset
// separado `balance_tercero_encabezado`/`balance_tercero_detalle` (auditorías CXC/CXP).
//
// Ruta AISLADA: no modifica ni es invocada por `transformar.ts` ni por el flujo del
// balance normal (DIAN/prevalidador/conciliaciones no la tocan). Reusa los helpers de
// bajo nivel ya probados (`descomponerCuenta`, `normalizarCodigo`, `normalizarMonto`,
// `normalizarTerceroModulo`) en vez de duplicar su lógica.
import { descomponerCuenta } from "@/lib/balance/calcular";
import { normalizarCodigo, normalizarMonto } from "@/lib/balance/extraccion/transformar";
import { normalizarTerceroModulo } from "@/lib/modulos/tercero";
import type { CeldaCruda, GridHoja } from "@/lib/balance/extraccion/ingesta";
import type { SpecCarga } from "@/lib/balance/extraccion/esquema";

export type FilaBalanceTercero = {
  cuenta2: string;
  cuenta4: string;
  cuenta6: string;
  cuenta8: string;
  nombreCuenta: string;
  nitTercero: string | null; // clave canónica (nucleoNit) o null
  nombreTercero: string | null;
  saldoInicial: number;
  debitos: number;
  creditos: number;
  saldoFinal: number;
};

export type SpecPorTercero = {
  filaEncabezado: number;
  primeraFilaDatos: number; // 1-based sobre la grilla compactada
  columnas: {
    cuenta: number; // índice 1-based
    nombre?: number;
    tercero?: number;
    saldoInicial?: number;
    debitos?: number;
    creditos?: number;
    saldoFinal: number;
  }; // 0/undefined = columna no existe
  signoCredito?: "natural" | "invertido"; // "invertido": columnas débito/crédito intercambiadas
};

export type ResultadoPorTercero = {
  filas: FilaBalanceTercero[];
  filasLeidas: number;
  filasExcluidas: number;
};

function celda(fila: CeldaCruda[], col: number | undefined | null): CeldaCruda {
  if (col == null || col < 1) return null; // 0/undefined = columna ausente
  return fila[col - 1] ?? null;
}

const texto = (c: CeldaCruda): string => (c == null ? "" : String(c).replace(/\s+/g, " ").trim());

/**
 * Recorre `hoja` desde `spec.primeraFilaDatos` y emite una fila por renglón de
 * detalle (cuenta + tercero + montos). NO colapsa por cuenta: el mismo código puede
 * repetirse con terceros distintos y cada uno queda en su propia fila (el saldo
 * consolidado de la cuenta vive en el balance normal, no aquí).
 *
 * Salta filas vacías y filas cuya cuenta no sea un código PUC numérico (encabezados,
 * totales, secciones) — mismo criterio que `transformarTabular`. No lanza: montos no
 * numéricos o celdas ausentes caen a 0.
 */
export function extraerBalancePorTercero(hoja: GridHoja, spec: SpecPorTercero): ResultadoPorTercero {
  const cols = spec.columnas;
  const filas: FilaBalanceTercero[] = [];
  let filasLeidas = 0;
  let filasExcluidas = 0;

  for (let r = spec.primeraFilaDatos - 1; r < hoja.filas.length; r++) {
    const fila = hoja.filas[r] ?? [];
    const codigoCrudo = texto(celda(fila, cols.cuenta));
    const nombreCrudo = texto(celda(fila, cols.nombre));
    if (!codigoCrudo && !nombreCrudo) continue; // fila vacía: no cuenta ni se excluye

    filasLeidas++;
    const code = normalizarCodigo(celda(fila, cols.cuenta));
    if (!/^\d+$/.test(code)) {
      filasExcluidas++; // encabezado/total/sección: sin código PUC imputable
      continue;
    }

    let debitos = cols.debitos ? (normalizarMonto(celda(fila, cols.debitos)) ?? 0) : 0;
    let creditos = cols.creditos ? (normalizarMonto(celda(fila, cols.creditos)) ?? 0) : 0;
    if (spec.signoCredito === "invertido") [debitos, creditos] = [creditos, debitos];
    const saldoInicial = cols.saldoInicial ? (normalizarMonto(celda(fila, cols.saldoInicial)) ?? 0) : 0;
    const saldoFinal = normalizarMonto(celda(fila, cols.saldoFinal)) ?? 0;

    const { nitCanonico, nombre: nombreTercero } = cols.tercero
      ? normalizarTerceroModulo(celda(fila, cols.tercero) as string | number | null)
      : { nitCanonico: null, nombre: null };

    filas.push({
      ...descomponerCuenta(code),
      nombreCuenta: nombreCrudo || code,
      nitTercero: nitCanonico,
      nombreTercero,
      saldoInicial,
      debitos,
      creditos,
      saldoFinal,
    });
  }

  return { filas, filasLeidas, filasExcluidas };
}

export type ConversionSpecPorTercero =
  | { ok: true; spec: SpecPorTercero }
  | { ok: false; message: string };

/**
 * Convierte el spec EDITABLE del modal de carga (`SpecCarga`, el mismo contrato
 * del editor de estructura del balance normal) al `SpecPorTercero` que espera
 * `extraerBalancePorTercero`. Así el modo "por tercero" reusa la detección de
 * columnas (IA o perfil) y el editor ya construidos para el balance normal, en
 * vez de duplicar esa UI.
 *
 * Exigencias propias del modo tercero (más estrictas que el balance normal):
 * código de cuenta en UNA sola columna (sin fragmentar), columna de tercero
 * mapeada y saldo final en una sola columna. No existe un equivalente de
 * "invertido" aquí: el editor ya permite mapear cualquier columna física del
 * archivo al rol de débito o de crédito, así que una inversión real de columnas
 * se corrige reasignando el rol, no con un flag adicional.
 */
export function specCargaASpecPorTercero(spec: SpecCarga): ConversionSpecPorTercero {
  if (!spec.columnas.tercero || spec.columnas.tercero < 1) {
    return { ok: false, message: "Mapea la columna de tercero/NIT del archivo para cargar por tercero." };
  }
  if (!spec.columnas.codigo || spec.columnas.codigo < 1) {
    return {
      ok: false,
      message: spec.columnas.codigoFragmentos.length > 0
        ? "El balance por tercero no admite el código de cuenta fragmentado en varias columnas."
        : "Mapea la columna del código de cuenta.",
    };
  }
  if (!spec.columnas.saldoFinal || spec.columnas.saldoFinal < 1) {
    return { ok: false, message: "Mapea la columna de saldo final (una sola columna) para cargar por tercero." };
  }
  return {
    ok: true,
    spec: {
      filaEncabezado: spec.filaEncabezado,
      primeraFilaDatos: spec.primeraFilaDatos,
      columnas: {
        cuenta: spec.columnas.codigo,
        nombre: spec.columnas.nombre > 0 ? spec.columnas.nombre : undefined,
        tercero: spec.columnas.tercero,
        saldoInicial: spec.columnas.saldoInicial > 0 ? spec.columnas.saldoInicial : undefined,
        debitos: spec.columnas.debitos > 0 ? spec.columnas.debitos : undefined,
        creditos: spec.columnas.creditos > 0 ? spec.columnas.creditos : undefined,
        saldoFinal: spec.columnas.saldoFinal,
      },
      signoCredito: "natural",
    },
  };
}
