// Transformación DETERMINISTA del balance (sin IA, sin BD): aplica el plan que
// detectó el modelo (MappingSpec) a todas las filas, o valida las filas que el
// modelo extrajo directamente (PDF). Normaliza montos multi-formato, conserva la
// CUENTA como texto, filtra padres/totales, agrega por tercero y valida la
// ecuación de control fila por fila. Es puro y testeable (`transformar.test.ts`).
import { CUADRE_NO_APLICA } from "./esquema";
import type { CuadreTotales, Estandar, Excepcion, ExtraccionDirecta, MappingSpec, Origen, ResumenAuditoria } from "./esquema";
import { conForzarHoja } from "@/lib/balance/calcular";
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

// Clasificación de cada fila parseada del archivo. La importación promueve solo
// las `movimiento`; el resto se conserva en staging (paso 1) sin descartarse.
export type TipoFila = "movimiento" | "agrupadora" | "total" | "descuadre";

// Fila CRUDA normalizada (un registro por fila leída del archivo), para el
// staging del paso 1. NO se descarta ninguna: padres, totales y descuadres se
// etiquetan con `tipoFila` en vez de tirarse.
export type FilaCruda = {
  hoja: string | null;
  filaNum: number; // índice 1-based de la fila origen
  codigoCrudo: string;
  codigo: string; // normalizado ("" si no numérico)
  nombre: string;
  nivel: number | null; // longitud del código (2/4/6/8)
  tipoFila: TipoFila;
  saldoInicial: number;
  debitos: number;
  creditos: number;
  saldoFinal: number;
};

// Votación de ORIENTACIÓN débito/crédito sobre los valores CRUDOS del archivo
// (antes de que `elegirMovimiento` normalice): cuántas filas de movimiento
// cumplen la ecuación de control solo en la orientación DIRECTA
// (saldo = si + db − cr), solo en la INVERTIDA (saldo = si − db + cr), o en
// ambas (AMBIGUAS: db=cr o sin movimiento — no votan). Una mayoría invertida
// delata columnas débito↔crédito intercambiadas en el mapping spec, que la
// partida doble no detecta por simetría.
export type OrientacionControl = { directa: number; invertida: number; ambiguas: number };

export type ResultadoTransform = {
  importReady: CuentaCruda[];
  filasCrudas: FilaCruda[]; // TODAS las filas leídas (clasificadas), para staging
  excepciones: Excepcion[];
  resumen: ResumenAuditoria;
  cabecera: Cabecera;
  cuadre: CuadreTotales; // cuadre de las hojas contra la fila TOTALES del archivo
  // Metadatos de la lectura para la HUELLA DIAGNÓSTICA (medición): cómo se leyó el
  // archivo («tabular» | «documento» | «plantilla») y la confianza 0..1 que la IA
  // declaró en su mapping spec (solo modo tabular; null/ausente en los demás).
  modo?: string;
  confianza?: number | null;
  // Solo modo tabular con control por fila disponible (saldo inicial + movimientos).
  orientacionControl?: OrientacionControl;
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

/**
 * CUENTA como texto normalizado. Maneja dos casos del archivo:
 *  - código SOLO: `11050501` → `11050501`.
 *  - código EMBEBIDO en el nombre: `11050501 - Caja General` → toma el token de
 *    código inicial → `11050501` (algunos ERP no traen columna de código aparte).
 * Además quita espacios/puntos y el SUFIJO alfabético final (INAC/A/AS):
 * `236550INAC` → `236550`. Si al quitar el sufijo queda vacío (texto puro, p. ej.
 * un rótulo de total), conserva el token para que el filtro `/^\d+$/` lo excluya.
 */
export function normalizarCodigo(c: CeldaCruda): string {
  if (c == null) return "";
  // 0) Filas de SUBTOTAL "al final": algunos ERP rotulan el subtotal en la columna de
  //    código como "TOTAL 110505" / "SUBTOTAL 1105" (el detalle va ANTES y el subtotal
  //    después). Se extrae el código numérico para identificarlas como AGRUPADORAS
  //    (si no, quedan sin código y sin clasificar).
  const tot = /^\s*(?:sub)?total\s*:?\s*([0-9][0-9.\s]*)\s*$/i.exec(String(c));
  if (tot) return tot[1].replace(/[\s.]/g, "");
  // 1) Quita espacios/puntos de FORMATO dentro del código: `0110.05` → `011005`,
  //    ` 11 05 05 ` → `110505`.
  const limpio = String(c).replace(/[\s.]/g, "").trim();
  // 1b) Código PUC RE-LISTADO en notación de GUIONES: la cuenta (grupo) seguida de tramos
  //     de EXACTAMENTE 2 dígitos («1105-05-04», «1130-05-04», «1305-05-05») → son los
  //     NIVELES de la cuenta y se CONCATENAN → `11050504`. El «exactamente 2 díg» lo
  //     distingue de: (a) «código - nombre» (`11050501-CajaGeneral`, tras el guion hay
  //     TEXTO); y (b) el DETALLE POR TERCERO (`120520-0-00-800011002`), que trae un tramo
  //     `-0-` de 1 díg y/o un NIT de ≥7 díg — ese se maneja aparte (truncar en el 1er guion).
  if (/^\d+(?:-\d{2})+$/.test(limpio)) return limpio.replace(/-/g, "");
  // 2) Toma el token de código inicial (por si el nombre va pegado tras un guion:
  //    `11050501-CajaGeneral` → `11050501`).
  const m = /^([0-9][0-9A-Za-z]*)/.exec(limpio);
  const base = m ? m[1] : limpio;
  // 3) Quita el sufijo alfabético final (INAC/A/AS): `236550INAC` → `236550`.
  const sinSufijo = base.replace(/[A-Za-z]+$/, "");
  return sinSufijo.length > 0 ? sinSufijo : base;
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

/**
 * Elige los movimientos (débito/crédito) que EXPLICAN el saldo final reportado.
 * El SIGNO ya viene NORMALIZADO por columna aguas arriba (`transformarTabular`
 * detecta el signo dominante de cada columna por mayoría y deja: dominante →
 * positivo, contrario → negativo). Aquí solo se decide, con el SALDO como verdad
 * (identidad `si + db − cr = saldo`):
 *  1) si los valores TAL CUAL la cumplen, se conservan con su signo (preserva un
 *     valor con signo contrario —reversa— sin marcarlo como falso «invertido»);
 *  2) si no, se devuelven en magnitud — notas débito sin saldo final, donde la
 *     verdad ES la magnitud (la validación de control posterior decide si entra).
 *
 * Para archivos de magnitudes (sin negativos) el resultado es idéntico a
 * `Math.abs`, así que los cargues normales no cambian de comportamiento.
 */
export function elegirMovimiento(si: number, db: number, cr: number, saldo: number, tol = 1): { db: number; cr: number } {
  if (Math.abs(saldo - (si + db - cr)) <= tol) return { db, cr };
  return { db: Math.abs(db), cr: Math.abs(cr) };
}

// Subtotal DUPLICADO: en algunos ERP una cuenta de 6 díg (subtotal) trae saldo
// PROPIO y, además, su detalle vive en una subcuenta de 8 díg del MISMO grupo de
// 4 díg con las CUATRO columnas idénticas (el ERP no anidó el detalle bajo su
// subtotal por código). Contar ambas duplica el monto. Se detecta la de 6 díg (el
// subtotal) para NO importarla: su detalle de 8 díg ya lleva el valor. El match
// EXACTO en las 4 columnas (saldo ini/débito/crédito/saldo final, todas ≠ 0) hace
// casi imposible un falso positivo.
export type FilaMontos = { codigo: string; saldoInicial: number; debitos: number; creditos: number; saldoFinal: number };
export function marcarSubtotalesDuplicados<T extends FilaMontos>(filas: T[]): Set<T> {
  const dup = new Set<T>();
  const firma = (f: FilaMontos) => `${f.saldoInicial}|${f.debitos}|${f.creditos}|${f.saldoFinal}`;
  const trivial = (f: FilaMontos) => f.saldoInicial === 0 && f.debitos === 0 && f.creditos === 0 && f.saldoFinal === 0;
  const porGrupo = new Map<string, T[]>();
  for (const f of filas) {
    if (!/^\d+$/.test(f.codigo)) continue;
    const g = f.codigo.slice(0, 4);
    (porGrupo.get(g) ?? porGrupo.set(g, []).get(g)!).push(f);
  }
  for (const grupo of porGrupo.values()) {
    const firmasOcho = new Set(grupo.filter((f) => f.codigo.length === 8 && !trivial(f)).map(firma));
    if (firmasOcho.size === 0) continue;
    for (const s of grupo) {
      if (s.codigo.length === 6 && !trivial(s) && firmasOcho.has(firma(s))) dup.add(s);
    }
  }
  return dup;
}

// Código REPETIDO: algunos ERP usan el MISMO código para un encabezado (agrupadora)
// y una línea de MOVIMIENTO consecutiva ("una agrupa, la otra contiene movimiento",
// p. ej. `1105 EFECTIVO` = total y `1105 CAJA GENERAL` = la caja real). La detección
// por prefijo marca AMBAS como agrupadora → la línea de movimiento se PERDERÍA al
// cargar. Se conserva la PRIMERA aparición como agrupadora y las repeticiones
// consecutivas del mismo código pasan a MOVIMIENTO. Muta `tipoFila` y devuelve las
// filas reclasificadas (para agregarlas al conjunto imputable). Opera en orden de
// archivo (`filaNum`).
export function reclasificarRepetidos<T extends { filaNum: number; codigo: string; tipoFila: TipoFila }>(filas: T[]): T[] {
  const ord = [...filas].sort((a, b) => a.filaNum - b.filaNum);
  const cambiadas: T[] = [];
  for (let i = 1; i < ord.length; i++) {
    const cur = ord[i];
    const prev = ord[i - 1];
    if (/^\d+$/.test(cur.codigo) && cur.codigo === prev.codigo && cur.tipoFila === "agrupadora" && prev.tipoFila === "agrupadora") {
      cur.tipoFila = "movimiento";
      cambiadas.push(cur);
    }
  }
  return cambiadas;
}

// Filas de PIE/TOTAL del reporte, clasificadas por error como MOVIMIENTO, cuyo
// código NO es numérico: el «Total general» / «Totales» del final, o la marca del
// software del ERP («Siesa Enterprise Net 1.25.0»). Sin código imputable NO son
// cuentas: si quedan como movimiento (a) se cuelgan por ORDEN de la última
// agrupadora abierta, inflando su Δ con el gran total, y (b) se cuentan al cargar.
// Se reclasifican a «total» (no se cuentan; en el árbol quedan como raíz). MUTA
// `filas` y devuelve las reclasificadas.
export function reclasificarNoImputables<T extends { codigo: string; tipoFila: TipoFila }>(filas: T[]): T[] {
  const cambiadas: T[] = [];
  for (const f of filas) {
    if (f.tipoFila === "movimiento" && !/^\d+$/.test(f.codigo)) {
      f.tipoFila = "total";
      cambiadas.push(f);
    }
  }
  return cambiadas;
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
      filasCrudas: [],
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
      filasCrudas: [],
      excepciones: [...excepciones, { hoja: spec.hoja, fila: null, campo: "hoja", valor: spec.hoja, regla: "Hoja no encontrada", accion: "Revisar el nombre de la hoja." }],
      resumen: resumenVacio(cabecera, spec.signoCredito),
      cabecera,
      cuadre: CUADRE_NO_APLICA,
    };
  }

  // Guardia de `primeraFilaDatos`: si el spec dejó filas de DATOS reales entre el
  // encabezado y la primera fila declarada, se amplía el rango (y se avisa).
  const primeraAjustada = ajustarPrimeraFilaDatos(hoja, spec);
  if (primeraAjustada !== spec.primeraFilaDatos) {
    excepciones.push({
      hoja: hoja.nombre,
      fila: primeraAjustada,
      campo: "primeraFilaDatos",
      valor: `F${spec.primeraFilaDatos} → F${primeraAjustada}`,
      regla: "Primera fila de datos corregida (había cuentas antes de la declarada)",
      accion: "Verificar el rango en el editor de estructura si el ajuste no corresponde.",
    });
    spec = { ...spec, primeraFilaDatos: primeraAjustada };
  }

  const cols = spec.columnas;
  const tieneInicial = cols.saldoInicial > 0;
  const tieneMovimientos = cols.debitos > 0 || cols.creditos > 0;
  const validarControl = tieneInicial && tieneMovimientos;
  // Reportes "balance por tercero": algunos ERP traen, para el mismo código,
  // una fila consolidada sin tercero y debajo el desglose por tercero/centro de
  // costo. Si sumamos ambos niveles duplicamos saldos. Cuando exista la fila
  // consolidada, el detalle por tercero es una vista alternativa y se excluye.
  const codigosConConsolidado = new Set<string>();
  const codigosConDetalleTercero = new Set<string>();
  if (cols.tercero > 0) {
    for (let r = spec.primeraFilaDatos - 1; r < hoja.filas.length; r++) {
      const fila = hoja.filas[r] ?? [];
      const code = normalizarCodigo(celdaCodigo(fila, cols));
      if (!/^\d+$/.test(code)) continue;
      if (texto(cell(fila, cols.tercero)) === "") codigosConConsolidado.add(code);
      else codigosConDetalleTercero.add(code);
    }
  }
  const omitirDetalleTercero = (code: string, fila: CeldaCruda[]): boolean =>
    cols.tercero > 0 &&
    codigosConConsolidado.has(code) &&
    codigosConDetalleTercero.has(code) &&
    texto(cell(fila, cols.tercero)) !== "";
  // Pasada 1 (jerarquía por PREFIJO): reúne TODOS los códigos numéricos de la
  // hoja. Una cuenta es HOJA (movimiento real) si su código no es prefijo de
  // ningún otro más largo del archivo; es AGRUPADORA si tiene hijos debajo. Esto
  // reemplaza la antigua heurística por longitud fija, que perdía las hojas de 6
  // dígitos sin auxiliares cuando OTRAS cuentas del archivo llegaban al nivel 8.
  const codigos: string[] = [];
  const saldosNumericos: { code: string; saldo: number }[] = [];
  // Signo DOMINANTE por columna (mayoría de valores no-cero). Un valor con el signo
  // opuesto al dominante de SU columna es "contrario": se sube en negativo y se marca
  // como magnitud en el borrador. En una columna con dominante NEGATIVO (Haber firmado
  // estilo SAP) se niega toda la columna → normales+, contrarios−; en una con dominante
  // POSITIVO (magnitud) se conserva el signo del archivo.
  let dbPos = 0, dbNeg = 0, crPos = 0, crNeg = 0;
  for (let r = spec.primeraFilaDatos - 1; r < hoja.filas.length; r++) {
    const fila = hoja.filas[r] ?? [];
    const code = normalizarCodigo(celdaCodigo(fila, cols));
    if (!/^\d+$/.test(code)) continue;
    codigos.push(code);
    const si = tieneInicial ? normalizarMonto(cell(fila, cols.saldoInicial)) : 0;
    const db = cols.debitos > 0 ? normalizarMonto(cell(fila, cols.debitos)) : 0;
    const cr = cols.creditos > 0 ? normalizarMonto(cell(fila, cols.creditos)) : 0;
    if (db) { if (db > 0) dbPos++; else dbNeg++; }
    if (cr) { if (cr > 0) crPos++; else crNeg++; }
    saldosNumericos.push({ code, saldo: leerSaldoFinal(fila, cols, si ?? 0, db ?? 0, cr ?? 0) ?? 0 });
  }
  const debitoDominanteNeg = dbNeg > dbPos;
  const creditoDominanteNeg = crNeg > crPos;
  const normDb = (v: number) => (debitoDominanteNeg ? -v : v);
  const normCr = (v: number) => (creditoDominanteNeg ? -v : v);
  const ancestros = prefijosDe(codigos);
  // Σ saldo de las HOJAS descendientes por cada código agrupador PRESENTE en el
  // archivo. Distingue, entre los padres SIN negrita, al que ya está explicado
  // por su detalle (importarlo doblaría el saldo) del que trae saldo PROPIO no
  // cubierto (el ERP mal-anidó un imputable — caso 135510 — y hay que rescatarlo).
  const codigosPresentes = new Set(codigos);
  const saldoHojasBajo = new Map<string, number>();
  for (const f of saldosNumericos) {
    if (ancestros.has(f.code)) continue; // solo las hojas suman
    for (let i = 1; i < f.code.length; i++) {
      const p = f.code.slice(0, i);
      if (codigosPresentes.has(p)) saldoHojasBajo.set(p, (saldoHojasBajo.get(p) ?? 0) + f.saldo);
    }
  }

  // ¿La hoja usa NEGRITA como marcador de agrupadora? Es marcador VÁLIDO solo si la
  // negrita marca de verdad las AGRUPADORAS: la mayoría de los PADRES estructurales
  // (código que es prefijo de otro) están en negrita, Y la mayoría de las HOJAS NO.
  // No basta el acuerdo GLOBAL: en un archivo con miles de hojas, unas pocas
  // agrupadoras mal marcadas (p. ej. el ERP solo pone en negrita las de 6 díg y no
  // las clases/grupos) quedan enmascaradas. Si la negrita no marca los padres de
  // forma consistente, se ignora y se clasifica por prefijo (`esHoja`).
  // ¿Balance ABIERTO POR TERCERO con las CUENTAS EN NEGRITA? (SIIGO «balance por tercero»):
  // bajo cada cuenta imputable viene su detalle por tercero; la CUENTA va en negrita y el
  // detalle (código `0` «GENERAL» o un NIT/cédula) va SIN negrita, y la cuenta YA trae el
  // total consolidado. Aquí la negrita marca las HOJAS (no los padres), así que la heurística
  // `usaNegrita` de abajo NO aplica; se descarta el detalle sin negrita (lo hace el bucle) y se
  // conservan solo las cuentas. Detección en ORDEN: fila numérica en negrita = cuenta; fila
  // numérica SIN negrita cuyo código NO EXTIENDE (no empieza por) la última cuenta = tercero.
  const descartarTerceroNegrita = ((): boolean => {
    if (!hoja.negrita) return false;
    let cuentas = 0;
    let terceros = 0;
    let cuentaBold = "";
    for (let r = spec.primeraFilaDatos - 1; r < hoja.filas.length; r++) {
      const code = normalizarCodigo(celdaCodigo(hoja.filas[r] ?? [], cols));
      if (!/^\d+$/.test(code)) continue;
      if (filaEnNegrita(hoja.negrita[r], cols.codigo, cols.nombre)) { cuentas++; cuentaBold = code; }
      else if (cuentaBold && !code.startsWith(cuentaBold)) terceros++;
    }
    return cuentas >= 20 && terceros / (cuentas + terceros) > 0.2;
  })();

  // Cortocircuitado en el patrón por-tercero-negrita: ahí TODAS las cuentas van en negrita
  // (padres Y hojas), así que el gate padres-bold/hojas-no-bold no aplica; manda el prefijo.
  const usaNegrita = !descartarTerceroNegrita && ((): boolean => {
    if (!hoja.negrita) return false;
    let padres = 0;
    let padresBold = 0;
    let hojas = 0;
    let hojasBold = 0;
    for (let r = spec.primeraFilaDatos - 1; r < hoja.filas.length; r++) {
      const code = normalizarCodigo(celdaCodigo(hoja.filas[r] ?? [], cols));
      if (!/^\d+$/.test(code)) continue;
      const enNegrita = filaEnNegrita(hoja.negrita[r], cols.codigo, cols.nombre);
      if (ancestros.has(code)) { padres++; if (enNegrita) padresBold++; }
      else { hojas++; if (enNegrita) hojasBold++; }
    }
    // La negrita debe marcar los padres (≥80%) y NO las hojas (≥80% sin negrita).
    return padres > 0 && hojas > 0 && padresBold / padres >= 0.8 && (hojas - hojasBold) / hojas >= 0.8;
  })();

  let filasLeidas = 0;
  let filasExcluidas = 0;
  const parciales: FilaParcial[] = [];
  let filasDetalleTerceroExcluidas = 0;
  let filasTerceroNegritaExcluidas = 0; // detalle por tercero descartado por negrita
  let cuentaNegritaActual = ""; // código de la última cuenta EN NEGRITA (contexto del descarte)
  const orientacion: OrientacionControl = { directa: 0, invertida: 0, ambiguas: 0 };
  // Todas las filas leídas (sin descartar), para el staging del paso 1.
  const filasCrudas: FilaCruda[] = [];
  // Índices en `filasCrudas` por código de movimiento → re-etiqueta a "descuadre"
  // las que no cuadren tras la agregación.
  const crudasPorCodigo = new Map<string, number[]>();

  for (let r = spec.primeraFilaDatos - 1; r < hoja.filas.length; r++) {
    const fila = hoja.filas[r] ?? [];
    const filaNum = r + 1;
    let codigoCrudo = texto(celdaCodigo(fila, cols));
    let code = normalizarCodigo(celdaCodigo(fila, cols));
    let name = texto(cell(fila, cols.nombre));
    // Si el código va embebido en el nombre ("11050501 - Caja General", "1105 - CAJA"),
    // deja solo el nombre (quita el prefijo "código -"). Requiere dígitos iniciales +
    // guion, así no afecta nombres normales que empiecen por texto. Además, si la fila NO
    // trae código en su columna (ERP que ponen el código de las AGRUPADORAS SOLO en el
    // nombre, y el de las hojas en otra columna), se ADOPTA ese código embebido: así la
    // cuenta se clasifica y anida, en vez de perderse como «total» sin código.
    const emb = /^\s*([0-9][0-9A-Za-z]*)\s*[-–—]\s*(.+)$/.exec(name);
    if (emb) {
      if (!code) {
        code = normalizarCodigo(emb[1]);
        if (code) codigoCrudo = emb[1].trim();
      }
      name = emb[2].trim();
    }
    if (!code && !name) continue; // fila vacía
    filasLeidas++;

    const esNum = /^\d+$/.test(code);
    const si = tieneInicial ? normalizarMonto(cell(fila, cols.saldoInicial)) : 0;
    // Normaliza por el signo DOMINANTE de cada columna: dominante → +, contrario → −.
    const dbRaw = cols.debitos > 0 ? normalizarMonto(cell(fila, cols.debitos)) : 0;
    const crRaw = cols.creditos > 0 ? normalizarMonto(cell(fila, cols.creditos)) : 0;
    const db = dbRaw == null ? null : normDb(dbRaw);
    const cr = crRaw == null ? null : normCr(crRaw);
    const saldo = leerSaldoFinal(fila, cols, si ?? 0, db ?? 0, cr ?? 0);

    // Registra la fila CRUDA (sin descartar). El tipo es provisional para las de
    // movimiento (puede pasar a "descuadre" tras validar el control).
    const registrar = (tipoFila: TipoFila, m: { si: number; db: number; cr: number; saldo: number }): number => {
      filasCrudas.push({
        hoja: hoja.nombre,
        filaNum,
        codigoCrudo,
        codigo: esNum ? code : "",
        nombre: name || code || codigoCrudo,
        nivel: esNum ? code.length : null,
        tipoFila,
        saldoInicial: m.si,
        debitos: m.db,
        creditos: m.cr,
        saldoFinal: m.saldo,
      });
      return filasCrudas.length - 1;
    };

    // Totales/secciones: código no numérico.
    if (!esNum) {
      filasExcluidas++;
      registrar("total", { si: si ?? 0, db: db ?? 0, cr: cr ?? 0, saldo: saldo ?? 0 });
      continue;
    }
    // Balance por tercero con cuentas EN NEGRITA: la cuenta va en negrita; su detalle por
    // tercero (código `0`/NIT que NO extiende la cuenta) va sin negrita → se DESCARTA (la
    // cuenta ya trae el total consolidado). Doble condición (sin-negrita Y no-extiende) para
    // conservar una hoja real no-negrita que SÍ cuelga por prefijo de un padre en negrita.
    if (descartarTerceroNegrita) {
      if (filaEnNegrita(hoja.negrita?.[r], cols.codigo, cols.nombre)) {
        cuentaNegritaActual = code; // cuenta en negrita → nuevo contexto
      } else if (cuentaNegritaActual && !code.startsWith(cuentaNegritaActual)) {
        filasExcluidas++;
        filasTerceroNegritaExcluidas++;
        continue; // tercero → descartar
      }
    }
    if (omitirDetalleTercero(code, fila)) {
      filasExcluidas++;
      filasDetalleTerceroExcluidas++;
      continue;
    }
    const consolidadoConDetalleTercero = codigosConConsolidado.has(code) && codigosConDetalleTercero.has(code);
    // ¿Es agrupadora? Con la NEGRITA como marcador (gate 80/80), la negrita manda
    // PERO no anula la evidencia estructural: un padre SIN negrita cuyo saldo ya
    // está CUBIERTO por sus hojas descendientes es agrupadora igual (importarlo
    // doblaría el saldo — el gate tolera hasta 20% de padres sin marcar). En
    // cambio, un padre sin negrita con saldo PROPIO no cubierto por su detalle se
    // conserva como movimiento (rescate del imputable mal-anidado, caso 135510).
    // En balances por tercero, la negrita de la fila consolidada suele significar
    // "subtotal del desglose por tercero", no cuenta padre contable; ahí manda el
    // prefijo (`esHoja`).
    const cubiertoPorHijos = ancestros.has(code) && Math.abs((saldo ?? 0) - (saldoHojasBajo.get(code) ?? 0)) <= 1;
    const esAgrupadora = spec.reglaDetalle.tipo === "movimiento"
      ? false // "Todas son movimiento": lista plana de cuentas imputables, sin agrupadoras.
      : usaNegrita && !consolidadoConDetalleTercero
        ? filaEnNegrita(hoja.negrita?.[r], cols.codigo, cols.nombre) || cubiertoPorHijos
        : !esHoja(code, fila, spec, ancestros);
    if (esAgrupadora) {
      filasExcluidas++;
      registrar("agrupadora", { si: si ?? 0, db: db ?? 0, cr: cr ?? 0, saldo: saldo ?? 0 });
      continue;
    }

    if (si === null || db === null || cr === null || saldo === null) {
      excepciones.push({ hoja: hoja.nombre, fila: filaNum, campo: "monto", valor: null, regla: "Monto no numérico", accion: "Corregir el valor en el archivo." });
      registrar("descuadre", { si: si ?? 0, db: db ?? 0, cr: cr ?? 0, saldo: saldo ?? 0 });
      continue;
    }
    // Voto de orientación sobre los valores CRUDOS (antes de normalizar): si la
    // fila solo cuadra con débitos y créditos intercambiados, es evidencia de un
    // mapeo de columnas invertido.
    if (validarControl) {
      const directaOk = Math.abs(saldo - (si + db - cr)) <= 1;
      const invertidaOk = Math.abs(saldo - (si - db + cr)) <= 1;
      if (directaOk && invertidaOk) orientacion.ambiguas++;
      else if (directaOk) orientacion.directa++;
      else if (invertidaOk) orientacion.invertida++;
    }
    const mov = elegirMovimiento(si, db, cr, saldo);
    const idx = registrar("movimiento", { si, db: mov.db, cr: mov.cr, saldo });
    (crudasPorCodigo.get(code) ?? crudasPorCodigo.set(code, []).get(code)!).push(idx);
    parciales.push({
      code,
      name: name || code,
      si, // movimiento del período: firmado si el ERP trae reversas, magnitud si no
      db: mov.db,
      cr: mov.cr,
      saldo,
    });
  }

  // El destino del balance no conserva tercero. Si el archivo trae esa columna,
  // varias filas pueden representar el mismo código; se agregan aunque el modelo
  // no active explícitamente `agregarPorTercero`, para que el borrador coincida
  // con la promoción final (que también agrupa staging por cuenta).
  const agregadas = (spec.agregarPorTercero || cols.tercero > 0) ? agregarPorCuenta(parciales) : parciales;

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
      for (const idx of crudasPorCodigo.get(f.code) ?? []) filasCrudas[idx].tipoFila = "descuadre";
      continue;
    }
    importReady.push({ code: f.code, name: f.name, prevBalance: f.si, balance: f.saldo, debitos: f.db, creditos: f.cr });
  }

  // Subtotales DUPLICADOS: una cuenta de 6 díg cuyas 4 columnas coinciden EXACTO
  // con una subcuenta de 8 díg del mismo grupo (el ERP mal-numeró el detalle). Se
  // re-clasifica como agrupadora y NO se importa: su detalle ya lleva el valor.
  const dupSubtotales = marcarSubtotalesDuplicados(filasCrudas.filter((f) => f.tipoFila === "movimiento"));
  if (dupSubtotales.size > 0) {
    const codigosDup = new Set<string>();
    for (const f of dupSubtotales) { f.tipoFila = "agrupadora"; codigosDup.add(f.codigo); }
    for (let i = importReady.length - 1; i >= 0; i--) {
      if (codigosDup.has(importReady[i].code)) importReady.splice(i, 1);
    }
  }

  // Códigos REPETIDOS (encabezado + línea de movimiento con el mismo código): la
  // repetición pasa a movimiento y se agrega a lo importable (si no, su saldo se
  // pierde). Su ecuación de control se valida como cualquier fila.
  for (const f of reclasificarRepetidos(filasCrudas)) {
    if (!validarControl || controlConcuerda(f.saldoInicial, f.debitos, f.creditos, f.saldoFinal)) {
      importReady.push({ code: f.codigo, name: f.nombre, prevBalance: f.saldoInicial, balance: f.saldoFinal, debitos: f.debitos, creditos: f.creditos });
    } else {
      f.tipoFila = "descuadre";
    }
  }

  // Cuadre OBLIGATORIO contra el gran total del archivo, sobre lo que
  // EFECTIVAMENTE se importa/persiste (importReady, ya sin las filas de descuadre
  // de control): así "cuadra" garantiza que lo guardado coincide con TOTALES, no
  // un conjunto distinto al persistido.
  // Σ firmada (no `|x|`): así una reversión (débito neto negativo) resta del lado
  // correcto y la partida doble Σdéb = Σcré cuadra igual que en el archivo origen.
  const sumaDebitos = importReady.reduce((s, f) => s + (f.debitos ?? 0), 0);
  const sumaCreditos = importReady.reduce((s, f) => s + (f.creditos ?? 0), 0);
  const cuadre = construirCuadre(detectarTotales(hoja, spec), sumaDebitos, sumaCreditos);
  if (filasDetalleTerceroExcluidas > 0) {
    excepciones.push({
      hoja: hoja.nombre,
      fila: null,
      campo: "tercero",
      valor: `${filasDetalleTerceroExcluidas} fila(s)`,
      regla: "Detalle por tercero omitido por fila consolidada",
      accion: "Se usó la fila consolidada sin tercero del mismo código para evitar doble conteo.",
    });
  }
  if (filasTerceroNegritaExcluidas > 0) {
    excepciones.push({
      hoja: hoja.nombre,
      fila: null,
      campo: "tercero",
      valor: `${filasTerceroNegritaExcluidas} fila(s)`,
      regla: "Detalle por tercero descartado (sin negrita)",
      accion: "Balance abierto por tercero: se conservaron solo las cuentas en negrita (que ya traen el total consolidado) y se descartó el detalle por tercero.",
    });
  }

  // Conteos por la clasificación FINAL de las filas (refleja la negrita y las
  // reclasificaciones), por código único. Una cuenta que quedó como movimiento no
  // se cuenta también como agrupadora.
  const codigosMovimiento = new Set(filasCrudas.filter((f) => f.tipoFila === "movimiento").map((f) => f.codigo));
  const codigosAgrupadora = new Set(filasCrudas.filter((f) => f.tipoFila === "agrupadora" && !codigosMovimiento.has(f.codigo)).map((f) => f.codigo));

  return {
    // Respeta como hojas los imputables de nivel alto ya clasificados (código
    // repetido/desacople) que el filtro por prefijo de `calcularBalance` descartaría.
    importReady: conForzarHoja(importReady),
    filasCrudas,
    excepciones,
    resumen: {
      filasLeidas,
      filasExcluidas,
      filasImportables: importReady.length,
      filasDescuadre,
      cuentasMovimiento: codigosMovimiento.size,
      cuentasAgrupadoras: codigosAgrupadora.size,
      nit: cabecera.nit,
      periodoInicial: cabecera.periodoInicial,
      periodoFinal: cabecera.periodoFinal,
      estandar: cabecera.estandar,
      convencionCredito: spec.signoCredito,
    },
    cabecera,
    cuadre,
    ...(validarControl ? { orientacionControl: orientacion } : {}),
  };
}

// ---------------- Ruta directa (PDF/texto → filas del modelo) ----------------

export function validarDirecta(extr: ExtraccionDirecta, params: ParamsExtraccion): ResultadoTransform {
  const excepciones: Excepcion[] = [...extr.excepciones];
  const cabecera = resolverCabecera({ ...extr }, params);

  if (!extr.importable) {
    return {
      importReady: [],
      filasCrudas: [],
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
  const base: FilaParcial[] = [];
  const filasCrudas: FilaCruda[] = [];
  const crudasPorCodigo = new Map<string, number[]>();
  extr.filas.forEach((f, i) => {
    const code = normalizarCodigo(f.cuenta);
    const esNum = /^\d+$/.test(code);
    const mov = elegirMovimiento(f.saldoInicial ?? 0, f.debitos ?? 0, f.creditos ?? 0, f.saldo ?? 0);
    const esMovimiento = esNum && code.length >= LONGITUD_MIN_IMPUTABLE && !ancestros.has(code);
    const tipoFila: TipoFila = !esNum ? "total" : esMovimiento ? "movimiento" : "agrupadora";
    filasCrudas.push({
      hoja: null,
      filaNum: i + 1,
      codigoCrudo: f.cuenta,
      codigo: esNum ? code : "",
      nombre: f.nombre || code || f.cuenta,
      nivel: esNum ? code.length : null,
      tipoFila,
      saldoInicial: f.saldoInicial ?? 0,
      debitos: mov.db,
      creditos: mov.cr,
      saldoFinal: f.saldo ?? 0,
    });
    if (esMovimiento) {
      const idx = filasCrudas.length - 1;
      (crudasPorCodigo.get(code) ?? crudasPorCodigo.set(code, []).get(code)!).push(idx);
      base.push({ code, name: f.nombre || code, si: f.saldoInicial ?? 0, db: mov.db, cr: mov.cr, saldo: f.saldo ?? 0 });
    }
  });
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
      for (const idx of crudasPorCodigo.get(f.code) ?? []) filasCrudas[idx].tipoFila = "descuadre";
      continue;
    }
    importReady.push({ code: f.code, name: f.name, prevBalance: f.si, balance: f.saldo, debitos: f.db, creditos: f.cr });
  }

  return {
    // Respeta como hojas los imputables de nivel alto ya clasificados (código
    // repetido/desacople) que el filtro por prefijo de `calcularBalance` descartaría.
    importReady: conForzarHoja(importReady),
    filasCrudas,
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

// Valor CRUDO del código PUC de una fila. Normalmente una sola columna (`cols.codigo`),
// pero algunos ERP (SIIGO «Balance de prueba auxiliares») lo traen FRAGMENTADO en varias
// columnas de jerarquía (GRUPO|CUENTA|SUBCUENTA|AUXILIAR|SUBAUXILIAR). Si `codigoFragmentos`
// trae índices, se CONCATENAN sus celdas en ese orden (`11`+`05`+`10`+`01` → `11051001`).
// Los tramos bajo el grupo son de 2 díg en el PUC: si el ERP los exportó como número (perdió
// el cero a la izquierda, `5` en vez de `05`) se re-completan. La entrega como cadena la
// consumen igual `normalizarCodigo` y `texto`; sin fragmentos devuelve la celda original.
function celdaCodigo(fila: CeldaCruda[], cols: MappingSpec["columnas"]): CeldaCruda {
  // La IA a veces expresa «sin fragmentos» como `[0]` (generaliza el 0=ausente de
  // los campos escalares al arreglo): un índice <1 no es columna → se descarta.
  const frag = cols.codigoFragmentos?.filter((c) => c >= 1);
  if (!frag || frag.length === 0) return cell(fila, cols.codigo);
  let out = "";
  for (let i = 0; i < frag.length; i++) {
    const t = texto(cell(fila, frag[i])).replace(/[\s.]/g, "");
    if (t === "") continue;
    out += i > 0 && /^\d$/.test(t) ? "0" + t : t; // completa el tramo de 2 díg
  }
  return out;
}

// Una fila "en negrita" (marca de agrupadora del ERP) = su código o su nombre en
// negrita. `negritaFila` viene de la ingesta (solo XLSX), alineada 0-based con la fila.
function filaEnNegrita(negritaFila: boolean[] | undefined, codigoCol: number | null, nombreCol: number | null): boolean {
  const cn = (col: number | null) => col != null && col >= 1 && negritaFila?.[col - 1] === true;
  return cn(nombreCol) || cn(codigoCol);
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

// Mínimo de filas con código numérico "saltadas" para corregir `primeraFilaDatos`:
// evita que un NIT o un dato suelto del encabezado dispare el ajuste.
const MIN_FILAS_SALTADAS_AJUSTE = 3;

/**
 * Guardia DETERMINISTA de `primeraFilaDatos`: si entre el encabezado y la
 * primera fila de datos declarada quedaron 3+ filas con código de cuenta
 * numérico, el spec está corrido (encabezado partido que confundió al modelo, o
 * un perfil guardado ante un layout desplazado) y esas filas de datos reales se
 * perderían. Devuelve la primera fila con código numérico de ese rango; si no
 * hay evidencia suficiente, la original.
 */
export function ajustarPrimeraFilaDatos(hoja: GridHoja, spec: MappingSpec): number {
  const desde = Math.max(spec.filaEncabezado + 1, 1);
  const hasta = spec.primeraFilaDatos - 1;
  if (hasta < desde || spec.columnas.codigo <= 0) return spec.primeraFilaDatos;
  let primera = 0;
  let saltadas = 0;
  for (let f = desde; f <= hasta; f++) {
    const code = normalizarCodigo(cell(hoja.filas[f - 1] ?? [], spec.columnas.codigo));
    if (!/^\d+$/.test(code)) continue;
    saltadas++;
    if (primera === 0) primera = f;
  }
  return saltadas >= MIN_FILAS_SALTADAS_AJUSTE ? primera : spec.primeraFilaDatos;
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
    const code = normalizarCodigo(celdaCodigo(fila, cols));
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
  // Partida doble de los movimientos: Σ débitos = Σ créditos, EXACTO (1 COP por
  // redondeo, sin %). No depende de la fila TOTALES del archivo.
  const diferenciaPartidaDoble = sumaDebitos - sumaCreditos;
  const partidaDobleCuadra = Math.abs(diferenciaPartidaDoble) <= 1;
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
    diferenciaPartidaDoble,
    partidaDobleCuadra,
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
