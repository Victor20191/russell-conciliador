// El VALOR de la fila como FÓRMULA de varias columnas — puro, sin BD.
//
// SAP Business One no imprime el ingreso neto en una columna: es «Total sin Descuento» más los
// tres «Total Fletes» (y «Total Documento» = eso + «Total Impuestos»). Otro ERP puede tener otra
// suma. El usuario la arma al mapear como una lista de columnas con signo —nada de texto libre
// ni × ÷—, y el motor la evalúa fila por fila igual que si fuera una columna más: el resultado
// queda en `datos[rol del valor]` y los términos, en `datos._formula`, como evidencia.
import type { SpecModulo } from "./esquema";
export { CLAVE_FORMULA } from "../cartera/detalle-cartera";

export type TerminoFormula = { columna: number; signo: "+" | "-" };
/** Con una sola columna no hay fórmula: se mapea la columna. */
export const MINIMO_TERMINOS_FORMULA = 2;

const redondear = (v: number): number => Math.round(v * 100) / 100 + 0 || 0;

export function tieneValorFormula(spec: Pick<SpecModulo, "valorFormula">): spec is Pick<SpecModulo, "valorFormula"> & { valorFormula: TerminoFormula[] } {
  return (spec.valorFormula?.length ?? 0) >= MINIMO_TERMINOS_FORMULA;
}

/**
 * Sanea lo que llegue guardado (perfil, patrón, spec del navegador): solo términos con columna
 * entera ≥ 1 y signo válido, sin columnas repetidas. Devuelve `undefined` si no queda fórmula.
 */
export function sanearValorFormula(crudo: unknown): TerminoFormula[] | undefined {
  if (!Array.isArray(crudo)) return undefined;
  const vistas = new Set<number>();
  const salida: TerminoFormula[] = [];
  for (const t of crudo) {
    if (t == null || typeof t !== "object") continue;
    const columna = (t as { columna?: unknown }).columna;
    const signo = (t as { signo?: unknown }).signo;
    if (!Number.isInteger(columna) || (columna as number) < 1) continue;
    if (signo !== "+" && signo !== "-") continue;
    if (vistas.has(columna as number)) continue;
    vistas.add(columna as number);
    salida.push({ columna: columna as number, signo });
  }
  return salida.length > 0 ? salida : undefined;
}

/** Mensaje si la fórmula del spec no sirve; `null` si no hay fórmula o está bien formada. */
export function validarValorFormula(spec: Pick<SpecModulo, "valorFormula">, letra: (columna: number) => string): string | null {
  const formula = spec.valorFormula;
  if (!formula || formula.length === 0) return null;
  if (formula.length < MINIMO_TERMINOS_FORMULA) return "La fórmula del valor necesita al menos dos columnas; con una sola, mapea la columna.";
  const vistas = new Set<number>();
  for (const t of formula) {
    if (!Number.isInteger(t.columna) || t.columna < 1) return "La fórmula del valor tiene una columna sin elegir.";
    if (vistas.has(t.columna)) return `La fórmula del valor repite la columna ${letra(t.columna)}.`;
    vistas.add(t.columna);
  }
  return null;
}

/** Rótulo legible de un término: «M · Total sin Descuento», o «M» si la columna no tiene rótulo. */
export function claveTerminoFormula(columna: number, letra: (columna: number) => string, encabezado?: readonly unknown[]): string {
  const rotulo = String(encabezado?.[columna - 1] ?? "").replace(/\s+/g, " ").trim();
  return rotulo ? `${letra(columna)} · ${rotulo}` : letra(columna);
}

/**
 * La fórmula en una línea: «M + N + O + P» o, con rótulos, «Total sin Descuento + Total Fletes − …».
 * El primer término no lleva «+» delante; una resta va con «−».
 */
export function textoValorFormula(
  formula: readonly TerminoFormula[],
  letra: (columna: number) => string,
  encabezado?: readonly unknown[],
): string {
  return formula
    .map((t, i) => {
      const rotulo = encabezado ? String(encabezado[t.columna - 1] ?? "").replace(/\s+/g, " ").trim() : "";
      const nombre = rotulo || letra(t.columna);
      if (i === 0) return t.signo === "-" ? `−${nombre}` : nombre;
      return `${t.signo === "-" ? "−" : "+"} ${nombre}`;
    })
    .join(" ");
}

/**
 * Evalúa la fórmula en una fila. Una celda vacía o no numérica vale 0 (un flete que no aplica
 * viene en blanco, no en cero). `leer` decide cómo se lee cada celda (signo del archivo, divisa),
 * y `clave` cómo se rotula cada término en `datos._formula`. Cada término guarda su APORTE —con
 * el signo de la fórmula ya aplicado—, así la suma de `terminos` es exactamente `valor`.
 */
export function evaluarValorFormula(
  formula: readonly TerminoFormula[],
  leer: (columna: number) => number | null,
  clave: (columna: number) => string,
): { valor: number; terminos: Record<string, number>; algunDato: boolean } {
  let suma = 0;
  let algunDato = false;
  const terminos: Record<string, number> = {};
  for (const t of formula) {
    const leido = leer(t.columna);
    if (leido != null && leido !== 0) algunDato = true;
    const aporte = t.signo === "-" ? -(leido ?? 0) : (leido ?? 0);
    terminos[clave(t.columna)] = redondear(aporte);
    suma += aporte;
  }
  return { valor: redondear(suma), terminos, algunDato };
}
