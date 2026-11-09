import { fechaVencimiento, type VencimientoDian } from "../calendario";
import { impuestoPorClave, RETENCION, type ClaveImpuesto, type ImpuestoDian } from "../impuestos-dian";
import type { MarcaCruceRetencion } from "./cruce";
import type { Formulario490, PeriodoRevision } from "./periodos-revision";

/**
 * Indicador de oportunidad de Retención en la fuente (puro): por período, la fecha límite del
 * calendario DIAN (año, período y último dígito del NIT sin el DV) contra la fecha de presentación
 * del 350 ORIGINAL (renglón 997 del primero de la cadena, no de la corrección) y las de pago, una
 * por concepto: 61 (renta, renglón 130) y 62 (reteIVA, renglón 134), cada una con el 997 del último
 * 490 de ese concepto. Si el 350 no declara el valor, «Sin valor a pagar»; si lo declara y no hay
 * recibo, «Sin pago». Se comparan fechas del calendario de Colombia, sin hora: igual o antes del
 * vencimiento es «Oportuno». Un mes sin formulario, sin calendario o sin original lo dice así;
 * nunca sale «Oportuno» por falta de fecha. Un período con la corrección sin su original admite
 * una marca opcional; lo que permite cerrar es cargar el original (lo exige el cierre).
 *
 * IVA usa la misma regla con su descriptor: el calendario de su periodicidad (el anual, el del año
 * siguiente), la presentación del 300 original y una sola columna de pago, la del último 490 del
 * concepto de la periodicidad (05, 57 o 58). Las columnas de pago van en `pagos`; Retención
 * conserva además `pago61` y `pago62`.
 */

export type EstadoOportunidad =
  | "oportuno"
  | "extemporaneo"
  | "sin_formulario"
  | "falta_350"
  | "falta_original"
  | "sin_fecha"
  | "sin_calendario"
  | "sin_pago"
  | "nada_que_pagar";

export const ETIQUETA_OPORTUNIDAD: Readonly<Record<EstadoOportunidad, string>> = {
  oportuno: "Oportuno",
  extemporaneo: "Extemporáneo",
  sin_formulario: "Sin formulario",
  falta_350: "Falta el 350",
  falta_original: "Falta el original",
  sin_fecha: "Sin fecha",
  sin_calendario: "Sin calendario",
  sin_pago: "Sin pago",
  nada_que_pagar: "Sin valor a pagar",
};

/** La etiqueta del estado con el formulario de la declaración del impuesto («Falta el 300» en IVA). */
export const etiquetaOportunidad = (estado: EstadoOportunidad, codigo = "350") => (estado === "falta_350" ? `Falta el ${codigo}` : ETIQUETA_OPORTUNIDAD[estado]);

/** Conceptos del 490 cuyo pago se mide: 61 (renta y autorretenciones) y 62 (reteIVA). */
export const CONCEPTOS_OPORTUNIDAD_PAGO = ["61", "62"] as const;
export type ConceptoOportunidadPago = (typeof CONCEPTOS_OPORTUNIDAD_PAGO)[number];

/** El pago de un concepto: el 490 cuya fecha se mide, su autoadhesivo (996) y su estado. */
export type PagoOportunidad = {
  numero: string | null;
  autoadhesivo: string | null;
  fecha: string | null;
  estado: EstadoOportunidad;
  /** Días después del vencimiento (solo si es extemporáneo). */
  dias: number | null;
};

export type FilaOportunidad = {
  periodo: number;
  /** Llave de la marca del período (`oportunidad:2026-01`). */
  clave: string;
  /** El 350 cuya presentación se mide (el original) y su autoadhesivo (996). */
  numero350: string | null;
  autoadhesivo350: string | null;
  vencimiento: string | null;
  presentacion: string | null;
  estadoPresentacion: EstadoOportunidad;
  /** Días después del vencimiento (solo si es extemporáneo). */
  diasPresentacion: number | null;
  /** Retención: el pago del concepto 61 y el del 62 (las copias antiguas solo traen estos). */
  pago61?: PagoOportunidad;
  pago62?: PagoOportunidad;
  /** Las columnas de pago del impuesto, en orden (`ImpuestoDian.columnasPago`). Las copias antiguas no lo traen. */
  pagos?: { id: string; pago: PagoOportunidad }[];
  /** La corrección llegó sin su original: no se puede medir la presentación y admite una marca opcional (para cerrar hay que cargar el original). */
  admiteMarca: boolean;
  marca: (MarcaCruceRetencion & { vigente: boolean }) | null;
};

export type EntradaOportunidad = {
  /** Sin impuesto es Retención en la fuente. */
  impuesto?: ClaveImpuesto;
  anio: number;
  nit: string;
  periodos: readonly PeriodoRevision[];
  /** Vencimientos del calendario del impuesto (RETEFUENTE o el de IVA de la periodicidad). Vacío = no está cargado. */
  calendario: readonly VencimientoDian[];
  /** El calendario es mensual: con otra periodicidad no hay fecha límite por período. */
  calendarioAplica: boolean;
  marcas: readonly (MarcaCruceRetencion & { clave: string })[];
};

export const claveMarcaPeriodo = (prefijo: "oportunidad" | "pago", anio: number, periodo: number) => `${prefijo}:${anio}-${String(periodo).padStart(2, "0")}`;

const dia = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const diasEntre = (desde: string, hasta: string) => Math.round((dia(hasta) - dia(desde)) / 86_400_000);

function comparar(fecha: string | null, vencimiento: string | null): { estado: EstadoOportunidad; dias: number | null } {
  if (!fecha) return { estado: "sin_fecha", dias: null };
  if (!vencimiento) return { estado: "sin_calendario", dias: null };
  return fecha <= vencimiento ? { estado: "oportuno", dias: null } : { estado: "extemporaneo", dias: diasEntre(vencimiento, fecha) };
}

/** El 490 de los conceptos cuya fecha cuenta: el último pago (con cuotas o pagos posteriores, el que lo completa). */
export function reciboDelConcepto(periodo: Pick<PeriodoRevision, "pagos">, concepto: ConceptoOportunidadPago | readonly string[]): Formulario490 | null {
  const conceptos: readonly string[] = typeof concepto === "string" ? [concepto] : concepto;
  const porFecha = (a: Formulario490, b: Formulario490) => (a.fechaPago ?? "").localeCompare(b.fechaPago ?? "") || a.numero.localeCompare(b.numero);
  const recibos = periodo.pagos.filter((p) => conceptos.includes(p.concepto)).flatMap((p) => p.formularios).sort(porFecha);
  return recibos.length > 0 ? recibos[recibos.length - 1] : null;
}

/** El pago de unos conceptos contra el vencimiento: sin recibo, «Sin pago» si la declaración los obliga y «Sin valor a pagar» si no. */
function medirPago(p: PeriodoRevision, conceptos: readonly string[], vencimiento: string | null): PagoOportunidad {
  const recibo = reciboDelConcepto(p, conceptos);
  if (!recibo) {
    const declara = p.pagos.some((x) => conceptos.includes(x.concepto) && x.esperado);
    return { numero: null, autoadhesivo: null, fecha: null, estado: declara ? "sin_pago" : "nada_que_pagar", dias: null };
  }
  const { estado, dias } = comparar(recibo.fechaPago, vencimiento);
  return { numero: recibo.numero, autoadhesivo: recibo.autoadhesivo ?? null, fecha: recibo.fechaPago, estado, dias };
}

/** Las columnas de pago de una fila, con su pago (las copias antiguas de Retención solo traen `pago61` y `pago62`). */
export function pagosDeFila(f: Pick<FilaOportunidad, "pagos" | "pago61" | "pago62">, impuesto: ImpuestoDian = RETENCION): { id: string; pago: PagoOportunidad }[] {
  if (f.pagos) return f.pagos;
  const viejos: Record<string, PagoOportunidad | undefined> = { "61": f.pago61, "62": f.pago62 };
  return impuesto.columnasPago.flatMap((c) => (viejos[c.id] ? [{ id: c.id, pago: viejos[c.id] as PagoOportunidad }] : []));
}

export function oportunidadRevision(e: EntradaOportunidad): FilaOportunidad[] {
  const impuesto = impuestoPorClave(e.impuesto) ?? RETENCION;
  const esRetencion = impuesto.clave === RETENCION.clave;
  const marcas = new Map(e.marcas.map((m) => [m.clave, m]));
  return e.periodos.map((p) => {
    const clave = claveMarcaPeriodo("oportunidad", e.anio, p.periodo);
    const vencimiento = e.calendarioAplica ? fechaVencimiento(e.calendario, p.periodo, e.nit) : null;
    const marca = marcas.get(clave);
    if (!p.cadena.vigente) {
      const estado: EstadoOportunidad = p.causal ? "sin_formulario" : "falta_350";
      const sinPago: PagoOportunidad = { numero: null, autoadhesivo: null, fecha: null, estado, dias: null };
      return {
        periodo: p.periodo, clave, numero350: null, autoadhesivo350: null, vencimiento, presentacion: null, estadoPresentacion: estado, diasPresentacion: null,
        ...(esRetencion ? { pago61: sinPago, pago62: sinPago } : {}),
        pagos: impuesto.columnasPago.map((c) => ({ id: c.id, pago: sinPago })),
        admiteMarca: false, marca: marca ? { ...marca, vigente: false } : null,
      };
    }

    const { original } = p.cadena;
    const presentacion = original
      ? comparar(original.fechaPresentacion, vencimiento)
      : { estado: "falta_original" as const, dias: null };
    const admiteMarca = original == null;
    const pagos = impuesto.columnasPago.map((c) => ({ id: c.id, pago: medirPago(p, c.conceptos, vencimiento) }));
    return {
      periodo: p.periodo,
      clave,
      numero350: original?.numero ?? null,
      autoadhesivo350: original?.autoadhesivo ?? null,
      vencimiento,
      presentacion: original?.fechaPresentacion ?? null,
      estadoPresentacion: presentacion.estado,
      diasPresentacion: presentacion.dias,
      ...(esRetencion ? { pago61: pagos.find((x) => x.id === "61")?.pago, pago62: pagos.find((x) => x.id === "62")?.pago } : {}),
      pagos,
      admiteMarca,
      // La marca no lleva cifra: vale mientras el período siga sin su original.
      marca: marca ? { ...marca, vigente: admiteMarca } : null,
    };
  });
}
