// ============================================================
// Cálculo PURO del balance de comprobación (sin BD, sin Excel).
//
// A partir de las cuentas crudas de un archivo (código, nombre, saldo
// anterior y saldo final) y del plan de cuentas estándar (346 cuentas
// de 6 dígitos), produce los agregados que consumen las pantallas de
// Balance: `sums`, `breakdown` (por grupo PUC), `validations` y los
// contadores de mapeo. Es determinista y testeable en memoria
// (`calcular.test.ts`); la persistencia y el versionado viven en la
// Server Action `confirmarCargaBalance` (`persistirCargue`).
// ============================================================
import { fmt } from "@/lib/format";

// ---- Tipos de entrada ----
// `debitos`/`creditos` son los movimientos del período (magnitud positiva);
// opcionales porque algunos balances solo traen saldos.
export type CuentaCruda = { code: string; name: string; prevBalance: number; balance: number; debitos?: number; creditos?: number };
// El plan estándar puede llegar «rico» (con descripciones) para el segundo
// barrido por coincidencia; los campos descriptivos son opcionales.
export type CuentaEstandar = {
  code: string;
  nature: string;
  critical: boolean;
  name?: string;
  russellAccount?: string | null;
  possibleAccounts?: string | null;
  includes?: string | null;
  categoryType?: string | null;
};

// ---- Tipos de salida (coinciden con el JSON que renderiza el detalle) ----
export type Sums = { activo: number; pasivo: number; patrimonio: number; ingresos: number; gastos: number; costos: number; utilidad: number };
export type Validation = { id: string; rule: string; status: "ok" | "warn"; detail: string; count?: number };
export type BreakdownItem = { code: string; name: string; balance: number; prevBalance: number; variation: number | null; std: string | null; coincidencia: number | null; mapped: boolean; critical: boolean; nature: string; saldoOk: boolean; debe?: number; haber?: number };
export type BreakdownGroup = { code: string; name: string; balance: number; prevBalance: number; variation: number | null; mapped: boolean; critical: boolean; nature: string; saldoOk: boolean; items: BreakdownItem[]; debe?: number; haber?: number };

export type ResultadoBalance = {
  sums: Sums;
  validations: Validation[];
  breakdown: BreakdownGroup[];
  balanced: boolean;
  diffCuadre: number;
  totalRows: number;
  mapped: number;
  unmapped: number;
  critical: number;
};

// Nombres de los grupos del PUC colombiano (Decreto 2650) — el plan
// estándar solo trae cuentas de 6 dígitos, así que los nombres de grupo
// (2 dígitos) se aportan como referencia. Fallback: "Grupo NN".
export const GRUPOS_PUC: Record<string, string> = {
  // Clase 1 · Activo
  "11": "Disponible", "12": "Inversiones", "13": "Deudores", "14": "Inventarios",
  "15": "Propiedades, planta y equipo", "16": "Intangibles", "17": "Diferidos",
  "18": "Otros activos", "19": "Valorizaciones",
  // Clase 2 · Pasivo
  "21": "Obligaciones financieras", "22": "Proveedores", "23": "Cuentas por pagar",
  "24": "Impuestos, gravámenes y tasas", "25": "Obligaciones laborales",
  "26": "Pasivos estimados y provisiones", "27": "Diferidos", "28": "Otros pasivos",
  "29": "Bonos y papeles comerciales",
  // Clase 3 · Patrimonio
  "31": "Capital social", "32": "Superávit de capital", "33": "Reservas",
  "34": "Revalorización del patrimonio", "35": "Dividendos o participaciones decretados",
  "36": "Resultados del ejercicio", "37": "Resultados de ejercicios anteriores",
  "38": "Superávit por valorizaciones",
  // Clase 4 · Ingresos
  "41": "Operacionales", "42": "No operacionales", "47": "Ajustes por inflación",
  // Clase 5 · Gastos
  "51": "Operacionales de administración", "52": "Operacionales de ventas",
  "53": "No operacionales", "54": "Impuesto de renta y complementarios",
  "59": "Ganancias y pérdidas",
  // Clase 6 · Costos de ventas
  "61": "Costo de ventas y prestación de servicios", "62": "Compras",
  // Clase 7 · Costos de producción
  "71": "Materia prima", "72": "Mano de obra directa", "73": "Costos indirectos",
  "74": "Contratos de servicios",
};

const CODIGO_SIN_CLASIFICAR = "99";

/** Naturaleza esperada por CLASE (primer dígito): D=débito, C=crédito. */
export function claseNatura(code: string): "D" | "C" | "-" {
  const c = code.charAt(0);
  if (c === "1" || c === "5" || c === "6" || c === "7" || c === "8") return "D";
  if (c === "2" || c === "3" || c === "4" || c === "9") return "C";
  return "-";
}

/** ¿El signo del saldo concuerda con la naturaleza? (0 siempre concuerda). */
function saldoConcuerda(balance: number, nature: string): boolean {
  if (balance === 0) return true;
  if (nature === "D") return balance > 0;
  if (nature === "C") return balance < 0;
  return true;
}

/** Variación porcentual vs período anterior; null si no hay base (saldo anterior 0). */
function variacion(prev: number, balance: number): number | null {
  if (prev === 0) return null;
  return Math.round(((balance - prev) / Math.abs(prev)) * 1000) / 10;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Normaliza un código de cuenta a su forma canónica de clave: dígitos sin
 * espacios ni puntos de miles. Replica la limpieza de `normalizarCodigo` de la
 * ingesta (módulo puro, sin dependencia inversa) para que la consolidación y la
 * descomposición PUC sean robustas ante códigos sin pre-normalizar.
 */
export function limpiarCodigo(code: string): string {
  // Quita espacios/puntos y el SUFIJO ALFABÉTICO final que algunos ERP agregan a
  // cuentas inactivas/variantes (INAC, A, AS…): `236550INAC` → `236550`. Así la
  // cuenta con sufijo se normaliza a su código base y consolida con él (los PUC
  // colombianos son numéricos, por lo que cualquier letra al final es un sufijo).
  // Si al quitar el sufijo el código quedara vacío (código todo-letras), se
  // conserva el original limpio para no perder la fila.
  const limpio = (code ?? "").replace(/[\s.]/g, "").trim();
  const sinSufijo = limpio.replace(/[A-Za-z]+$/, "");
  return sinSufijo.length > 0 ? sinSufijo : limpio;
}

// ---- Segundo barrido: coincidencia por descripción ----
// Umbral mínimo de similitud (0..1) para aceptar un match por descripción.
export const UMBRAL_DESCRIPCION = 0.55;
const STOPWORDS = new Set(["de", "del", "la", "el", "los", "las", "y", "en", "por", "para", "a", "con", "o", "u", "e", "su", "sus"]);

/** Normaliza texto: minúsculas, sin acentos, sin puntuación, espacios colapsados. */
export function normalizarTexto(s: string): string {
  // NFD separa los acentos en marcas combinantes; `[^a-z0-9\s]` las elimina
  // (junto con la puntuación), dejando solo letras/dígitos ASCII y espacios.
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(normalizarTexto(s).split(" ").filter((t) => t && !STOPWORDS.has(t)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

// Plan estándar pre-tokenizado para el barrido por descripción: se construye
// una sola vez por cargue, evitando re-tokenizar las ~346 cuentas del plan por
// cada cuenta del cliente sin mapear.
export type CuentaPlanTokenizada = { code: string; clase: string; frasesTok: Set<string>[]; frasesNorm: string[] };

/** Pre-tokeniza el plan (nombre + cuenta Russell + cuentas posibles) una vez. */
export function tokenizarPlan(estandar: CuentaEstandar[]): CuentaPlanTokenizada[] {
  return estandar.map((s) => {
    const frases: string[] = [];
    if (s.name) frases.push(s.name);
    if (s.russellAccount) frases.push(s.russellAccount);
    if (s.possibleAccounts) frases.push(...s.possibleAccounts.split(","));
    return { code: s.code, clase: s.code.charAt(0), frasesTok: frases.map((f) => tokens(f)), frasesNorm: frases.map((f) => normalizarTexto(f)) };
  });
}

/**
 * Mejor cuenta estándar para el nombre de una cuenta del cliente, comparando por
 * descripción (nombre + cuenta Russell + cuentas posibles) dentro de la MISMA
 * clase PUC (primer dígito). Recibe el plan YA tokenizado. Devuelve `{ code, score }` (0..1) o null.
 */
export function mejorPorDescripcion(nombre: string, clase: string, plan: CuentaPlanTokenizada[]): { code: string; score: number } | null {
  const q = tokens(nombre);
  if (q.size === 0) return null;
  const qNorm = normalizarTexto(nombre);
  let best: { code: string; score: number } | null = null;
  for (const s of plan) {
    if (s.clase !== clase) continue; // restringe a la misma clase
    let local = 0;
    for (let i = 0; i < s.frasesTok.length; i++) {
      const score = s.frasesNorm[i] === qNorm ? 1 : jaccard(q, s.frasesTok[i]);
      if (score > local) local = score;
    }
    if (!best || local > best.score) best = { code: s.code, score: local };
  }
  return best;
}

export type MapeoCuenta = { std: string | null; coincidencia: number | null; mapped: boolean };

/**
 * Mapea una cuenta del cliente al plan estándar: 1) exacto por prefijo de 6
 * dígitos (coincidencia 100); 2) si falla y hay descripciones, por similitud de
 * texto (coincidencia = score%) si supera el umbral. El tercer barrido (IA) se
 * inyecta aparte vía `override` en `calcularBalance`.
 */
export function mapearCuenta(code: string, name: string, stdByCode: Map<string, CuentaEstandar>, estandar: CuentaEstandar[], hayDescripcion: boolean, planTok?: CuentaPlanTokenizada[]): MapeoCuenta {
  const key = code.length >= 6 ? code.slice(0, 6) : null;
  if (key && stdByCode.get(key)) return { std: key, coincidencia: 100, mapped: true };
  if (hayDescripcion) {
    const plan = planTok ?? tokenizarPlan(estandar); // construido aparte por `calcularBalance`; perezoso para llamadas sueltas/tests
    const m = mejorPorDescripcion(name, code.charAt(0), plan);
    if (m && m.score >= UMBRAL_DESCRIPCION) return { std: m.code, coincidencia: Math.round(m.score * 100), mapped: true };
  }
  return { std: null, coincidencia: null, mapped: false };
}

/**
 * Consolida cuentas crudas con el MISMO código en una sola fila: suma saldos
 * (anterior/final) y movimientos (débitos/créditos), conserva el primer nombre y
 * el orden de aparición. Un archivo que trae la misma cuenta repetida (o que la
 * IA extrae dos veces) no debe producir detalle duplicado al persistir. La clave
 * de agrupación es el código `trim`-eado (también se normaliza el `code` de salida).
 */
export function consolidarPorCodigo(cuentas: CuentaCruda[]): CuentaCruda[] {
  const porCodigo = new Map<string, CuentaCruda>();
  for (const c of cuentas) {
    const key = limpiarCodigo(c.code);
    const prev = porCodigo.get(key);
    if (!prev) {
      porCodigo.set(key, { ...c, code: key });
      continue;
    }
    prev.prevBalance += c.prevBalance;
    prev.balance += c.balance;
    if (c.debitos != null) prev.debitos = (prev.debitos ?? 0) + c.debitos;
    if (c.creditos != null) prev.creditos = (prev.creditos ?? 0) + c.creditos;
  }
  return [...porCodigo.values()];
}

/**
 * Quita "padres redundantes" en archivos cuya jerarquía NO anida por prefijo: el
 * ERP agrupa por estructura/indentación con códigos HERMANOS (p. ej. el padre
 * `221005 PROVEEDORES INTERNACIONALES` y su único hijo `221006 …USD`, con el MISMO
 * saldo). La detección por prefijo no los ve como padre/hijo y cargaría AMBOS →
 * duplica el monto. Regla determinista y conservadora: dentro del MISMO grupo de 4
 * díg, si dos cuentas tienen montos IDÉNTICOS y NO triviales (no todo en 0) y el
 * nombre de una es prefijo del de la otra, la de nombre más corto (el encabezado)
 * se descarta y se conserva el detalle. Solo aplica a montos idénticos, así que es
 * casi imposible que afecte a cuentas genuinamente distintas.
 */
export function quitarPadresRedundantes(cuentas: CuentaCruda[]): CuentaCruda[] {
  const norm = (s: string) => (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  const trivial = (c: CuentaCruda) => c.prevBalance === 0 && c.balance === 0 && (c.debitos ?? 0) === 0 && (c.creditos ?? 0) === 0;
  // Firma: mismo grupo de 4 díg + montos idénticos.
  const firma = (c: CuentaCruda) => `${c.code.slice(0, 4)}|${c.prevBalance}|${c.balance}|${c.debitos ?? 0}|${c.creditos ?? 0}`;
  const grupos = new Map<string, CuentaCruda[]>();
  for (const c of cuentas) {
    if (trivial(c)) continue; // los de monto 0 no se deduplican (muchos coinciden)
    const k = firma(c);
    (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(c);
  }
  const descartar = new Set<CuentaCruda>();
  for (const g of grupos.values()) {
    if (g.length < 2) continue;
    for (const a of g) {
      for (const b of g) {
        if (a === b) continue;
        const na = norm(a.name);
        const nb = norm(b.name);
        // `a` (encabezado) es prefijo de `b` (detalle más específico) → se descarta `a`.
        if (na.length > 0 && nb.length > na.length && nb.startsWith(na)) descartar.add(a);
      }
    }
  }
  return descartar.size === 0 ? cuentas : cuentas.filter((c) => !descartar.has(c));
}

/**
 * Calcula los agregados del balance. `cuentas` son las filas crudas del
 * Excel; `estandar` el plan de cuentas (6 dígitos, con descripciones opcionales).
 * Mapeo en cascada: 1) exacto por prefijo de 6 dígitos; 2) por descripción si el
 * plan trae `possibleAccounts`/`name`; 3) IA, inyectada vía `override`
 * (code de cliente → cuenta estándar) desde la Server Action.
 */
export function calcularBalance(
  cuentas: CuentaCruda[],
  estandar: CuentaEstandar[],
  override?: Map<string, { std: string | null; coincidencia: number | null }>,
  planTok?: CuentaPlanTokenizada[],
  // Configuración de mapeo GUARDADA del cliente (clave = cuenta de 6 dígitos).
  // Tiene PRIORIDAD sobre la cascada: lo que ya se parametrizó no se recalcula.
  configCliente?: Map<string, { std: string | null; coincidencia: number | null }>,
): ResultadoBalance {
  const stdByCode = new Map(estandar.map((s) => [s.code, s]));
  const hayDescripcion = estandar.some((s) => s.possibleAccounts || s.name);
  // Plan pre-tokenizado para el barrido por descripción: se calcula una vez (o
  // se recibe ya construido para no repetirlo entre la pasada determinista y la
  // pasada con override de IA — ver `persistirCargue`).
  const plan = hayDescripcion ? (planTok ?? tokenizarPlan(estandar)) : [];

  // 0) Consolida cuentas repetidas (mismo código) ANTES del filtro de hojas:
  //    una cuenta partida en varias filas se fusiona sumando saldos/movimientos.
  const consolidadas = consolidarPorCodigo(cuentas);

  // 1) Hojas: cuentas que no son prefijo de otra (evita doble conteo de
  //    filas de resumen como clase/grupo/cuenta cuando el archivo las trae).
  //    O(n·L): se marcan los prefijos propios de cada código como "ancestros";
  //    una cuenta es hoja si su código no es ancestro de ninguna otra.
  const ancestros = new Set<string>();
  for (const { code } of consolidadas) {
    for (let i = 1; i < code.length; i++) ancestros.add(code.slice(0, i));
  }
  // Hojas por prefijo + guard para jerarquías de código hermano (padre/hijo con
  // mismo saldo) que el prefijo no detecta (evita el doble conteo del encabezado).
  const hojas = quitarPadresRedundantes(consolidadas.filter((c) => !ancestros.has(c.code)));

  // 2) Mapeo en cascada: config guardada del cliente → exacto → descripción →
  //    override IA. La config (por cuenta de 6 díg.) manda sobre todo lo demás.
  const mapeadas = hojas.map((c) => {
    const cfg = configCliente?.get(c.code.slice(0, 6));
    let mp: MapeoCuenta;
    if (cfg?.std) {
      mp = { std: cfg.std, coincidencia: cfg.coincidencia, mapped: true };
    } else {
      mp = mapearCuenta(c.code, c.name, stdByCode, estandar, hayDescripcion, plan);
      if (!mp.mapped) {
        const ov = override?.get(c.code);
        if (ov?.std) mp = { std: ov.std, coincidencia: ov.coincidencia, mapped: true };
      }
    }
    const ref = mp.std ? stdByCode.get(mp.std) : undefined;
    return {
      ...c,
      std: mp.std,
      coincidencia: mp.coincidencia,
      mapped: mp.mapped,
      nature: ref ? ref.nature : claseNatura(c.code),
      critical: ref ? ref.critical : false,
    };
  });

  // 3) Convención de signos. Internamente se usa "firmado": débito +, crédito −
  //    (las cuentas de crédito quedan negativas). Si el archivo trae magnitudes
  //    (todo positivo), las cuentas de naturaleza crédito aparecen en positivo:
  //    se detecta y se normalizan invirtiendo su signo.
  const creditos = mapeadas.filter((m) => m.nature === "C");
  const creditosPositivos = creditos.filter((m) => m.balance > 0).length;
  const creditosNegativos = creditos.filter((m) => m.balance < 0).length;
  const flip = creditos.length > 0 && creditosPositivos > creditosNegativos;
  // Bajo magnitud se INVIERTE el signo de las cuentas de naturaleza crédito
  // (no se fuerza a -Math.abs): así una cuenta crédito con saldo deudor —saldo
  // contrario legítimo a su naturaleza— conserva su anomalía y la validación V2
  // la detecta, en vez de "corregirla" silenciosamente al signo de su clase.
  const aSigno = (nature: string, v: number) => (flip ? (nature === "C" ? -v : v) : v);

  const detalle: BreakdownItem[] = mapeadas.map((m) => {
    const balance = aSigno(m.nature, m.balance);
    const prevBalance = aSigno(m.nature, m.prevBalance);
    return {
      code: m.code,
      name: m.name,
      balance,
      prevBalance,
      variation: variacion(prevBalance, balance),
      std: m.std,
      coincidencia: m.coincidencia,
      mapped: m.mapped,
      critical: m.critical,
      nature: m.nature,
      saldoOk: saldoConcuerda(balance, m.nature),
      debe: m.debitos ?? 0, // movimientos del período (magnitud, sin flip)
      haber: m.creditos ?? 0,
    };
  });

  return agregarDetalle(detalle);
}

/**
 * Agregación común (sumas, validaciones, desglose, cuadre) a partir del detalle
 * ya mapeado y firmado (débito +, crédito −). La comparten `calcularBalance`
 * (detalle proveniente del archivo) y `reconstruirBalance` (detalle proveniente
 * de las filas persistidas en `balance_prueba_detalle`).
 */
function agregarDetalle(detalle: BreakdownItem[]): ResultadoBalance {
  // 4) Sumas por clase (primer dígito). Las clases de crédito se muestran
  //    como magnitud natural positiva (pasivo, patrimonio, ingresos).
  const porClase: Record<string, number> = {};
  for (const d of detalle) {
    const k = d.code.charAt(0);
    porClase[k] = (porClase[k] ?? 0) + d.balance;
  }
  const activo = porClase["1"] ?? 0;
  const pasivo = -(porClase["2"] ?? 0);
  const patrimonio = -(porClase["3"] ?? 0);
  const ingresos = -(porClase["4"] ?? 0);
  const gastos = porClase["5"] ?? 0;
  const costos = (porClase["6"] ?? 0) + (porClase["7"] ?? 0);
  const utilidad = ingresos - gastos - costos;
  const sums: Sums = { activo, pasivo, patrimonio, ingresos, gastos, costos, utilidad };

  // Cuadre por PARTIDA DOBLE: en un balance de comprobación los débitos igualan
  // a los créditos, es decir Σ(saldos firmados) ≈ 0. Es el invariante válido en
  // cualquier momento del período (a diferencia de A = P + Pat, que solo se
  // cumple tras el cierre). Equivale a A = P + Pat + Resultado.
  // Las cuentas de ORDEN (clases 8 y 9) no forman parte de la ecuación de
  // partida doble patrimonio-resultado: se excluyen del cuadre (siguen visibles
  // en el desglose y en las sumas no entran de por sí).
  const paraCuadre = detalle.filter((d) => d.code.charAt(0) !== "8" && d.code.charAt(0) !== "9");
  const totalAbs = sum(paraCuadre.map((d) => Math.abs(d.balance)));
  const diffCuadre = sum(paraCuadre.map((d) => d.balance));
  const balanced = Math.abs(diffCuadre) <= Math.max(1, totalAbs * 0.005);

  // 5) Desglose por grupo PUC (2 dígitos). Códigos sin grupo conocido → "99".
  const buckets = new Map<string, BreakdownItem[]>();
  for (const d of detalle) {
    const g2 = GRUPOS_PUC[d.code.slice(0, 2)] ? d.code.slice(0, 2) : CODIGO_SIN_CLASIFICAR;
    (buckets.get(g2) ?? buckets.set(g2, []).get(g2)!).push(d);
  }
  const breakdown: BreakdownGroup[] = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([g2, items]) => {
      items.sort((a, b) => a.code.localeCompare(b.code));
      const gBalance = sum(items.map((i) => i.balance));
      const gPrev = sum(items.map((i) => i.prevBalance));
      const noClasificado = g2 === CODIGO_SIN_CLASIFICAR;
      const nature = noClasificado ? "-" : claseNatura(g2);
      return {
        code: g2,
        name: noClasificado ? "Sin clasificar (cuentas no mapeadas)" : GRUPOS_PUC[g2],
        balance: gBalance,
        prevBalance: gPrev,
        variation: variacion(gPrev, gBalance),
        mapped: !noClasificado,
        critical: items.some((i) => i.critical),
        nature,
        saldoOk: noClasificado ? true : saldoConcuerda(gBalance, nature),
        items,
        debe: sum(items.map((i) => i.debe ?? 0)),
        haber: sum(items.map((i) => i.haber ?? 0)),
      };
    });

  // 6) Validaciones.
  const sinMapeo = detalle.filter((d) => !d.mapped).length;
  const contrario = detalle.filter((d) => !d.saldoOk).length;
  const variaciones = detalle.filter((d) => d.variation != null && Math.abs(d.variation) > 25).length;
  const validations: Validation[] = [
    {
      id: "V1",
      rule: "Balance cuadrado (débitos = créditos)",
      status: balanced ? "ok" : "warn",
      detail: balanced ? `Partida doble correcta · diferencia: ${fmt(diffCuadre)}` : `Diferencia entre débitos y créditos: ${fmt(diffCuadre)}`,
      ...(balanced ? {} : { count: 1 }),
    },
    {
      id: "V2",
      rule: "Naturaleza de cuenta vs saldo",
      status: contrario > 0 ? "warn" : "ok",
      detail: contrario > 0 ? `${contrario} cuenta(s) con saldo contrario a su naturaleza` : "Sin saldos contrarios",
      ...(contrario > 0 ? { count: contrario } : {}),
    },
    {
      id: "V3",
      rule: "Cuentas sin mapeo al estándar",
      status: sinMapeo > 0 ? "warn" : "ok",
      detail: sinMapeo > 0 ? `${sinMapeo} cuenta(s) sin mapeo al estándar` : `${detalle.length} cuentas validadas`,
      ...(sinMapeo > 0 ? { count: sinMapeo } : {}),
    },
    {
      id: "V4",
      rule: "Variaciones > 25% vs período anterior",
      status: variaciones > 0 ? "warn" : "ok",
      detail: variaciones > 0 ? `${variaciones} cuenta(s) con variación significativa` : "Sin variaciones significativas",
      ...(variaciones > 0 ? { count: variaciones } : {}),
    },
  ];

  // V5: cuadre de los MOVIMIENTOS del período (Σ débitos = Σ créditos), un
  // invariante distinto del cuadre de saldos (V1). Solo aplica si el archivo
  // trajo columnas de movimientos (debe/haber); si no, no se evalúa.
  const totalDebe = sum(detalle.map((d) => d.debe ?? 0));
  const totalHaber = sum(detalle.map((d) => d.haber ?? 0));
  if (totalDebe > 0 || totalHaber > 0) {
    const diffMov = totalDebe - totalHaber;
    const movOk = Math.abs(diffMov) <= Math.max(1, (totalDebe + totalHaber) * 0.005);
    validations.push({
      id: "V5",
      rule: "Movimientos del período (débitos = créditos)",
      status: movOk ? "ok" : "warn",
      detail: movOk ? `Partida doble del período correcta · diferencia: ${fmt(diffMov)}` : `Σ débitos − Σ créditos del período: ${fmt(diffMov)}`,
      ...(movOk ? {} : { count: 1 }),
    });
  }

  return {
    sums,
    validations,
    breakdown,
    balanced,
    diffCuadre,
    totalRows: detalle.length,
    mapped: detalle.length - sinMapeo,
    unmapped: sinMapeo,
    critical: detalle.filter((d) => d.critical).length,
  };
}

// ============================================================
// Puente con el modelo normalizado (balance_prueba_detalle).
// ============================================================

/** Descompone un código imputable en sus prefijos PUC (niveles 2/4/6/8). */
export function descomponerCuenta(code: string): { cuenta2: string; cuenta4: string; cuenta6: string; cuenta8: string } {
  const c = limpiarCodigo(code);
  return { cuenta2: c.slice(0, 2), cuenta4: c.slice(0, 4), cuenta6: c.slice(0, 6), cuenta8: c };
}

// Fila lista para insertar en `balance_prueba_detalle` (montos firmados).
export type FilaDetalle = {
  cuenta2: string; cuenta4: string; cuenta6: string; cuenta8: string;
  nombreCuenta: string; cuenta6Russell: string | null; coincidencia: number | null;
  saldoInicial: number; debitos: number; creditos: number; saldoFinal: number;
};

/** Aplana el desglose calculado a filas de detalle para persistir (1 por cuenta). */
export function aFilasDetalle(breakdown: BreakdownGroup[]): FilaDetalle[] {
  const filas: FilaDetalle[] = [];
  for (const g of breakdown) {
    for (const it of g.items) {
      filas.push({
        ...descomponerCuenta(it.code),
        nombreCuenta: it.name,
        cuenta6Russell: it.std,
        coincidencia: it.coincidencia,
        saldoInicial: it.prevBalance,
        debitos: it.debe ?? 0,
        creditos: it.haber ?? 0,
        saldoFinal: it.balance,
      });
    }
  }
  return filas;
}

// Fila tal como se lee de `balance_prueba_detalle` (montos ya firmados; los
// Decimal de Prisma deben convertirse a number antes de pasar aquí).
export type FilaDetallePersistida = {
  id?: number; cuenta8: string; nombreCuenta: string; cuenta6Russell: string | null; coincidencia?: number | null;
  saldoInicial: number; debitos: number; creditos: number; saldoFinal: number;
};

/**
 * Reconstruye los agregados (sumas, validaciones, desglose, cuadre) a partir de
 * las filas persistidas. NO re-aplica la normalización de signo: los saldos ya
 * están firmados desde el cargue. `estandar` aporta naturaleza/criticidad.
 */
export function reconstruirBalance(filas: FilaDetallePersistida[], estandar: CuentaEstandar[]): ResultadoBalance {
  const stdByCode = new Map(estandar.map((s) => [s.code, s]));
  const detalle: BreakdownItem[] = filas.map((f) => {
    const ref = f.cuenta6Russell ? stdByCode.get(f.cuenta6Russell) : undefined;
    const nature = ref ? ref.nature : claseNatura(f.cuenta8);
    return {
      code: f.cuenta8,
      name: f.nombreCuenta,
      balance: f.saldoFinal,
      prevBalance: f.saldoInicial,
      variation: variacion(f.saldoInicial, f.saldoFinal),
      std: f.cuenta6Russell,
      coincidencia: f.coincidencia ?? (f.cuenta6Russell != null ? 100 : null),
      mapped: f.cuenta6Russell != null,
      critical: ref ? ref.critical : false,
      nature,
      saldoOk: saldoConcuerda(f.saldoFinal, nature),
      debe: f.debitos,
      haber: f.creditos,
    };
  });
  return agregarDetalle(detalle);
}

// ============================================================
// Vista NORMALIZADA a Russell para la pantalla de detalle.
// Agrupa por la cuenta estándar Russell (cuenta_6_russell), adoptando SU nombre,
// y hace drill-down a las cuentas imputables (cuenta_8) del cliente. Es una vista
// de presentación; NO sustituye al `breakdown` por clase PUC que alimenta sumas,
// validaciones y estado de resultado.
// ============================================================
export type RussellItem = {
  code: string; name: string; prevBalance: number; balance: number;
  debe: number; haber: number; variation: number | null; std: string | null;
  coincidencia: number | null; saldoOk: boolean; critical: boolean;
};
export type RussellGroup = {
  code: string; name: string; prevBalance: number; balance: number;
  debe: number; haber: number; variation: number | null; mapped: boolean;
  saldoOk: boolean; critical: boolean; items: RussellItem[];
};

/**
 * Agrupa las cuentas del cliente por su cuenta estándar Russell. `nombres` mapea
 * código estándar → nombre Russell (de `StandardAccount`). Las cuentas sin mapeo
 * caen en un grupo «Sin mapeo» al final.
 */
export function agruparPorRussell(
  filas: FilaDetallePersistida[],
  estandar: CuentaEstandar[],
  nombres: Map<string, string>,
): RussellGroup[] {
  const stdByCode = new Map(estandar.map((s) => [s.code, s]));
  const buckets = new Map<string, RussellItem[]>();
  for (const f of filas) {
    const std = f.cuenta6Russell;
    const ref = std ? stdByCode.get(std) : undefined;
    const nature = ref ? ref.nature : claseNatura(f.cuenta8);
    const item: RussellItem = {
      code: f.cuenta8,
      name: f.nombreCuenta,
      prevBalance: f.saldoInicial,
      balance: f.saldoFinal,
      debe: f.debitos,
      haber: f.creditos,
      variation: variacion(f.saldoInicial, f.saldoFinal),
      std,
      coincidencia: f.coincidencia ?? (std != null ? 100 : null),
      saldoOk: saldoConcuerda(f.saldoFinal, nature),
      critical: ref ? ref.critical : false,
    };
    const key = std ?? "SIN";
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(item);
  }

  const grupos: RussellGroup[] = [...buckets.entries()].map(([key, items]) => {
    items.sort((a, b) => a.code.localeCompare(b.code));
    const mapped = key !== "SIN";
    const ref = mapped ? stdByCode.get(key) : undefined;
    const nature = ref ? ref.nature : "-";
    const balance = sum(items.map((i) => i.balance));
    const prevBalance = sum(items.map((i) => i.prevBalance));
    return {
      code: mapped ? key : "—",
      name: mapped ? nombres.get(key) ?? `Cuenta ${key}` : "Sin mapeo (cuentas no mapeadas)",
      prevBalance,
      balance,
      debe: sum(items.map((i) => i.debe)),
      haber: sum(items.map((i) => i.haber)),
      variation: variacion(prevBalance, balance),
      mapped,
      saldoOk: mapped ? saldoConcuerda(balance, nature) : true,
      critical: items.some((i) => i.critical),
      items,
    };
  });

  // Orden: por código Russell ascendente; el grupo «Sin mapeo» (—) al final.
  grupos.sort((a, b) => (a.code === "—" ? 1 : 0) - (b.code === "—" ? 1 : 0) || a.code.localeCompare(b.code));
  return grupos;
}

// ============================================================
// Árbol jerárquico para el detalle: clase (2) → subgrupo (4) → cuenta estándar
// Russell (6) → cuenta del cliente (8). Las cuentas mapeadas cuelgan del código
// ESTÁNDAR (normalizado a Russell); las no mapeadas, de su propio código de
// cliente bajo un nodo «Sin mapeo» en su clase. Es una vista de presentación.
// ============================================================
export type NodoBalance = {
  key: string;
  nivel: 2 | 4 | 6 | 8;
  code: string;
  name: string;
  prevBalance: number;
  balance: number;
  debe: number;
  haber: number;
  variation: number | null;
  mapped: boolean;
  saldoOk: boolean;
  critical: boolean;
  clase: string; // primer dígito (filtro Balance 1-3 / Estado de Resultado 4-7)
  detalleId: number | null; // solo hojas (nivel 8): id de balance_prueba_detalle
  std: string | null;
  coincidencia: number | null;
  hijos: NodoBalance[];
};

// Nombres de los niveles 4 (subgrupo) y 2 (grupo) — de la tabla `subgrupos_estandar`.
export type NombresJerarquia = { nombre4: Map<string, string>; nombre2: Map<string, string> };

export function agruparJerarquia(
  filas: FilaDetallePersistida[],
  estandar: CuentaEstandar[],
  nombres: Map<string, string>,
  sub?: NombresJerarquia,
): NodoBalance[] {
  const stdByCode = new Map(estandar.map((s) => [s.code, s]));
  type N6 = { code: string; name: string; mapped: boolean; std: string | null; hojas: NodoBalance[] };
  type N4 = { code: string; n6: Map<string, N6> };
  type N2 = { name: string; clase: string; n4: Map<string, N4> };
  const arbol = new Map<string, N2>();

  for (const f of filas) {
    const std = f.cuenta6Russell;
    const mapped = std != null;
    const ref = std ? stdByCode.get(std) : undefined;
    const nature = ref ? ref.nature : claseNatura(f.cuenta8);
    const base = mapped ? std! : f.cuenta8; // de dónde derivar nivel 2/4
    const c2 = base.slice(0, 2);
    const c4 = base.slice(0, 4) || c2;
    const c6 = mapped ? std! : `${c4}-SIN`;
    const hoja: NodoBalance = {
      key: `${c2}/${c4}/${c6}/${f.cuenta8}#${f.id ?? ""}`,
      nivel: 8,
      code: f.cuenta8,
      name: f.nombreCuenta,
      prevBalance: f.saldoInicial,
      balance: f.saldoFinal,
      debe: f.debitos,
      haber: f.creditos,
      variation: variacion(f.saldoInicial, f.saldoFinal),
      mapped,
      saldoOk: saldoConcuerda(f.saldoFinal, nature),
      critical: ref ? ref.critical : false,
      clase: c2.charAt(0),
      detalleId: f.id ?? null,
      std: std ?? null,
      coincidencia: f.coincidencia ?? (mapped ? 100 : null),
      hijos: [],
    };
    const n2 = arbol.get(c2) ?? arbol.set(c2, { name: sub?.nombre2.get(c2) ?? GRUPOS_PUC[c2] ?? `Grupo ${c2}`, clase: c2.charAt(0), n4: new Map() }).get(c2)!;
    const n4 = n2.n4.get(c4) ?? n2.n4.set(c4, { code: c4, n6: new Map() }).get(c4)!;
    const n6 = n4.n6.get(c6) ?? n4.n6.set(c6, { code: mapped ? std! : "—", name: mapped ? nombres.get(std!) ?? `Cuenta ${std}` : "Sin mapeo", mapped, std: std ?? null, hojas: [] }).get(c6)!;
    n6.hojas.push(hoja);
  }

  const agg = (hijos: NodoBalance[]) => ({
    prevBalance: sum(hijos.map((h) => h.prevBalance)),
    balance: sum(hijos.map((h) => h.balance)),
    debe: sum(hijos.map((h) => h.debe)),
    haber: sum(hijos.map((h) => h.haber)),
    critical: hijos.some((h) => h.critical),
  });

  return [...arbol.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([c2, v2]) => {
      const n4nodes = [...v2.n4.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([c4, v4]) => {
          const n6nodes = [...v4.n6.entries()]
            .sort((a, b) => (a[1].mapped ? 0 : 1) - (b[1].mapped ? 0 : 1) || a[0].localeCompare(b[0]))
            .map(([c6, v6]) => {
              v6.hojas.sort((x, y) => x.code.localeCompare(y.code));
              const a = agg(v6.hojas);
              return {
                key: `${c2}/${c4}/${c6}`, nivel: 6 as const, code: v6.code, name: v6.name, ...a,
                variation: variacion(a.prevBalance, a.balance), mapped: v6.mapped,
                saldoOk: v6.mapped ? saldoConcuerda(a.balance, claseNatura(c2)) : true,
                clase: c2.charAt(0), detalleId: null, std: v6.std, coincidencia: null, hijos: v6.hojas,
              } satisfies NodoBalance;
            });
          const a = agg(n6nodes);
          return {
            key: `${c2}/${c4}`, nivel: 4 as const, code: c4, name: sub?.nombre4.get(c4) ?? `Subgrupo ${c4}`, ...a,
            variation: variacion(a.prevBalance, a.balance), mapped: true, saldoOk: saldoConcuerda(a.balance, claseNatura(c2)),
            clase: c2.charAt(0), detalleId: null, std: null, coincidencia: null, hijos: n6nodes,
          } satisfies NodoBalance;
        });
      const a = agg(n4nodes);
      return {
        key: c2, nivel: 2 as const, code: c2, name: v2.name, ...a,
        variation: variacion(a.prevBalance, a.balance), mapped: true, saldoOk: saldoConcuerda(a.balance, claseNatura(c2)),
        clase: v2.clase, detalleId: null, std: null, coincidencia: null, hijos: n4nodes,
      } satisfies NodoBalance;
    });
}

// ---- Estado de resultado derivado (clases 4/5/6/7) ----
export type LineaEstadoResultado = { concept: string; current: number; prior: number; budget: number; bold: boolean; sep: boolean };

/**
 * Construye un estado de resultado básico a partir de los agregados del balance.
 * `prior`/`budget` quedan en 0 (no hay histórico ni presupuesto en el modelo).
 * Útil para el período corriente; sustituye al antiguo JSON `incomeStatement`.
 */
export function construirEstadoResultado(r: ResultadoBalance): LineaEstadoResultado[] {
  const magnitud = (code: string) => {
    const g = r.breakdown.find((x) => x.code === code);
    return g ? Math.abs(g.balance) : 0;
  };
  const lineas: LineaEstadoResultado[] = [];
  const push = (concept: string, current: number, opts: { bold?: boolean; sep?: boolean } = {}) =>
    lineas.push({ concept, current, prior: 0, budget: 0, bold: opts.bold ?? false, sep: opts.sep ?? false });

  const ingrNoOp = magnitud("42");
  push("Ingresos operacionales", magnitud("41"));
  if (ingrNoOp) push("Ingresos no operacionales", ingrNoOp);
  push("Total ingresos", r.sums.ingresos, { bold: true });
  push("Costo de ventas", r.sums.costos, { sep: true });
  push("Utilidad bruta", r.sums.ingresos - r.sums.costos, { bold: true });
  const gAdmin = magnitud("51");
  const gVentas = magnitud("52");
  push("Gastos de administración", gAdmin);
  if (gVentas) push("Gastos de ventas", gVentas);
  push("Utilidad operacional", r.sums.ingresos - r.sums.costos - gAdmin - gVentas, { bold: true });
  const gNoOp = magnitud("53");
  const impuesto = magnitud("54");
  if (gNoOp) push("Gastos no operacionales", gNoOp);
  if (impuesto) push("Impuesto de renta y complementarios", impuesto);
  push("Utilidad neta", r.sums.utilidad, { bold: true, sep: true });
  return lineas;
}

// ---- Comparativo entre versiones (para el campo `diff`) ----
export type DiffRow = { type: "added" | "removed" | "changed"; code: string; name: string; before: number; after: number; delta: number };
export type DiffBalance = { summary: { added: number; removed: number; changed: number; totalAffected: number }; rows: DiffRow[] };

/** Aplana el desglose a un mapa código → {nombre, saldo} para comparar versiones. */
export function aplanarBreakdown(breakdown: BreakdownGroup[]): Map<string, { name: string; balance: number }> {
  const m = new Map<string, { name: string; balance: number }>();
  for (const g of breakdown) for (const it of g.items) m.set(it.code, { name: it.name, balance: it.balance });
  return m;
}

/**
 * Compara la versión nueva contra la anterior (mapas código → saldo).
 * Devuelve cuentas agregadas, removidas y con cambio de saldo, ordenadas
 * por impacto (|delta|) descendente.
 */
export function compararBalances(
  anterior: Map<string, { name: string; balance: number }>,
  nuevo: Map<string, { name: string; balance: number }>,
): DiffBalance {
  const rows: DiffRow[] = [];
  for (const [code, n] of nuevo) {
    const a = anterior.get(code);
    if (!a) rows.push({ type: "added", code, name: n.name, before: 0, after: n.balance, delta: n.balance });
    else if (a.balance !== n.balance) rows.push({ type: "changed", code, name: n.name, before: a.balance, after: n.balance, delta: n.balance - a.balance });
  }
  for (const [code, a] of anterior) {
    if (!nuevo.has(code)) rows.push({ type: "removed", code, name: a.name, before: a.balance, after: 0, delta: -a.balance });
  }
  rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  return {
    summary: {
      added: rows.filter((r) => r.type === "added").length,
      removed: rows.filter((r) => r.type === "removed").length,
      changed: rows.filter((r) => r.type === "changed").length,
      totalAffected: sum(rows.map((r) => Math.abs(r.delta))),
    },
    rows,
  };
}
