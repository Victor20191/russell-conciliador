// Transformación DETERMINISTA del balance (sin IA, sin BD): aplica el plan que
// detectó el modelo (MappingSpec) a todas las filas, o valida las filas que el
// modelo extrajo directamente (PDF). Normaliza montos multi-formato, conserva la
// CUENTA como texto, filtra padres/totales, agrega por tercero y valida la
// ecuación de control fila por fila. Es puro y testeable (`transformar.test.ts`).
import { CUADRE_NO_APLICA } from "./esquema";
import type { CuadreTotales, Estandar, Excepcion, ExtraccionDirecta, MappingSpec, Origen, ResumenAuditoria } from "./esquema";
import type { CuentaCruda } from "@/lib/balance/calcular";
import type { CeldaCruda, GridHoja } from "./ingesta";

// Nivel mínimo de imputación del PUC: ninguna cuenta de MOVIMIENTO es más corta
// que la subcuenta (6 dígitos). Clases/grupos/cuentas (1/2/4 díg.) nunca son
// hojas aunque el archivo las traiga "sueltas" (sin subcuentas debajo).
const LONGITUD_MIN_IMPUTABLE = 6;

export type Cabecera = {
  nit: Origen;
  periodoInicial: Origen;
  periodoFinal: Origen;
  estandar: Estandar;
};

export type ParamsExtraccion = {
  nit: string | null;
  periodoInicial: string | null;
  periodoFinal: string | null;
  estandar: Estandar;
};

export type ResultadoTransform = {
  importReady: CuentaCruda[];
  excepciones: Excepcion[];
  resumen: ResumenAuditoria;
  cabecera: Cabecera;
  cuadre: CuadreTotales; // cuadre de las hojas contra la fila TOTALES del archivo
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
  det: { nit: Origen; periodoInicial: Origen; periodoFinal: Origen; estandar: Estandar },
  params: ParamsExtraccion,
): Cabecera {
  return {
    nit: elegir(params.nit, det.nit),
    periodoInicial: elegir(params.periodoInicial, det.periodoInicial),
    periodoFinal: elegir(params.periodoFinal, det.periodoFinal),
    estandar: params.estandar !== "AUTO" ? params.estandar : det.estandar,
  };
}

// ---------------- Ruta tabular (MappingSpec → filas) ----------------

type FilaParcial = { code: string; name: string; si: number; db: number; cr: number; saldo: number };

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
      cuadre: CUADRE_NO_APLICA,
    };
  }

  const hoja = hojas.find((h) => h.nombre === spec.hoja) ?? hojas[0];
  if (!hoja) {
    return {
      importReady: [],
      excepciones: [...excepciones, { hoja: spec.hoja, fila: null, campo: "hoja", valor: spec.hoja, regla: "Hoja no encontrada", accion: "Revisar el nombre de la hoja." }],
      resumen: resumenVacio(cabecera, spec.signoCredito),
      cabecera,
      cuadre: CUADRE_NO_APLICA,
    };
  }

  const cols = spec.columnas;
  const tieneInicial = cols.saldoInicial > 0;
  const tieneMovimientos = cols.debitos > 0 || cols.creditos > 0;
  const validarControl = tieneInicial && tieneMovimientos;
  // Pasada 1 (jerarquía por PREFIJO): reúne TODOS los códigos numéricos de la
  // hoja. Una cuenta es HOJA (movimiento real) si su código no es prefijo de
  // ningún otro más largo del archivo; es AGRUPADORA si tiene hijos debajo. Esto
  // reemplaza la antigua heurística por longitud fija, que perdía las hojas de 6
  // dígitos sin auxiliares cuando OTRAS cuentas del archivo llegaban al nivel 8.
  const codigos: string[] = [];
  for (let r = spec.primeraFilaDatos - 1; r < hoja.filas.length; r++) {
    const code = normalizarCodigo(cell(hoja.filas[r] ?? [], cols.codigo));
    if (/^\d+$/.test(code)) codigos.push(code);
  }
  const ancestros = prefijosDe(codigos);

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
    // ¿Es cuenta de movimiento (hoja)? Columna marcadora si el archivo la trae;
    // si no, detección estructural por prefijo (no es prefijo de otra) + piso PUC.
    if (!esHoja(code, fila, spec, ancestros)) {
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
    });
  }

  const agregadas = spec.agregarPorTercero ? agregarPorCuenta(parciales) : parciales;
  const { movimiento, agrupadoras } = contarJerarquia(codigos, ancestros);

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

  // Cuadre OBLIGATORIO contra el gran total del archivo, sobre lo que
  // EFECTIVAMENTE se importa/persiste (importReady, ya sin las filas de descuadre
  // de control): así "cuadra" garantiza que lo guardado coincide con TOTALES, no
  // un conjunto distinto al persistido.
  const sumaDebitos = importReady.reduce((s, f) => s + Math.abs(f.debitos ?? 0), 0);
  const sumaCreditos = importReady.reduce((s, f) => s + Math.abs(f.creditos ?? 0), 0);
  const cuadre = construirCuadre(detectarTotales(hoja, spec), sumaDebitos, sumaCreditos);

  return {
    importReady,
    excepciones,
    resumen: {
      filasLeidas,
      filasExcluidas,
      filasImportables: importReady.length,
      filasDescuadre,
      cuentasMovimiento: movimiento,
      cuentasAgrupadoras: agrupadoras,
      nit: cabecera.nit,
      periodoInicial: cabecera.periodoInicial,
      periodoFinal: cabecera.periodoFinal,
      estandar: cabecera.estandar,
      convencionCredito: spec.signoCredito,
    },
    cabecera,
    cuadre,
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
      cuadre: CUADRE_NO_APLICA,
    };
  }

  // Misma detección de jerarquía por prefijo que la ruta tabular: descarta las
  // cuentas padre que el modelo haya devuelto junto a sus auxiliares.
  const codigos = extr.filas.map((f) => normalizarCodigo(f.cuenta)).filter((c) => /^\d+$/.test(c));
  const ancestros = prefijosDe(codigos);
  const base: FilaParcial[] = extr.filas
    .filter((f) => {
      const c = normalizarCodigo(f.cuenta);
      return /^\d+$/.test(c) && c.length >= LONGITUD_MIN_IMPUTABLE && !ancestros.has(c);
    })
    .map((f) => ({
      code: normalizarCodigo(f.cuenta),
      name: f.nombre || normalizarCodigo(f.cuenta),
      si: f.saldoInicial ?? 0,
      db: Math.abs(f.debitos ?? 0),
      cr: Math.abs(f.creditos ?? 0),
      saldo: f.saldo ?? 0,
    }));
  const filasLeidas = extr.filas.length;
  const filasExcluidas = filasLeidas - base.length;
  const { movimiento, agrupadoras } = contarJerarquia(codigos, ancestros);
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
      cuentasMovimiento: movimiento,
      cuentasAgrupadoras: agrupadoras,
      nit: cabecera.nit,
      periodoInicial: cabecera.periodoInicial,
      periodoFinal: cabecera.periodoFinal,
      estandar: cabecera.estandar,
      convencionCredito: "firmado",
    },
    cabecera,
    // La extracción directa de PDF no expone una fila TOTALES fiable: el cuadre
    // queda a la validación interna por partida doble (no bloquea).
    cuadre: CUADRE_NO_APLICA,
  };
}

// ---------------- Auxiliares ----------------

function cell(fila: CeldaCruda[], col1: number | null): CeldaCruda {
  if (col1 == null || col1 < 1) return null; // 0/negativo = columna ausente
  return fila[col1 - 1] ?? null;
}

/**
 * Conjunto de prefijos PROPIOS de todos los códigos. Un código que aparece aquí
 * es AGRUPADORA (es prefijo de otro más largo → tiene hijos); si no aparece, es
 * HOJA (movimiento real: nadie cuelga de él). Mismo criterio que la detección de
 * hojas de `calcular.ts`, pero aplicado YA en la selección de filas.
 */
function prefijosDe(codigos: Iterable<string>): Set<string> {
  const prefijos = new Set<string>();
  for (const code of codigos) {
    for (let i = 1; i < code.length; i++) prefijos.add(code.slice(0, i));
  }
  return prefijos;
}

/**
 * ¿La fila es una cuenta de MOVIMIENTO (hoja)? Base estructural: código de ≥6
 * dígitos (nivel imputable del PUC) que NO sea prefijo de otro. Si el archivo
 * trae una columna marcadora de imputable, esta REFINA la base (no la sustituye):
 * nunca se importa una cuenta con hijos en el archivo aunque la marca la señale,
 * para no doble-contar una agrupadora marcada por error.
 */
function esHoja(code: string, fila: CeldaCruda[], spec: MappingSpec, ancestros: Set<string>): boolean {
  const estructural = code.length >= LONGITUD_MIN_IMPUTABLE && !ancestros.has(code);
  if (spec.reglaDetalle.tipo === "columna" && spec.reglaDetalle.columna != null) {
    const marca = texto(cell(fila, spec.reglaDetalle.columna)).toLowerCase();
    const esperado = (spec.reglaDetalle.valor ?? "").toLowerCase().trim();
    if (esperado) return marca === esperado && estructural;
  }
  return estructural;
}

/** Cuenta hojas (movimiento) vs. agrupadoras entre los códigos numéricos únicos. */
function contarJerarquia(codigos: Iterable<string>, ancestros: Set<string>): { movimiento: number; agrupadoras: number } {
  let movimiento = 0;
  let agrupadoras = 0;
  for (const code of new Set(codigos)) {
    if (code.length >= LONGITUD_MIN_IMPUTABLE && !ancestros.has(code)) movimiento++;
    else agrupadoras++;
  }
  return { movimiento, agrupadoras };
}

/**
 * Busca la fila del GRAN TOTAL del archivo para cuadrar contra ella. La señal
 * definitoria es que el gran total de un balance de prueba **cuadra**: la suma de
 * débitos ≈ la suma de créditos (partida doble). Por eso una candidata válida
 * debe: tener código NO imputable, un rótulo con "total"† que NO sea un subtotal
 * por sección (TOTAL ACTIVOS, PASIVOS, INGRESOS…, plural/acentos incluidos), y
 * traer AMBOS lados (débito>0 y crédito>0) con `|débito − crédito|` dentro del 1 %.
 * Entre las válidas toma la de mayor magnitud (el gran total ≥ cualquier
 * subtotal). Esto descarta los subtotales de una sola sección y las filas
 * narrativas/ruido con la palabra "total". Si no halla ninguna válida (o falta
 * alguna columna de movimiento) devuelve no detectado y NO se bloquea el cargue
 * (queda la validación interna por partida doble).
 * † también "sumas iguales", el rótulo clásico del cuadre contable.
 */
function detectarTotales(hoja: GridHoja, spec: MappingSpec): { detectado: boolean; debitos: number; creditos: number } {
  const cols = spec.columnas;
  if (cols.debitos < 1 || cols.creditos < 1) return { detectado: false, debitos: 0, creditos: 0 };
  let mejor: { debitos: number; creditos: number; mag: number } | null = null;
  for (let r = Math.max(spec.primeraFilaDatos - 1, 0); r < hoja.filas.length; r++) {
    const fila = hoja.filas[r] ?? [];
    const code = normalizarCodigo(cell(fila, cols.codigo));
    if (/^\d+$/.test(code)) continue; // una fila con código imputable no es la de totales
    const rotulo = fila.map((c) => texto(c)).join(" ").toLowerCase();
    if (!/\btotal(es)?\b|sumas?\s+iguales|gran\s+total/.test(rotulo)) continue;
    // Excluye los SUBTOTALES por sección/clase (en singular y plural, con o sin
    // acentos): solo el GRAN total del reporte cuadra contra todas las hojas.
    if (/\b(activos?|pasivos?|patrimonios?|ingresos?|gastos?|costos?|[oó]rdenes?|orden|resultados?|corrientes?|clases?|grupos?)\b/.test(rotulo)) continue;
    const d = Math.abs(normalizarMonto(cell(fila, cols.debitos)) ?? 0);
    const c = Math.abs(normalizarMonto(cell(fila, cols.creditos)) ?? 0);
    if (d <= 0 || c <= 0) continue; // el gran total tiene AMBOS lados informados
    if (Math.abs(d - c) > Math.max(1, Math.max(d, c) * 0.01)) continue; // … y cuadra (Σdéb ≈ Σcré)
    const mag = d + c;
    if (!mejor || mag > mejor.mag) mejor = { debitos: d, creditos: c, mag };
  }
  return mejor ? { detectado: true, debitos: mejor.debitos, creditos: mejor.creditos } : { detectado: false, debitos: 0, creditos: 0 };
}

/** Arma el resultado del cuadre con tolerancia max(1 COP, 0.5% del total). Puro:
 *  lo reusa la Server Action para RE-evaluar el cuadre en el servidor sobre las
 *  cuentas validadas (no se confía en el veredicto del payload del cliente). */
export function construirCuadre(totales: { detectado: boolean; debitos: number; creditos: number }, sumaDebitos: number, sumaCreditos: number): CuadreTotales {
  const toleranciaDebitos = Math.max(1, Math.abs(totales.debitos) * 0.005);
  const toleranciaCreditos = Math.max(1, Math.abs(totales.creditos) * 0.005);
  const diferenciaDebitos = sumaDebitos - totales.debitos;
  const diferenciaCreditos = sumaCreditos - totales.creditos;
  const cuadra = totales.detectado && Math.abs(diferenciaDebitos) <= toleranciaDebitos && Math.abs(diferenciaCreditos) <= toleranciaCreditos;
  return {
    detectado: totales.detectado,
    totalDebitos: totales.debitos,
    totalCreditos: totales.creditos,
    sumaDebitos,
    sumaCreditos,
    diferenciaDebitos,
    diferenciaCreditos,
    toleranciaDebitos,
    toleranciaCreditos,
    cuadra,
  };
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
    const k = f.code;
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
    cuentasMovimiento: 0,
    cuentasAgrupadoras: 0,
    nit: cabecera.nit,
    periodoInicial: cabecera.periodoInicial,
    periodoFinal: cabecera.periodoFinal,
    estandar: cabecera.estandar,
    convencionCredito: conv,
  };
}
