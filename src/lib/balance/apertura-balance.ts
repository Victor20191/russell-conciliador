/**
 * APERTURA del balance de comprobación: ¿el archivo viene abierto POR TERCERO
 * (cada cuenta desglosada por NIT/cédula) o POR CUENTA (una fila por cuenta)?
 *
 * Es un dato DECLARADO por quien carga —no una heurística—: se pregunta en el
 * borrador y es obligatorio antes de promoverlo, y viaja al balance oficial para
 * que las versiones del cliente digan siempre con qué informe se trabajó.
 *
 * NO altera el cálculo ni la consolidación de terceros: eso lo sigue decidiendo la
 * detección automática de `terceros.ts` (que solo sugiere el valor inicial). Aquí
 * se guarda trazabilidad del origen del archivo, no una instrucción de proceso.
 *
 * Módulo PURO (sin BD ni `server-only`): lo comparten la Server Action, los
 * loaders RSC y las tablas del cliente.
 */
export type AperturaBalance = "cuenta" | "tercero";

export const APERTURAS_BALANCE = [
  {
    valor: "cuenta",
    etiqueta: "Por cuenta",
    descripcion: "Una fila por cuenta contable, sin desglose de terceros.",
  },
  {
    valor: "tercero",
    etiqueta: "Por terceros",
    descripcion: "Cada cuenta viene desglosada por tercero (NIT/cédula).",
  },
] as const satisfies ReadonlyArray<{
  valor: AperturaBalance;
  etiqueta: string;
  descripcion: string;
}>;

/** Texto que se muestra cuando el cargue es anterior a este dato (o no se declaró). */
export const APERTURA_SIN_DECLARAR = "—";

/**
 * Normaliza cualquier entrada (formulario, columna legada de BD) a una apertura
 * válida o a `null`. Fail-closed: lo que no se reconoce NO se inventa.
 */
export function parsearApertura(valor: unknown): AperturaBalance | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim().toLowerCase();
  return v === "cuenta" || v === "tercero" ? v : null;
}

/** Etiqueta para pantallas y exportaciones. Sin dato declarado devuelve «—». */
export function etiquetaApertura(valor: unknown): string {
  const apertura = parsearApertura(valor);
  if (!apertura) return APERTURA_SIN_DECLARAR;
  return APERTURAS_BALANCE.find((o) => o.valor === apertura)!.etiqueta;
}

/**
 * Valor con el que se PRESELECCIONA el selector del borrador: lo que detectó la
 * lectura del archivo. El usuario puede cambiarlo; su elección es la que manda.
 */
export function aperturaSugerida(porTerceroDetectado: boolean): AperturaBalance {
  return porTerceroDetectado ? "tercero" : "cuenta";
}

/**
 * ¿La lectura vio DETALLE POR TERCERO en el archivo? Une las dos formas en que el
 * detalle puede llegar, que ninguna señal cubre sola:
 *
 *  - `porFilasDetectado` — el archivo trae el tercero como FILAS propias (NIT/cédula
 *    bajo la cuenta, o pegado al sufijo del código). Lo miden los detectores de
 *    `terceros.ts` sobre las filas crudas.
 *  - `filasTerceroSpec` — el archivo trae el tercero en una COLUMNA mapeada. Ahí no
 *    quedan filas de tercero que detectar: la transformación agrega por cuenta antes
 *    de persistir, y el único rastro es el detalle que la lectura apartó.
 *
 * Un balance por tercero de un ERP tipo SIIGO (columna Tercero) daba `false` con la
 * primera señal a solas, que es justo el caso donde la apertura importa.
 */
export function detectoDetallePorTercero(
  porFilasDetectado: boolean,
  filasTerceroSpec: number,
): boolean {
  return porFilasDetectado || filasTerceroSpec > 0;
}

/** Orden alfabético estable por etiqueta; los cargues sin dato van al final. */
export function compararApertura(a: unknown, b: unknown): number {
  const ea = parsearApertura(a);
  const eb = parsearApertura(b);
  if (ea === eb) return 0;
  if (!ea) return 1;
  if (!eb) return -1;
  return etiquetaApertura(ea).localeCompare(etiquetaApertura(eb), "es");
}
