import type { Formulario350, Formulario490 } from "../retencion/periodos-revision";

/**
 * Formularios 350 y 490 de 2026 de un cliente real (períodos 1 a 8), ANONIMIZADOS: sin NIT ni
 * razón social. Se conservan los números de formulario, las fechas y los totales (130, 134, 136)
 * y el renglón 36 de cada pago. Para que los totales cuadren, cada 350 lleva su retención de renta
 * en un solo renglón (93) y la de IVA en el 131; febrero trae sus renglones reales.
 */

export const NIT_FICTICIO = "900123456";

const f350 = (periodo: number, numero: string, fecha: string, renta: number, iva: number, correccion?: string): Formulario350 & { periodo: number } => ({
  id: periodo * 10,
  periodo,
  numero,
  codigoCorreccion: correccion ? 1 : null,
  numeroAnterior: correccion ?? null,
  fechaPresentacion: fecha,
  valores: { 93: renta, 130: renta, 131: iva, 134: iva, 136: renta + iva, 138: renta + iva },
});

export const F350_2026: (Formulario350 & { periodo: number })[] = [
  // Enero llegó solo como CORRECCIÓN (25 = 1, 26 = 3510669606483), sin su original.
  f350(1, "3510673781751", "2026-04-07", 113_762_000, 2_156_000, "3510669606483"),
  f350(2, "3510673398173", "2026-03-19", 127_141_000, 2_556_000),
  f350(3, "3510676289861", "2026-04-22", 129_528_000, 1_873_000),
  f350(4, "3510681197247", "2026-05-21", 135_987_000, 2_040_000),
  f350(5, "3510684896886", "2026-06-20", 129_065_000, 2_174_000),
  f350(6, "3510688576900", "2026-07-21", 141_712_000, 2_659_000),
  f350(7, "3510692214725", "2026-08-18", 144_922_000, 1_814_000),
  f350(8, "3510696773029", "2026-09-17", 152_256_000, 2_545_000),
];

const f490 = (periodo: number, numero: string, concepto: string, pagado: string, fecha: string, impuesto: number): Formulario490 & { periodo: number } => ({
  id: 1000 + periodo * 10 + Number(concepto) - 60,
  periodo,
  numero,
  concepto,
  numeroPagado: pagado,
  fechaPago: fecha,
  valores: { 34: 0, 35: 0, 36: impuesto, 980: impuesto },
});

/** Solo concepto 61 de enero a julio (falta el 62); agosto trae 61 y 62. */
export const F490_2026: (Formulario490 & { periodo: number })[] = [
  f490(1, "4911086421291", "61", "3510669606483", "2026-02-20", 122_704_000),
  f490(2, "4911096214419", "61", "3510673398173", "2026-03-20", 127_141_000),
  f490(3, "4911106147948", "61", "3510676289861", "2026-04-23", 129_528_000),
  f490(4, "4911124579812", "61", "3510681197247", "2026-05-25", 135_987_000),
  f490(5, "4911135773227", "61", "3510684896886", "2026-06-22", 129_065_000),
  f490(6, "4911144906079", "61", "3510688576900", "2026-07-22", 141_712_000),
  f490(7, "4911154088103", "61", "3510692214725", "2026-08-19", 144_922_000),
  f490(8, "4911175044123", "61", "3510696773029", "2026-09-18", 152_256_000),
  f490(8, "4911175045977", "62", "3510696773029", "2026-09-18", 2_545_000),
];

/** Febrero tal como lo devolvería la IA (texto), con el NIT ficticio pegado al DV. */
export function lecturaCrudaFebrero(nitConDv: string) {
  const r = (renglon: number, valor: string) => ({ renglon, valor });
  return {
    formulario: "350",
    anio: "2 0 2 6",
    periodo: "2",
    numero: "3510673398173",
    nit: nitConDv,
    dv: "",
    razonSocial: "CLIENTE DE PRUEBA S.A.S.",
    codigoCorreccion: "",
    numeroAnterior: "",
    concepto: "",
    numeroPagado: "",
    cuota: "",
    deCuotas: "",
    fechaLimitePago: "",
    autoadhesivo: "91900433060923",
    fechaSello: "2 0 2 6 -0 3 -1 9 /1 5 :0 8 :4 4",
    renglones: [
      r(77, "530,139,000"), r(93, "63,256,000"), r(29, "6,521,000"), r(42, "717,000"), r(79, "5,650,000"), r(95, "622,000"),
      r(30, "251,000"), r(43, "28,000"), r(31, "528,739,000"), r(44, "8,317,000"), r(81, "1,630,000"), r(97, "65,000"),
      r(33, "163,167,000"), r(46, "5,927,000"), r(36, "81,300,000"), r(49, "2,033,000"), r(55, "7,148,000"), r(57, "1,134,000"),
      r(59, "4,094,688,000"), r(68, "45,042,000"), r(129, "0"), r(130, "127,141,000"), r(131, "158,000"), r(132, "2,398,000"),
      r(133, "0"), r(134, "2,556,000"), r(135, "0"), r(136, "129,697,000"), r(137, "0"), r(138, "129,697,000"), r(150, "1,134,000"),
      r(980, "0"),
    ],
    exterior: [
      { pais: "SIN CONVENIO", tipoPersona: "", valorRetencion: "295,000" },
      { pais: "SIN CONVENIO", tipoPersona: "1", valorRetencion: "839,000" },
    ],
  };
}
