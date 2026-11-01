import { fechaVencimiento, type VencimientoDian } from "../calendario";
import type { MarcaCruceRetencion } from "./cruce";
import type { Formulario490, PeriodoRevision } from "./periodos-revision";

/**
 * Indicador de oportunidad de Retención en la fuente (puro): por período, la fecha límite del
 * calendario DIAN (año, período y último dígito del NIT sin el DV) contra la fecha de presentación
 * del 350 ORIGINAL (renglón 997 del primero de la cadena, no de la corrección) y la de pago (997
 * del último 490 del concepto 61; sin 61, el primer 490 del período, y se dice cuál). Se comparan
 * fechas del calendario de Colombia, sin hora: igual o antes del vencimiento es «Oportuno». Un mes
 * sin formulario, sin calendario o sin original lo dice así; nunca sale «Oportuno» por falta de
 * fecha. Un período con la corrección sin su original pide marca para cerrar.
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

export type FilaOportunidad = {
  periodo: number;
  /** Llave de la marca del período (`oportunidad:2026-01`). */
  clave: string;
  /** El 350 cuya presentación se mide (el original) y su autoadhesivo (996). */
  numero350: string | null;
  autoadhesivo350: string | null;
  /** El 490 cuya fecha de pago se mide y su autoadhesivo (996). */
  numeroPago: string | null;
  autoadhesivoPago: string | null;
  conceptoPago: string | null;
  /** El período no tiene 490 del concepto 61: la fecha de pago es la del primer recibo que haya. */
  pagoSinConcepto61: boolean;
  vencimiento: string | null;
  presentacion: string | null;
  pago: string | null;
  estadoPresentacion: EstadoOportunidad;
  estadoPago: EstadoOportunidad;
  /** Días después del vencimiento (solo si es extemporáneo). */
  diasPresentacion: number | null;
  diasPago: number | null;
  /** La corrección llegó sin su original: no se puede medir la presentación y se exige marca. */
  requiereMarca: boolean;
  marca: (MarcaCruceRetencion & { vigente: boolean }) | null;
};

export type EntradaOportunidad = {
  anio: number;
  nit: string;
  periodos: readonly PeriodoRevision[];
  /** Vencimientos del año (formulario RETEFUENTE). Vacío = el calendario del año no está cargado. */
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

/** El 490 cuya fecha cuenta: el último pago del 61; sin 61, el primer recibo del período. */
export function reciboDePago(periodo: Pick<PeriodoRevision, "pagos">): { recibo: Formulario490; sinConcepto61: boolean } | null {
  const porFecha = (a: Formulario490, b: Formulario490) => (a.fechaPago ?? "").localeCompare(b.fechaPago ?? "") || a.numero.localeCompare(b.numero);
  const del61 = [...(periodo.pagos.find((p) => p.concepto === "61")?.formularios ?? [])].sort(porFecha);
  if (del61.length > 0) return { recibo: del61[del61.length - 1], sinConcepto61: false };
  const todos = periodo.pagos.flatMap((p) => p.formularios).sort(porFecha);
  return todos.length > 0 ? { recibo: todos[0], sinConcepto61: true } : null;
}

export function oportunidadRevision(e: EntradaOportunidad): FilaOportunidad[] {
  const marcas = new Map(e.marcas.map((m) => [m.clave, m]));
  return e.periodos.map((p) => {
    const clave = claveMarcaPeriodo("oportunidad", e.anio, p.periodo);
    const vencimiento = e.calendarioAplica ? fechaVencimiento(e.calendario, p.periodo, e.nit) : null;
    const base = {
      periodo: p.periodo, clave, numero350: null, autoadhesivo350: null, numeroPago: null, autoadhesivoPago: null, conceptoPago: null,
      pagoSinConcepto61: false, vencimiento, presentacion: null, pago: null, diasPresentacion: null, diasPago: null,
    };
    const marca = marcas.get(clave);
    if (!p.cadena.vigente) {
      const estado: EstadoOportunidad = p.causal ? "sin_formulario" : "falta_350";
      return { ...base, estadoPresentacion: estado, estadoPago: estado, requiereMarca: false, marca: marca ? { ...marca, vigente: false } : null };
    }

    const { original } = p.cadena;
    const presentacion = original
      ? comparar(original.fechaPresentacion, vencimiento)
      : { estado: "falta_original" as const, dias: null };
    const recibo = reciboDePago(p);
    const declaraPago = p.pagos.some((x) => x.esperado);
    const pago = recibo
      ? comparar(recibo.recibo.fechaPago, vencimiento)
      : { estado: declaraPago ? ("sin_pago" as const) : ("nada_que_pagar" as const), dias: null };
    const requiereMarca = original == null;
    return {
      ...base,
      numero350: original?.numero ?? null,
      autoadhesivo350: original?.autoadhesivo ?? null,
      numeroPago: recibo?.recibo.numero ?? null,
      autoadhesivoPago: recibo?.recibo.autoadhesivo ?? null,
      conceptoPago: recibo?.recibo.concepto ?? null,
      pagoSinConcepto61: recibo?.sinConcepto61 ?? false,
      presentacion: original?.fechaPresentacion ?? null,
      pago: recibo?.recibo.fechaPago ?? null,
      estadoPresentacion: presentacion.estado,
      estadoPago: pago.estado,
      diasPresentacion: presentacion.dias,
      diasPago: pago.dias,
      requiereMarca,
      // La marca no lleva cifra: vale mientras el período siga sin su original.
      marca: marca ? { ...marca, vigente: requiereMarca } : null,
    };
  });
}
