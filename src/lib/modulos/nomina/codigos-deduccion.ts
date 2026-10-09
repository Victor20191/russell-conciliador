// Rangos de CÓDIGOS DE DEDUCCIÓN de un formato de nómina — puro, sin BD.
//
// Hay ERP que no dicen en ninguna columna qué concepto es devengo y cuál deducción, y traen todo
// el «Valor» en positivo. NOMINAI (KP EMPAQUES, 2025) lo distingue solo por el código: 001–499
// devengos, 500–799 deducciones (retención, EPS, AFP, embargos, préstamos, AFC, FSP). Leído tal
// cual, las 7.604 filas de deducción entraban como devengos: el cargue sumaba 9.116.050.337 en vez
// de 6.260.507.646 y el control de deducciones salía con el signo al revés. El formato declara los
// rangos («500-799») y esas filas se restan (`valorFilaNomina`). Es del FORMATO: viaja con el patrón
// y con el perfil del cliente. Adivinarlo por el nombre falla («DEV. DEDUCC FESERT» es un devengo).

export type RangoCodigos = { desde: number; hasta: number };

/** Tope de rangos por formato (un catálogo real usa uno o dos). */
const MAX_RANGOS = 20;

const esEntero = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

/** Rangos válidos (enteros, desde ≤ hasta, sin repetir), en orden; `undefined` si no queda ninguno. */
export function sanearRangosCodigos(rangos: unknown): RangoCodigos[] | undefined {
  if (!Array.isArray(rangos)) return undefined;
  const vistos = new Set<string>();
  const salida: RangoCodigos[] = [];
  for (const r of rangos.slice(0, MAX_RANGOS)) {
    const { desde, hasta } = (r ?? {}) as { desde?: unknown; hasta?: unknown };
    if (!esEntero(desde) || !esEntero(hasta) || desde > hasta) continue;
    const clave = `${desde}-${hasta}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push({ desde, hasta });
  }
  salida.sort((a, b) => a.desde - b.desde || a.hasta - b.hasta);
  return salida.length > 0 ? salida : undefined;
}

/**
 * «500-799» o «500-799, 900, 950-960» → rangos. Vacío → sin rangos. Un rango al revés («799-500»)
 * se acepta y se ordena; cualquier otro texto es un error que se explica.
 */
export function parsearRangosCodigos(texto: string): { ok: true; rangos: RangoCodigos[] | undefined } | { ok: false; error: string } {
  const partes = texto.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  if (partes.length === 0) return { ok: true, rangos: undefined };
  const rangos: RangoCodigos[] = [];
  for (const parte of partes) {
    const m = /^(\d{1,9})(?:\s*(?:-|–|a|al|hasta)\s*(\d{1,9}))?$/i.exec(parte);
    if (!m) return { ok: false, error: `«${parte}» no es un código ni un rango. Escribe, por ejemplo, 500-799 o 500-799, 900.` };
    const a = Number(m[1]);
    const b = m[2] != null ? Number(m[2]) : a;
    rangos.push({ desde: Math.min(a, b), hasta: Math.max(a, b) });
  }
  if (rangos.length > MAX_RANGOS) return { ok: false, error: `Son demasiados rangos: el máximo es ${MAX_RANGOS}.` };
  return { ok: true, rangos: sanearRangosCodigos(rangos) };
}

/** Rangos → «500-799, 900» (lo que se muestra en el editor y en el resumen del mapeo). */
export function textoRangosCodigos(rangos: readonly RangoCodigos[] | undefined): string {
  return (rangos ?? []).map((r) => (r.desde === r.hasta ? String(r.desde) : `${r.desde}-${r.hasta}`)).join(", ");
}

/**
 * ¿El código del concepto cae en alguno de los rangos? Solo dígitos («541», «0541»), o el código con
 * su nombre pegado («541 - DEDUC. FESERT», como lo imprime NOMINAI cuando no se separa al leer).
 */
export function esCodigoDeduccion(codigo: unknown, rangos: readonly RangoCodigos[] | undefined): boolean {
  if (!rangos?.length || codigo == null) return false;
  const m = /^(\d{1,9})(?:\s*-\s*.*)?$/.exec(String(codigo).trim());
  if (!m) return false;
  const n = Number(m[1]);
  return rangos.some((r) => n >= r.desde && n <= r.hasta);
}
