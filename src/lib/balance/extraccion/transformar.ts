// Transformación DETERMINISTA del balance (sin IA, sin BD): aplica el plan que
// detectó el modelo (MappingSpec) a todas las filas, o valida las filas que el
// modelo extrajo directamente (PDF). Normaliza montos multi-formato, conserva la
// CUENTA como texto, filtra padres/totales, agrega por tercero y valida la
// ecuación de control fila por fila. Es puro y testeable (`transformar.test.ts`).
import type { Estandar, Excepcion, ExtraccionDirecta, MappingSpec, Origen, ResumenAuditoria } from "./esquema";
import type { CuentaCruda } from "@/lib/balance/calcular";
import type { CeldaCruda, GridHoja } from "./ingesta";

export type Cabecera = {
  nit: Origen;
  periodoInicial: Origen;
  periodoFinal: Origen;
  centro: Origen;
  estandar: Estandar;
};

export type ParamsExtraccion = {
  nit: string | null;
  periodoInicial: string | null;
  periodoFinal: string | null;
  centro: string | null;
  estandar: Estandar;
};

export type ResultadoTransform = {
  importReady: CuentaCruda[];
  excepciones: Excepcion[];
  resumen: ResumenAuditoria;
  cabecera: Cabecera;
};

// ---------------- Normalización numérica ----------------

/**
 * Convierte un texto numérico a número aceptando formato es-CO (`1.234.567,89`),
 * US (`1,234,567.89`), `COP`, `$`, espacios y negativos entre paréntesis.
 * Devuelve null si no es numérico; 0 si está vacío.
 */
export function parseNumeroFlexible(raw: string): number | null {
  let s = (raw ?? "").trim();
  if (s === "" || s === "-") return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[^\d.,\-]/g, ""); // quita $, COP, espacios, NBSP, letras
  if (s.startsWith("-")) neg = true;
  s = s.replace(/-/g, "");
  if (s === "") return null; // tenía contenido pero ningún dígito → no numérico

  const comas = (s.match(/,/g) ?? []).length;
  const puntos = (s.match(/\./g) ?? []).length;
  let norm: string;
  if (comas > 0 && puntos > 0) {
    // El último separador es el decimal.
    norm = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (comas > 0) {
    norm = comas === 1 && /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (puntos > 0) {
    norm = puntos === 1 && /\.\d{1,2}$/.test(s) ? s : s.replace(/\./g, "");
  } else {
    norm = s;
  }
  const n = Number(norm);
  if (Number.isNaN(n)) return null;
  return neg ? -n : n;
}

/** Monto desde una celda: número exacto si la celda es numérica; si no, parsea texto. */
export function normalizarMonto(c: CeldaCruda): number | null {
  if (c == null || c === "") return 0;
  if (typeof c === "number") return c;
  if (typeof c === "boolean") return c ? 1 : 0;
  return parseNumeroFlexible(String(c));
}

/** CUENTA como texto: dígitos con ceros iniciales; sin espacios ni puntos de miles. */
export function normalizarCodigo(c: CeldaCruda): string {
  if (c == null) return "";
  return String(c).replace(/[\s.]/g, "").trim();
}

const texto = (c: CeldaCruda): string => (c == null ? "" : String(c).replace(/\s+/g, " ").trim());

/**
 * Ecuación de control. Acepta ambas orientaciones del signo (firmado vs
 * magnitud por cuenta de crédito): la fila cuadra si el movimiento explica el
 * cambio de saldo en cualquiera de las dos.
 */
export function controlConcuerda(si: number, db: number, cr: number, saldo: number, tol = 1): boolean {
  return Math.abs(saldo - (si + db - cr)) <= tol || Math.abs(saldo - (si - db + cr)) <= tol;
}

// ---------------- Resolución de cabecera ----------------

function elegir(param: string | null, detectado: Origen): Origen {
  if (param != null && param !== "") return { valor: param, fuente: "PARAMETRO" };
  return detectado;
}

function resolverCabecera(
  det: { nit: Origen; periodoInicial: Origen; periodoFinal: Origen; centroOperativo: Origen; estandar: Estandar },
  params: ParamsExtraccion,
): Cabecera {
  return {
    nit: elegir(params.nit, det.nit),
    periodoInicial: elegir(params.periodoInicial, det.periodoInicial),
    periodoFinal: elegir(params.periodoFinal, det.periodoFinal),
    centro: elegir(params.centro, det.centroOperativo),
    estandar: params.estandar !== "AUTO" ? params.estandar : det.estandar,
  };
}

// ---------------- Ruta tabular (MappingSpec → filas) ----------------

type FilaParcial = { code: string; name: string; si: number; db: number; cr: number; saldo: number; centro: string | null };

export function transformarTabular(spec: MappingSpec, hojas: GridHoja[], params: ParamsExtraccion): ResultadoTransform {
  const excepciones: Excepcion[] = [...spec.excepciones];
  const cabecera = resolverCabecera({ ...spec }, params);

  if (!spec.importable) {
    return {
      importReady: [],
      excepciones: [
        ...excepciones,
        { hoja: spec.hoja, fila: null, campo: null, valor: null, regla: "Archivo no importable", accion: spec.motivoNoImportable ?? "Solicitar un balance con saldos." },
      ],
      resumen: resumenVacio(cabecera, spec.signoCredito),
      cabecera,
    };
  }

  const hoja = hojas.find((h) => h.nombre === spec.hoja) ?? hojas[0];
  if (!hoja) {
    return {
      importReady: [],
      excepciones: [...excepciones, { hoja: spec.hoja, fila: null, campo: "hoja", valor: spec.hoja, regla: "Hoja no encontrada", accion: "Revisar el nombre de la hoja." }],
      resumen: resumenVacio(cabecera, spec.signoCredito),
      cabecera,
    };
  }

  const cols = spec.columnas;
  const tieneInicial = cols.saldoInicial > 0;
  const tieneMovimientos = cols.debitos > 0 || cols.creditos > 0;
  const validarControl = tieneInicial && tieneMovimientos;
  // Longitud MÍNIMA inclusiva de una cuenta de detalle. Default 6 (no 7) para
  // alinear con la ruta directa/PDF (`validarDirecta`, >=6) y con el nivel de
  // imputación del estándar Russell (cuentas de 6 dígitos).
  const minLen = spec.reglaDetalle.longitudMin ?? 6;

  let filasLeidas = 0;
  let filasExcluidas = 0;
  const parciales: FilaParcial[] = [];

  for (let r = spec.primeraFilaDatos - 1; r < hoja.filas.length; r++) {
    const fila = hoja.filas[r] ?? [];
    const filaNum = r + 1;
    const code = normalizarCodigo(cell(fila, cols.codigo));
    const name = texto(cell(fila, cols.nombre));
    if (!code && !name) continue; // fila vacía
    filasLeidas++;

    // Totales/secciones: código no numérico.
    if (!/^\d+$/.test(code)) {
      filasExcluidas++;
      continue;
    }
    // ¿Es fila de detalle?
    if (!esDetalle(code, fila, spec, minLen)) {
      filasExcluidas++;
      continue;
    }

    const si = tieneInicial ? normalizarMonto(cell(fila, cols.saldoInicial)) : 0;
    const db = cols.debitos > 0 ? normalizarMonto(cell(fila, cols.debitos)) : 0;
    const cr = cols.creditos > 0 ? normalizarMonto(cell(fila, cols.creditos)) : 0;
    const saldo = leerSaldoFinal(fila, cols, si ?? 0, db ?? 0, cr ?? 0);

    if (si === null || db === null || cr === null || saldo === null) {
      excepciones.push({ hoja: hoja.nombre, fila: filaNum, campo: "monto", valor: null, regla: "Monto no numérico", accion: "Corregir el valor en el archivo." });
      continue;
    }
    parciales.push({
      code,
      name: name || code,
      si: si ?? 0,
      db: Math.abs(db ?? 0), // movimientos en magnitud positiva
      cr: Math.abs(cr ?? 0),
      saldo: saldo ?? 0,
      centro: cols.centro > 0 ? texto(cell(fila, cols.centro)) || null : null,
    });
  }

  const agregadas = spec.agregarPorTercero ? agregarPorCuenta(parciales) : parciales;

  const importReady: CuentaCruda[] = [];
  let filasDescuadre = 0;
  for (const f of agregadas) {
    if (validarControl && !controlConcuerda(f.si, f.db, f.cr, f.saldo)) {
      filasDescuadre++;
      excepciones.push({
        hoja: hoja.nombre,
        fila: null,
        campo: "saldo",
        valor: `${f.code}: SI ${f.si} + D ${f.db} − C ${f.cr} ≠ ${f.saldo}`,
        regla: "Descuadre (SALDO ≠ SALDO_INICIAL + DÉBITOS − CRÉDITOS)",
        accion: "Revisar la cuenta; no se importa.",
      });
      continue;
    }
    importReady.push({ code: f.code, name: f.name, prevBalance: f.si, balance: f.saldo, debitos: f.db, creditos: f.cr });
  }

  return {
    importReady,
    excepciones,
    resumen: {
      filasLeidas,
      filasExcluidas,
      filasImportables: importReady.length,
      filasDescuadre,
      nit: cabecera.nit,
      periodoInicial: cabecera.periodoInicial,
      periodoFinal: cabecera.periodoFinal,
      centro: cabecera.centro,
      estandar: cabecera.estandar,
      convencionCredito: spec.signoCredito,
    },
    cabecera,
  };
}

// ---------------- Ruta directa (PDF/texto → filas del modelo) ----------------

export function validarDirecta(extr: ExtraccionDirecta, params: ParamsExtraccion): ResultadoTransform {
  const excepciones: Excepcion[] = [...extr.excepciones];
  const cabecera = resolverCabecera({ ...extr }, params);

  if (!extr.importable) {
    return {
      importReady: [],
      excepciones: [...excepciones, { hoja: null, fila: null, campo: null, valor: null, regla: "Archivo no importable", accion: extr.motivoNoImportable ?? "Solicitar un balance con saldos." }],
      resumen: resumenVacio(cabecera, "firmado"),
      cabecera,
    };
  }

  const base: FilaParcial[] = extr.filas
    .filter((f) => /^\d+$/.test(normalizarCodigo(f.cuenta)) && normalizarCodigo(f.cuenta).length >= 6)
    .map((f) => ({
      code: normalizarCodigo(f.cuenta),
      name: f.nombre || normalizarCodigo(f.cuenta),
      si: f.saldoInicial ?? 0,
      db: Math.abs(f.debitos ?? 0),
      cr: Math.abs(f.creditos ?? 0),
      saldo: f.saldo ?? 0,
      centro: f.centro,
    }));
  const filasLeidas = extr.filas.length;
  const filasExcluidas = filasLeidas - base.length;
  const agregadas = extr.agregarPorTercero ? agregarPorCuenta(base) : base;

  const importReady: CuentaCruda[] = [];
  let filasDescuadre = 0;
  for (const f of agregadas) {
    // En PDF solo validamos si hay movimientos informados.
    const hayMov = f.db !== 0 || f.cr !== 0 || f.si !== 0;
    if (hayMov && !controlConcuerda(f.si, f.db, f.cr, f.saldo)) {
      filasDescuadre++;
      excepciones.push({ hoja: null, fila: null, campo: "saldo", valor: `${f.code}`, regla: "Descuadre (SALDO ≠ SALDO_INICIAL + DÉBITOS − CRÉDITOS)", accion: "Revisar la cuenta; no se importa." });
      continue;
    }
    importReady.push({ code: f.code, name: f.name, prevBalance: f.si, balance: f.saldo, debitos: f.db, creditos: f.cr });
  }

  return {
    importReady,
    excepciones,
    resumen: {
      filasLeidas,
      filasExcluidas,
      filasImportables: importReady.length,
      filasDescuadre,
      nit: cabecera.nit,
      periodoInicial: cabecera.periodoInicial,
      periodoFinal: cabecera.periodoFinal,
      centro: cabecera.centro,
      estandar: cabecera.estandar,
      convencionCredito: "firmado",
    },
    cabecera,
  };
}

// ---------------- Auxiliares ----------------

function cell(fila: CeldaCruda[], col1: number | null): CeldaCruda {
  if (col1 == null || col1 < 1) return null; // 0/negativo = columna ausente
  return fila[col1 - 1] ?? null;
}

function esDetalle(code: string, fila: CeldaCruda[], spec: MappingSpec, minLen: number): boolean {
  if (spec.reglaDetalle.tipo === "columna" && spec.reglaDetalle.columna != null) {
    const marca = texto(cell(fila, spec.reglaDetalle.columna)).toLowerCase();
    const esperado = (spec.reglaDetalle.valor ?? "").toLowerCase().trim();
    if (esperado) return marca === esperado;
  }
  return code.length >= minLen;
}

function leerSaldoFinal(fila: CeldaCruda[], cols: MappingSpec["columnas"], si: number, db: number, cr: number): number | null {
  if (cols.saldoFinal > 0) return normalizarMonto(cell(fila, cols.saldoFinal));
  if (cols.saldoFinalDebito > 0 || cols.saldoFinalCredito > 0) {
    const d = cols.saldoFinalDebito > 0 ? normalizarMonto(cell(fila, cols.saldoFinalDebito)) : 0;
    const c = cols.saldoFinalCredito > 0 ? normalizarMonto(cell(fila, cols.saldoFinalCredito)) : 0;
    if (d === null || c === null) return null;
    return d - c;
  }
  return si + Math.abs(db) - Math.abs(cr); // sin columna de saldo final: se computa con los movimientos en magnitud (igual que el control)
}

function agregarPorCuenta(filas: FilaParcial[]): FilaParcial[] {
  const m = new Map<string, FilaParcial>();
  for (const f of filas) {
    const k = `${f.code}|${f.centro ?? ""}`;
    const prev = m.get(k);
    if (!prev) m.set(k, { ...f });
    else {
      prev.si += f.si;
      prev.db += f.db;
      prev.cr += f.cr;
      prev.saldo += f.saldo;
      if (!prev.name && f.name) prev.name = f.name;
    }
  }
  return [...m.values()];
}

function resumenVacio(cabecera: Cabecera, conv: "firmado" | "magnitud"): ResumenAuditoria {
  return {
    filasLeidas: 0,
    filasExcluidas: 0,
    filasImportables: 0,
    filasDescuadre: 0,
    nit: cabecera.nit,
    periodoInicial: cabecera.periodoInicial,
    periodoFinal: cabecera.periodoFinal,
    centro: cabecera.centro,
    estandar: cabecera.estandar,
    convencionCredito: conv,
  };
}
