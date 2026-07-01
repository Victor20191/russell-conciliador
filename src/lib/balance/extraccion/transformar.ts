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

export type ResultadoTransform = {
  importReady: CuentaCruda[];
  filasCrudas: FilaCruda[]; // TODAS las filas leídas (clasificadas), para staging
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
  // 1) Quita espacios/puntos de FORMATO dentro del código: `0110.05` → `011005`,
  //    ` 11 05 05 ` → `110505`.
  const limpio = String(c).replace(/[\s.]/g, "").trim();
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
 * Algunos ERP traen el movimiento NETO firmado: un débito negativo es una
 * reversión (un neto en sentido crédito), no un error. Tomar su magnitud (`|x|`)
 * rompía la identidad de control y, según el caso, corrompía el monto (lo dejaba
 * con el signo equivocado) o excluía la cuenta entera por «descuadre».
 *
 * Regla, con el SALDO como verdad (identidad firmada `si + db − cr = saldo`):
 *  1) si los valores TAL CUAL la cumplen, se conservan con su signo (preserva la
 *     reversión del ERP);
 *  2) si no, se devuelven en magnitud — cubre los créditos firmados-negativos
 *     estilo SAP y las notas débito sin saldo final, donde la verdad ES la
 *     magnitud (la validación de control posterior decide si la fila entra).
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

  // ¿La hoja usa NEGRITA como marcador de agrupadora? Solo si hay MEZCLA (algunas
  // cuentas numéricas en negrita y otras no). Cuando la trae, es la clasificación
  // PROPIA del ERP y manda sobre la heurística por prefijo. Si el archivo NO trae
  // negrita (CSV/JSON/xlsx sin formato) o viene toda igual, `usaNegrita` es false y
  // se conserva la heurística estructural (`esHoja`) como respaldo.
  const usaNegrita = ((): boolean => {
    if (!hoja.negrita) return false;
    let b = 0;
    let nb = 0;
    for (let r = spec.primeraFilaDatos - 1; r < hoja.filas.length; r++) {
      const code = normalizarCodigo(cell(hoja.filas[r] ?? [], cols.codigo));
      if (!/^\d+$/.test(code)) continue;
      if (filaEnNegrita(hoja.negrita[r], cols.codigo, cols.nombre)) b++;
      else nb++;
    }
    return b > 0 && nb > 0;
  })();

  let filasLeidas = 0;
  let filasExcluidas = 0;
  const parciales: FilaParcial[] = [];
  // Todas las filas leídas (sin descartar), para el staging del paso 1.
  const filasCrudas: FilaCruda[] = [];
  // Índices en `filasCrudas` por código de movimiento → re-etiqueta a "descuadre"
  // las que no cuadren tras la agregación.
  const crudasPorCodigo = new Map<string, number[]>();

  for (let r = spec.primeraFilaDatos - 1; r < hoja.filas.length; r++) {
    const fila = hoja.filas[r] ?? [];
    const filaNum = r + 1;
    const codigoCrudo = texto(cell(fila, cols.codigo));
    const code = normalizarCodigo(cell(fila, cols.codigo));
    let name = texto(cell(fila, cols.nombre));
    // Si el código va embebido en el nombre ("11050501 - Caja General"), deja solo
    // el nombre (quita el prefijo "código -"). Requiere dígitos iniciales + guion,
    // así no afecta nombres normales que empiecen por texto.
    const emb = /^\s*[0-9][0-9A-Za-z]*\s*[-–—]\s*(.+)$/.exec(name);
    if (emb) name = emb[1].trim();
    if (!code && !name) continue; // fila vacía
    filasLeidas++;

    const esNum = /^\d+$/.test(code);
    const si = tieneInicial ? normalizarMonto(cell(fila, cols.saldoInicial)) : 0;
    const db = cols.debitos > 0 ? normalizarMonto(cell(fila, cols.debitos)) : 0;
    const cr = cols.creditos > 0 ? normalizarMonto(cell(fila, cols.creditos)) : 0;
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
    // ¿Es agrupadora? 1º la NEGRITA del ERP si la hoja la usa como marcador (manda);
    // si no, columna marcadora del archivo o detección estructural por prefijo
    // (no es prefijo de otra) + piso PUC — `esHoja`.
    const esAgrupadora = usaNegrita
      ? filaEnNegrita(hoja.negrita?.[r], cols.codigo, cols.nombre)
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

  // Conteos por la clasificación FINAL de las filas (refleja la negrita y las
  // reclasificaciones), por código único. Una cuenta que quedó como movimiento no
  // se cuenta también como agrupadora.
  const codigosMovimiento = new Set(filasCrudas.filter((f) => f.tipoFila === "movimiento").map((f) => f.codigo));
  const codigosAgrupadora = new Set(filasCrudas.filter((f) => f.tipoFila === "agrupadora" && !codigosMovimiento.has(f.codigo)).map((f) => f.codigo));

  return {
    importReady,
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
    importReady,
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
