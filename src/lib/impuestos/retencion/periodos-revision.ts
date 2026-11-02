import { periodosEsperados } from "../periodicidad";
import { NOMBRES_MES } from "../calendario";
import { RENGLON_PAGADO_POR_CONCEPTO_490 } from "../formularios/f350";
import { CONCEPTOS_PAGO_RETENCION, type ConceptoPagoRetencion } from "../formularios/f490";

/**
 * Estado de cada período de una revisión de Retención en la fuente (puro): qué 350 rige, si es
 * corrección, qué pagos (490) se esperan y cuáles faltan, o la causal de un mes sin formulario.
 *
 * Correcciones: un 350 con renglón 25 = 1 corrige al del renglón 26 (puede haber cadena). Los
 * VALORES salen del último de la cadena (la corrección vigente) y la OPORTUNIDAD del primero (el
 * original). Si llega la corrección sin su original, se avisa.
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
  concepto: ConceptoPagoRetencion;
  /** Renglón del 350 que paga (130, 134 o 135) y su valor en el 350 vigente. */
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

export type PeriodoRevision = {
  periodo: number;
  mesFin: number;
  estado: EstadoPeriodo;
  cadena: CadenaPeriodo;
  causal: string | null;
  porConfirmar: number;
  /** De los anteriores, los que no son 490 (incluye el que no se reconoció como 350 ni 490). */
  porConfirmar350: number;
  /** 490 por confirmar sin un concepto 61, 62 o 63: no se sabe qué renglón pagan. */
  recibosSinConcepto: number;
  pagos: PagoConcepto[];
  /** Conceptos que el 350 vigente obliga a pagar y no tienen 490, ni confirmado ni por confirmar. */
  pagosFaltantes: ConceptoPagoRetencion[];
  avisos: string[];
};

export type EntradaPeriodos = {
  periodicidad: string;
  mesCorte: number;
  formularios350: (Formulario350 & { periodo: number })[];
  formularios490: (Formulario490 & { periodo: number })[];
  porConfirmar: { periodo: number | null; formulario: string | null; concepto: string | null }[];
  causales: { periodo: number; causal: string }[];
};

/** Estado de todos los períodos esperados hasta el corte. */
export function periodosRevision(e: EntradaPeriodos): PeriodoRevision[] {
  return periodosEsperados(e.periodicidad, e.mesCorte).map(({ periodo, mesFin }) => {
    const cadena = cadenaCorrecciones(e.formularios350.filter((f) => f.periodo === periodo));
    const causal = e.causales.find((c) => c.periodo === periodo)?.causal ?? null;
    const pendientes = e.porConfirmar.filter((f) => f.periodo === periodo);
    const porConfirmar = pendientes.length;
    const recibosPendientes = pendientes.filter((f) => f.formulario === "490");
    const porConfirmar350 = porConfirmar - recibosPendientes.length;
    const recibosSinConcepto = recibosPendientes.filter((f) => !(CONCEPTOS_PAGO_RETENCION as readonly (string | null)[]).includes(f.concepto)).length;
    // Un 490 puede pagar cualquier 350 de la cadena, también el original que la corrección cita
    // aunque no esté cargado (el pago se hizo antes de corregir).
    const numerosCadena = new Set([...cadena.cadena.map((f) => f.numero), ...cadena.cadena.map((f) => f.numeroAnterior).filter((n): n is string => n != null)]);
    const del490 = e.formularios490.filter((f) => f.periodo === periodo);
    const avisos: string[] = [];

    const pagos: PagoConcepto[] = CONCEPTOS_PAGO_RETENCION.map((concepto) => {
      const renglon = RENGLON_PAGADO_POR_CONCEPTO_490[concepto];
      const declarado = cadena.vigente?.valores[renglon] ?? 0;
      const formularios = del490.filter((f) => f.concepto === concepto);
      const suma = (r: number) => formularios.reduce((s, f) => s + (f.valores[r] ?? 0), 0);
      return { concepto, renglon, declarado, esperado: declarado > 0, formularios, impuesto: suma(36), sancion: suma(34), intereses: suma(35), porConfirmar: recibosPendientes.filter((f) => f.concepto === concepto).length };
    });
    for (const f of del490) {
      if (f.numeroPagado && numerosCadena.size > 0 && !numerosCadena.has(f.numeroPagado)) {
        avisos.push(`El recibo ${f.numero} paga el formulario ${f.numeroPagado}, que no es un 350 de este período.`);
      }
    }
    for (const f of cadena.fueraDeCadena) {
      avisos.push(`El formulario ${f.numero} no hace parte de la cadena de correcciones del período.`);
    }
    if (cadena.faltaOriginal) avisos.push(`Falta el formulario original ${cadena.faltaOriginal}: sin él no se mide la oportunidad de presentación.`);
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
    return { periodo, mesFin, estado, cadena, causal: cadena.vigente ? null : causal, porConfirmar, porConfirmar350, recibosSinConcepto, pagos, pagosFaltantes, avisos };
  });
}

/** Nombre de un período en pantalla: el mes con periodicidad mensual; si no, «Período n». */
export function etiquetaPeriodoRevision(periodicidad: string, periodo: number): string {
  return periodicidad === "Mensual" ? (NOMBRES_MES[periodo - 1] ?? `Período ${periodo}`) : `Período ${periodo}`;
}

export const ETIQUETA_ESTADO_PERIODO: Readonly<Record<EstadoPeriodo, string>> = {
  completo: "Completo",
  por_confirmar: "Por confirmar",
  falta_350: "Falta el 350",
  sin_formulario: "Sin formulario",
  falta_original: "Falta el original",
  faltan_pagos: "Faltan pagos",
};
