import type { DefinicionFormulario, RenglonDian, TerminoTotal } from "./definicion";

/**
 * Formulario 300 · Declaración del impuesto sobre las ventas (IVA), estructura DIAN 2025-2026.
 *
 * Fuente: «IVA - F300 y F490.xlsx», pestaña «Formulario 300» (docs/impuestos/iva). Se guardan los
 * ingresos (27 a 43), el impuesto generado (58 a 67), el descontable (68 a 81), la liquidación (82 a
 * 89), el control de saldos (90 a 93), el pago total (980, informativo) y los datos que piden la
 * corrección y la oportunidad. Las compras (44 a 57) no se guardan ni se concilian; tampoco los
 * nombres, la seccional, los anticipos del Régimen Simple ni las firmas. Los saldos 82, 83, 86, 88 y
 * 89 se escriben en cero si dan negativo (`pisoCero`).
 */

const GENERALES = "Datos generales";
const INGRESOS = "Ingresos";
const COMPRAS = "Compras";
const GENERADO = "Impuesto generado";
const DESCONTABLE = "Impuesto descontable";
const LIQUIDACION = "Liquidación privada";
const CONTROL = "Control de saldos";
const FIRMAS = "Firmas";
const OFICIAL = "Uso oficial";
const INFORMATIVO = "Informativo";

const dato = (renglon: number, etiqueta: string, guardar: boolean, seccion = GENERALES): RenglonDian => ({
  renglon, seccion, concepto: `dato_${renglon}`, etiqueta, persona: "unica", tipo: "dato", guardar,
});
const valor = (renglon: number, concepto: string, etiqueta: string, seccion: string): RenglonDian => ({
  renglon, seccion, concepto, etiqueta, persona: "unica", tipo: "valor", guardar: true,
});
const total = (renglon: number, concepto: string, etiqueta: string, seccion: string, terminos: readonly TerminoTotal[], pisoCero = false): RenglonDian => ({
  renglon, seccion, concepto, etiqueta, persona: "unica", tipo: "total", guardar: true, terminos, ...(pisoCero ? { pisoCero } : {}),
});
const compra = (renglon: number, etiqueta: string): RenglonDian => ({
  renglon, seccion: COMPRAS, concepto: `compra_${renglon}`, etiqueta, persona: "unica", tipo: "base", guardar: false,
});
const suma = (desde: number, hasta: number): TerminoTotal[] => Array.from({ length: hasta - desde + 1 }, (_, i) => [desde + i, 1] as const);

/** Renglones con valor de los ingresos, el impuesto generado y el descontable (los que se concilian). */
export const VALORES_F300: readonly { renglon: number; concepto: string; etiqueta: string; seccion: string }[] = [
  { renglon: 27, concepto: "ing_gravadas_5", etiqueta: "Por operaciones gravadas al 5%", seccion: INGRESOS },
  { renglon: 28, concepto: "ing_gravadas_general", etiqueta: "Por operaciones gravadas a la tarifa general", seccion: INGRESOS },
  { renglon: 29, concepto: "ing_aiu", etiqueta: "A.I.U. por operaciones gravadas (base gravable especial)", seccion: INGRESOS },
  { renglon: 30, concepto: "ing_exportacion_bienes", etiqueta: "Por exportación de bienes", seccion: INGRESOS },
  { renglon: 31, concepto: "ing_exportacion_servicios", etiqueta: "Por exportación de servicios", seccion: INGRESOS },
  { renglon: 32, concepto: "ing_comercializadoras", etiqueta: "Por ventas a sociedades de comercialización internacional", seccion: INGRESOS },
  { renglon: 33, concepto: "ing_zonas_francas", etiqueta: "Por ventas a zonas francas", seccion: INGRESOS },
  { renglon: 34, concepto: "ing_juegos_azar", etiqueta: "Por juegos de suerte y azar", seccion: INGRESOS },
  { renglon: 35, concepto: "ing_exentas", etiqueta: "Por operaciones exentas", seccion: INGRESOS },
  { renglon: 36, concepto: "ing_cerveza", etiqueta: "Por venta de cerveza de producción nacional o importada", seccion: INGRESOS },
  { renglon: 37, concepto: "ing_gaseosas", etiqueta: "Por venta de gaseosas y similares", seccion: INGRESOS },
  { renglon: 38, concepto: "ing_licores", etiqueta: "Por venta de licores, aperitivos, vinos y similares", seccion: INGRESOS },
  { renglon: 39, concepto: "ing_excluidas", etiqueta: "Por operaciones excluidas", seccion: INGRESOS },
  { renglon: 40, concepto: "ing_no_gravadas", etiqueta: "Por operaciones no gravadas", seccion: INGRESOS },
  { renglon: 42, concepto: "ing_devoluciones", etiqueta: "Devoluciones en ventas anuladas, rescindidas o resueltas", seccion: INGRESOS },
  { renglon: 58, concepto: "gen_tarifa_5", etiqueta: "A la tarifa del 5%", seccion: GENERADO },
  { renglon: 59, concepto: "gen_tarifa_general", etiqueta: "A la tarifa general", seccion: GENERADO },
  { renglon: 60, concepto: "gen_aiu", etiqueta: "Sobre A.I.U. en operaciones gravadas (base gravable especial)", seccion: GENERADO },
  { renglon: 61, concepto: "gen_juegos_azar", etiqueta: "En juegos de suerte y azar", seccion: GENERADO },
  { renglon: 62, concepto: "gen_cerveza", etiqueta: "En venta de cerveza de producción nacional o importada", seccion: GENERADO },
  { renglon: 63, concepto: "gen_gaseosas", etiqueta: "En venta de gaseosas y similares", seccion: GENERADO },
  { renglon: 64, concepto: "gen_licores_5", etiqueta: "En venta de licores, aperitivos, vinos y similares 5%", seccion: GENERADO },
  { renglon: 65, concepto: "gen_retiro_inventario", etiqueta: "En retiro de inventario para activos fijos, consumo, muestras gratis o donaciones", seccion: GENERADO },
  { renglon: 66, concepto: "gen_recuperado_devoluciones", etiqueta: "IVA recuperado en devoluciones en compras anuladas, rescindidas o resueltas", seccion: GENERADO },
  { renglon: 68, concepto: "desc_importaciones_5", etiqueta: "Por importaciones gravadas a la tarifa del 5%", seccion: DESCONTABLE },
  { renglon: 69, concepto: "desc_importaciones_general", etiqueta: "Por importaciones gravadas a la tarifa general", seccion: DESCONTABLE },
  { renglon: 70, concepto: "desc_zonas_francas", etiqueta: "De bienes y servicios gravados provenientes de zonas francas", seccion: DESCONTABLE },
  { renglon: 71, concepto: "desc_compras_bienes_5", etiqueta: "Por compras de bienes gravados a la tarifa del 5%", seccion: DESCONTABLE },
  { renglon: 72, concepto: "desc_compras_bienes_general", etiqueta: "Por compras de bienes gravados a la tarifa general", seccion: DESCONTABLE },
  { renglon: 73, concepto: "desc_licores", etiqueta: "Por licores, aperitivos, vinos y similares", seccion: DESCONTABLE },
  { renglon: 74, concepto: "desc_servicios_5", etiqueta: "Por servicios gravados a la tarifa del 5%", seccion: DESCONTABLE },
  { renglon: 75, concepto: "desc_servicios_general", etiqueta: "Por servicios gravados a la tarifa general", seccion: DESCONTABLE },
  { renglon: 76, concepto: "desc_hidrocarburos", etiqueta: "Descuento IVA exploración hidrocarburos art. 485-2 E.T.", seccion: DESCONTABLE },
  { renglon: 78, concepto: "desc_no_residentes", etiqueta: "IVA retenido por servicios prestados en Colombia por no domiciliados o no residentes", seccion: DESCONTABLE },
  { renglon: 79, concepto: "desc_devoluciones_ventas", etiqueta: "IVA resultante por devoluciones en ventas anuladas, rescindidas o resueltas", seccion: DESCONTABLE },
  { renglon: 80, concepto: "desc_ajuste_perdidas", etiqueta: "Ajuste impuestos descontables (pérdidas, hurto o castigo de inventarios)", seccion: DESCONTABLE },
];

const de = (renglon: number) => {
  const v = VALORES_F300.find((x) => x.renglon === renglon);
  if (!v) throw new Error(`Renglón ${renglon} sin definir en el F300`);
  return valor(v.renglon, v.concepto, v.etiqueta, v.seccion);
};

export const F300: DefinicionFormulario = {
  codigo: "300",
  nombre: "Declaración del impuesto sobre las ventas - IVA",
  renglones: [
    dato(1, "Año", true),
    dato(3, "Período", true),
    dato(4, "Número de formulario", true),
    dato(5, "NIT", true),
    dato(6, "DV", true),
    dato(7, "Primer apellido", false),
    dato(8, "Segundo apellido", false),
    dato(9, "Primer nombre", false),
    dato(10, "Otros nombres", false),
    dato(11, "Razón social", true),
    dato(12, "Código de dirección seccional", false),
    dato(24, "Periodicidad de la declaración", true),
    dato(25, "Código de corrección", true),
    dato(26, "Número del formulario anterior", true),
    ...[27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40].map(de),
    total(41, "ing_brutos", "Total ingresos brutos (suma 27 a 40)", INGRESOS, suma(27, 40)),
    de(42),
    total(43, "ing_netos", "Total ingresos netos recibidos durante el período (41 − 42)", INGRESOS, [[41, 1], [42, -1]]),
    compra(44, "Importaciones · de bienes gravados a la tarifa del 5%"),
    compra(45, "Importaciones · de bienes gravados a la tarifa general"),
    compra(46, "Importaciones · de bienes y servicios gravados provenientes de zonas francas"),
    compra(47, "Importaciones · de bienes no gravados"),
    compra(48, "Importaciones · de bienes excluidos, exentos y no gravados provenientes de zonas francas"),
    compra(49, "Importaciones · de servicios"),
    compra(50, "Nacionales · de bienes gravados a la tarifa del 5%"),
    compra(51, "Nacionales · de bienes gravados a la tarifa general"),
    compra(52, "Nacionales · de servicios gravados a la tarifa del 5%"),
    compra(53, "Nacionales · de servicios gravados a la tarifa general"),
    compra(54, "Nacionales · de bienes y servicios excluidos, exentos y no gravados"),
    compra(55, "Total compras e importaciones brutas"),
    compra(56, "Devoluciones en compras anuladas, rescindidas o resueltas en este período"),
    compra(57, "Total compras netas realizadas durante el período"),
    ...[58, 59, 60, 61, 62, 63, 64, 65, 66].map(de),
    total(67, "gen_total", "Total impuesto generado por operaciones gravadas (suma 58 a 66)", GENERADO, suma(58, 66)),
    ...[68, 69, 70, 71, 72, 73, 74, 75, 76].map(de),
    total(77, "desc_pagado_facturado", "Total impuesto pagado o facturado (suma 68 a 76)", DESCONTABLE, suma(68, 76)),
    de(78),
    de(79),
    de(80),
    total(81, "desc_total", "Total impuestos descontables (suma 77 a 79 y reste 80)", DESCONTABLE, [[77, 1], [78, 1], [79, 1], [80, -1]]),
    total(82, "saldo_pagar_periodo", "Saldo a pagar por el período fiscal (67 − 81)", LIQUIDACION, [[67, 1], [81, -1]], true),
    total(83, "saldo_favor_periodo", "Saldo a favor del período fiscal (81 − 67)", LIQUIDACION, [[81, 1], [67, -1]], true),
    valor(84, "saldo_favor_anterior", "Saldo a favor del período fiscal anterior", LIQUIDACION),
    valor(85, "retenciones_iva", "Retenciones por IVA que le practicaron", LIQUIDACION),
    total(86, "saldo_pagar_impuesto", "Saldo a pagar por impuesto (82 − 84 − 85)", LIQUIDACION, [[82, 1], [84, -1], [85, -1]], true),
    valor(87, "sanciones", "Sanciones", LIQUIDACION),
    total(88, "total_saldo_pagar", "Total saldo a pagar (82 − 84 − 85 + 87)", LIQUIDACION, [[82, 1], [84, -1], [85, -1], [87, 1]], true),
    // La DIAN imprime «83 + 84 + 85 − 87», pero con saldo a pagar el 84 y el 85 ya se restaron en el 86 y el 88:
    // el 89 resta también el 82 para que el 88 y el 89 no tengan valor a la vez.
    total(89, "total_saldo_favor", "Total saldo a favor (83 + 84 + 85 − 82 − 87)", LIQUIDACION, [[83, 1], [84, 1], [85, 1], [82, -1], [87, -1]], true),
    valor(90, "favor_devolucion", "Saldo a favor susceptible de devolución y/o compensación por el presente período", CONTROL),
    valor(91, "favor_imputar_devolucion", "Saldo a favor susceptible de ser devuelto y/o compensado a imputar en el período siguiente", CONTROL),
    valor(92, "favor_sin_derecho", "Saldo a favor sin derecho a devolución y/o compensación susceptible de ser imputado en el siguiente período", CONTROL),
    total(93, "favor_imputar_siguiente", "Total saldo a favor a imputar al período siguiente (89 − 90)", CONTROL, [[89, 1], [90, -1]]),
    dato(100, "Total anticipos IVA Régimen Simple", false, "Anticipos Régimen Simple"),
    dato(101, "Número de identificación del signatario", false, FIRMAS),
    dato(102, "DV del signatario", false, FIRMAS),
    { renglon: 980, seccion: INFORMATIVO, concepto: "pago_total", etiqueta: "Pago total", persona: "unica", tipo: "informativo", guardar: true },
    dato(981, "Código de representación", false, FIRMAS),
    dato(982, "Código contador o revisor fiscal", false, FIRMAS),
    dato(983, "Número de tarjeta profesional", false, FIRMAS),
    dato(994, "Con salvedades", false, FIRMAS),
    dato(996, "Número interno DIAN / autoadhesivo", true, OFICIAL),
    dato(997, "Sello de la entidad recaudadora (fecha de presentación)", true, OFICIAL),
  ],
  validaciones: [
    { clave: "saldos_89", etiqueta: "Control de saldos: 90 + 91 + 92 debe ser igual al total saldo a favor (89)", terminos: [[90, 1], [91, 1], [92, 1]], contra: 89 },
  ],
};

/** Renglones que se pagan con el 490 de IVA: el impuesto (86) y las sanciones (87); total 88. */
export const RENGLONES_PAGO_F300 = { impuesto: 86, sanciones: 87, total: 88 } as const;
