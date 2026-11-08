import type { DefinicionFormulario, PersonaRenglon, RenglonDian } from "./definicion";

/**
 * Formulario 350 · Declaración de retenciones en la fuente (DIAN, estructura 2026).
 *
 * Fuente: «Retencion en la fuente - F350 y F490.xlsx», pestaña «Formulario 350»
 * (docs/impuestos/retencion-fuente). Las bases (29 a 41, 55, 56, 59 a 67, 77 a 92, 109,
 * 110 y 113 a 120) no se guardan ni se concilian; tampoco los nombres, la seccional ni las
 * firmas. El pago total (980) se guarda como importe INFORMATIVO: no lo suma ningún total, no
 * tiene concepto en «Mapeos DIAN» (no entra al cruce) y Pagos efectuados mide lo pagado con
 * los recibos 490.
 */

type Concepto = {
  concepto: string;
  etiqueta: string;
  seccion: string;
  /** [base, valor] de persona jurídica. */
  pj?: readonly [number, number];
  /** [base, valor] de persona natural. */
  pn?: readonly [number, number];
};

const RENTA = "Retenciones a título de renta";
const EXTERIOR = "Pagos al exterior";
const AUTORRETENCIONES = "Autorretenciones";

/** Conceptos con base y retención, en el orden del formulario. */
export const CONCEPTOS_RETENCION_F350: readonly Concepto[] = [
  { concepto: "rentas_trabajo", etiqueta: "Rentas de trabajo", seccion: RENTA, pn: [77, 93] },
  { concepto: "rentas_pensiones", etiqueta: "Rentas de pensiones", seccion: RENTA, pn: [78, 94] },
  { concepto: "honorarios", etiqueta: "Honorarios", seccion: RENTA, pj: [29, 42], pn: [79, 95] },
  { concepto: "comisiones", etiqueta: "Comisiones", seccion: RENTA, pj: [30, 43], pn: [80, 96] },
  { concepto: "servicios", etiqueta: "Servicios", seccion: RENTA, pj: [31, 44], pn: [81, 97] },
  { concepto: "rendimientos", etiqueta: "Rendimientos financieros e intereses", seccion: RENTA, pj: [32, 45], pn: [82, 98] },
  { concepto: "arrendamientos", etiqueta: "Arrendamientos (muebles e inmuebles)", seccion: RENTA, pj: [33, 46], pn: [83, 99] },
  { concepto: "regalias", etiqueta: "Regalías y explotación de la propiedad intelectual", seccion: RENTA, pj: [34, 47], pn: [84, 100] },
  { concepto: "dividendos", etiqueta: "Dividendos y participaciones", seccion: RENTA, pj: [35, 48], pn: [85, 101] },
  { concepto: "compras", etiqueta: "Compras", seccion: RENTA, pj: [36, 49], pn: [86, 102] },
  { concepto: "tarjetas", etiqueta: "Transacciones con tarjetas débito y crédito", seccion: RENTA, pj: [37, 50], pn: [87, 103] },
  { concepto: "construccion", etiqueta: "Contratos de construcción", seccion: RENTA, pj: [38, 51], pn: [88, 104] },
  { concepto: "enajenacion_activos", etiqueta: "Enajenación de activos fijos de personas naturales ante notarios y autoridades de tránsito", seccion: RENTA, pn: [89, 105] },
  { concepto: "loterias", etiqueta: "Loterías, rifas, apuestas y similares", seccion: RENTA, pj: [39, 52], pn: [90, 106] },
  { concepto: "hidrocarburos", etiqueta: "Hidrocarburos, carbón y demás productos mineros", seccion: RENTA, pj: [40, 53], pn: [91, 107] },
  { concepto: "otros_pagos", etiqueta: "Otros pagos sujetos a retención", seccion: RENTA, pj: [41, 54], pn: [92, 108] },
  { concepto: "exterior_sin_convenio", etiqueta: "Pagos o abonos en cuenta al exterior: países sin convenio", seccion: EXTERIOR, pj: [55, 57], pn: [109, 111] },
  { concepto: "exterior_con_convenio", etiqueta: "Pagos o abonos en cuenta al exterior: países con convenio vigente", seccion: EXTERIOR, pj: [56, 58], pn: [110, 112] },
  { concepto: "autorret_exonerados", etiqueta: "Contribuyentes exonerados de aportes (art. 114-1 E.T.)", seccion: AUTORRETENCIONES, pj: [59, 68] },
  { concepto: "autorret_ventas", etiqueta: "Ventas", seccion: AUTORRETENCIONES, pj: [60, 69], pn: [113, 121] },
  { concepto: "autorret_honorarios", etiqueta: "Honorarios", seccion: AUTORRETENCIONES, pj: [61, 70], pn: [114, 122] },
  { concepto: "autorret_comisiones", etiqueta: "Comisiones", seccion: AUTORRETENCIONES, pj: [62, 71], pn: [115, 123] },
  { concepto: "autorret_servicios", etiqueta: "Servicios", seccion: AUTORRETENCIONES, pj: [63, 72], pn: [116, 124] },
  { concepto: "autorret_rendimientos", etiqueta: "Rendimientos financieros", seccion: AUTORRETENCIONES, pj: [64, 73], pn: [117, 125] },
  { concepto: "autorret_pagos_provisionales", etiqueta: "Pagos mensuales provisionales de carácter voluntario (hidrocarburos y demás productos mineros)", seccion: AUTORRETENCIONES, pj: [65, 74], pn: [118, 126] },
  { concepto: "autorret_exportacion_hidrocarburos", etiqueta: "Exportación de hidrocarburos, carbón y demás productos mineros", seccion: AUTORRETENCIONES, pj: [66, 75], pn: [119, 127] },
  { concepto: "autorret_otros", etiqueta: "Otros conceptos", seccion: AUTORRETENCIONES, pj: [67, 76], pn: [120, 128] },
];

const dato = (renglon: number, etiqueta: string, guardar: boolean, seccion = "Datos generales"): RenglonDian => ({
  renglon, seccion, concepto: `dato_${renglon}`, etiqueta, persona: "unica", tipo: "dato", guardar,
});

function renglonesDeConcepto(c: Concepto): RenglonDian[] {
  const filas: RenglonDian[] = [];
  const agregar = (persona: PersonaRenglon, par: readonly [number, number] | undefined) => {
    if (!par) return;
    filas.push({ renglon: par[0], seccion: c.seccion, concepto: c.concepto, etiqueta: c.etiqueta, persona, tipo: "base", guardar: false });
    filas.push({ renglon: par[1], seccion: c.seccion, concepto: c.concepto, etiqueta: c.etiqueta, persona, tipo: "valor", guardar: true });
  };
  agregar("juridica", c.pj);
  agregar("natural", c.pn);
  return filas;
}

/** Renglones de retención a título de renta (los que suma el 130 antes de restar el 129). */
export const RENGLONES_RENTA_F350: readonly number[] = CONCEPTOS_RETENCION_F350
  .flatMap((c) => [c.pj?.[1], c.pn?.[1]])
  .filter((r): r is number => r != null)
  .sort((a, b) => a - b);

const TOTAL_RENTA = "Total retenciones a título de renta";
const IVA = "Retenciones a título de IVA";
const TOTALES = "Totales";
const unico = (renglon: number, concepto: string, etiqueta: string, seccion: string, tipo: "valor" | "total" = "valor", terminos?: RenglonDian["terminos"]): RenglonDian => ({
  renglon, seccion, concepto, etiqueta, persona: "unica", tipo, guardar: true, ...(terminos ? { terminos } : {}),
});

const ANEXO = "Anexo · pagos al exterior (hoja 2)";
/** Importes que se guardan y se muestran sin entrar a los totales, al cruce ni a Pagos efectuados. */
const INFORMATIVO = "Informativo";

export const F350: DefinicionFormulario = {
  codigo: "350",
  nombre: "Declaración de retenciones en la fuente",
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
    dato(25, "Código de corrección", true),
    dato(26, "Número del formulario anterior", true),
    dato(27, "Autorretenedores exonerados de aportes: actividad económica principal", false),
    dato(28, "Tarifa", false),
    ...CONCEPTOS_RETENCION_F350.flatMap(renglonesDeConcepto),
    unico(129, "menos_renta_exceso", "Menos retenciones practicadas en exceso o indebidas o por operaciones anuladas, rescindidas o resueltas", TOTAL_RENTA),
    unico(130, "total_renta", "Total retenciones renta y complementario", TOTAL_RENTA, "total", [
      ...RENGLONES_RENTA_F350.map((r) => [r, 1] as const),
      [129, -1],
    ]),
    unico(131, "reteiva_responsables", "A responsables del impuesto sobre las ventas", IVA),
    unico(132, "reteiva_no_residentes", "Practicadas por servicios a no residentes o no domiciliados", IVA),
    unico(133, "menos_reteiva_exceso", "Menos retenciones de IVA practicadas en exceso o indebidas o por operaciones anuladas, rescindidas o resueltas", IVA),
    unico(134, "total_reteiva", "Total retenciones IVA", IVA, "total", [[131, 1], [132, 1], [133, -1]]),
    unico(135, "timbre", "Retenciones impuesto de timbre nacional", "Retención de timbre"),
    unico(136, "total_retenciones", "Total retenciones", TOTALES, "total", [[130, 1], [134, 1], [135, 1]]),
    unico(137, "sanciones", "Sanciones", TOTALES),
    unico(138, "total_mas_sanciones", "Total retenciones más sanciones", TOTALES, "total", [[136, 1], [137, 1]]),
    dato(139, "Número de identificación del signatario", false, "Firmas"),
    dato(140, "DV del signatario", false, "Firmas"),
    { renglon: 980, seccion: INFORMATIVO, concepto: "pago_total", etiqueta: "Pago total", persona: "unica", tipo: "informativo", guardar: true },
    dato(981, "Código de representación", false, "Firmas"),
    dato(982, "Código contador o revisor fiscal", false, "Firmas"),
    dato(983, "Número de tarjeta profesional", false, "Firmas"),
    dato(994, "Con salvedades", false, "Firmas"),
    dato(996, "Número interno DIAN / autoadhesivo", true, "Uso oficial"),
    dato(997, "Sello de la entidad recaudadora (fecha de presentación)", true, "Uso oficial"),
    // Hoja 2: el detalle por línea (141 a 147) va aparte; aquí solo los totales que se controlan.
    { renglon: 148, seccion: ANEXO, concepto: "anexo_sin_convenio_pj", etiqueta: "Sin convenio, persona jurídica (base)", persona: "juridica", tipo: "base", guardar: false },
    { renglon: 149, seccion: ANEXO, concepto: "anexo_sin_convenio_pn", etiqueta: "Sin convenio, persona natural (base)", persona: "natural", tipo: "base", guardar: false },
    { renglon: 150, seccion: ANEXO, concepto: "anexo_sin_convenio_pj", etiqueta: "Sin convenio, persona jurídica (retención)", persona: "juridica", tipo: "total", guardar: true, terminos: [[57, 1]] },
    { renglon: 151, seccion: ANEXO, concepto: "anexo_sin_convenio_pn", etiqueta: "Sin convenio, persona natural (retención)", persona: "natural", tipo: "total", guardar: true, terminos: [[111, 1]] },
    { renglon: 152, seccion: ANEXO, concepto: "anexo_con_convenio_pj", etiqueta: "Con convenio, persona jurídica (base)", persona: "juridica", tipo: "base", guardar: false },
    { renglon: 153, seccion: ANEXO, concepto: "anexo_con_convenio_pn", etiqueta: "Con convenio, persona natural (base)", persona: "natural", tipo: "base", guardar: false },
    { renglon: 154, seccion: ANEXO, concepto: "anexo_con_convenio_pj", etiqueta: "Con convenio, persona jurídica (retención)", persona: "juridica", tipo: "total", guardar: true, terminos: [[58, 1]] },
    { renglon: 155, seccion: ANEXO, concepto: "anexo_con_convenio_pn", etiqueta: "Con convenio, persona natural (retención)", persona: "natural", tipo: "total", guardar: true, terminos: [[112, 1]] },
  ],
};

/** Detalle por línea de la hoja 2: se guarda país (141), tipo de persona (143) y retención (147). */
export const ANEXO_EXTERIOR_F350 = { pais: 141, tipoPersona: 143, valorRetencion: 147 } as const;

/** Los renglones que pagan los conceptos del formulario 490. */
export const RENGLON_PAGADO_POR_CONCEPTO_490 = { "61": 130, "62": 134, "63": 135 } as const;
