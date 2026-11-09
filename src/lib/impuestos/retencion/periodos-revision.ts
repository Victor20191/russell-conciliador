import { etiquetaPeriodo, periodosEsperados } from "../periodicidad";
import { calcularTotal } from "../formularios/definicion";
import { conceptosPagoDe, impuestoPorClave, RETENCION, type ClaveImpuesto } from "../impuestos-dian";

/**
 * Estado de cada período de una revisión de Impuestos · DIAN (puro): qué declaración rige (el 350 en
 * Retención en la fuente, el 300 en IVA), si es corrección, qué pagos (490) se esperan y cuáles
 * faltan, o la causal de un período sin formulario. Los tipos y avisos conservan el nombre «350» de
 * Retención (viven en las copias congeladas), pero valen para las dos declaraciones.
 *
 * Correcciones: una declaración con renglón 25 = 1 corrige a la del renglón 26 (puede haber cadena).
 * Los VALORES salen del último de la cadena (la corrección vigente) y la OPORTUNIDAD del primero (el
 * original). Si llega la corrección sin su original, se avisa.
 *
 * Pagos esperados: en Retención, un 490 por cada concepto (61, 62, 63) cuyo renglón declara valor
 * (130, 134, 135); en IVA, un 490 del concepto de la periodicidad (05, 57 o 58) si el total a pagar
 * (88, recalculado) es mayor que cero.
 */

export type Formulario350 = {
  id: number;
  numero: string;
  codigoCorreccion: number | null;
  numeroAnterior: string | null;
  fechaPresentacion: string | null;
  /** Renglón 996 (número del autoadhesivo). */
  autoadhesivo?: string | null;
  valores: Record<number, number>;
};

export type Formulario490 = {
  id: number;
  numero: string;
  concepto: string | null;
  numeroPagado: string | null;
  fechaPago: string | null;
  /** Renglón 996 (número del autoadhesivo). */
  autoadhesivo?: string | null;
  valores: Record<number, number>;
};

export type CadenaPeriodo = {
  /** El que rige (la última corrección o el único). */
  vigente: Formulario350 | null;
  /** El primero de la cadena; null si la corrección llegó sin su original. */
  original: Formulario350 | null;
  /** Del original a la vigente. */
  cadena: Formulario350[];
  /** Número del formulario corregido que no está cargado. */
  faltaOriginal: string | null;
  /** 350 confirmados del período que no hacen parte de la cadena vigente. */
  fueraDeCadena: Formulario350[];
};

const esCorreccion = (f: Formulario350) => f.codigoCorreccion === 1 && f.numeroAnterior != null;

/** Arma la cadena de correcciones de los 350 confirmados de un período. */
export function cadenaCorrecciones(formularios: readonly Formulario350[]): CadenaPeriodo {
  if (formularios.length === 0) return { vigente: null, original: null, cadena: [], faltaOriginal: null, fueraDeCadena: [] };
  const porNumero = new Map(formularios.map((f) => [f.numero, f]));
  const corregidos = new Set(formularios.filter(esCorreccion).map((f) => f.numeroAnterior as string));
  // La vigente es un formulario que nadie corrige; si hay varios, el presentado más tarde.
  const finales = formularios.filter((f) => !corregidos.has(f.numero));
  const candidatos = finales.length > 0 ? finales : [...formularios];
  const vigente = [...candidatos].sort((a, b) => (b.fechaPresentacion ?? "").localeCompare(a.fechaPresentacion ?? "") || b.numero.localeCompare(a.numero))[0];

  const cadena: Formulario350[] = [vigente];
  const vistos = new Set([vigente.numero]);
  let actual = vigente;
  let faltaOriginal: string | null = null;
  while (esCorreccion(actual)) {
    const anterior = porNumero.get(actual.numeroAnterior as string);
    if (!anterior) { faltaOriginal = actual.numeroAnterior; break; }
    if (vistos.has(anterior.numero)) break; // ciclo: no debería pasar con datos de la DIAN
    cadena.unshift(anterior);
    vistos.add(anterior.numero);
    actual = anterior;
  }
  return {
    vigente,
    original: faltaOriginal ? null : cadena[0],
    cadena,
    faltaOriginal,
    fueraDeCadena: formularios.filter((f) => !vistos.has(f.numero)),
  };
}

export type PagoConcepto = {
  /** Renglón 2 del 490: 61, 62 o 63 en Retención; el de la periodicidad (05, 57 o 58) en IVA. */
  concepto: string;
  /** Renglón de la declaración que paga (130, 134 o 135 del 350; 86 del 300) y su valor en la vigente. */
  renglon: number;
  declarado: number;
  esperado: boolean;
  formularios: Formulario490[];
  /** Σ renglón 36 (impuesto), 34 (sanción) y 35 (intereses) de los 490 del concepto. */
  impuesto: number;
  sancion: number;
  intereses: number;
  /** 490 del concepto cargados y sin confirmar: no suman hasta confirmarlos. */
  porConfirmar: number;
};

export type EstadoPeriodo =
  | "completo"
  | "por_confirmar"
  | "falta_350"
  | "sin_formulario"
  | "falta_original"
  | "faltan_pagos";

/** Recibo cuyo renglón 29 cita un 350 que no es de la cadena del período. */
export type ReciboDeOtro350 = { numero: string; numeroPagado: string };

export const avisoReciboDeOtro350 = (r: ReciboDeOtro350, codigo = "350") => `El recibo ${r.numero} paga el formulario ${r.numeroPagado}, que no es un ${codigo} de este período.`;

export const avisoFueraDeCadena = (numero: string) => `El formulario ${numero} no hace parte de la cadena de correcciones del período.`;

export const avisoFaltaOriginal = (numero: string) =>
  `Falta el formulario original ${numero}: sin él no se mide la oportunidad de presentación ni se puede cerrar en firme.`;

/** 490 confirmados de un mes sin 350 (falta, o se registró que no hubo): exigen marca en Pagos efectuados. */
export const recibosSin350 = (p: Pick<PeriodoRevision, "cadena" | "pagos">): Formulario490[] => (p.cadena.vigente ? [] : p.pagos.flatMap((x) => x.formularios));

export const avisoRecibosSin350 = (numeros: readonly string[], codigo = "350") =>
  `${codigo === "350" ? "El mes" : "El período"} no tiene ${codigo} y tiene ${numeros.length === 1 ? `el recibo 490 ${numeros[0]}` : `los recibos 490 ${numeros.join(", ")}`}.`;

export type PeriodoRevision = {
  periodo: number;
  mesFin: number;
  estado: EstadoPeriodo;
  cadena: CadenaPeriodo;
  causal: string | null;
  porConfirmar: number;
  /** De los anteriores, los que no son 490 (incluye el que no se reconoció como 350 ni 490). */
  porConfirmar350: number;
  /** 490 por confirmar sin un concepto del impuesto: no se sabe qué renglón pagan. */
  recibosSinConcepto: number;
  pagos: PagoConcepto[];
  /** Conceptos que la declaración vigente obliga a pagar y no tienen 490, ni confirmado ni por confirmar. */
  pagosFaltantes: string[];
  /** Siguen contando como pago del período por su renglón 3, pero exigen marca en Pagos efectuados. Las copias antiguas no lo traen. */
  recibosDeOtro350?: ReciboDeOtro350[];
  avisos: string[];
};

export type EntradaPeriodos = {
  /** Sin impuesto es Retención en la fuente. */
  impuesto?: ClaveImpuesto;
  periodicidad: string;
  mesCorte: number;
  /** Las declaraciones confirmadas del impuesto (350 o 300). */
  formularios350: (Formulario350 & { periodo: number })[];
  formularios490: (Formulario490 & { periodo: number })[];
  porConfirmar: { periodo: number | null; formulario: string | null; concepto: string | null }[];
  causales: { periodo: number; causal: string }[];
};

/** Estado de todos los períodos esperados hasta el corte. */
export function periodosRevision(e: EntradaPeriodos): PeriodoRevision[] {
  const impuesto = impuestoPorClave(e.impuesto) ?? RETENCION;
  const conceptos = conceptosPagoDe(impuesto, e.periodicidad);
  const codigosConcepto = new Set(conceptos.map((c) => c.concepto));
  return periodosEsperados(e.periodicidad, e.mesCorte).map(({ periodo, mesFin }) => {
    const cadena = cadenaCorrecciones(e.formularios350.filter((f) => f.periodo === periodo));
    const causal = e.causales.find((c) => c.periodo === periodo)?.causal ?? null;
    const pendientes = e.porConfirmar.filter((f) => f.periodo === periodo);
    const porConfirmar = pendientes.length;
    const recibosPendientes = pendientes.filter((f) => f.formulario === "490");
    const porConfirmar350 = porConfirmar - recibosPendientes.length;
    const recibosSinConcepto = recibosPendientes.filter((f) => !f.concepto || !codigosConcepto.has(f.concepto)).length;
    // Un 490 puede pagar cualquier 350 de la cadena, también el original que la corrección cita
    // aunque no esté cargado (el pago se hizo antes de corregir).
    const numerosCadena = new Set([...cadena.cadena.map((f) => f.numero), ...cadena.cadena.map((f) => f.numeroAnterior).filter((n): n is string => n != null)]);
    const del490 = e.formularios490.filter((f) => f.periodo === periodo);
    const avisos: string[] = [];

    // IVA espera un 490 si el total a pagar (88, recalculado) es mayor que cero; Retención, uno por
    // cada concepto cuyo renglón declara valor.
    const valoresVigente = cadena.vigente ? new Map(Object.entries(cadena.vigente.valores).map(([r, v]) => [Number(r), v])) : null;
    const totalAPagar = valoresVigente ? calcularTotal(impuesto.declaracion, impuesto.renglones.total, valoresVigente) : 0;
    const pagos: PagoConcepto[] = conceptos.map(({ concepto, renglonPagado: renglon }) => {
      const declarado = cadena.vigente?.valores[renglon] ?? 0;
      const formularios = del490.filter((f) => f.concepto === concepto);
      const suma = (r: number) => formularios.reduce((s, f) => s + (f.valores[r] ?? 0), 0);
      const esperado = impuesto.pagoEsperadoPorTotal ? totalAPagar > 0 : declarado > 0;
      return { concepto, renglon, declarado, esperado, formularios, impuesto: suma(36), sancion: suma(34), intereses: suma(35), porConfirmar: recibosPendientes.filter((f) => f.concepto === concepto).length };
    });
    const recibosDeOtro350: ReciboDeOtro350[] = del490.flatMap((f) =>
      f.numeroPagado && numerosCadena.size > 0 && !numerosCadena.has(f.numeroPagado) ? [{ numero: f.numero, numeroPagado: f.numeroPagado }] : [],
    );
    for (const f of cadena.fueraDeCadena) avisos.push(avisoFueraDeCadena(f.numero));
    // La corrección sin su original no va como aviso: el cierre la cuenta como pendiente.
    const pagosFaltantes = pagos.filter((p) => p.esperado && p.formularios.length === 0 && p.porConfirmar === 0).map((p) => p.concepto);

    const estado: EstadoPeriodo = cadena.vigente
      ? cadena.faltaOriginal
        ? "falta_original"
        : pagosFaltantes.length > 0
          ? "faltan_pagos"
          : porConfirmar > 0
            ? "por_confirmar"
            : "completo"
      : causal
        ? "sin_formulario"
        : porConfirmar350 > 0
          ? "por_confirmar"
          : "falta_350";
    return { periodo, mesFin, estado, cadena, causal: cadena.vigente ? null : causal, porConfirmar, porConfirmar350, recibosSinConcepto, pagos, pagosFaltantes, recibosDeOtro350, avisos };
  });
}

/** Nombre de un período en pantalla: el mes con periodicidad mensual; «Bimestre 01 · Enero-Febrero», «Cuatrimestre 02 · Mayo-Agosto» o «Año». */
export function etiquetaPeriodoRevision(periodicidad: string, periodo: number): string {
  return etiquetaPeriodo(periodicidad, periodo);
}

export const ETIQUETA_ESTADO_PERIODO: Readonly<Record<EstadoPeriodo, string>> = {
  completo: "Completo",
  por_confirmar: "Por confirmar",
  falta_350: "Falta el 350",
  sin_formulario: "Sin formulario",
  falta_original: "Falta el original",
  faltan_pagos: "Faltan pagos",
};

/** La etiqueta del estado con el formulario de la declaración del impuesto («Falta el 300» en IVA). */
export function etiquetaEstadoPeriodo(estado: EstadoPeriodo, codigoDeclaracion = "350"): string {
  return estado === "falta_350" ? `Falta el ${codigoDeclaracion}` : ETIQUETA_ESTADO_PERIODO[estado];
}
