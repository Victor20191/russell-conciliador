import type { DefinicionFormulario } from "./formularios/definicion";
import { F300, RENGLONES_PAGO_F300 } from "./formularios/f300";
import { F350, RENGLON_PAGADO_POR_CONCEPTO_490 } from "./formularios/f350";
import type { FormularioCalendario } from "./calendario";
import type { Periodicidad } from "./periodicidad";
import { TABS_REVISION_IMPUESTO, type TabRevisionImpuesto } from "./pestanas-revision";

/**
 * Impuestos · DIAN: un descriptor por impuesto (puro, se puede importar desde el cliente).
 *
 * Retención en la fuente e IVA comparten el motor (`src/lib/impuestos/retencion/`, las acciones y
 * las pantallas): todo lo que cambia entre uno y otro —formulario de declaración, conceptos del 490,
 * renglones que se pagan, periodicidad, calendario, secciones del cruce— sale de aquí. A los
 * componentes del cliente viaja la `clave` (el descriptor tiene funciones) y cada uno lo resuelve con
 * `impuestoPorClave`.
 */

export type ClaveImpuesto = "RET" | "IVA";

export type ConceptoPagoImpuesto = {
  /** Renglón 2 del 490. */
  concepto: string;
  /** Renglón del formulario de declaración que paga. */
  renglonPagado: number;
  /** Solo IVA: la periodicidad del 300 a la que corresponde el concepto. */
  periodicidad?: Periodicidad;
};

/** Una sección del cruce contable: qué secciones del mapeo agrupa y cómo se lee su lado contable. */
export type GrupoCruceImpuesto = {
  grupo: string;
  etiqueta: string;
  /** Secciones del mapeo (`mapeo_renglon_dian.seccion`) que caen en el grupo. */
  secciones: readonly string[];
  /** Por tercero (con DIAN tachada y saldo inicial) o por cuenta (ingresos). */
  porTercero: boolean;
  /** Renglón del total de la sección en el formulario (subtotal del grupo). */
  renglonTotal: number | null;
};

export type ImpuestoDian = {
  clave: ClaveImpuesto;
  /** Segmento de la ruta (`/impuestos/<slug>`), de la llave del PDF y tipo de la copia congelada. */
  slug: "retencion" | "iva";
  nombre: string;
  /** En la bitácora: «CREÓ REVISIÓN DE RETENCIÓN» / «CREÓ REVISIÓN DE IVA». */
  nombreCorto: string;
  /** Clave en `formularios_dian` (la periodicidad de la ficha del cliente). */
  claveFormularioCliente: "RETEFUENTE" | "IVA";
  declaracion: DefinicionFormulario;
  conceptosPago: readonly ConceptoPagoImpuesto[];
  /**
   * Cuándo se espera un 490: por concepto, si el 350 declara el renglón que paga (Retención); o una
   * sola vez, si el total a pagar (88) del 300 es mayor que cero (IVA).
   */
  pagoEsperadoPorTotal: boolean;
  /** Renglones de la declaración que se comparan en Pagos efectuados, y cómo se llaman en sus columnas. */
  renglones: { impuesto: number; sanciones: number; total: number };
  etiquetasPago: { impuesto: string; sanciones: string; total: string };
  /**
   * Las columnas de pago de Oportunidad: Retención mide aparte el 61 y el 62; IVA, el recibo del concepto
   * de la periodicidad. `corta` nombra la columna en el Excel («Recibo 61», «Recibo 490»).
   */
  columnasPago: readonly { id: string; conceptos: readonly string[]; titulo: string; subtitulo?: string; corta: string }[];
  /** Las pestañas de la revisión que ya están disponibles para el impuesto. */
  pestanas: readonly TabRevisionImpuesto[];
  textos: {
    /** El total que se muestra de cada período en «Formularios por período». */
    totalPeriodo: { etiqueta: string; renglon: number };
    subtituloLista: string;
    subtituloRevision: string;
    /** «No hubo formulario»: por qué un período sin declaración no es un error, y un ejemplo de causal. */
    explicacionCausal: string;
    ejemploCausal: string;
  };
  /** Retención declara por persona jurídica y natural; IVA, un solo valor por renglón. */
  columnasPersona: boolean;
  periodicidades: readonly Periodicidad[];
  cortesAtajo: readonly { mes: number; etiqueta: string }[];
  /** El calendario que mide la oportunidad de un año: IVA anual vence en febrero del año siguiente. */
  calendario: (periodicidad: string, anio: number) => { formulario: FormularioCalendario; anio: number } | null;
  cruce: {
    grupos: readonly GrupoCruceImpuesto[];
    /** Prefijos de cuentas Russell que se leen por tercero del balance. */
    prefijosTercero: readonly string[];
    /** Prefijos de las cuentas del cliente que se avisan si quedaron homologadas fuera del impuesto. */
    prefijosCliente: readonly string[];
    /**
     * Cómo se usa el signo «−» del mapeo. Retención: resta en lo declarado (129 y 133, que corrigen su
     * total). IVA: la fila se compara en positivo y resta en el subtotal de su sección (42 y 80).
     */
    signoEnSubtotal: boolean;
    conTotalGeneral: boolean;
    /** El lado contable sigue la naturaleza del plan Russell (C → −saldo, D → +saldo); si no, pasivo en positivo. */
    signoPorNaturaleza: boolean;
  };
};

export const RETENCION: ImpuestoDian = {
  clave: "RET",
  slug: "retencion",
  nombre: "Retención en la fuente",
  nombreCorto: "Retención",
  claveFormularioCliente: "RETEFUENTE",
  declaracion: F350,
  conceptosPago: [
    { concepto: "61", renglonPagado: RENGLON_PAGADO_POR_CONCEPTO_490["61"] },
    { concepto: "62", renglonPagado: RENGLON_PAGADO_POR_CONCEPTO_490["62"] },
    { concepto: "63", renglonPagado: RENGLON_PAGADO_POR_CONCEPTO_490["63"] },
  ],
  pagoEsperadoPorTotal: false,
  renglones: { impuesto: 136, sanciones: 137, total: 138 },
  etiquetasPago: { impuesto: "Retenciones", sanciones: "Sanciones", total: "Total" },
  columnasPago: [
    { id: "61", conceptos: ["61"], titulo: "Pago · Formulario 490 · Concepto 61", subtitulo: "(Retención de renta)", corta: "61" },
    { id: "62", conceptos: ["62"], titulo: "Pago · Formulario 490 · Concepto 62", subtitulo: "(ReteIVA)", corta: "62" },
  ],
  pestanas: TABS_REVISION_IMPUESTO,
  textos: {
    totalPeriodo: { etiqueta: "Total retenciones", renglon: 136 },
    subtituloLista: "Revisión acumulada de los formularios 350 (declaración) y 490 (pago) de cada cliente a un corte: el precierre, generalmente a septiembre, y el cierre a diciembre.",
    subtituloRevision: "Importa los PDF de los formularios 350 y 490 del año hasta el corte, revisa lo que leyó la IA y confírmalo. Un formulario solo cuenta cuando está confirmado.",
    explicacionCausal: "Un mes sin retenciones que declarar no es un error.",
    ejemploCausal: "Ej.: en el mes no hubo pagos sujetos a retención.",
  },
  columnasPersona: true,
  periodicidades: ["Mensual"],
  cortesAtajo: [{ mes: 9, etiqueta: "Precierre · septiembre" }, { mes: 12, etiqueta: "Cierre · diciembre" }],
  calendario: (periodicidad, anio) => (periodicidad === "Mensual" ? { formulario: "RETEFUENTE", anio } : null),
  cruce: {
    grupos: [
      { grupo: "renta", etiqueta: "Retenciones a título de renta (130)", secciones: ["Retenciones a título de renta", "Pagos al exterior", "Autorretenciones"], porTercero: true, renglonTotal: 130 },
      { grupo: "iva", etiqueta: "Retenciones a título de IVA (134)", secciones: ["Retenciones a título de IVA"], porTercero: true, renglonTotal: 134 },
      { grupo: "timbre", etiqueta: "Retención de timbre nacional (135)", secciones: ["Retención de timbre"], porTercero: true, renglonTotal: 135 },
    ],
    prefijosTercero: ["2365", "2367"],
    prefijosCliente: ["2365", "2367"],
    signoEnSubtotal: false,
    conTotalGeneral: true,
    signoPorNaturaleza: false,
  },
};

/** Secciones del mapeo del 300 (las del cruce contable, en su orden). */
export const SECCIONES_MAPEO_F300 = {
  generado: "Impuesto generado",
  descontable: "Impuesto descontable",
  reteiva: "Retención de IVA",
  ingresos: "Ingresos",
  liquidacion: "Liquidación privada",
} as const;

export const IVA: ImpuestoDian = {
  clave: "IVA",
  slug: "iva",
  nombre: "IVA",
  nombreCorto: "IVA",
  claveFormularioCliente: "IVA",
  declaracion: F300,
  conceptosPago: [
    { concepto: "05", renglonPagado: RENGLONES_PAGO_F300.impuesto, periodicidad: "Bimestral" },
    { concepto: "57", renglonPagado: RENGLONES_PAGO_F300.impuesto, periodicidad: "Cuatrimestral" },
    { concepto: "58", renglonPagado: RENGLONES_PAGO_F300.impuesto, periodicidad: "Anual" },
  ],
  pagoEsperadoPorTotal: true,
  renglones: { ...RENGLONES_PAGO_F300 },
  etiquetasPago: { impuesto: "Saldo a pagar por impuesto", sanciones: "Sanciones", total: "Total saldo a pagar" },
  columnasPago: [{ id: "490", conceptos: ["05", "57", "58"], titulo: "Pago · Formulario 490", corta: "490" }],
  pestanas: TABS_REVISION_IMPUESTO,
  textos: {
    totalPeriodo: { etiqueta: "Total saldo a pagar", renglon: 88 },
    subtituloLista: "Revisión acumulada de los formularios 300 (declaración de IVA) y 490 (pago) de cada cliente a un corte: el precorte, generalmente a agosto, y el cierre a diciembre. La periodicidad (bimestral, cuatrimestral o anual) es la de la ficha del cliente.",
    subtituloRevision: "Importa los PDF de los formularios 300 y 490 del año hasta el corte, revisa lo que leyó la IA y confírmalo. Un formulario solo cuenta cuando está confirmado.",
    explicacionCausal: "Un período sin operaciones que declarar no es un error.",
    ejemploCausal: "Ej.: en el bimestre no hubo operaciones gravadas ni ingresos.",
  },
  columnasPersona: false,
  periodicidades: ["Bimestral", "Cuatrimestral", "Anual"],
  cortesAtajo: [{ mes: 8, etiqueta: "Precorte · agosto" }, { mes: 12, etiqueta: "Cierre · diciembre" }],
  calendario: (periodicidad, anio) =>
    periodicidad === "Bimestral"
      ? { formulario: "IVA_BIMESTRAL", anio }
      : periodicidad === "Cuatrimestral"
        ? { formulario: "IVA_CUATRIMESTRAL", anio }
        : periodicidad === "Anual"
          ? { formulario: "IVA_ANUAL", anio: anio + 1 }
          : null,
  cruce: {
    grupos: [
      { grupo: "generado", etiqueta: "Impuesto generado (67)", secciones: [SECCIONES_MAPEO_F300.generado], porTercero: true, renglonTotal: 67 },
      { grupo: "descontable", etiqueta: "Impuesto descontable (81)", secciones: [SECCIONES_MAPEO_F300.descontable], porTercero: true, renglonTotal: 81 },
      { grupo: "reteiva", etiqueta: "Retención de IVA (85)", secciones: [SECCIONES_MAPEO_F300.reteiva], porTercero: true, renglonTotal: 85 },
      { grupo: "ingresos", etiqueta: "Ingresos (43)", secciones: [SECCIONES_MAPEO_F300.ingresos], porTercero: false, renglonTotal: 43 },
    ],
    prefijosTercero: ["2408", "135517"],
    prefijosCliente: ["2408"],
    signoEnSubtotal: true,
    conTotalGeneral: false,
    signoPorNaturaleza: true,
  },
};

export const IMPUESTOS: readonly ImpuestoDian[] = [RETENCION, IVA];

export function impuestoPorClave(clave: string | null | undefined): ImpuestoDian | null {
  return IMPUESTOS.find((i) => i.clave === clave) ?? null;
}

export function impuestoPorSlug(slug: string | null | undefined): ImpuestoDian | null {
  return IMPUESTOS.find((i) => i.slug === slug) ?? null;
}

/** El impuesto cuyo formulario de declaración es este código («350» → Retención, «300» → IVA). */
export function impuestoPorDeclaracion(codigo: string | null | undefined): ImpuestoDian | null {
  return IMPUESTOS.find((i) => i.declaracion.codigo === codigo) ?? null;
}

/** El concepto del 490 que corresponde a la periodicidad (solo IVA; Retención admite los tres). */
export function conceptosPagoDe(impuesto: ImpuestoDian, periodicidad?: string | null): readonly ConceptoPagoImpuesto[] {
  const propios = impuesto.conceptosPago.filter((c) => c.periodicidad && c.periodicidad === periodicidad);
  return propios.length > 0 ? propios : impuesto.conceptosPago;
}
