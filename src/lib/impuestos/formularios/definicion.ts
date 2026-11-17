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

export type CodigoFormularioDian = "300" | "350" | "490" | "2593";

/** Persona del renglón: las dos columnas del 350 o un solo valor. */
export type PersonaRenglon = "juridica" | "natural" | "unica";

/**
 * - `valor`: retención declarada (se guarda y, si el mapeo lo dice, se concilia).
 * - `informativo`: importe que se guarda y se muestra, pero no lo suma ningún total ni tiene
 *   concepto en el mapeo (no entra al cruce). Ej.: el pago total (980) del 350.
 * - `base`: base sujeta a retención (no se guarda ni se concilia).
 * - `total`: se recalcula con `terminos` y se compara con lo impreso.
 * - `dato`: encabezado, firmas o uso oficial (se guarda solo si `guardar`).
 * - `calculado`: no viene impreso ni se lee ni se guarda; se calcula con `terminos` y se muestra
 *   (en el 2593, el total de los valores a pagar, 76 a 79, que paga el 490). No tiene control.
 */
export type TipoRenglon = "valor" | "informativo" | "base" | "total" | "dato" | "calculado";

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
  /** Total que la DIAN escribe en cero si da negativo (82, 83, 86, 88 y 89 del 300). */
  pisoCero?: boolean;
  /**
   * Renglón que, si tiene valor, deja este total en cero sin sumar sus términos (en el 300, el 89 es
   * cero cuando el total saldo a pagar, 88, tiene valor).
   */
  ceroSi?: number;
  /** Cómo se nombra el renglón en las tablas cuando no es una casilla del formulario («76 a 79»). */
  rotulo?: string;
};

/**
 * Cuadre entre renglones que el formulario pide pero no es un total impreso (en el 300,
 * 90 + 91 + 92 = 89). No bloquea la confirmación: avisa. Con `pisoCero`, la suma se toma en cero si
 * da negativo (los «resultado positivo de…» del 2593).
 */
export type ValidacionFormulario = { clave: string; etiqueta: string; terminos: readonly TerminoTotal[]; contra: number; pisoCero?: boolean };

export type DefinicionFormulario = {
  codigo: CodigoFormularioDian;
  nombre: string;
  renglones: readonly RenglonDian[];
  validaciones?: readonly ValidacionFormulario[];
  /** Cómo es su número (renglón 4). Sin él: los dos primeros dígitos del código y 13 dígitos (350, 300, 490). */
  numero?: { prefijo: string; digitos: number };
  /** Casillas de la corrección: código (1 = corrección) y número del formulario que corrige. Sin él, 25 y 26. */
  correccion?: { codigo: number; anterior: number };
  /** La declaración no trae sello con la fecha de presentación (el 2593): la fecha no se exige. */
  sinSello?: boolean;
};

export function renglonDe(def: DefinicionFormulario, renglon: number): RenglonDian | undefined {
  return def.renglones.find((r) => r.renglon === renglon);
}

/** Prefijo y cantidad de dígitos del número de un formulario (350 → 35 y 13; 2593 → 2593 y 14). */
export function reglaNumero(def: Pick<DefinicionFormulario, "codigo" | "numero">): { prefijo: string; digitos: number } {
  return def.numero ?? { prefijo: def.codigo.slice(0, 2), digitos: 13 };
}

/** ¿El número tiene la forma de un formulario de esta definición (solo dígitos, su prefijo y su largo)? */
export function numeroFormularioValido(def: Pick<DefinicionFormulario, "codigo" | "numero">, numero: string | null | undefined): boolean {
  const { prefijo, digitos } = reglaNumero(def);
  return numero != null && numero.length === digitos && /^\d+$/.test(numero) && numero.startsWith(prefijo);
}

/** Casillas de la corrección (25 y 26 en el 350 y el 300; 24 y 25 en el 2593). */
export function casillasCorreccion(def: Pick<DefinicionFormulario, "correccion">): { codigo: number; anterior: number } {
  return def.correccion ?? { codigo: 25, anterior: 26 };
}

/** Cómo se nombra un renglón en una tabla: su número o el rótulo del calculado («76 a 79»). */
export function rotuloRenglon(def: DefinicionFormulario, renglon: number): string {
  return renglonDe(def, renglon)?.rotulo ?? String(renglon);
}

/** Renglones que muestran las vistas: los que se guardan con importe y los calculados. */
export function renglonesVisibles(def: DefinicionFormulario): number[] {
  return def.renglones.filter((r) => (r.guardar && esImporte(r)) || r.tipo === "calculado").map((r) => r.renglon);
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

/** Σ con signo de los términos, en centavos; con piso cero si el renglón lo pide. */
function sumaTerminos(r: Pick<RenglonDian, "terminos" | "pisoCero" | "ceroSi">, valor: (renglon: number) => number): number {
  if (r.ceroSi != null && valor(r.ceroSi) !== 0) return 0;
  const suma = (r.terminos ?? []).reduce((s, [renglon, signo]) => s + signo * valor(renglon), 0);
  return r.pisoCero ? Math.max(0, suma) : suma;
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
      const calculado = sumaTerminos(r, valor);
      const impreso = valor(r.renglon);
      return { renglon: r.renglon, etiqueta: r.etiqueta, calculado: calculado / 100, impreso: impreso / 100, cuadra: calculado === impreso };
    });
}

/** Valor de un total calculado con los renglones dados (para las vistas acumuladas). */
export function calcularTotal(def: DefinicionFormulario, renglon: number, valores: ReadonlyMap<number, number>): number {
  const r = renglonDe(def, renglon);
  if (!r?.terminos) return valores.get(renglon) ?? 0;
  const centavos = sumaTerminos(r, (termino) => aCentavos(valores.get(termino) ?? 0));
  return centavos / 100;
}

/**
 * El valor de un renglón tal como se guardó; el de un renglón `calculado` (que no se guarda) sale de
 * su fórmula. Los demás totales no se recalculan aquí: para eso está `calcularTotal`.
 */
export function valorRenglon(def: DefinicionFormulario, renglon: number, valores: ReadonlyMap<number, number>): number {
  return renglonDe(def, renglon)?.tipo === "calculado" ? calcularTotal(def, renglon, valores) : (valores.get(renglon) ?? 0);
}

export type ControlValidacion = { clave: string; etiqueta: string; calculado: number; contra: number; renglonContra: number; cuadra: boolean };

/** Las validaciones del formulario (cuadres que avisan) con los valores leídos. */
export function controlarValidaciones(def: DefinicionFormulario, valores: ReadonlyMap<number, number>): ControlValidacion[] {
  const valor = (r: number) => aCentavos(valores.get(r) ?? 0);
  return (def.validaciones ?? []).map((v) => {
    const suma = v.terminos.reduce((s, [renglon, signo]) => s + signo * valor(renglon), 0);
    const calculado = v.pisoCero ? Math.max(0, suma) : suma;
    const contra = valor(v.contra);
    return { clave: v.clave, etiqueta: v.etiqueta, calculado: calculado / 100, contra: contra / 100, renglonContra: v.contra, cuadra: calculado === contra };
  });
}
