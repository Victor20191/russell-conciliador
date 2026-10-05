// QUÉ TRAE CADA ARCHIVO de un cargue de Activos fijos: el costo, la depreciación o las dos cosas.
//
// La cédula compara por grupo de activo el costo contra la 15## y la depreciación acumulada contra
// su 1592##. Unos ERP sacan las dos columnas en el mismo reporte y otros imprimen dos archivos: el
// listado de activos por un lado y la depreciación por otro. En el segundo caso la columna de valor
// del archivo de depreciación NO es costo, y leída como tal inflaría el activo y dejaría la
// depreciación en cero: dos descuadres del mismo tamaño y de signo contrario.
//
// Por eso la carga pregunta SIEMPRE qué trae el archivo. Es del CARGUE, no del formato: un mismo
// patrón sirve para los dos reportes, así que la respuesta nunca se guarda en el perfil ni en el
// patrón. El segundo archivo se agrega a la misma versión del período («Agregar archivo»).
//
// Puro y sin dependencias del motor: lo usan la transformación, la acción y las pantallas.

export const CONTENIDOS_ACTIVOS = ["ambos", "costo", "depreciacion"] as const;
export type ContenidoActivos = (typeof CONTENIDOS_ACTIVOS)[number];

export const INFO_CONTENIDO_ACTIVOS: Record<ContenidoActivos, { rotulo: string; opcion: string; ayuda: string }> = {
  ambos: {
    rotulo: "Costo y depreciación",
    opcion: "Costo y depreciación acumulada",
    ayuda: "El archivo trae las dos columnas: el costo del activo y su depreciación acumulada.",
  },
  costo: {
    rotulo: "Solo costo",
    opcion: "Solo el costo de los activos",
    ayuda: "La depreciación llega en otro archivo (o no se concilia): este cargue deja esa columna en cero.",
  },
  depreciacion: {
    rotulo: "Solo depreciación",
    opcion: "Solo la depreciación acumulada",
    ayuda: "El valor de cada fila es depreciación, no costo: va a la columna de depreciación de la cédula, contra la 1592 del activo.",
  },
};

export function esContenidoActivos(v: unknown): v is ContenidoActivos {
  return typeof v === "string" && (CONTENIDOS_ACTIVOS as readonly string[]).includes(v);
}

/** Marca que lleva cada fila de un archivo de SOLO depreciación, para no contarla como costo. */
export const MARCA_SOLO_DEPRECIACION = "_soloDepreciacion";

/**
 * ¿Esta fila trae depreciación en vez de costo? (la marca la escribe la lectura del archivo). Las
 * celdas de una fila son texto o número, así que la marca se guarda como 1 y se lee tolerante.
 */
export function filaEsSoloDepreciacion(datos: Record<string, unknown> | null | undefined): boolean {
  const v = datos?.[MARCA_SOLO_DEPRECIACION];
  return v === 1 || v === true || v === "1";
}

/**
 * Qué trae el cargue completo, leído de sus filas: si alguna vino de un archivo de solo
 * depreciación y si alguna trae costo. Sirve para avisar en la cédula cuando falta un lado.
 */
export function contenidoDelCargue(
  filas: readonly { valor: number; datos?: Record<string, unknown> | null; imputable?: boolean | null }[],
): { conCosto: boolean; conDepreciacion: boolean } {
  let conCosto = false;
  let conDepreciacion = false;
  for (const f of filas) {
    if (f.imputable === false) continue;
    if (filaEsSoloDepreciacion(f.datos)) {
      if (f.valor !== 0) conDepreciacion = true;
      continue;
    }
    if (f.valor !== 0) conCosto = true;
    const dep = f.datos?.depreciacion;
    if (typeof dep === "number" && dep !== 0) conDepreciacion = true;
  }
  return { conCosto, conDepreciacion };
}

/**
 * Aviso para la cédula cuando el cargue trae un solo lado: la diferencia que se ve no es un
 * faltante del cliente, es que todavía falta el otro archivo. No bloquea nada.
 */
export function avisoContenidoIncompleto(c: { conCosto: boolean; conDepreciacion: boolean }): string | null {
  if (c.conCosto && c.conDepreciacion) return null;
  if (c.conCosto) return "Este cargue solo trae el COSTO de los activos: la columna de depreciación del módulo está en cero. Agrega el archivo de la depreciación a esta misma versión para que la cédula compare el neto.";
  if (c.conDepreciacion) return "Este cargue solo trae la DEPRECIACIÓN: la columna de costo del módulo está en cero. Agrega el archivo de los activos a esta misma versión para que la cédula compare el neto.";
  return null;
}
