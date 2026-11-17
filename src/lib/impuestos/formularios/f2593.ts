import type { DefinicionFormulario, RenglonDian, TerminoTotal, ValidacionFormulario } from "./definicion";

/**
 * Formulario 2593 · Recibo electrónico del SIMPLE (anticipo bimestral del Régimen Simple de
 * Tributación), hoja 1. Estructura DIAN 2024, la de los recibos de 2026.
 *
 * Fuente: «Formulario_2593_2024.pdf» (formulario e instructivo; copia en docs/impuestos/rst). Se
 * guardan los ingresos por grupo de actividades (26 a 35), las ganancias ocasionales (37 y 38), la
 * liquidación del anticipo (39 a 49), el valor a pagar o excedente del anticipo (50 a 57), el impuesto
 * al consumo (58 a 65), el IVA (66 a 75) y los valores a pagar (76 a 79). La tarifa (36) es un
 * porcentaje y no se guarda; la hoja 2 (ICA por municipio, 82 a 108) tampoco: su total ya está en el
 * 43 y el 76.
 *
 * Lo que se paga con el 490 concepto 27 es la suma de 76 + 77 + 78 + 79, que el formulario no imprime:
 * va como renglón `calculado`. Los totales impresos del recibo se guardan como valores y sus fórmulas
 * (las del instructivo) solo AVISAN si no cuadran, para no bloquear un recibo que la DIAN ya generó.
 * El número tiene 14 dígitos y empieza por 2593; el ajuste va en la casilla 24 y el recibo que ajusta en
 * la 25; no hay sello de presentación (casilla 997): la fecha que cuenta es la del pago, en el 490.
 */

const GENERALES = "Datos generales";
const INGRESOS = "Ingresos brutos bimestrales por grupo de actividades";
const LIQUIDACION = "Liquidación del anticipo bimestral · componente SIMPLE nacional";
const DETERMINACION = "Valor a pagar o excedente del anticipo SIMPLE";
const CONSUMO = "Impuesto nacional al consumo de comidas y bebidas";
const VENTAS = "Impuesto sobre las ventas";
const VALORES_A_PAGAR = "Valores a pagar";
const DIAN = "Espacio de la DIAN";

/** El total de los valores a pagar (76 a 79): no es una casilla del formulario. */
export const RENGLON_TOTAL_F2593 = 1000;

/** Los valores a pagar del recibo: ICA (76), anticipo SIMPLE (77), consumo (78) e IVA (79). */
export const COMPONENTES_PAGO_F2593 = [76, 77, 78, 79] as const;

const dato = (renglon: number, etiqueta: string, guardar: boolean, seccion = GENERALES): RenglonDian => ({
  renglon, seccion, concepto: `dato_${renglon}`, etiqueta, persona: "unica", tipo: "dato", guardar,
});
const valor = (renglon: number, concepto: string, etiqueta: string, seccion: string): RenglonDian => ({
  renglon, seccion, concepto, etiqueta, persona: "unica", tipo: "valor", guardar: true,
});
const suma = (desde: number, hasta: number): TerminoTotal[] => Array.from({ length: hasta - desde + 1 }, (_, i) => [desde + i, 1] as const);
const valida = (contra: number, etiqueta: string, terminos: readonly TerminoTotal[], pisoCero = false): ValidacionFormulario => ({
  clave: `cuadre_${contra}`, etiqueta, terminos, contra, ...(pisoCero ? { pisoCero } : {}),
});

export const F2593: DefinicionFormulario = {
  codigo: "2593",
  nombre: "Recibo electrónico del SIMPLE",
  numero: { prefijo: "2593", digitos: 14 },
  correccion: { codigo: 24, anterior: 25 },
  sinSello: true,
  renglones: [
    dato(1, "Año", true),
    dato(3, "Período (bimestre)", true),
    dato(4, "Número de formulario", true),
    dato(5, "NIT", true),
    dato(6, "DV", true),
    dato(7, "Primer apellido", false),
    dato(8, "Segundo apellido", false),
    dato(9, "Primer nombre", false),
    dato(10, "Otros nombres", false),
    dato(11, "Razón social", true),
    dato(12, "Código de dirección seccional", false),
    dato(24, "Ajuste", true),
    dato(25, "Número del recibo 2593 anterior", true),
    valor(26, "grupo1_pais", "Grupo 1 · ingresos brutos en todo el país", INGRESOS),
    valor(27, "grupo1_exterior", "Grupo 1 · ingresos brutos en el exterior", INGRESOS),
    valor(28, "grupo2_pais", "Grupo 2 · ingresos brutos en todo el país", INGRESOS),
    valor(29, "grupo2_exterior", "Grupo 2 · ingresos brutos en el exterior", INGRESOS),
    valor(30, "grupo3_pais", "Grupo 3 · ingresos brutos en todo el país", INGRESOS),
    valor(31, "grupo3_exterior", "Grupo 3 · ingresos brutos en el exterior", INGRESOS),
    valor(32, "grupo3sic_pais", "Grupo 3 (sic) · ingresos brutos en todo el país", INGRESOS),
    valor(33, "grupo3sic_exterior", "Grupo 3 (sic) · ingresos brutos en el exterior", INGRESOS),
    valor(34, "grupo6_pais", "Grupo 6 · ingresos brutos en todo el país", INGRESOS),
    valor(35, "grupo6_exterior", "Grupo 6 · ingresos brutos en el exterior", INGRESOS),
    dato(36, "Tarifa SIMPLE consolidada (%)", false, INGRESOS),
    valor(37, "ganancias_pais", "Ganancias ocasionales en el país", INGRESOS),
    valor(38, "ganancias_exterior", "Ganancias ocasionales en el exterior", INGRESOS),
    valor(39, "ingresos_brutos", "Ingresos brutos bimestrales (26 a 35)", LIQUIDACION),
    valor(40, "ingresos_no_constitutivos", "Ingresos no constitutivos de renta", LIQUIDACION),
    valor(41, "ingresos_netos", "Total ingresos netos bimestrales (39 − 40)", LIQUIDACION),
    valor(42, "anticipo_simple", "Anticipo SIMPLE (tarifa 36 × 41)", LIQUIDACION),
    valor(43, "ica_consolidado", "ICA consolidado liquidado durante el bimestre (casilla 99)", LIQUIDACION),
    valor(44, "anticipo_nacional", "Valor del anticipo componente SIMPLE nacional (42 − 43)", LIQUIDACION),
    valor(45, "aportes_pension", "Aportes a pensiones a cargo del empleador pagados en el bimestre", LIQUIDACION),
    valor(46, "excedente_aportes_anterior", "Excedente de aportes a pensiones no solicitado en el bimestre anterior", LIQUIDACION),
    valor(47, "aportes_limitados", "Excedentes de aportes del bimestre anterior y aportes del bimestre (limitados)", LIQUIDACION),
    valor(48, "exceso_aportes", "Exceso de aportes a pensiones a cargo del empleador (45 + 46 − 47)", LIQUIDACION),
    valor(49, "anticipo_neto", "Anticipo neto impuesto unificado SIMPLE (44 − 47)", LIQUIDACION),
    valor(50, "retenciones_previas", "Retenciones y autorretenciones de renta antes de pertenecer al SIMPLE", DETERMINACION),
    valor(51, "excedente_anticipo_anterior", "Excedente anticipo SIMPLE del bimestre anterior", DETERMINACION),
    valor(52, "saldo_favor_anio_anterior", "Saldo a favor por impuesto SIMPLE de la declaración del año anterior", DETERMINACION),
    valor(53, "saldo_anticipo", "Saldo anticipo SIMPLE (49 − 50 − 51 − 52)", DETERMINACION),
    valor(54, "intereses_anticipo", "Intereses causados por anticipo SIMPLE (art. 804 E.T.)", DETERMINACION),
    valor(55, "pagos_anteriores_anticipo", "Pagos anteriores anticipo SIMPLE por este período", DETERMINACION),
    valor(56, "total_pagar_anticipo", "Total a pagar anticipo impuesto SIMPLE", DETERMINACION),
    valor(57, "excedente_anticipo", "Excedente anticipo impuesto SIMPLE", DETERMINACION),
    valor(58, "consumo_ingresos", "Ingresos brutos gravados con impuesto al consumo de comidas y bebidas", CONSUMO),
    valor(59, "consumo_impuesto", "Impuesto nacional al consumo 8%", CONSUMO),
    valor(60, "consumo_excedente_anterior", "Excedente impuesto al consumo del bimestre anterior", CONSUMO),
    valor(61, "consumo_saldo", "Saldo impuesto nacional al consumo (59 − 60)", CONSUMO),
    valor(62, "consumo_intereses", "Intereses causados por impuesto al consumo (art. 804 E.T.)", CONSUMO),
    valor(63, "consumo_pagos_anteriores", "Pagos anteriores impuesto al consumo por este período", CONSUMO),
    valor(64, "consumo_total_pagar", "Total a pagar impuesto al consumo bimestral", CONSUMO),
    valor(65, "consumo_excedente", "Excedente impuesto al consumo bimestral", CONSUMO),
    valor(66, "iva_generado", "IVA generado en el bimestre por operaciones gravadas", VENTAS),
    valor(67, "iva_descontable", "Impuestos descontables del bimestre", VENTAS),
    valor(68, "iva_saldo_favor_anio_anterior", "Saldo a favor de la declaración de IVA del año gravable anterior", VENTAS),
    valor(69, "iva_excedente_anterior", "Excedente IVA del bimestre anterior", VENTAS),
    valor(70, "iva_retenciones", "Retenciones por IVA que le practicaron en el bimestre", VENTAS),
    valor(71, "iva_saldo", "Saldo impuesto sobre las ventas (66 − 67 − 68 − 69 − 70)", VENTAS),
    valor(72, "iva_intereses", "Intereses causados por IVA (art. 804 E.T.)", VENTAS),
    valor(73, "iva_pagos_anteriores", "Pagos anteriores de IVA por este período", VENTAS),
    valor(74, "iva_total_pagar", "Total a pagar IVA bimestral", VENTAS),
    valor(75, "iva_excedente", "Excedente IVA bimestral", VENTAS),
    valor(76, "pagar_ica", "ICA municipios o distritos", VALORES_A_PAGAR),
    valor(77, "pagar_anticipo", "Anticipo SIMPLE", VALORES_A_PAGAR),
    valor(78, "pagar_consumo", "Impuesto nacional al consumo de comidas y bebidas", VALORES_A_PAGAR),
    valor(79, "pagar_iva", "Impuesto sobre las ventas", VALORES_A_PAGAR),
    {
      renglon: RENGLON_TOTAL_F2593, seccion: VALORES_A_PAGAR, concepto: "total_valores_pagar", etiqueta: "Total valores a pagar (76 + 77 + 78 + 79)",
      persona: "unica", tipo: "calculado", guardar: false, terminos: COMPONENTES_PAGO_F2593.map((r) => [r, 1] as const), rotulo: "76 a 79",
    },
    dato(80, "Número del formulario 490 asociado", false, DIAN),
    dato(81, "Fecha del formulario 490 asociado", false, DIAN),
  ],
  validaciones: [
    valida(39, "Ingresos brutos bimestrales: 26 a 35 deben sumar el 39", suma(26, 35)),
    valida(41, "Total ingresos netos: 39 − 40 debe ser igual al 41", [[39, 1], [40, -1]]),
    valida(44, "Anticipo componente SIMPLE nacional: 42 − 43 debe ser igual al 44", [[42, 1], [43, -1]], true),
    valida(48, "Exceso de aportes a pensiones: 45 + 46 − 47 debe ser igual al 48", [[45, 1], [46, 1], [47, -1]], true),
    valida(49, "Anticipo neto: 44 − 47 debe ser igual al 49", [[44, 1], [47, -1]], true),
    valida(53, "Saldo anticipo SIMPLE: 49 − 50 − 51 − 52 debe ser igual al 53", [[49, 1], [50, -1], [51, -1], [52, -1]], true),
    valida(56, "Total a pagar anticipo: 49 + 54 − 50 − 51 − 52 − 55 debe ser igual al 56", [[49, 1], [54, 1], [50, -1], [51, -1], [52, -1], [55, -1]], true),
    valida(57, "Excedente anticipo: 50 + 51 + 52 + 55 − 49 − 54 debe ser igual al 57", [[50, 1], [51, 1], [52, 1], [55, 1], [49, -1], [54, -1]], true),
    valida(61, "Saldo impuesto al consumo: 59 − 60 debe ser igual al 61", [[59, 1], [60, -1]], true),
    valida(64, "Total a pagar impuesto al consumo: 59 + 62 − 60 − 63 debe ser igual al 64", [[59, 1], [62, 1], [60, -1], [63, -1]], true),
    valida(65, "Excedente impuesto al consumo: 60 + 63 − 59 − 62 debe ser igual al 65", [[60, 1], [63, 1], [59, -1], [62, -1]], true),
    valida(71, "Saldo IVA: 66 − 67 − 68 − 69 − 70 debe ser igual al 71", [[66, 1], [67, -1], [68, -1], [69, -1], [70, -1]], true),
    valida(74, "Total a pagar IVA: 66 + 72 − 67 − 68 − 69 − 70 − 73 debe ser igual al 74", [[66, 1], [72, 1], [67, -1], [68, -1], [69, -1], [70, -1], [73, -1]], true),
    valida(75, "Excedente IVA: 67 + 68 + 69 + 70 + 73 − 66 − 72 debe ser igual al 75", [[67, 1], [68, 1], [69, 1], [70, 1], [73, 1], [66, -1], [72, -1]], true),
    valida(77, "Anticipo SIMPLE a pagar: el 77 debe ser igual al 56", [[56, 1]]),
    valida(78, "Impuesto al consumo a pagar: el 78 debe ser igual al 64", [[64, 1]]),
    valida(79, "IVA a pagar: el 79 debe ser igual al 74", [[74, 1]]),
  ],
};
