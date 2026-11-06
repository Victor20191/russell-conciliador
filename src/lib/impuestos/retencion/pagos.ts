import { calcularTotal } from "../formularios/definicion";
import { F350, RENGLON_PAGADO_POR_CONCEPTO_490 } from "../formularios/f350";
import { CONCEPTOS_PAGO_RETENCION, type ConceptoPagoRetencion } from "../formularios/f490";
import type { MarcaCruceRetencion } from "./cruce";
import { claveMarcaPeriodo } from "./oportunidad";
import type { PeriodoRevision, ReciboDeOtro350 } from "./periodos-revision";

/**
 * Pagos efectuados de Retención en la fuente (puro): por período, lo que declara el 350 VIGENTE
 * (136 retenciones, 137 sanciones, 138 total) contra lo pagado con los recibos 490 de su cadena
 * (Σ renglón 36 impuesto de los conceptos 61, 62 y 63; Σ 34 sanción; Σ 35 intereses de mora).
 * Diferencia = total pagado − 138 = (Σ36 − 136) + (Σ34 − 137): positiva si se pagó de más y
 * negativa si se pagó de menos. El total pagado no lleva los intereses de mora: van aparte y no se
 * comparan. Se compara al peso (sin umbral); una diferencia exige marca para cerrar, y también un
 * recibo que paga un 350 de otro período. El desglose por concepto (pagado − declarado) dice qué
 * falta: el 61 contra el 130, el 62 contra el 134 y el 63 contra el 135.
 */

export type EstadoPago = "completo" | "diferencia" | "sin_formulario" | "falta_350";

export const ETIQUETA_PAGO: Readonly<Record<EstadoPago, string>> = {
  completo: "Pago completo",
  diferencia: "Diferencia en el pago",
  sin_formulario: "Sin formulario",
  falta_350: "Falta el 350",
};

export type DesglosePago = { concepto: ConceptoPagoRetencion; renglon: number; declarado: number; pagado: number; diferencia: number; recibos: number };

export type FilaPagos = {
  periodo: number;
  /** Llave de la marca del período (`pago:2026-02`). */
  clave: string;
  estado: EstadoPago;
  retenciones: number;
  sanciones: number;
  totalDeclarado: number;
  impuestoPagado: number;
  sancionPagada: number;
  intereses: number;
  totalPagado: number;
  diferencia: number;
  desglose: DesglosePago[];
  /** Recibos que cuentan en este mes pero citan un 350 de otro. Las copias antiguas no lo traen. */
  recibosDeOtro350?: ReciboDeOtro350[];
  requiereMarca: boolean;
  marca: (MarcaCruceRetencion & { vigente: boolean }) | null;
};

export type ResultadoPagos = {
  filas: FilaPagos[];
  total: Pick<FilaPagos, "retenciones" | "sanciones" | "totalDeclarado" | "impuestoPagado" | "sancionPagada" | "intereses" | "totalPagado" | "diferencia">;
  pendientesMarca: number;
};

/**
 * Los conceptos que el 350 vigente obliga a pagar y no tienen recibo 490 (la alerta de la lista de
 * formularios). Sale del desglose, así que también vale para las copias en firme ya guardadas.
 */
export const conceptosSinRecibo = (f: Pick<FilaPagos, "desglose">): DesglosePago[] => f.desglose.filter((d) => d.declarado > 0 && d.recibos === 0);

export const alertaSinRecibo = (d: Pick<DesglosePago, "concepto">) => `Falta el 490 concepto ${d.concepto}`;

export const alertaReciboDeOtro350 = (r: ReciboDeOtro350) => `Recibo de otro 350 (${r.numeroPagado})`;

const centavos = (n: number) => Math.round(n * 100);
const sumar = (valores: readonly number[]) => valores.reduce((s, v) => s + centavos(v), 0) / 100;

export function pagosRevision(e: { anio: number; periodos: readonly PeriodoRevision[]; marcas: readonly (MarcaCruceRetencion & { clave: string })[] }): ResultadoPagos {
  const marcas = new Map(e.marcas.map((m) => [m.clave, m]));
  const filas = e.periodos.map((p): FilaPagos => {
    const clave = claveMarcaPeriodo("pago", e.anio, p.periodo);
    const marcaGuardada = marcas.get(clave);
    const vigente = p.cadena.vigente;
    if (!vigente) {
      return {
        periodo: p.periodo, clave, estado: p.causal ? "sin_formulario" : "falta_350",
        retenciones: 0, sanciones: 0, totalDeclarado: 0, impuestoPagado: 0, sancionPagada: 0, intereses: 0, totalPagado: 0, diferencia: 0,
        desglose: [], requiereMarca: false, marca: marcaGuardada ? { ...marcaGuardada, vigente: false } : null,
      };
    }
    // Los totales se recalculan con la definición del formulario, como en las vistas.
    const valores = new Map(Object.entries(vigente.valores).map(([r, v]) => [Number(r), v]));
    const retenciones = calcularTotal(F350, 136, valores);
    const sanciones = valores.get(137) ?? 0;
    const desglose = CONCEPTOS_PAGO_RETENCION.map((concepto): DesglosePago => {
      const renglon = RENGLON_PAGADO_POR_CONCEPTO_490[concepto];
      const pago = p.pagos.find((x) => x.concepto === concepto);
      const declarado = calcularTotal(F350, renglon, valores);
      const pagado = pago?.impuesto ?? 0;
      return { concepto, renglon, declarado, pagado, diferencia: sumar([pagado, -declarado]), recibos: pago?.formularios.length ?? 0 };
    });
    const impuestoPagado = sumar(p.pagos.map((x) => x.impuesto));
    const sancionPagada = sumar(p.pagos.map((x) => x.sancion));
    const intereses = sumar(p.pagos.map((x) => x.intereses));
    const diferencia = sumar([impuestoPagado, -retenciones, sancionPagada, -sanciones]);
    const hayDiferencia = centavos(diferencia) !== 0;
    const recibosDeOtro350 = p.recibosDeOtro350 ?? [];
    const requiereMarca = hayDiferencia || recibosDeOtro350.length > 0;
    return {
      periodo: p.periodo, clave, estado: hayDiferencia ? "diferencia" : "completo",
      retenciones, sanciones, totalDeclarado: calcularTotal(F350, 138, valores),
      impuestoPagado, sancionPagada, intereses, totalPagado: sumar([impuestoPagado, sancionPagada]), diferencia,
      desglose, recibosDeOtro350, requiereMarca,
      marca: marcaGuardada ? { ...marcaGuardada, vigente: centavos(marcaGuardada.diferencia) === centavos(diferencia) } : null,
    };
  });
  const total = (k: keyof ResultadoPagos["total"]) => sumar(filas.map((f) => f[k]));
  return {
    filas,
    total: {
      retenciones: total("retenciones"), sanciones: total("sanciones"), totalDeclarado: total("totalDeclarado"), impuestoPagado: total("impuestoPagado"),
      sancionPagada: total("sancionPagada"), intereses: total("intereses"), totalPagado: total("totalPagado"), diferencia: total("diferencia"),
    },
    pendientesMarca: filas.filter((f) => f.requiereMarca && !f.marca?.vigente).length,
  };
}
