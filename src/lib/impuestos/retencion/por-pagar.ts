import { nivelDiferencia, type NivelDiferencia } from "@/lib/balance/umbrales-alertas";
import type { PeriodoRevision } from "./periodos-revision";

/**
 * Control de lo que queda por pagar al corte (puro). No es una fila del cruce: no exige marca ni impide
 * cerrar; si no cuadra, sale un aviso en Novedades. RST lo usa con el impuesto al consumo: la casilla 64
 * de los recibos 2593 del año que al corte no se habían pagado, contra el saldo neto por pagar de las
 * cuentas del cliente homologadas a la 249505 (causado, crédito) y la 249510 (pagos, débito).
 *
 * Se compara el neto por pagar y no lo pagado porque el pago llega meses después del bimestre (enero y
 * febrero se pagan en mayo; noviembre y diciembre, en enero del año siguiente): lo pagado en el año trae
 * el último bimestre del año anterior, que no está en la revisión. El neto usa el saldo final, sirve con
 * cualquier balance y no depende de en cuál de las dos cuentas se registró el pago.
 *
 * Un recibo queda por pagar al corte si no tiene un 490 pagado (casilla 997) hasta la fecha de corte.
 * Cuentan la vigente de cada bimestre y los recibos anteriores de su cadena que tienen su 490 (como en
 * Pagos efectuados): un ajuste trae solo lo adicional. Un 490 del bimestre que no cita un recibo
 * cargado de la cadena se toma como pago de la vigente.
 */

export type EstadoReciboPorPagar = "pagado" | "pagado_despues" | "sin_fecha" | "sin_pago";

export const ETIQUETA_RECIBO_POR_PAGAR: Readonly<Record<EstadoReciboPorPagar, string>> = {
  pagado: "Pagado al corte",
  pagado_despues: "Pagado después del corte",
  sin_fecha: "490 sin fecha de pago",
  sin_pago: "Sin 490",
};

export type ReciboPorPagar = {
  periodo: number;
  /** Número del recibo (2593). */
  numero: string;
  /** El renglón del control en el recibo (la 64). */
  valor: number;
  /** El 490 que lo paga (el primero hasta el corte o, si no hay, el primero después); null si no tiene. */
  pago: { numero: string; fecha: string | null } | null;
  estado: EstadoReciboPorPagar;
  /** Lo que queda por pagar al corte: el valor si no está pagado; 0 si lo está. */
  porPagar: number;
};

/** Una cuenta del cliente del control, con el saldo por pagar en positivo (crédito). */
export type CuentaPorPagar = { cuenta: string; nombre: string; cuentaRussell: string; nombreRussell: string | null; saldo: number };

export type ControlPorPagar = {
  titulo: string;
  renglon: number;
  /** AAAA-MM-DD: el último día del balance del corte. */
  fechaCorte: string;
  /** Los recibos del año con valor en el renglón, pagados o no. */
  recibos: ReciboPorPagar[];
  /** Períodos del corte sin recibo y sin la causal de que no hubo: lo que causaron no está en los recibos. */
  periodosSinRecibo: number[];
  /** Σ por pagar de los recibos. */
  porPagarRecibos: number;
  cuentas: CuentaPorPagar[];
  /** Σ saldo de las cuentas: lo que falta pagar según la contabilidad. */
  porPagarContable: number;
  /** Recibos − contabilidad. */
  diferencia: number;
  nivel: NivelDiferencia;
};

/** Una cuenta del cliente leída del balance por cuenta (saldo final con débito positivo). */
export type FilaCuentaPorPagar = { cuentaCliente: string; nombreCuenta: string; cuentaRussell: string; saldoFinal: number };

const centavos = (n: number) => Math.round(n * 100);
const sumar = (valores: readonly number[]) => valores.reduce((s, v) => s + centavos(v), 0) / 100;

export function controlPorPagar(e: {
  titulo: string;
  renglon: number;
  cuentas: readonly string[];
  fechaCorte: string;
  periodos: readonly PeriodoRevision[];
  filas: readonly FilaCuentaPorPagar[];
  nombresRussell?: ReadonlyMap<string, string>;
  umbral: number;
}): ControlPorPagar {
  const recibos: ReciboPorPagar[] = [];
  const periodosSinRecibo: number[] = [];
  for (const p of e.periodos) {
    const vigente = p.cadena.vigente;
    if (!vigente) {
      if (!p.causal) periodosSinRecibo.push(p.periodo);
      continue;
    }
    const recibos490 = p.pagos.flatMap((x) => x.formularios);
    const numerosCadena = new Set(p.cadena.cadena.map((f) => f.numero));
    const pagosDe = (numero: string) =>
      recibos490.filter((r) => r.numeroPagado === numero || (numero === vigente.numero && (!r.numeroPagado || !numerosCadena.has(r.numeroPagado))));
    for (const f of p.cadena.cadena) {
      const pagos = pagosDe(f.numero);
      // Un recibo anterior de la cadena sin 490 no se debe: el ajuste lo reemplazó entero.
      if (f.numero !== vigente.numero && pagos.length === 0) continue;
      const valor = f.valores[e.renglon] ?? 0;
      if (valor === 0) continue;
      const porFecha = [...pagos].sort((a, b) => (a.fechaPago ?? "9999").localeCompare(b.fechaPago ?? "9999") || a.numero.localeCompare(b.numero));
      const alCorte = porFecha.find((r) => r.fechaPago != null && r.fechaPago <= e.fechaCorte);
      const despues = porFecha.find((r) => r.fechaPago != null && r.fechaPago > e.fechaCorte);
      const estado: EstadoReciboPorPagar = alCorte ? "pagado" : despues ? "pagado_despues" : porFecha.length > 0 ? "sin_fecha" : "sin_pago";
      const pago = alCorte ?? despues ?? porFecha[0] ?? null;
      recibos.push({
        periodo: p.periodo,
        numero: f.numero,
        valor,
        pago: pago ? { numero: pago.numero, fecha: pago.fechaPago } : null,
        estado,
        porPagar: estado === "pagado" ? 0 : valor,
      });
    }
  }

  const delControl = new Set(e.cuentas);
  const porCuenta = new Map<string, CuentaPorPagar>();
  for (const f of e.filas) {
    if (!delControl.has(f.cuentaRussell)) continue;
    const previa = porCuenta.get(f.cuentaCliente);
    // Por pagar en positivo: el crédito de la 249505 suma y el débito de la 249510 (los pagos) resta.
    porCuenta.set(f.cuentaCliente, {
      cuenta: f.cuentaCliente,
      nombre: f.nombreCuenta,
      cuentaRussell: f.cuentaRussell,
      nombreRussell: e.nombresRussell?.get(f.cuentaRussell) ?? null,
      saldo: sumar([previa?.saldo ?? 0, -f.saldoFinal]),
    });
  }
  const cuentas = [...porCuenta.values()].sort((a, b) => a.cuentaRussell.localeCompare(b.cuentaRussell) || a.cuenta.localeCompare(b.cuenta));
  const porPagarRecibos = sumar(recibos.map((r) => r.porPagar));
  const porPagarContable = sumar(cuentas.map((c) => c.saldo));
  const diferencia = sumar([porPagarRecibos, -porPagarContable]);
  return {
    titulo: e.titulo,
    renglon: e.renglon,
    fechaCorte: e.fechaCorte,
    recibos,
    periodosSinRecibo,
    porPagarRecibos,
    cuentas,
    porPagarContable,
    diferencia,
    nivel: nivelDiferencia(diferencia, { descuadre: e.umbral }),
  };
}

/** El aviso de Novedades cuando el control no cuadra (desde el umbral); null si cuadra. */
export function avisoPorPagar(c: ControlPorPagar): string | null {
  if (c.nivel !== "alerta") return null;
  const pesos = (n: number) => `${n < 0 ? "-" : ""}$ ${Math.abs(n).toLocaleString("es-CO", { maximumFractionDigits: 2 })}`;
  return `Cruce contable · ${c.titulo}: al corte quedan por pagar ${pesos(c.porPagarRecibos)} según la casilla ${c.renglon} de los recibos y ${pesos(c.porPagarContable)} según la contabilidad; diferencia de ${pesos(c.diferencia)}. Es un control: no impide cerrar.`;
}
