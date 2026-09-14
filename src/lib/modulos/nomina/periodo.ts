// PERÍODO de cada fila de un archivo de NÓMINA — puro, sin BD.
//
// Los reportes de nómina dicen a qué mes pertenece cada fila de doce maneras distintas:
// «202512» (SIESA), «PERIODO 3» más el año del ejercicio (LIBRA), «january»/«enero» (LIBRA
// de nuevo), una fecha de liquidación o de pago (Novasoft, Buk), el fin de la quincena
// (Ofimática), «Mes 1 · Año 2026 · Q2» en tres columnas (Pure Nature) o un rango «De 202501
// A 202512» (SIIGO, acumulado anual). La firma decidió (D3, 13/Sep/2026) que un pago
// liquidado en un mes por días de otro va al mes de LIQUIDACIÓN, así que la fecha de
// liquidación/pago manda sobre cualquier período impreso.
//
// Aquí solo se interpreta el texto/número de la celda; quién decide el rango del cargue y qué
// se hace con las filas fuera de él vive en `transformar.ts` (`fuera_de_periodo`).

/** Mes calendario «YYYY-MM». */
export type Mes = string;
/** Rango de meses (inclusive) al que pertenece una fila o un cargue. */
export type RangoMeses = { desde: Mes; hasta: Mes };

const MESES: Record<string, number> = {
  enero: 1, ene: 1, january: 1, jan: 1,
  febrero: 2, feb: 2, february: 2,
  marzo: 3, mar: 3, march: 3,
  abril: 4, abr: 4, april: 4, apr: 4,
  mayo: 5, may: 5,
  junio: 6, jun: 6, june: 6,
  julio: 7, jul: 7, july: 7,
  agosto: 8, ago: 8, august: 8, aug: 8,
  septiembre: 9, setiembre: 9, sep: 9, sept: 9, september: 9,
  octubre: 10, oct: 10, october: 10,
  noviembre: 11, nov: 11, november: 11,
  diciembre: 12, dic: 12, december: 12, dec: 12,
};

const ES_MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const dos = (n: number) => String(n).padStart(2, "0");
const normalizar = (v: unknown): string =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function mesValido(anio: number, mes: number): Mes | null {
  if (!Number.isInteger(anio) || anio < 1990 || anio > 2100) return null;
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return null;
  return `${anio}-${dos(mes)}`;
}

/** Año de dos dígitos («25») → 2025. Los de cuatro se respetan. */
function anioCompleto(v: string): number {
  const n = Number(v);
  return v.length === 2 ? 2000 + n : n;
}

/**
 * Fecha de una celda en ISO «YYYY-MM-DD», o `null` si no es una fecha. Acepta lo que traen
 * los ERP: ISO (ExcelJS ya convierte las fechas con estilo), «31/12/2025», «2025/01/19»,
 * «1/15/2026 12:00:00 AM» (formato anglosajón de la planilla PILA) y el SERIAL de Excel
 * cuando el libro perdió los estilos y la fecha llega como número (45687).
 *
 * Con «a/b/yyyy» ambiguo (ambos ≤ 12) se asume día/mes: es la convención de Colombia. El mes también
 * puede venir en letras: «DIC/30/2025» (Metroplus), «30-dic-2025», «Ene 5, 2026».
 */
export function parsearFechaCelda(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    // Serial de Excel (época 1899-12-30). Se acota a fechas plausibles de un reporte contable.
    if (!Number.isFinite(v) || v < 20000 || v > 80000) return null;
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) return mesValido(Number(m[1]), Number(m[2])) ? `${m[1]}-${dos(Number(m[2]))}-${dos(Number(m[3]))}` : null;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[T\s].*)?$/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const anio = anioCompleto(m[3]);
    // «15/01/2026» es día/mes; «1/15/2026» solo puede ser mes/día.
    const [dia, mes] = a > 12 && b <= 12 ? [a, b] : b > 12 && a <= 12 ? [b, a] : [a, b];
    if (!mesValido(anio, mes) || dia < 1 || dia > 31) return null;
    return `${anio}-${dos(mes)}-${dos(dia)}`;
  }
  // Mes en letras, antes o después del día.
  const t = normalizar(s);
  const mesPrimero = /^([a-z]{3,10})\.?[\s/.-]+(\d{1,2}),?[\s/.-]+(\d{2}|\d{4})$/.exec(t);
  const diaPrimero = mesPrimero ? null : /^(\d{1,2})[\s/.-]+([a-z]{3,10})\.?[\s/.-]+(\d{2}|\d{4})$/.exec(t);
  const partes = mesPrimero
    ? { mes: MESES[mesPrimero[1]], dia: Number(mesPrimero[2]), anio: anioCompleto(mesPrimero[3]) }
    : diaPrimero
      ? { mes: MESES[diaPrimero[2]], dia: Number(diaPrimero[1]), anio: anioCompleto(diaPrimero[3]) }
      : null;
  if (partes?.mes && mesValido(partes.anio, partes.mes) && partes.dia >= 1 && partes.dia <= 31) {
    return `${partes.anio}-${dos(partes.mes)}-${dos(partes.dia)}`;
  }
  return null;
}

/** Mes «YYYY-MM» de una fecha ISO. */
export function mesDeFecha(iso: string | null | undefined): Mes | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  return m ? mesValido(Number(m[1]), Number(m[2])) : null;
}

/**
 * Mes escrito como período: «202512», «2025-12», «12/2025», «dic-25», «Enero 2025», «january»
 * (con `anio` de contexto), «PERIODO 3» o «3» (número del mes, también con `anio`), o una
 * fecha. `null` si no se reconoce (p. ej. «Q2», «Mensual»).
 */
export function parsearPeriodo(v: unknown, anio?: number | null): Mes | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    if (Number.isInteger(v) && v >= 1 && v <= 12) return anio != null ? mesValido(anio, v) : null;
    if (Number.isInteger(v) && v >= 199001 && v <= 210012) return mesValido(Math.floor(v / 100), v % 100);
    return mesDeFecha(parsearFechaCelda(v));
  }
  const s = normalizar(v);
  if (!s) return null;
  let m = /^(\d{4})(0[1-9]|1[0-2])$/.exec(s);
  if (m) return mesValido(Number(m[1]), Number(m[2]));
  m = /^(\d{4})[-/. ](\d{1,2})$/.exec(s);
  if (m) return mesValido(Number(m[1]), Number(m[2]));
  m = /^(\d{1,2})[-/. ](\d{4})$/.exec(s);
  if (m) return mesValido(Number(m[2]), Number(m[1]));
  const fecha = parsearFechaCelda(String(v));
  if (fecha) return mesDeFecha(fecha);
  m = /^(?:periodo|per|p|mes)?\s*(\d{1,2})$/.exec(s);
  if (m) return anio != null ? mesValido(anio, Number(m[1])) : null;
  // Nombre del mes, solo o con año («enero 2025», «ene-25», «january/enero»).
  m = /^([a-z]+)(?:\s*[-/ ]\s*([a-z]+))?(?:\s*[-/ ]?\s*(\d{2}|\d{4}))?$/.exec(s);
  if (m) {
    const mes = MESES[m[1]] ?? (m[2] ? MESES[m[2]] : undefined);
    if (mes) {
      const a = m[3] ? anioCompleto(m[3]) : anio ?? null;
      return a != null ? mesValido(a, mes) : null;
    }
  }
  return null;
}

/** Año de una celda: «2025», 2025, «2025-01-15» → 2025. */
export function parsearAnio(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isInteger(v) && v >= 1990 && v <= 2100 ? v : null;
  const m = /^(\d{4})\b/.exec(String(v).trim());
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 1990 && n <= 2100 ? n : null;
}

/** Valores de una fila que pueden decir su período. Todos opcionales: cada archivo trae unos. */
export type DatosPeriodoFila = {
  fecha?: unknown;
  fechaCorte?: unknown;
  periodo?: unknown;
  mes?: unknown;
  anio?: unknown;
  periodoDesde?: unknown;
  periodoHasta?: unknown;
};

/**
 * Rango de meses de una fila, en este orden de preferencia (D3: manda la liquidación):
 *  1. `fecha` (liquidación / pago / fin de quincena);
 *  2. `mes` + `anio` en columnas aparte (Pure Nature);
 *  3. `periodo` («202512», «PERIODO 3» con el año del archivo, «january»…);
 *  4. `periodoDesde`/`periodoHasta` (acumulado SIIGO «De 202501 A 202512»);
 *  5. `fechaCorte`, solo si nada más lo dice.
 * `anioContexto` es el año del cargue o del archivo, para los períodos sin año.
 */
export function rangoDeFila(d: DatosPeriodoFila, anioContexto?: number | null): RangoMeses | null {
  const anio = parsearAnio(d.anio) ?? anioContexto ?? null;
  const porFecha = mesDeFecha(parsearFechaCelda(d.fecha));
  if (porFecha) return { desde: porFecha, hasta: porFecha };
  const mesNumero = typeof d.mes === "number" ? d.mes : Number(String(d.mes ?? "").trim());
  if (anio != null && Number.isInteger(mesNumero) && mesNumero >= 1 && mesNumero <= 12) {
    const m = mesValido(anio, mesNumero)!;
    return { desde: m, hasta: m };
  }
  const porMes = parsearPeriodo(d.mes, anio);
  if (porMes) return { desde: porMes, hasta: porMes };
  const porPeriodo = parsearPeriodo(d.periodo, anio);
  if (porPeriodo) return { desde: porPeriodo, hasta: porPeriodo };
  const desde = parsearPeriodo(d.periodoDesde, anio);
  const hasta = parsearPeriodo(d.periodoHasta, anio);
  if (desde || hasta) {
    const a = desde ?? hasta!;
    const b = hasta ?? desde!;
    return a <= b ? { desde: a, hasta: b } : { desde: b, hasta: a };
  }
  const porCorte = mesDeFecha(parsearFechaCelda(d.fechaCorte));
  if (porCorte) return { desde: porCorte, hasta: porCorte };
  return null;
}

/** ¿Es un mes «YYYY-MM» válido? */
export function esMes(v: unknown): v is Mes {
  return typeof v === "string" && ES_MES.test(v);
}

/** ¿El rango de la fila toca el rango del cargue? (meses inclusive, comparación lexicográfica). */
export function rangoDentroDelCargue(fila: RangoMeses, cargue: RangoMeses): boolean {
  return fila.desde <= cargue.hasta && fila.hasta >= cargue.desde;
}

/** Etiqueta de un rango para el usuario: «2025-03» o «2025-01 → 2025-12». */
export function etiquetaRango(r: RangoMeses): string {
  return r.desde === r.hasta ? r.desde : `${r.desde} → ${r.hasta}`;
}

export type ResumenPeriodo = { periodo: string; filas: number; valor: number };

/**
 * Qué meses (o rangos) trae el archivo y cuánto suma cada uno, para que el wizard lo muestre y
 * el usuario elija el cargue. Solo cuentan las filas de movimiento; las filas sin período
 * caen en «(sin período)».
 */
export function resumirPeriodos(
  filas: readonly { periodoDesde?: unknown; periodoHasta?: unknown; valor: number; tipoFila?: string }[],
): ResumenPeriodo[] {
  const acumulado = new Map<string, { filas: number; valor: number }>();
  for (const f of filas) {
    if (f.tipoFila && f.tipoFila !== "movimiento") continue;
    const desde = esMes(f.periodoDesde) ? f.periodoDesde : null;
    const hasta = esMes(f.periodoHasta) ? f.periodoHasta : desde;
    const clave = desde ? etiquetaRango({ desde, hasta: hasta ?? desde }) : "(sin período)";
    const acc = acumulado.get(clave) ?? { filas: 0, valor: 0 };
    acc.filas += 1;
    acc.valor += f.valor;
    acumulado.set(clave, acc);
  }
  return [...acumulado.entries()]
    .map(([periodo, a]) => ({ periodo, filas: a.filas, valor: Math.round(a.valor * 100) / 100 }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
}
