import { dvValido, nucleoNit } from "@/lib/nit";
import { esFechaIso } from "../calendario";
import { controlarTotales, renglonesConImporte } from "../formularios/definicion";
import { F350 } from "../formularios/f350";
import { CONCEPTOS_PAGO_RETENCION, F490 } from "../formularios/f490";

/**
 * Lectura de un formulario DIAN (350 o 490) que devolvió la IA: normalización y controles (puro).
 *
 * La IA devuelve todo como TEXTO (los valores, sin convertir) y aquí se convierte: los PDF de la
 * DIAN traen el NIT pegado al DV («9014276595»), fechas espaciadas («2 0 2 6 -0 3 -1 9») o con hora
 * («2026-03-19 / 03:08:44 PM»), y valores con comas. Los controles deciden si la lectura se puede
 * confirmar: un control que «bloquea» tiene que pasar (el usuario corrige el valor a mano).
 */

export type LecturaCruda = {
  formulario: string;
  anio: string;
  periodo: string;
  numero: string;
  nit: string;
  dv: string;
  razonSocial: string;
  codigoCorreccion: string;
  numeroAnterior: string;
  concepto: string;
  numeroPagado: string;
  cuota: string;
  deCuotas: string;
  fechaLimitePago: string;
  autoadhesivo: string;
  fechaSello: string;
  renglones: { renglon: number; valor: string }[];
  exterior: { pais: string; tipoPersona: string; valorRetencion: string }[];
};

export type CodigoFormulario = "350" | "490";

export type LecturaFormulario = {
  formulario: CodigoFormulario | null;
  anio: number | null;
  periodo: number | null;
  numero: string | null;
  nit: string | null;
  dv: string | null;
  razonSocial: string | null;
  /** Renglón 25 del 350: 1 = corrección. */
  codigoCorreccion: number | null;
  /** Renglón 26 del 350: el formulario que corrige. */
  numeroAnterior: string | null;
  /** Renglón 2 del 490: 61, 62 o 63. */
  concepto: string | null;
  /** Renglón 29 del 490: el 350 que se paga. */
  numeroPagado: string | null;
  cuota: number | null;
  deCuotas: number | null;
  fechaLimitePago: string | null;
  /** Renglón 996. */
  autoadhesivo: string | null;
  /** Renglón 997: fecha de presentación (350) o de pago (490), AAAA-MM-DD. */
  fechaSello: string | null;
  /** Importes en pesos de los renglones que se guardan (sin los ceros que no vinieron). */
  valores: Record<number, number>;
  exterior: { pais: string; tipoPersona: string; valorRetencion: number }[];
};

const soloDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const vacioANull = (s: string | null | undefined) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
};

/** «127,141,000», «127.141.000», «127141000» o «$ 0» → pesos enteros; null si no hay número. */
export function aPesos(texto: string | null | undefined): number | null {
  const t = (texto ?? "").trim();
  if (t === "") return null;
  // Un decimal con coma o punto al final (,00 / .00) se descarta: la DIAN declara pesos enteros.
  const sinDecimales = t.replace(/[.,]\d{1,2}$/, "");
  const digitos = soloDigitos(sinDecimales);
  if (digitos === "") return null;
  const n = Number(digitos);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Fechas como las imprime la DIAN → AAAA-MM-DD: «2026-03-19 / 03:08:44 PM», «2 0 2 6 -0 3 -1 9»,
 * «20260220» o «19/03/2026». null si no se reconoce una fecha real.
 */
export function normalizarFecha(texto: string | null | undefined): string | null {
  const t = (texto ?? "").replace(/\s+/g, "");
  if (t === "") return null;
  let m = /^(\d{4})[-/.]?(\d{2})[-/.]?(\d{2})/.exec(t);
  let iso = m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  if (!iso) {
    m = /^(\d{2})[-/.](\d{2})[-/.](\d{4})/.exec(t);
    iso = m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  }
  return iso && esFechaIso(iso) ? iso : null;
}

/** NIT y DV: si el DV vino pegado al NIT («9014276595»), se separa (9 + 1). */
export function separarNitDv(nit: string | null | undefined, dv: string | null | undefined): { nit: string | null; dv: string | null } {
  let n = soloDigitos(nit);
  let d = soloDigitos(dv);
  if (d === "" && n.length === 10) {
    d = n.slice(9);
    n = n.slice(0, 9);
  }
  return { nit: n === "" ? null : n, dv: d === "" ? null : d };
}

const entero = (s: string | null | undefined) => {
  const d = soloDigitos(s);
  return d === "" ? null : Number(d);
};

/** Convierte la lectura cruda de la IA. Descarta los renglones que no se guardan (bases, firmas). */
export function normalizarLectura(cruda: LecturaCruda): LecturaFormulario {
  const formulario = cruda.formulario.includes("350") ? "350" : cruda.formulario.includes("490") ? "490" : null;
  const def = formulario === "490" ? F490 : F350;
  const conImporte = new Set(renglonesConImporte(def));
  const valores: Record<number, number> = {};
  for (const r of cruda.renglones) {
    if (!conImporte.has(r.renglon)) continue;
    const v = aPesos(r.valor);
    if (v != null) valores[r.renglon] = v;
  }
  const { nit, dv } = separarNitDv(cruda.nit, cruda.dv);
  const numero = soloDigitos(cruda.numero);
  const anterior = soloDigitos(cruda.numeroAnterior);
  const pagado = soloDigitos(cruda.numeroPagado);
  const concepto = soloDigitos(cruda.concepto);
  return {
    formulario,
    anio: entero(cruda.anio),
    periodo: entero(cruda.periodo),
    numero: numero === "" ? null : numero,
    nit,
    dv,
    razonSocial: vacioANull(cruda.razonSocial),
    codigoCorreccion: formulario === "350" ? entero(cruda.codigoCorreccion) : null,
    numeroAnterior: formulario === "350" && anterior !== "" ? anterior : null,
    concepto: formulario === "490" && concepto !== "" ? concepto : null,
    numeroPagado: formulario === "490" && pagado !== "" ? pagado : null,
    cuota: formulario === "490" ? entero(cruda.cuota) : null,
    deCuotas: formulario === "490" ? entero(cruda.deCuotas) : null,
    fechaLimitePago: formulario === "490" ? normalizarFecha(cruda.fechaLimitePago) : null,
    autoadhesivo: soloDigitos(cruda.autoadhesivo) || null,
    fechaSello: normalizarFecha(cruda.fechaSello),
    valores,
    exterior:
      formulario === "350"
        ? cruda.exterior
            .map((e) => ({ pais: e.pais.trim(), tipoPersona: e.tipoPersona.trim(), valorRetencion: aPesos(e.valorRetencion) ?? 0 }))
            .filter((e) => e.valorRetencion > 0 || e.pais !== "")
        : [],
  };
}

export type ControlLectura = {
  clave: string;
  ok: boolean;
  /** Si falla, el formulario no se puede confirmar hasta corregirlo. */
  bloquea: boolean;
  mensaje: string;
};

export type ContextoLectura = { nitCliente: string; anio: number; mesCorte: number };

const NUMERO_FORMULARIO = /^\d{13}$/;

/** Controles de una lectura (o de lo que el usuario corrigió) contra el cliente y la revisión. */
export function controlesLectura(l: LecturaFormulario, ctx: ContextoLectura): ControlLectura[] {
  const controles: ControlLectura[] = [];
  const agregar = (clave: string, ok: boolean, mensaje: string, bloquea = true) => controles.push({ clave, ok, bloquea, mensaje });

  agregar("formulario", l.formulario != null, l.formulario ? `Formulario ${l.formulario}` : "No se reconoce si es un formulario 350 o 490.");
  const prefijo = l.formulario === "490" ? "49" : "35";
  agregar(
    "numero",
    l.numero != null && NUMERO_FORMULARIO.test(l.numero) && l.numero.startsWith(prefijo),
    l.numero ? `Número de formulario ${l.numero}` : "Falta el número del formulario (renglón 4).",
  );
  const nucleoCliente = nucleoNit(ctx.nitCliente);
  agregar(
    "nit",
    l.nit != null && nucleoNit(l.nit) === nucleoCliente,
    l.nit ? (nucleoNit(l.nit) === nucleoCliente ? `NIT ${l.nit} del cliente` : `El NIT ${l.nit} no es el del cliente (${nucleoCliente}).`) : "Falta el NIT (renglón 5).",
  );
  if (l.nit && l.dv) agregar("dv", dvValido(l.nit, l.dv), dvValido(l.nit, l.dv) ? "Dígito de verificación correcto" : `El DV ${l.dv} no corresponde al NIT ${l.nit}.`, false);
  agregar("anio", l.anio === ctx.anio, l.anio == null ? "Falta el año (renglón 1)." : l.anio === ctx.anio ? `Año ${l.anio}` : `Es del año ${l.anio}, no de ${ctx.anio}.`);
  const periodoValido = l.periodo != null && l.periodo >= 1 && l.periodo <= 12;
  agregar("periodo", periodoValido, periodoValido ? `Período ${l.periodo}` : "Falta el período (renglón 3).");
  if (periodoValido && (l.periodo as number) > ctx.mesCorte) {
    agregar("corte", false, `El período ${l.periodo} es posterior al corte de esta revisión: se guarda para el año, pero aquí no cuenta.`, false);
  }
  agregar(
    "fecha",
    l.fechaSello != null,
    l.fechaSello ? `${l.formulario === "490" ? "Pagado" : "Presentado"} el ${l.fechaSello}` : `Falta la fecha del sello de la entidad recaudadora (renglón 997).`,
  );

  if (l.formulario === "350") {
    if (l.codigoCorreccion === 1) {
      const ok = l.numeroAnterior != null && NUMERO_FORMULARIO.test(l.numeroAnterior);
      agregar("correccion", ok, ok ? `Corrige al formulario ${l.numeroAnterior}` : "Es una corrección (renglón 25 = 1) pero falta el formulario que corrige (renglón 26).");
    }
    for (const c of controlarTotales(F350, mapaValores(l.valores))) {
      agregar(`total_${c.renglon}`, c.cuadra, c.cuadra ? `Renglón ${c.renglon} cuadra` : `El renglón ${c.renglon} dice ${fmtPesos(c.impreso)} y sus renglones suman ${fmtPesos(c.calculado)}.`);
    }
  }
  if (l.formulario === "490") {
    const concepto = l.concepto ?? "";
    agregar("concepto", (CONCEPTOS_PAGO_RETENCION as readonly string[]).includes(concepto), concepto ? `Concepto ${concepto}` : "Falta el concepto de pago (renglón 2).");
    const pagado = l.numeroPagado != null && NUMERO_FORMULARIO.test(l.numeroPagado) && l.numeroPagado.startsWith("35");
    agregar("pagado", pagado, pagado ? `Paga el formulario ${l.numeroPagado}` : "Falta el formulario 350 que se paga (renglón 29).");
    for (const c of controlarTotales(F490, mapaValores(l.valores))) {
      agregar(`total_${c.renglon}`, c.cuadra, c.cuadra ? `Renglón ${c.renglon} cuadra` : `El renglón ${c.renglon} dice ${fmtPesos(c.impreso)} y 34 + 35 + 36 suman ${fmtPesos(c.calculado)}.`);
    }
  }
  return controles;
}

/** ¿Hay que volver a leer con el modelo más capaz? Cuando falla un control que bloquea. */
export function lecturaConErrores(controles: readonly ControlLectura[]): boolean {
  return controles.some((c) => c.bloquea && !c.ok);
}

export function mapaValores(valores: Record<number, number>): Map<number, number> {
  return new Map(Object.entries(valores).map(([r, v]) => [Number(r), v]));
}

function fmtPesos(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}

/** Renglones que el usuario cambió frente a lo que leyó la IA (para dejar constancia). */
export function renglonesCorregidos(leido: Record<number, number>, final: Record<number, number>): number[] {
  const todos = new Set([...Object.keys(leido), ...Object.keys(final)].map(Number));
  return [...todos].filter((r) => (leido[r] ?? 0) !== (final[r] ?? 0)).sort((a, b) => a - b);
}

