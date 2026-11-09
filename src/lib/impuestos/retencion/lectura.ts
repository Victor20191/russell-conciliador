import { dvValido, nucleoNit } from "@/lib/nit";
import { esFechaIso } from "../calendario";
import { controlarTotales, controlarValidaciones, renglonesConImporte } from "../formularios/definicion";
import { F300 } from "../formularios/f300";
import { F350 } from "../formularios/f350";
import { F490 } from "../formularios/f490";
import { conceptosPagoDe, impuestoPorClave, IMPUESTOS, RETENCION, type ClaveImpuesto, type ImpuestoDian } from "../impuestos-dian";
import { mesesPorPeriodo, type Periodicidad } from "../periodicidad";

/**
 * Lectura de un formulario DIAN (350, 300 o 490) que devolvió la IA: normalización y controles (puro).
 *
 * La IA devuelve todo como TEXTO (los valores, sin convertir) y aquí se convierte: los PDF de la
 * DIAN traen el NIT pegado al DV («9014276595»), fechas espaciadas («2 0 2 6 -0 3 -1 9») o con hora
 * («2026-03-19 / 03:08:44 PM»), y valores con comas. Los controles deciden si la lectura se puede
 * confirmar: un control que «bloquea» tiene que pasar (el usuario corrige el valor a mano). Los
 * controles dependen del impuesto de la revisión: Retención en la fuente espera el 350 y los 490 de
 * los conceptos 61, 62 y 63; IVA, el 300 y el 490 del concepto de su periodicidad (05, 57 o 58).
 */

export type LecturaCruda = {
  formulario: string;
  anio: string;
  periodo: string;
  numero: string;
  nit: string;
  dv: string;
  razonSocial: string;
  /** Solo el 300: la periodicidad marcada en la casilla 24. Las lecturas guardadas antes no la traen. */
  periodicidad?: string;
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

export type CodigoFormulario = "350" | "300" | "490";

export type LecturaFormulario = {
  formulario: CodigoFormulario | null;
  anio: number | null;
  periodo: number | null;
  numero: string | null;
  nit: string | null;
  dv: string | null;
  razonSocial: string | null;
  /** Renglón 24 del 300 (Bimestral, Cuatrimestral o Anual); null en el 350 y el 490. */
  periodicidad: Periodicidad | null;
  /** Renglón 25 del 350 o del 300: 1 = corrección. */
  codigoCorreccion: number | null;
  /** Renglón 26 del 350 o del 300: el formulario que corrige. */
  numeroAnterior: string | null;
  /** Renglón 2 del 490: 61, 62 o 63 (Retención); 05, 57 o 58 (IVA). */
  concepto: string | null;
  /** Renglón 29 del 490: la declaración que se paga. */
  numeroPagado: string | null;
  cuota: number | null;
  deCuotas: number | null;
  fechaLimitePago: string | null;
  /** Renglón 996. */
  autoadhesivo: string | null;
  /** Renglón 997: fecha de presentación (350 o 300) o de pago (490), AAAA-MM-DD. */
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

/** La periodicidad marcada en la casilla 24 del 300 («Bimestral», «X bimestral»…); null si no se reconoce. */
export function normalizarPeriodicidad(texto: string | null | undefined): Periodicidad | null {
  const t = (texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (t.includes("cuatri")) return "Cuatrimestral";
  if (t.includes("bimes")) return "Bimestral";
  if (t.includes("anual")) return "Anual";
  return null;
}

const entero = (s: string | null | undefined) => {
  const d = soloDigitos(s);
  return d === "" ? null : Number(d);
};

/** El formulario que dice la lectura: 350, 300 o 490 (se mira primero el 350, que no contiene «300»). */
function codigoDe(texto: string): CodigoFormulario | null {
  if (texto.includes("350")) return "350";
  if (texto.includes("300")) return "300";
  if (texto.includes("490")) return "490";
  return null;
}

const DEFINICIONES = { "350": F350, "300": F300, "490": F490 } as const;

/** Convierte la lectura cruda de la IA. Descarta los renglones que no se guardan (bases, compras, firmas). */
export function normalizarLectura(cruda: LecturaCruda): LecturaFormulario {
  const formulario = codigoDe(cruda.formulario);
  const def = DEFINICIONES[formulario ?? "350"];
  const declaracion = formulario === "350" || formulario === "300";
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
  const conceptoLeido = soloDigitos(cruda.concepto);
  // Los conceptos del 490 tienen dos dígitos: el de IVA bimestral es «05», aunque la IA lea «5».
  const concepto = conceptoLeido.length === 1 ? conceptoLeido.padStart(2, "0") : conceptoLeido;
  return {
    formulario,
    anio: entero(cruda.anio),
    periodo: entero(cruda.periodo),
    numero: numero === "" ? null : numero,
    nit,
    dv,
    razonSocial: vacioANull(cruda.razonSocial),
    periodicidad: formulario === "300" ? normalizarPeriodicidad(cruda.periodicidad) : null,
    codigoCorreccion: declaracion ? entero(cruda.codigoCorreccion) : null,
    numeroAnterior: declaracion && anterior !== "" ? anterior : null,
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

/**
 * Contra qué se controla una lectura. Sin `impuesto` es Retención en la fuente; la periodicidad es la
 * de la revisión (en IVA, la de la ficha del cliente).
 */
export type ContextoLectura = { nitCliente: string; anio: number; mesCorte: number; impuesto?: ClaveImpuesto; periodicidad?: string };

const NUMERO_FORMULARIO = /^\d{13}$/;

/** Prefijo del número de un formulario: los dos primeros dígitos de su código (35, 30, 49). */
const prefijoNumero = (codigo: string) => codigo.slice(0, 2);

/** El impuesto al que pertenece un concepto del 490, o null si no es de ninguno. */
function impuestoDelConcepto(concepto: string | null): ImpuestoDian | null {
  return IMPUESTOS.find((i) => i.conceptosPago.some((c) => c.concepto === concepto)) ?? null;
}

/** Controles de una lectura (o de lo que el usuario corrigió) contra el cliente y la revisión. */
export function controlesLectura(l: LecturaFormulario, ctx: ContextoLectura): ControlLectura[] {
  const impuesto = impuestoPorClave(ctx.impuesto) ?? RETENCION;
  const codigo = impuesto.declaracion.codigo;
  const periodicidad = ctx.periodicidad ?? impuesto.periodicidades[0];
  const meses = mesesPorPeriodo(periodicidad);
  const controles: ControlLectura[] = [];
  const agregar = (clave: string, ok: boolean, mensaje: string, bloquea = true) => controles.push({ clave, ok, bloquea, mensaje });

  const otraDeclaracion = l.formulario != null && l.formulario !== "490" && l.formulario !== codigo ? IMPUESTOS.find((i) => i.declaracion.codigo === l.formulario) : null;
  agregar(
    "formulario",
    l.formulario != null && !otraDeclaracion,
    otraDeclaracion
      ? `Es un formulario ${l.formulario}: cárgalo en ${otraDeclaracion.nombre}.`
      : l.formulario
        ? `Formulario ${l.formulario}`
        : `No se reconoce si es un formulario ${codigo} o 490.`,
  );
  const prefijo = prefijoNumero(l.formulario === "490" ? "490" : codigo);
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
  const periodos = Math.floor(12 / meses);
  const periodoValido = l.periodo != null && l.periodo >= 1 && l.periodo <= periodos;
  agregar(
    "periodo",
    periodoValido,
    periodoValido
      ? `Período ${l.periodo}`
      : l.periodo == null
        ? "Falta el período (renglón 3)."
        : `El período ${l.periodo} no existe con periodicidad ${periodicidad.toLowerCase()} (1 a ${periodos}).`,
  );
  if (periodoValido && (l.periodo as number) * meses > ctx.mesCorte) {
    agregar("corte", false, `El período ${l.periodo} es posterior al corte de esta revisión: se guarda para el año, pero aquí no cuenta.`, false);
  }
  agregar(
    "fecha",
    l.fechaSello != null,
    l.fechaSello ? `${l.formulario === "490" ? "Pagado" : "Presentado"} el ${l.fechaSello}` : `Falta la fecha del sello de la entidad recaudadora (renglón 997).`,
  );

  if (l.formulario === codigo) {
    if (l.formulario === "300") {
      if (l.periodicidad == null) {
        agregar("periodicidad", false, "No se leyó la periodicidad marcada (casilla 24): revisa el PDF.", false);
      } else {
        agregar(
          "periodicidad",
          l.periodicidad === periodicidad,
          l.periodicidad === periodicidad
            ? `Periodicidad ${l.periodicidad.toLowerCase()}`
            : `El formulario es ${l.periodicidad.toLowerCase()} y el cliente declara ${periodicidad.toLowerCase()}: corrige la periodicidad en la ficha del cliente o revisa el PDF.`,
        );
      }
    }
    if (l.codigoCorreccion === 1) {
      const ok = l.numeroAnterior != null && NUMERO_FORMULARIO.test(l.numeroAnterior);
      agregar("correccion", ok, ok ? `Corrige al formulario ${l.numeroAnterior}` : "Es una corrección (renglón 25 = 1) pero falta el formulario que corrige (renglón 26).");
    }
    const valores = mapaValores(l.valores);
    for (const c of controlarTotales(impuesto.declaracion, valores)) {
      agregar(`total_${c.renglon}`, c.cuadra, c.cuadra ? `Renglón ${c.renglon} cuadra` : `El renglón ${c.renglon} dice ${fmtPesos(c.impreso)} y sus renglones suman ${fmtPesos(c.calculado)}.`);
    }
    for (const v of controlarValidaciones(impuesto.declaracion, valores)) {
      agregar(v.clave, v.cuadra, v.cuadra ? `${v.etiqueta}: cuadra` : `${v.etiqueta}: suman ${fmtPesos(v.calculado)} y el ${v.renglonContra} dice ${fmtPesos(v.contra)}.`, false);
    }
  }
  if (l.formulario === "490") {
    const concepto = l.concepto ?? "";
    const propios = conceptosPagoDe(impuesto, periodicidad).map((c) => c.concepto);
    const deOtro = impuestoDelConcepto(l.concepto);
    if (deOtro && deOtro.clave !== impuesto.clave) {
      agregar("otro_impuesto", false, `El recibo es del concepto ${concepto} (${deOtro.nombre}): cárgalo en ${deOtro.nombre}.`);
    } else {
      agregar(
        "concepto",
        propios.includes(concepto),
        !concepto
          ? "Falta el concepto de pago (renglón 2)."
          : propios.includes(concepto)
            ? `Concepto ${concepto}`
            : `El concepto ${concepto} no corresponde a la periodicidad ${periodicidad.toLowerCase()} (se espera ${propios.join(" o ")}).`,
      );
    }
    const pagado = l.numeroPagado != null && NUMERO_FORMULARIO.test(l.numeroPagado) && l.numeroPagado.startsWith(prefijoNumero(codigo));
    agregar("pagado", pagado, pagado ? `Paga el formulario ${l.numeroPagado}` : `Falta el formulario ${codigo} que se paga (renglón 29).`);
    for (const c of controlarTotales(F490, mapaValores(l.valores))) {
      agregar(`total_${c.renglon}`, c.cuadra, c.cuadra ? `Renglón ${c.renglon} cuadra` : `El renglón ${c.renglon} dice ${fmtPesos(c.impreso)} y 34 + 35 + 36 suman ${fmtPesos(c.calculado)}.`);
    }
  }
  return controles;
}

/**
 * Controles que hacen rechazar un PDF al importarlo, sin guardarlo: no se sabe qué formulario es, de
 * quién, de qué año o período, o es de otro impuesto.
 */
export const CONTROLES_QUE_RECHAZAN = ["formulario", "otro_impuesto", "numero", "nit", "anio", "periodo"] as const;

/** ¿Hay que volver a leer con el modelo más capaz? Cuando falla un control que bloquea. */
export function lecturaConErrores(controles: readonly ControlLectura[]): boolean {
  return controles.some((c) => c.bloquea && !c.ok);
}

const MAX_MOTIVOS_RESUMEN = 3;

/** Resultado de confirmar varios formularios: es éxito solo si quedaron confirmados todos los pedidos. */
export function resumenConfirmacion({ pedidos, confirmados, fallos }: { pedidos: number; confirmados: number; fallos: readonly string[] }): { ok: boolean; message: string } {
  if (pedidos > 0 && confirmados === pedidos) return { ok: true, message: confirmados === 1 ? "1 formulario confirmado." : `${confirmados} formularios confirmados.` };
  const yaNo = pedidos - confirmados - fallos.length;
  const motivos = [
    ...fallos.slice(0, MAX_MOTIVOS_RESUMEN),
    ...(fallos.length > MAX_MOTIVOS_RESUMEN ? [`y ${fallos.length - MAX_MOTIVOS_RESUMEN} más`] : []),
    ...(yaNo > 0 ? [`${yaNo} ya no ${yaNo === 1 ? "estaba" : "estaban"} por confirmar`] : []),
  ].join(" · ");
  return { ok: false, message: `${confirmados === 0 ? "No se confirmó ninguno" : `Se confirmaron ${confirmados} de ${pedidos}`}. ${motivos}` };
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
