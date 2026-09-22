// VALIDACIÓN DE COHERENCIA entre los terceros sueltos del cruce por tercero — pura, sin BD.
//
// Cuando un tercero queda «solo en el módulo» y otro «solo en contabilidad», casi siempre es el
// mismo tercero escrito distinto: el auxiliar sin dígito de verificación y el balance con él, un
// sufijo de sucursal, el nombre en vez del NIT, o el mismo saldo al centavo. Aquí se buscan esas
// coincidencias con SEÑALES deterministas y se devuelven como PROPUESTAS con su evidencia: nunca
// se aplican solas, el auditor las revisa y las aplica (una a una o en lote).
//
// Reglas que no se ven a simple vista:
//  - Solo se propone un par cuando es el mejor candidato EN AMBOS SENTIDOS. Un tercero con dos
//    candidatos empatados no se propone: mejor una propuesta menos que una equivocada.
//  - El saldo solo cuenta como señal si ese importe es ÚNICO en su lado: dos clientes con la
//    misma cuota pendiente no son el mismo cliente.
//  - Las búsquedas van por índices (saldo, prefijo, núcleo, nombre, tokens): el cruce se
//    recalcula en cada lectura y no puede ser cuadrático sobre miles de terceros.
import { dvValido, nucleoNit } from "@/lib/nit";
import type { FilaCruceTerceroCartera } from "./cruce-tercero-cartera";

export type SenalCoherencia = "nit_dv" | "nit_prefijo" | "nucleo" | "saldo" | "nombre";

export type ConfianzaCoherencia = "alta" | "media";

export type SugerenciaEmparejamiento = {
  claveModulo: string;
  nombreModulo: string | null;
  saldoModulo: number;
  claveBalance: string;
  nombreBalance: string | null;
  saldoContable: number;
  senales: SenalCoherencia[];
  confianza: ConfianzaCoherencia;
};

/** Lo que se anota en cada renglón del par propuesto: el tercero del otro lado y por qué. */
export type SugerenciaFila = {
  clave: string;
  nombre: string | null;
  senales: SenalCoherencia[];
  confianza: ConfianzaCoherencia;
};

export const ETIQUETA_SENAL: Record<SenalCoherencia, string> = {
  nit_dv: "NIT con dígito de verificación",
  nit_prefijo: "NIT con sufijo",
  nucleo: "mismos nueve dígitos",
  saldo: "mismo saldo",
  nombre: "nombre parecido",
};

/** Formas societarias que el balance y el auxiliar escriben distinto («S.A.S.», «SAS», «LTDA»…). */
const FORMA_SOCIETARIA = /\b(?:S A S|SAS|S A|SA|LTDA|LIMITADA|S EN C S|S EN C|SCA|E U|EU|Y CIA|CIA|INC|LLC|CORP|BIC|EN LIQUIDACION)\b/g;

/** Nombre comparable entre el balance y el auxiliar: sin tildes, puntuación ni forma societaria. */
export function nombreComparable(nombre: string | null | undefined): string | null {
  const limpio = String(nombre ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/&/g, " Y ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(FORMA_SOCIETARIA, " ")
    .replace(/\s+/g, " ")
    .trim();
  return limpio || null;
}

/** Palabras con peso de un nombre (tres letras o más; «DE», «LA», «Y» no identifican a nadie). */
export function tokensNombre(nombre: string | null | undefined): string[] {
  const comparable = nombreComparable(nombre);
  if (!comparable) return [];
  return [...new Set(comparable.split(" ").filter((t) => t.length >= 3))];
}

/** Umbral de Jaccard sobre tokens para considerar dos nombres «parecidos». */
const JACCARD_MINIMO = 0.6;

/** ¿Dos nombres se parecen lo bastante para ser el mismo tercero escrito distinto? */
export function nombresParecidos(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = nombreComparable(a);
  const cb = nombreComparable(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  const ta = tokensNombre(ca);
  const tb = tokensNombre(cb);
  if (ta.length === 0 || tb.length === 0) return false;
  const [corto, largo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const setLargo = new Set(largo);
  const comunes = corto.filter((t) => setLargo.has(t)).length;
  // «GAITAN REYES LINA MARCELA» está contenido en «RACING MOSTER/GAITAN REYES LINA MARCELA».
  if (corto.length >= 2 && comunes === corto.length) return true;
  const union = new Set([...ta, ...tb]).size;
  return union > 0 && comunes / union >= JACCARD_MINIMO;
}

const esNumerica = (clave: string) => /^\d{5,}$/.test(clave);

/** ¿`larga` es `corta` más su dígito de verificación DIAN? */
export function esClaveConDv(corta: string, larga: string): boolean {
  return esNumerica(corta) && esNumerica(larga) && larga.length === corta.length + 1 && larga.startsWith(corta)
    && dvValido(corta, larga[larga.length - 1]);
}

/** Señal de identificador entre dos claves numéricas distintas, si la hay. */
export function senalIdentificador(a: string, b: string): "nit_dv" | "nit_prefijo" | "nucleo" | null {
  if (a === b || !esNumerica(a) || !esNumerica(b)) return null;
  const [corta, larga] = a.length <= b.length ? [a, b] : [b, a];
  if (esClaveConDv(corta, larga)) return "nit_dv";
  // Sufijo de sucursal o de consecutivo: uno o dos dígitos de más sobre el mismo documento.
  if (larga.startsWith(corta) && larga.length - corta.length <= 2) return "nit_prefijo";
  // Dos documentos completos que comparten los nueve primeros dígitos (lo que la pasada
  // automática por núcleo se niega a unir sola).
  if (corta.length >= 9 && nucleoNit(a) === nucleoNit(b)) return "nucleo";
  return null;
}

const claveSaldo = (v: number) => String(Math.round(v * 100));

type Lado = {
  fila: FilaCruceTerceroCartera;
  saldo: number;
  tokens: string[];
};

/** Índices por los que un tercero de un lado encuentra candidatos en el otro. */
function indexar(lados: Lado[]) {
  const porClave = new Map<string, Lado>();
  const porSaldo = new Map<string, Lado[]>();
  const porPrefijo = new Map<string, Lado[]>(); // clave sin 1 o 2 dígitos finales → filas
  const porNucleo = new Map<string, Lado[]>();
  const porToken = new Map<string, Lado[]>();
  const agregar = (mapa: Map<string, Lado[]>, k: string, l: Lado) => mapa.set(k, [...(mapa.get(k) ?? []), l]);
  for (const l of lados) {
    const { clave } = l.fila;
    porClave.set(clave, l);
    agregar(porSaldo, claveSaldo(l.saldo), l);
    if (esNumerica(clave)) {
      agregar(porPrefijo, clave, l);
      if (clave.length > 5) agregar(porPrefijo, clave.slice(0, -1), l);
      if (clave.length > 6) agregar(porPrefijo, clave.slice(0, -2), l);
      if (clave.length >= 9) agregar(porNucleo, nucleoNit(clave), l);
    }
    for (const t of l.tokens) agregar(porToken, t, l);
  }
  return { porClave, porSaldo, porPrefijo, porNucleo, porToken };
}

/** Candidatos del otro lado que comparten al menos una pista con la fila. */
function candidatosDe(l: Lado, indice: ReturnType<typeof indexar>): Set<Lado> {
  const candidatos = new Set<Lado>();
  const { clave } = l.fila;
  for (const c of indice.porSaldo.get(claveSaldo(l.saldo)) ?? []) candidatos.add(c);
  if (esNumerica(clave)) {
    for (const k of [clave, clave.length > 5 ? clave.slice(0, -1) : null, clave.length > 6 ? clave.slice(0, -2) : null]) {
      if (k) for (const c of indice.porPrefijo.get(k) ?? []) candidatos.add(c);
    }
    if (clave.length >= 9) for (const c of indice.porNucleo.get(nucleoNit(clave)) ?? []) candidatos.add(c);
  }
  for (const t of l.tokens) for (const c of indice.porToken.get(t) ?? []) candidatos.add(c);
  candidatos.delete(l);
  return candidatos;
}

const PESO: Record<SenalCoherencia, number> = { nit_dv: 3, nit_prefijo: 2, nucleo: 2, saldo: 2, nombre: 2 };

function confianzaDe(senales: readonly SenalCoherencia[]): ConfianzaCoherencia {
  return senales.includes("nit_dv") || senales.length >= 2 ? "alta" : "media";
}

/**
 * Propuestas de emparejamiento entre los terceros que quedaron solo en el módulo y solo en la
 * contabilidad. `separadas` son los pares que el auditor ya rechazó: no se vuelven a proponer.
 * Anota `sugerencia` en los dos renglones de cada par propuesto y devuelve la lista, con las de
 * mayor confianza y mayor saldo primero.
 */
export function sugerirEmparejamientosTercero(
  filas: FilaCruceTerceroCartera[],
  opciones: { tolerancia?: number; separadas?: ReadonlySet<string> } = {},
): SugerenciaEmparejamiento[] {
  const tolerancia = opciones.tolerancia ?? 0.01;
  const separadas = opciones.separadas ?? new Set<string>();
  const lado = (f: FilaCruceTerceroCartera, saldo: number): Lado => ({ fila: f, saldo, tokens: tokensNombre(f.nombre) });
  const delModulo = filas.filter((f) => f.estado === "solo_modulo").map((f) => lado(f, f.modulo.total));
  const delBalance = filas.filter((f) => f.estado === "solo_contable").map((f) => lado(f, f.contable.total));
  if (delModulo.length === 0 || delBalance.length === 0) return [];

  const indiceModulo = indexar(delModulo);
  const indiceBalance = indexar(delBalance);
  const saldoUnico = (indice: ReturnType<typeof indexar>, saldo: number) => (indice.porSaldo.get(claveSaldo(saldo))?.length ?? 0) === 1;

  const senalesDe = (m: Lado, c: Lado): SenalCoherencia[] => {
    const senales: SenalCoherencia[] = [];
    const id = senalIdentificador(m.fila.clave, c.fila.clave);
    if (id) senales.push(id);
    if (Math.abs(m.saldo - c.saldo) <= tolerancia && saldoUnico(indiceModulo, m.saldo) && saldoUnico(indiceBalance, c.saldo)) senales.push("saldo");
    if (nombresParecidos(m.fila.nombre, c.fila.nombre)) senales.push("nombre");
    return senales;
  };
  const puntaje = (senales: readonly SenalCoherencia[]) => senales.reduce((suma, s) => suma + PESO[s], 0);

  // El mejor candidato de cada tercero, o null si no hay ninguno o hay empate.
  const mejor = (l: Lado, indice: ReturnType<typeof indexar>, senalesPar: (a: Lado, b: Lado) => SenalCoherencia[]) => {
    let ganador: { otro: Lado; senales: SenalCoherencia[]; puntos: number } | null = null;
    let empate = false;
    for (const otro of candidatosDe(l, indice)) {
      if (separadas.has(`${l.fila.clave}\u0000${otro.fila.clave}`) || separadas.has(`${otro.fila.clave}\u0000${l.fila.clave}`)) continue;
      const senales = senalesPar(l, otro);
      const puntos = puntaje(senales);
      if (puntos === 0) continue;
      if (!ganador || puntos > ganador.puntos) {
        ganador = { otro, senales, puntos };
        empate = false;
      } else if (puntos === ganador.puntos) {
        empate = true;
      }
    }
    return ganador && !empate ? ganador : null;
  };

  const sugerencias: SugerenciaEmparejamiento[] = [];
  for (const m of delModulo) {
    const eleccion = mejor(m, indiceBalance, senalesDe);
    if (!eleccion) continue;
    const reciproco = mejor(eleccion.otro, indiceModulo, (c, mm) => senalesDe(mm, c));
    if (!reciproco || reciproco.otro !== m) continue;
    const confianza = confianzaDe(eleccion.senales);
    m.fila.sugerencia = { clave: eleccion.otro.fila.clave, nombre: eleccion.otro.fila.nombre, senales: eleccion.senales, confianza };
    eleccion.otro.fila.sugerencia = { clave: m.fila.clave, nombre: m.fila.nombre, senales: eleccion.senales, confianza };
    sugerencias.push({
      claveModulo: m.fila.clave,
      nombreModulo: m.fila.nombre,
      saldoModulo: m.saldo,
      claveBalance: eleccion.otro.fila.clave,
      nombreBalance: eleccion.otro.fila.nombre,
      saldoContable: eleccion.otro.saldo,
      senales: eleccion.senales,
      confianza,
    });
  }

  const ORDEN: Record<ConfianzaCoherencia, number> = { alta: 0, media: 1 };
  return sugerencias.sort((a, b) =>
    ORDEN[a.confianza] - ORDEN[b.confianza]
    || Math.abs(b.saldoModulo) - Math.abs(a.saldoModulo)
    || a.claveModulo.localeCompare(b.claveModulo));
}

/** La nota que deja constancia de por qué la validación de coherencia propuso el par. */
export function notaDeSugerencia(s: Pick<SugerenciaEmparejamiento, "senales" | "confianza">): string {
  return `Validación de coherencia (confianza ${s.confianza}): ${s.senales.map((x) => ETIQUETA_SENAL[x]).join(", ")}.`;
}

/** Las señales de una propuesta, en palabras, para tooltips y observaciones. */
export function describirSenales(senales: readonly SenalCoherencia[]): string {
  return senales.map((x) => ETIQUETA_SENAL[x]).join(", ");
}

/** Llave de un par separado, para el conjunto `separadas`. */
export function claveParSeparado(claveModulo: string, claveBalance: string): string {
  return `${claveModulo}\u0000${claveBalance}`;
}
