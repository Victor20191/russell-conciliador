import { calcularTotal } from "../formularios/definicion";
import { impuestoPorClave, renglonSanciones, RETENCION, type ClaveImpuesto } from "../impuestos-dian";
import type { MarcaCruceRetencion } from "./cruce";
import { claveMarcaPeriodo } from "./oportunidad";
import { recibosSin350, valoresAPagar, type PeriodoRevision, type ReciboDeOtro350 } from "./periodos-revision";

/**
 * Pagos efectuados de Retención en la fuente (puro): por período, lo que declara el 350 VIGENTE
 * (136 retenciones, 137 sanciones, 138 total) contra lo pagado con los recibos 490 de su cadena
 * (Σ renglón 36 impuesto de los conceptos 61, 62 y 63; Σ 34 sanción; Σ 35 intereses de mora).
 * Diferencia = total pagado − 138 = (Σ36 − 136) + (Σ34 − 137): positiva si se pagó de más y
 * negativa si se pagó de menos. El total pagado no lleva los intereses de mora: van aparte y no se
 * comparan. Se compara al peso (sin umbral); una diferencia exige marca para cerrar, y también un
 * recibo que paga un 350 de otro período y un 490 que el 350 obliga a pagar y no está (la marca
 * explica por qué no se tiene; no impide cerrar). Un mes sin 350 con recibos 490 confirmados muestra lo
 * pagado como diferencia y exige marca. El desglose por concepto (pagado − declarado) dice qué
 * falta: el 61 contra el 130, el 62 contra el 134 y el 63 contra el 135.
 *
 * IVA usa la misma regla con su descriptor: lo declarado es el 86 (saldo a pagar por impuesto), el 87
 * (sanciones) y el 88 (total saldo a pagar), recalculados con su piso en cero, contra el 36 y el 34 de
 * los 490 del concepto de la periodicidad. Los nombres de los campos (`retenciones`, `sanciones`) son
 * los de Retención: en IVA, `retenciones` es el 86.
 *
 * Los anticipos del Régimen Simple (RST): lo que se debe pagar es 76 + 77 + 78 + 79 del recibo 2593
 * (con un ajuste, sumando los recibos de la cadena que ya tienen su 490) y se compara con el 36 de los
 * 490 concepto 27. El 2593 no liquida sanciones: la sanción (34) y los intereses (35) del 490 se
 * muestran aparte y no entran a la diferencia ni al total pagado.
 */

export type EstadoPago = "completo" | "diferencia" | "sin_formulario" | "falta_350";

export const ETIQUETA_PAGO: Readonly<Record<EstadoPago, string>> = {
  completo: "Pago completo",
  diferencia: "Diferencia en el pago",
  sin_formulario: "Sin formulario",
  falta_350: "Falta el 350",
};

/** La etiqueta del estado con el formulario de la declaración del impuesto («Falta el 300» en IVA). */
export const etiquetaPago = (estado: EstadoPago, codigo = "350") => (estado === "falta_350" ? `Falta el ${codigo}` : ETIQUETA_PAGO[estado]);

export type DesglosePago = { concepto: string; renglon: number; declarado: number; pagado: number; diferencia: number; recibos: number };

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
  /** Números de los 490 confirmados de un mes sin 350: lo que pagaron es toda la diferencia. Las copias antiguas no lo traen. */
  recibosSin350?: string[];
  /** RST: los valores a pagar del 2593 que suman lo declarado (76 ICA, 77 anticipo, 78 consumo, 79 IVA). */
  componentes?: ComponentePago[];
  requiereMarca: boolean;
  marca: (MarcaCruceRetencion & { vigente: boolean }) | null;
};

export type ComponentePago = { renglon: number; valor: number };

export type ResultadoPagos = {
  filas: FilaPagos[];
  total: Pick<FilaPagos, "retenciones" | "sanciones" | "totalDeclarado" | "impuestoPagado" | "sancionPagada" | "intereses" | "totalPagado" | "diferencia">;
  /** RST: la suma de cada valor a pagar de los períodos. */
  totalComponentes?: ComponentePago[];
  pendientesMarca: number;
};

/**
 * Los conceptos que el 350 vigente obliga a pagar y no tienen recibo 490 (la alerta de la lista de
 * formularios). Sale del desglose, así que también vale para las copias en firme ya guardadas.
 */
export const conceptosSinRecibo = (f: Pick<FilaPagos, "desglose">): DesglosePago[] => f.desglose.filter((d) => d.declarado > 0 && d.recibos === 0);

export const alertaSinRecibo = (d: Pick<DesglosePago, "concepto">) => `Falta el 490 concepto ${d.concepto}`;

export const alertaReciboDeOtro350 = (r: ReciboDeOtro350, codigo = "350") => `Recibo de otro ${codigo} (${r.numeroPagado})`;

export const alertaRecibosSin350 = (numeros: readonly string[], codigo = "350") => (numeros.length === 1 ? `Recibo 490 sin ${codigo}` : `${numeros.length} recibos 490 sin ${codigo}`);

const centavos = (n: number) => Math.round(n * 100);
const sumar = (valores: readonly number[]) => valores.reduce((s, v) => s + centavos(v), 0) / 100;

export function pagosRevision(e: { impuesto?: ClaveImpuesto; anio: number; periodos: readonly PeriodoRevision[]; marcas: readonly (MarcaCruceRetencion & { clave: string })[] }): ResultadoPagos {
  const impuesto = impuestoPorClave(e.impuesto) ?? RETENCION;
  const def = impuesto.declaracion;
  const { impuesto: rImpuesto, total: rTotal } = impuesto.renglones;
  const rSanciones = renglonSanciones(impuesto);
  // Sin renglón de sanciones (el 2593), la sanción pagada no se compara: se muestra aparte.
  const conSanciones = rSanciones != null;
  const componentesPago = impuesto.componentesPago?.map((c) => c.renglon) ?? null;
  const marcas = new Map(e.marcas.map((m) => [m.clave, m]));
  const filas = e.periodos.map((p): FilaPagos => {
    const clave = claveMarcaPeriodo("pago", e.anio, p.periodo);
    const marcaGuardada = marcas.get(clave);
    const vigente = p.cadena.vigente;
    if (!vigente) {
      // Sin 350 no hay nada declarado: si hay 490 confirmados, lo que pagaron es toda la diferencia y exige marca.
      const sin350 = recibosSin350(p).map((f) => f.numero);
      const impuestoPagado = sumar(p.pagos.map((x) => x.impuesto));
      const sancionPagada = sumar(p.pagos.map((x) => x.sancion));
      const totalPagado = conSanciones ? sumar([impuestoPagado, sancionPagada]) : impuestoPagado;
      const requiereMarca = sin350.length > 0;
      return {
        periodo: p.periodo, clave, estado: p.causal ? "sin_formulario" : "falta_350",
        retenciones: 0, sanciones: 0, totalDeclarado: 0, impuestoPagado, sancionPagada, intereses: sumar(p.pagos.map((x) => x.intereses)), totalPagado,
        diferencia: totalPagado, desglose: [], recibosSin350: sin350, requiereMarca,
        ...(componentesPago ? { componentes: componentesPago.map((renglon) => ({ renglon, valor: 0 })) } : {}),
        marca: marcaGuardada ? { ...marcaGuardada, vigente: requiereMarca && centavos(marcaGuardada.diferencia) === centavos(totalPagado) } : null,
      };
    }
    // Los totales se recalculan con la definición del formulario, como en las vistas. En RST, los valores
    // a pagar suman además los recibos de la cadena que ya tienen su 490 (un ajuste trae solo lo adicional).
    const valores = valoresAPagar(impuesto, p.cadena, p.pagos.flatMap((x) => x.formularios)) ?? new Map<number, number>();
    const retenciones = calcularTotal(def, rImpuesto, valores);
    const sanciones = rSanciones == null ? 0 : (valores.get(rSanciones) ?? 0);
    // Un renglón del desglose por concepto de pago del período (61, 62 y 63 en Retención; el de la periodicidad en IVA).
    const desglose = p.pagos.map(({ concepto, renglon }): DesglosePago => {
      const pago = p.pagos.find((x) => x.concepto === concepto);
      const declarado = calcularTotal(def, renglon, valores);
      const pagado = pago?.impuesto ?? 0;
      return { concepto, renglon, declarado, pagado, diferencia: sumar([pagado, -declarado]), recibos: pago?.formularios.length ?? 0 };
    });
    const impuestoPagado = sumar(p.pagos.map((x) => x.impuesto));
    const sancionPagada = sumar(p.pagos.map((x) => x.sancion));
    const intereses = sumar(p.pagos.map((x) => x.intereses));
    const diferencia = conSanciones ? sumar([impuestoPagado, -retenciones, sancionPagada, -sanciones]) : sumar([impuestoPagado, -retenciones]);
    const hayDiferencia = centavos(diferencia) !== 0;
    const recibosDeOtro350 = p.recibosDeOtro350 ?? [];
    // Un 490 que el 350 obliga a pagar y no está no impide cerrar, pero exige la marca del mes
    // (por qué no se tiene), aunque otro recibo cubra la cifra y la diferencia dé cero.
    const requiereMarca = hayDiferencia || recibosDeOtro350.length > 0 || conceptosSinRecibo({ desglose }).length > 0;
    return {
      periodo: p.periodo, clave, estado: hayDiferencia ? "diferencia" : "completo",
      retenciones, sanciones, totalDeclarado: calcularTotal(def, rTotal, valores),
      impuestoPagado, sancionPagada, intereses, totalPagado: conSanciones ? sumar([impuestoPagado, sancionPagada]) : impuestoPagado, diferencia,
      desglose, recibosDeOtro350, requiereMarca,
      ...(componentesPago ? { componentes: componentesPago.map((renglon) => ({ renglon, valor: valores.get(renglon) ?? 0 })) } : {}),
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
    ...(componentesPago
      ? { totalComponentes: componentesPago.map((renglon) => ({ renglon, valor: sumar(filas.map((f) => f.componentes?.find((c) => c.renglon === renglon)?.valor ?? 0)) })) }
      : {}),
    pendientesMarca: filas.filter((f) => f.requiereMarca && !f.marca?.vigente).length,
  };
}
