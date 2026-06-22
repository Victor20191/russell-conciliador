// ============================================================
// Cálculo PURO del balance de comprobación (sin BD, sin Excel).
//
// A partir de las cuentas crudas de un archivo (código, nombre, saldo
// anterior y saldo final) y del plan de cuentas estándar (346 cuentas
// de 6 dígitos), produce los agregados que consumen las pantallas de
// Balance: `sums`, `breakdown` (por grupo PUC), `validations` y los
// contadores de mapeo. Es determinista y testeable en memoria
// (`calcular.test.ts`); la persistencia y el versionado viven en la
// Server Action `cargarBalance`.
// ============================================================
import { fmt } from "@/lib/format";

// ---- Tipos de entrada ----
// `debitos`/`creditos` son los movimientos del período (magnitud positiva);
// opcionales porque algunos balances solo traen saldos.
export type CuentaCruda = { code: string; name: string; prevBalance: number; balance: number; debitos?: number; creditos?: number };
export type CuentaEstandar = { code: string; nature: string; critical: boolean };

// ---- Tipos de salida (coinciden con el JSON que renderiza el detalle) ----
export type Sums = { activo: number; pasivo: number; patrimonio: number; ingresos: number; gastos: number; costos: number; utilidad: number };
export type Validation = { id: string; rule: string; status: "ok" | "warn"; detail: string; count?: number };
export type BreakdownItem = { code: string; name: string; balance: number; prevBalance: number; variation: number | null; std: string | null; mapped: boolean; critical: boolean; nature: string; saldoOk: boolean; debe?: number; haber?: number };
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
 * Calcula los agregados del balance. `cuentas` son las filas crudas del
 * Excel; `estandar` el plan de cuentas (6 dígitos). El mapeo es por
 * prefijo de 6 dígitos: una cuenta `11050501` mapea a la subcuenta
 * estándar `110505`.
 */
export function calcularBalance(cuentas: CuentaCruda[], estandar: CuentaEstandar[]): ResultadoBalance {
  const stdByCode = new Map(estandar.map((s) => [s.code, s]));

  // 1) Hojas: cuentas que no son prefijo de otra (evita doble conteo de
  //    filas de resumen como clase/grupo/cuenta cuando el archivo las trae).
  const hojas = cuentas.filter(
    (c) => !cuentas.some((o) => o.code !== c.code && o.code.startsWith(c.code) && o.code.length > c.code.length),
  );

  // 2) Mapeo al estándar + naturaleza/criticidad de cada hoja.
  const mapeadas = hojas.map((c) => {
    const key = c.code.length >= 6 ? c.code.slice(0, 6) : null;
    const ref = key ? stdByCode.get(key) : undefined;
    const std = ref ? key : null;
    return {
      ...c,
      std,
      mapped: ref != null,
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
  const aSigno = (nature: string, v: number) => (flip ? (nature === "C" ? -Math.abs(v) : Math.abs(v)) : v);

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
      mapped: m.mapped,
      critical: m.critical,
      nature: m.nature,
      saldoOk: saldoConcuerda(balance, m.nature),
      debe: m.debitos ?? 0, // movimientos del período (magnitud, sin flip)
      haber: m.creditos ?? 0,
    };
  });

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
  const totalAbs = sum(detalle.map((d) => Math.abs(d.balance)));
  const diffCuadre = sum(detalle.map((d) => d.balance));
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
      detail: balanced ? "Partida doble correcta · diferencia: $ 0" : `Diferencia entre débitos y créditos: ${fmt(diffCuadre)}`,
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
