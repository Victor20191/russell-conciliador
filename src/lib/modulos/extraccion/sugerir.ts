// Sugeridor HEURÍSTICO de columnas (sin IA): detecta la fila de encabezado y mapea cada
// columna al rol del descriptor cuyo sinónimo/etiqueta mejor coincide con el texto del
// encabezado. Da un punto de partida para el wizard; el usuario lo corrige a mano.
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import type { DescriptorModulo, RolColumna } from "../descriptores";
import type { SpecModulo } from "./esquema";

export const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
export const norm = (s: unknown) =>
  sinAcentos(String(s ?? "").toLowerCase())
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const ENCABEZADOS_INGRESO_NETO_SEGUROS = [
  "subtotal",
  "base gravable",
  "venta neta",
  "ingreso neto",
  "sin iva",
  "sin impuestos",
  "valor sin iva",
  "valor sin impuestos",
];

/**
 * Un total de factura suele incluir IVA/otros impuestos y no es comparable con
 * la cuenta 41. Se considera ambiguo salvo que el encabezado declare de forma
 * inequívoca una base neta/sin impuestos.
 */
export function encabezadoValorIngresoAmbiguo(encabezado: unknown): boolean {
  const texto = norm(encabezado);
  if (!texto) return false;
  if (ENCABEZADOS_INGRESO_NETO_SEGUROS.some((seguro) => texto === seguro || texto.includes(seguro))) {
    return false;
  }
  return texto.split(" ").includes("total");
}

/**
 * Invalida únicamente el rol monetario peligroso de ING; conserva el resto del
 * perfil para que el usuario solo tenga que volver a escoger el ingreso neto.
 */
export function invalidarValorAmbiguoIngresos(
  descriptor: DescriptorModulo,
  hoja: GridHoja,
  spec: SpecModulo,
): { spec: SpecModulo; invalidado: boolean } {
  if (descriptor.codigo !== "ING") return { spec, invalidado: false };
  const columna = spec.columnas[descriptor.valor] ?? 0;
  const encabezado = columna > 0
    ? hoja.filas[spec.filaEncabezado - 1]?.[columna - 1]
    : null;
  if (!encabezadoValorIngresoAmbiguo(encabezado)) return { spec, invalidado: false };
  return {
    spec: {
      ...spec,
      columnas: { ...spec.columnas, [descriptor.valor]: 0 },
    },
    invalidado: true,
  };
}

/**
 * Puntaje de coincidencia encabezado↔rol. Prefiere el match EXACTO, luego que el
 * encabezado CONTENGA la clave (encabezado específico), y por último que la clave
 * contenga al encabezado (fragmento débil). 0 = sin match.
 * Exportada: `transformarModulo` la reutiliza para NO sembrar el arrastre del clasificador
 * con la etiqueta del encabezado (ver `transformar.ts`).
 */
export function puntajeRol(headerNorm: string, rc: RolColumna): number {
  if (!headerNorm) return 0;
  const claves = [rc.etiqueta, rc.nombre, ...(rc.sinonimos ?? [])].map(norm).filter(Boolean);
  let mejor = 0;
  for (const k of claves) {
    if (headerNorm === k) mejor = Math.max(mejor, 1000 + k.length);
    else if (headerNorm.includes(k)) mejor = Math.max(mejor, 500 + k.length);
    else if (k.includes(headerNorm)) mejor = Math.max(mejor, headerNorm.length);
  }
  return mejor;
}

/** Fila de encabezado = la de las primeras `maxFilas` con más columnas que matchean algún rol. */
function detectarEncabezado(descriptor: DescriptorModulo, hoja: GridHoja, maxFilas = 15): number {
  let mejorFila = 1;
  let mejorScore = -1;
  const lim = Math.min(hoja.filas.length, maxFilas);
  for (let r = 0; r < lim; r++) {
    const fila = hoja.filas[r] ?? [];
    let score = 0;
    for (const celda of fila) {
      const h = norm(celda);
      if (descriptor.columnas.some((rc) => puntajeRol(h, rc) > 0)) score += 1;
    }
    if (score > mejorScore) {
      mejorScore = score;
      mejorFila = r + 1;
    }
  }
  return mejorFila;
}

/**
 * Sugiere un `SpecModulo` para una hoja: detecta encabezado y asigna columnas a roles de
 * forma greedy (mayor puntaje primero; cada columna y cada rol se usan una sola vez).
 */
export function sugerirSpec(descriptor: DescriptorModulo, hoja: GridHoja): SpecModulo {
  const filaEncabezado = detectarEncabezado(descriptor, hoja);
  const header = hoja.filas[filaEncabezado - 1] ?? [];
  const columnas: Record<string, number> = Object.fromEntries(descriptor.columnas.map((rc) => [rc.nombre, 0]));

  const candidatos: { col: number; rol: string; score: number }[] = [];
  for (let c = 0; c < header.length; c++) {
    const h = norm(header[c]);
    for (const rc of descriptor.columnas) {
      const s = puntajeRol(h, rc);
      if (s > 0) candidatos.push({ col: c + 1, rol: rc.nombre, score: s });
    }
  }
  candidatos.sort((a, b) => b.score - a.score);
  const colUsada = new Set<number>();
  const rolUsado = new Set<string>();
  for (const cand of candidatos) {
    if (colUsada.has(cand.col) || rolUsado.has(cand.rol)) continue;
    columnas[cand.rol] = cand.col;
    colUsada.add(cand.col);
    rolUsado.add(cand.rol);
  }

  return invalidarValorAmbiguoIngresos(descriptor, hoja, {
    hoja: hoja.nombre,
    filaEncabezado,
    primeraFilaDatos: filaEncabezado + 1,
    columnas,
  }).spec;
}

/** Roles requeridos que quedaron sin mapear (para avisar/bloquear en el wizard). */
export function rolesRequeridosFaltantes(descriptor: DescriptorModulo, spec: SpecModulo): string[] {
  return descriptor.columnas.filter((rc) => rc.requerido && (spec.columnas[rc.nombre] ?? 0) < 1).map((rc) => rc.nombre);
}
