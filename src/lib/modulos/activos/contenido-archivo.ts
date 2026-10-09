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

/**
 * Con «Cargar» (no «Agregar archivo»), un archivo que trae UN SOLO lado sobre un período que ya
 * tiene cargue es casi siempre la otra mitad de ese cargue: crear una versión nueva solo con la
 * depreciación reemplazaría a los activos, y al revés. Se ofrece agregarlo cuando de verdad
 * completa lo que falta; `aviso` explica por qué no se puede cuando no se puede.
 *
 * No se ofrece si el archivo trae las dos cosas (es un cargue completo, que sí reemplaza) ni si el
 * vigente ya tiene ese lado (sería duplicarlo).
 */
export function ofertaAnexoActivos(
  contenido: ContenidoActivos | null,
  vigente: { version: number; periodo: string; congelado: boolean; enFirme: boolean; lados: { conCosto: boolean; conDepreciacion: boolean } | null } | null,
): { ofrecer: boolean; aviso: string | null } {
  if (!contenido || !vigente) return { ofrecer: false, aviso: null };
  if (contenido === "ambos") return { ofrecer: false, aviso: null };
  const lados = vigente.lados;
  // Sin saber qué trae el vigente (cargue anterior a este dato) se ofrece igual: completar es lo
  // más probable y el usuario decide; duplicar se vería en el acto en la cédula.
  const completa = lados == null
    || (contenido === "costo" ? !lados.conCosto : !lados.conDepreciacion);
  if (!completa) return { ofrecer: false, aviso: null };
  const destino = `la v${vigente.version} de ${vigente.periodo}`;
  if (vigente.enFirme) {
    return { ofrecer: false, aviso: `La conciliación de ${vigente.periodo} está en firme: no se le pueden agregar archivos. Desbloquéala primero si este archivo es parte del cargue.` };
  }
  if (vigente.congelado) {
    return { ofrecer: false, aviso: `${destino[0].toUpperCase()}${destino.slice(1)} está congelada: este archivo creará una versión nueva que la reemplaza.` };
  }
  return { ofrecer: true, aviso: null };
}

/** Lo que el analista declaró para ESTE archivo, tal como quedó en el spec del lote. */
export function leerContenidoActivosDeLote(specJson: unknown): ContenidoActivos | null {
  if (specJson == null || typeof specJson !== "object") return null;
  const v = (specJson as Record<string, unknown>).contenidoActivos;
  return esContenidoActivos(v) ? v : null;
}
