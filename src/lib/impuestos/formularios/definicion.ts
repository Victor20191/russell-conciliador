/**
 * Formularios DIAN descritos como DATO (Impuestos · Retención en la fuente, Fase 1).
 *
 * Cada renglón dice qué es (valor, base, total o dato del encabezado), a qué persona
 * corresponde y si se guarda; los totales llevan su fórmula como términos con signo. La
 * misma definición alimenta la lectura (qué se le pide a Claude y qué se descarta), los
 * controles aritméticos, el orden de las vistas y el Excel. Puro: sin BD ni Prisma.
 *
 * Los valores de la DIAN son pesos enteros; las cuentas se hacen en centavos enteros para
 * no arrastrar errores de coma flotante.
 */

export type CodigoFormularioDian = "350" | "490";

/** Persona del renglón: las dos columnas del 350 o un solo valor. */
export type PersonaRenglon = "juridica" | "natural" | "unica";

/**
 * - `valor`: retención declarada (se guarda y, si el mapeo lo dice, se concilia).
 * - `informativo`: importe que se guarda y se muestra, pero no lo suma ningún total ni tiene
 *   concepto en el mapeo (no entra al cruce). Ej.: el pago total (980) del 350.
 * - `base`: base sujeta a retención (no se guarda ni se concilia).
 * - `total`: se recalcula con `terminos` y se compara con lo impreso.
 * - `dato`: encabezado, firmas o uso oficial (se guarda solo si `guardar`).
 */
export type TipoRenglon = "valor" | "informativo" | "base" | "total" | "dato";

/** ¿El renglón lleva un importe en pesos (no un dato del encabezado ni una base)? */
export const esImporte = (r: Pick<RenglonDian, "tipo">): boolean => r.tipo === "valor" || r.tipo === "informativo" || r.tipo === "total";

export type TerminoTotal = readonly [renglon: number, signo: 1 | -1];

export type RenglonDian = {
  renglon: number;
  seccion: string;
  /** Concepto del renglón (las dos personas de un mismo concepto comparten su clave). */
  concepto: string;
  etiqueta: string;
  persona: PersonaRenglon;
  tipo: TipoRenglon;
  guardar: boolean;
  terminos?: readonly TerminoTotal[];
};

export type DefinicionFormulario = {
  codigo: CodigoFormularioDian;
  nombre: string;
  renglones: readonly RenglonDian[];
};

export function renglonDe(def: DefinicionFormulario, renglon: number): RenglonDian | undefined {
  return def.renglones.find((r) => r.renglon === renglon);
}

/** Renglones que se guardan (todo lo demás se descarta al leer). */
export function renglonesGuardados(def: DefinicionFormulario): number[] {
  return def.renglones.filter((r) => r.guardar).map((r) => r.renglon);
}

/** Renglones con importe que se guardan (valores, informativos y totales; no los datos del encabezado). */
export function renglonesConImporte(def: DefinicionFormulario): number[] {
  return def.renglones.filter((r) => r.guardar && esImporte(r)).map((r) => r.renglon);
}

export function aCentavos(valor: number): number {
  return Math.round(valor * 100);
}

export type ControlTotal = {
  renglon: number;
  etiqueta: string;
  /** Lo que da la fórmula con los renglones leídos. */
  calculado: number;
  /** Lo que trae impreso el formulario (0 si el renglón vino vacío). */
  impreso: number;
  cuadra: boolean;
};

/**
 * Recalcula cada total con los valores leídos y lo compara con el impreso. Un renglón sin
 * valor cuenta como 0, igual que en el formulario. Los totales se evalúan en orden, así que
 * un total que usa otro (136 usa 130) toma el IMPRESO de ese otro: cada control mide una
 * sola suma, y un error se ve en el renglón donde ocurre.
 */
export function controlarTotales(def: DefinicionFormulario, valores: ReadonlyMap<number, number>): ControlTotal[] {
  const valor = (r: number) => aCentavos(valores.get(r) ?? 0);
  return def.renglones
    .filter((r) => r.tipo === "total" && r.terminos)
    .map((r) => {
      const calculado = (r.terminos ?? []).reduce((suma, [renglon, signo]) => suma + signo * valor(renglon), 0);
      const impreso = valor(r.renglon);
      return { renglon: r.renglon, etiqueta: r.etiqueta, calculado: calculado / 100, impreso: impreso / 100, cuadra: calculado === impreso };
    });
}

/** Valor de un total calculado con los renglones dados (para las vistas acumuladas). */
export function calcularTotal(def: DefinicionFormulario, renglon: number, valores: ReadonlyMap<number, number>): number {
  const r = renglonDe(def, renglon);
  if (!r?.terminos) return valores.get(renglon) ?? 0;
  const centavos = r.terminos.reduce((suma, [termino, signo]) => suma + signo * aCentavos(valores.get(termino) ?? 0), 0);
  return centavos / 100;
}
