import type { FilaMapeoDian } from "../mapeo-dian";

/**
 * Mapeo cuentas DIAN · recibo 2593 (anticipo bimestral del Régimen Simple) → cuenta Russell, valores de
 * fábrica (pestaña «Matriz RST» de la matriz global de homologación, con las decisiones del equipo del
 * 18/Nov/2026 y la propuesta del 21/Nov/2026). Siete casillas se cruzan con la contabilidad:
 *
 * - 44 (anticipo componente SIMPLE nacional) contra la 135595: lo pagado como anticipo. En esa cuenta el
 *   tercero DIAN NO se tacha (el anticipo es lo pagado a la DIAN; ver `CUENTAS_SIN_RESTA_DIAN_FABRICA`).
 * - 59 (impuesto al consumo) contra la 249505, que en el plan solo recibe ese impuesto.
 * - 66 (IVA generado) contra 240805 + 240815 y 67 (descontables) contra 240810 + 240820: las genéricas,
 *   como se homologa el IVA de un cliente del Régimen Simple. El 67 resta en el subtotal del IVA.
 * - 39 (ingresos brutos) contra los ingresos operacionales y no operacionales, por el saldo de la cuenta y
 *   sin terceros; la 417505 (devoluciones, débito) resta dentro de la misma fila por su naturaleza.
 * - 70 (retenciones de IVA que le practicaron) contra la 135517, por tercero, como el renglón 85 del 300.
 * - 43 (componente ICA, la suma de las 99 de la hoja 2) contra la 511505 (gasto de ICA), por el saldo de la
 *   cuenta: acumula el ICA del año, como la 135595 el anticipo. La 241205 (lo que falta pagar) va en el
 *   control por pagar del ICA.
 *
 * Los excedentes, saldos a favor y retenciones de antes del SIMPLE (50, 51, 52, 57, 60, 65, 68, 69, 75 y,
 * en la hoja 2, 100 y 105) quedan de control: no se comparan con la contabilidad (ver `controlesEntreRecibos`,
 * `avisosConValor` y `avisosConValorIca` del descriptor RST). Los totales a pagar (64, 74 y 76) van en los
 * controles por pagar (`controlesPorPagar`); las bases (58, 84, 85 y 86), de control.
 */

export const SECCIONES_MAPEO_F2593 = {
  anticipo: "Anticipo SIMPLE",
  consumo: "Impuesto nacional al consumo",
  iva: "Impuesto sobre las ventas",
  reteiva: "Retenciones de IVA",
  ica: "ICA consolidado",
  ingresos: "Ingresos brutos",
} as const;

/** Las cuentas del renglón 39: ingresos de la matriz más 421020, 424515 y 425005, menos la 417505. */
export const CUENTAS_INGRESOS_F2593 = [
  "410505", "410510", "410515", "410520", "410525", "410530", "417505",
  "420505", "421005", "421020", "421095", "422005", "423005", "423505", "424515", "425005", "429595",
] as const;

const fila = (renglon: number, concepto: string, etiqueta: string, seccion: string, cuentaRussell: string, signo: "+" | "-" = "+"): FilaMapeoDian => ({
  concepto, etiqueta, seccion, renglonPj: renglon, renglonPn: null, cuentaRussell, signo, enCruce: true, orden: 0,
});

export const MAPEO_F2593_FABRICA: readonly FilaMapeoDian[] = [
  fila(44, "anticipo_nacional", "Valor del anticipo componente SIMPLE nacional", SECCIONES_MAPEO_F2593.anticipo, "135595"),
  fila(59, "consumo_impuesto", "Impuesto nacional al consumo 8%", SECCIONES_MAPEO_F2593.consumo, "249505"),
  fila(66, "iva_generado", "IVA generado en el bimestre por operaciones gravadas", SECCIONES_MAPEO_F2593.iva, "240805+240815"),
  fila(67, "iva_descontable", "Impuestos descontables del bimestre", SECCIONES_MAPEO_F2593.iva, "240810+240820", "-"),
  fila(39, "ingresos_brutos", "Ingresos brutos bimestrales (26 a 35)", SECCIONES_MAPEO_F2593.ingresos, CUENTAS_INGRESOS_F2593.join("+")),
  fila(70, "iva_retenciones", "Retenciones por IVA que le practicaron en el bimestre", SECCIONES_MAPEO_F2593.reteiva, "135517"),
  fila(43, "ica_consolidado", "Componente ICA consolidado (suma de las 99 de la hoja 2)", SECCIONES_MAPEO_F2593.ica, "511505"),
].map((f, i) => ({ ...f, orden: (i + 1) * 10 }));
