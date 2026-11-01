import type { DefinicionFormulario, RenglonDian } from "./definicion";

/**
 * Formulario 490 · Recibo oficial de pago de impuestos nacionales.
 *
 * Fuente: «Retencion en la fuente - F350 y F490.xlsx», pestaña «Formulario 490». Para la
 * retención en la fuente, el concepto (renglón 2) es 61 (renta y autorretenciones, paga el
 * 130 del 350), 62 (reteIVA, paga el 134) o 63 (timbre, paga el 135); el valor del
 * impuesto va en el 36, y puede venir sanción (34) e intereses de mora (35).
 */

const r = (renglon: number, etiqueta: string, seccion: string, tipo: RenglonDian["tipo"], guardar: boolean, terminos?: RenglonDian["terminos"]): RenglonDian => ({
  renglon, seccion, concepto: `r${renglon}`, etiqueta, persona: "unica", tipo, guardar, ...(terminos ? { terminos } : {}),
});

const ID = "Identificación del recibo";
const OBLIGADO = "Datos del obligado";
const REF = "Referencia de la obligación";
const PAGOS = "Pagos";
const DEUDOR = "Deudor solidario o subsidiario";
const OFICIAL = "Uso oficial";

export const CONCEPTOS_PAGO_RETENCION = ["61", "62", "63"] as const;
export type ConceptoPagoRetencion = (typeof CONCEPTOS_PAGO_RETENCION)[number];

export const F490: DefinicionFormulario = {
  codigo: "490",
  nombre: "Recibo oficial de pago de impuestos nacionales",
  renglones: [
    r(1, "Año", ID, "dato", true),
    r(2, "Concepto de pago", ID, "dato", true),
    r(3, "Período", ID, "dato", true),
    r(4, "Número del formulario 490", ID, "dato", true),
    r(5, "NIT", OBLIGADO, "dato", true),
    r(6, "DV", OBLIGADO, "dato", true),
    r(7, "Primer apellido", OBLIGADO, "dato", false),
    r(8, "Segundo apellido", OBLIGADO, "dato", false),
    r(9, "Primer nombre", OBLIGADO, "dato", false),
    r(10, "Otros nombres", OBLIGADO, "dato", false),
    r(11, "Razón social", OBLIGADO, "dato", true),
    r(12, "Código de dirección seccional", OBLIGADO, "dato", false),
    r(24, "Gran contribuyente", OBLIGADO, "dato", false),
    r(25, "Número de título judicial", REF, "dato", false),
    r(26, "Fecha de depósito", REF, "dato", false),
    r(27, "Cuota número", REF, "dato", true),
    r(28, "De (total de cuotas)", REF, "dato", true),
    r(29, "Número del formulario de la declaración que se paga", REF, "dato", true),
    r(30, "Número de acto oficial", REF, "dato", false),
    r(31, "Fecha del acto oficial", REF, "dato", false),
    r(32, "Fecha para el pago de este recibo", REF, "dato", true),
    r(33, "Código de título", REF, "dato", false),
    r(34, "Valor pago sanción", PAGOS, "valor", true),
    r(35, "Valor pago intereses de mora", PAGOS, "valor", true),
    r(36, "Valor pago impuesto", PAGOS, "valor", true),
    ...[37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48].map((n) => r(n, `Deudor solidario o subsidiario (casilla ${n})`, DEUDOR, "dato", false)),
    r(980, "Pago total", PAGOS, "total", true, [[34, 1], [35, 1], [36, 1]]),
    r(988, "Código deudor", DEUDOR, "dato", false),
    r(996, "Número interno DIAN / autoadhesivo", OFICIAL, "dato", true),
    r(997, "Sello de la entidad recaudadora (fecha de pago)", OFICIAL, "dato", true),
  ],
};
