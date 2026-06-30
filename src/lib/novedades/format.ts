// Helpers PUROS del módulo de Novedades (sin React, sin Prisma, sin BD):
// formato del changelog / control de versiones. Determinista y testeable en
// aislamiento (ver format.test.ts). La UI (page/cliente) y el seed los reusan.

// Tonos válidos del componente Chip (src/components/ui.tsx).
export type Tono = "ok" | "warn" | "err" | "ink" | "blue" | "ai";

export const TIPOS_CAMBIO = ["nueva", "mejora", "correccion", "seguridad"] as const;
export type TipoCambio = (typeof TIPOS_CAMBIO)[number];

export const ESTADOS_FUNCIONALIDAD = ["disponible", "en_desarrollo", "planeada"] as const;
export type EstadoFuncionalidad = (typeof ESTADOS_FUNCIONALIDAD)[number];

export const ESTADOS_VERSION = ["borrador", "publicada"] as const;
export type EstadoVersion = (typeof ESTADOS_VERSION)[number];

const TIPO_LABEL: Record<TipoCambio, string> = {
  nueva: "Nueva funcionalidad",
  mejora: "Mejora",
  correccion: "Corrección",
  seguridad: "Seguridad",
};
const TIPO_TONE: Record<TipoCambio, Tono> = {
  nueva: "blue",
  mejora: "ok",
  correccion: "warn",
  seguridad: "err",
};

const ESTADO_FUNC_LABEL: Record<EstadoFuncionalidad, string> = {
  disponible: "Disponible",
  en_desarrollo: "En desarrollo",
  planeada: "Planeada",
};
const ESTADO_FUNC_TONE: Record<EstadoFuncionalidad, Tono> = {
  disponible: "ok",
  en_desarrollo: "warn",
  planeada: "ink",
};

const ESTADO_VERSION_LABEL: Record<EstadoVersion, string> = {
  borrador: "Borrador",
  publicada: "Publicada",
};
const ESTADO_VERSION_TONE: Record<EstadoVersion, Tono> = {
  borrador: "ink",
  publicada: "ok",
};

export function etiquetaTipo(tipo: string): string {
  return TIPO_LABEL[tipo as TipoCambio] ?? tipo;
}
export function toneDeTipo(tipo: string): Tono {
  return TIPO_TONE[tipo as TipoCambio] ?? "ink";
}
export function etiquetaEstadoFuncionalidad(estado: string): string {
  return ESTADO_FUNC_LABEL[estado as EstadoFuncionalidad] ?? estado;
}
export function toneDeEstadoFuncionalidad(estado: string): Tono {
  return ESTADO_FUNC_TONE[estado as EstadoFuncionalidad] ?? "ink";
}
export function etiquetaEstadoVersion(estado: string): string {
  return ESTADO_VERSION_LABEL[estado as EstadoVersion] ?? estado;
}
export function toneDeEstadoVersion(estado: string): Tono {
  return ESTADO_VERSION_TONE[estado as EstadoVersion] ?? "ink";
}

/**
 * Divide la guía "cómo operar" (texto multilínea) en PASOS: una línea = un paso.
 * Recorta espacios, descarta líneas vacías y elimina marcadores de lista
 * iniciales ("1.", "2)", "-", "*", "•") para numerarlos limpio en un <ol>.
 */
export function parsePasos(howTo: string | null | undefined): string[] {
  if (!howTo) return [];
  return howTo
    .split(/\r?\n/)
    .map((linea) => linea.trim().replace(/^(\d+[.)]|[-*•])\s+/, "").trim())
    .filter((linea) => linea.length > 0);
}

/** Fecha efectiva de una versión en epoch ms, base del orden cronológico. En las
 * versiones autogeneradas `dev-AAAA-MM-DD` es la fecha del nombre (la de sus
 * cambios, no la de cuándo corrió el volcado); en el resto, la de publicación si
 * existe y, si no, la de registro. 0 si no parsea. */
function fechaEfectivaVersion(v: {
  number: string;
  releasedAt: string | null;
  createdAt: string;
}): number {
  const dev = /^dev-(\d{4}-\d{2}-\d{2})$/.exec(v.number);
  const t = new Date(dev ? dev[1] : (v.releasedAt ?? v.createdAt)).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Ordena las versiones de la MÁS RECIENTE a la más antigua por fecha efectiva
 * (ver `fechaEfectivaVersion`), descendente. A igualdad de fecha respeta el
 * `order` manual del admin y, por último, `id` (ambos desc). Así las versiones
 * autogeneradas (sin `order`) quedan en su lugar cronológico y no siempre al
 * final. NO muta el arreglo de entrada.
 */
export function ordenarVersiones<
  T extends {
    number: string;
    order: number;
    id: number;
    releasedAt: string | null;
    createdAt: string;
  },
>(versiones: readonly T[]): T[] {
  return [...versiones].sort(
    (a, b) => fechaEfectivaVersion(b) - fechaEfectivaVersion(a) || b.order - a.order || b.id - a.id,
  );
}

/**
 * ¿`route` es una ruta interna segura para un <Link>? Debe ser absoluta
 * (empezar con "/"), sin "//" inicial (protocolo-relativa) ni dominio/esquema.
 * Evita open-redirect / enlaces externos desde el botón "Probar funcionalidad".
 */
export function esRutaInternaSegura(route: string | null | undefined): route is string {
  if (!route) return false;
  return /^\/(?!\/)[A-Za-z0-9/_-]*$/.test(route);
}

/** Conteo de cambios por tipo (para el resumen del encabezado de versión). */
export function contarPorTipo(
  cambios: readonly { type: string }[],
): Record<TipoCambio, number> {
  const base: Record<TipoCambio, number> = { nueva: 0, mejora: 0, correccion: 0, seguridad: 0 };
  for (const c of cambios) {
    if ((TIPOS_CAMBIO as readonly string[]).includes(c.type)) base[c.type as TipoCambio] += 1;
  }
  return base;
}
