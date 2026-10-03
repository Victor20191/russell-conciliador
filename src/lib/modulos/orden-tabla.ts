// ORDEN por columna de las tablas de módulos (puro, sin BD ni UI): el detalle del borrador, el
// del cargue y el Consolidado. Mismo criterio en los tres y en los dos lados (el servidor ordena
// las tablas que pagina; el navegador, las que ya tiene enteras).
//
// Texto: alfabético español con `Intl.Collator` —«ñ» después de «n», «á» junto a «a»— y con
// `numeric` para que «10» vaya después de «9» y no entre «1» y «2» (los códigos de concepto de
// Nómina son números escritos como texto). Numérico: por valor. Los vacíos van SIEMPRE al final,
// suban o bajen: una fila sin dato no es «la más pequeña», es una fila sin dato.

export type DireccionOrden = "asc" | "desc";

/** Columna por la que se ordena y hacia dónde. `null` = el orden natural de la tabla. */
export type OrdenTabla = { columna: string; direccion: DireccionOrden } | null;

/** Un clic en el encabezado: ascendente → descendente → sin orden. */
export function alternarOrden(actual: OrdenTabla, columna: string): OrdenTabla {
  if (!actual || actual.columna !== columna) return { columna, direccion: "asc" };
  return actual.direccion === "asc" ? { columna, direccion: "desc" } : null;
}

const colador = new Intl.Collator("es-CO", { numeric: true, sensitivity: "base" });

const vacio = (v: unknown): boolean => v == null || (typeof v === "string" && v.trim() === "") || (typeof v === "number" && !Number.isFinite(v));

/** Compara dos valores de una columna de TEXTO (vacíos al final). */
export function compararTexto(a: unknown, b: unknown): number {
  if (vacio(a) || vacio(b)) return vacio(a) && vacio(b) ? 0 : vacio(a) ? 1 : -1;
  return colador.compare(String(a), String(b));
}

/** Compara dos valores de una columna NUMÉRICA (vacíos y no numéricos al final). */
export function compararNumero(a: unknown, b: unknown): number {
  const x = typeof a === "number" ? a : Number(a);
  const y = typeof b === "number" ? b : Number(b);
  const malA = vacio(a) || !Number.isFinite(x);
  const malB = vacio(b) || !Number.isFinite(y);
  if (malA || malB) return malA && malB ? 0 : malA ? 1 : -1;
  return x - y;
}

/**
 * Ordena una copia de las filas. Es ESTABLE: dos filas que empatan conservan el orden que traían
 * (el del archivo), así que ordenar por una columna repetida no baraja lo demás. Los vacíos
 * quedan al final en ambas direcciones.
 */
export function ordenarFilas<T>(
  filas: readonly T[],
  orden: OrdenTabla,
  obtenerValor: (fila: T, columna: string) => unknown,
  esNumerica: (columna: string) => boolean,
): T[] {
  if (!orden) return [...filas];
  const comparar = esNumerica(orden.columna) ? compararNumero : compararTexto;
  const signo = orden.direccion === "desc" ? -1 : 1;
  return [...filas]
    .map((fila, i) => ({ fila, i, valor: obtenerValor(fila, orden.columna) }))
    .sort((a, b) => {
      // Un vacío contra un dato no cambia de lado al invertir: siempre va al final.
      if (vacio(a.valor) !== vacio(b.valor)) return vacio(a.valor) ? 1 : -1;
      return comparar(a.valor, b.valor) * signo || a.i - b.i;
    })
    .map((x) => x.fila);
}

/** Flecha del encabezado: la de la columna ordenada, o ninguna. */
export function flechaOrden(orden: OrdenTabla, columna: string): "↑" | "↓" | null {
  if (!orden || orden.columna !== columna) return null;
  return orden.direccion === "asc" ? "↑" : "↓";
}

/** Texto del `title` del encabezado, para que el clic diga qué va a hacer. */
export function tituloOrden(orden: OrdenTabla, columna: string, numerica: boolean): string {
  const ascendente = numerica ? "de menor a mayor" : "de la A a la Z";
  const descendente = numerica ? "de mayor a menor" : "de la Z a la A";
  if (!orden || orden.columna !== columna) return `Ordenar ${ascendente}`;
  return orden.direccion === "asc" ? `Ordenar ${descendente}` : "Quitar el orden";
}

/** Valida lo que llega del navegador a una Server Action (columna conocida y dirección válida). */
export function normalizarOrden(entrada: unknown, columnasValidas: readonly string[]): OrdenTabla {
  if (!entrada || typeof entrada !== "object") return null;
  const { columna, direccion } = entrada as { columna?: unknown; direccion?: unknown };
  if (typeof columna !== "string" || !columnasValidas.includes(columna)) return null;
  return { columna, direccion: direccion === "desc" ? "desc" : "asc" };
}
