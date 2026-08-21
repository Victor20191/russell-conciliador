// Alcance del reporte para gerencia: SOLO se cuenta y se cuenta lo que ya está
// publicado para todos los usuarios y no sigue en desarrollo.
//
// Dos filtros, ambos PUROS (sin BD ni IA):
//  1) Novedades: se descarta todo cambio cuyo estado de funcionalidad no sea
//     «disponible» (en_desarrollo / planeada) o cuyo módulo no esté publicado.
//  2) Uso: se descartan las acciones de bitácora de módulos no publicados
//     (p. ej. Perfiles de carga, Prompts de IA, Parámetros, Novedades), para no
//     mencionarle al cliente actividad de herramientas que aún no puede operar.
//
// Qué está publicado lo decide `enabledForNonAdmins` del catálogo/BD de
// `PlatformModule`; el llamador lo resuelve y pasa el conjunto de claves.

import type { CambioNovedadContexto } from "./adopcion";
import type { EventoAuditoria, FamiliaProceso } from "./metricas";

/** Módulo de plataforma «dueño» de cada familia de proceso (null = indeterminado). */
export const MODULO_POR_FAMILIA: Record<FamiliaProceso, string | null> = {
  balance: "balance",
  conciliaciones: "conciliaciones",
  dian: "dian",
  clientes: "clientes",
  mapeo: "mapeo",
  usuarios: "usuarios",
  administracion: null,
  otros: null,
};

/**
 * Acciones de bitácora cuyo módulo real NO coincide con su familia (o que la
 * familia no alcanza a distinguir). Se evalúa por prefijo, de más específico a
 * más general.
 */
const MODULO_POR_PREFIJO_ACCION: Array<[string, string]> = [
  ["GUARDÓ PERFIL de carga", "perfiles_carga"],
  ["GUARDÓ NOTAS de carga", "perfiles_carga"],
  ["GUARDÓ PREFERENCIAS de carga", "perfiles_carga"],
  ["ELIMINÓ PERFIL de carga", "perfiles_carga"],
  ["ELIMINÓ CORRECCIÓN de carga", "perfiles_carga"],
  ["LIMPIÓ CORRECCIONES de carga", "perfiles_carga"],
  ["EDITÓ PROMPT IA", "prompts"],
  ["RESTAURÓ PROMPT IA", "prompts"],
  ["EDITÓ UMBRAL", "parametros"],
  ["RESTAURÓ UMBRAL", "parametros"],
  ["CREÓ VERSIÓN", "novedades"],
  ["EDITÓ VERSIÓN", "novedades"],
  ["ELIMINÓ VERSIÓN", "novedades"],
  ["CREÓ CAMBIO", "novedades"],
  ["EDITÓ CAMBIO", "novedades"],
  ["ELIMINÓ CAMBIO", "novedades"],
  ["CAMBIÓ NIVEL DE ACCESO", "roles"],
  ["GENERÓ REPORTE IA", "auditoria"],
  ["REGISTRÓ ENVÍO DE REPORTE", "auditoria"],
  ["ELIMINÓ ENVÍO DE REPORTE", "auditoria"],
];

/** Alias frecuentes de `moduleKey` de Novedades → clave de módulo de plataforma. */
const ALIAS_MODULO: Array<[RegExp, string]> = [
  [/perfil(es)?[_\s-]*carga|carga[_\s-]*(de[_\s-]*)?balance/i, "perfiles_carga"],
  [/prompt/i, "prompts"],
  [/par[aá]metro|umbral/i, "parametros"],
  [/novedad|changelog|versi[oó]n/i, "novedades"],
  [/estructura|jerarqu[ií]a/i, "estructura"],
  [/publicaci[oó]n/i, "publicacion_modulos"],
  [/rol|permiso/i, "roles"],
  [/auditor[ií]a|bit[aá]cora/i, "auditoria"],
  [/balance/i, "balance"],
  [/concili/i, "conciliaciones"],
  [/dian|impuesto/i, "dian"],
  [/mapeo|cuenta/i, "mapeo"],
  [/cliente/i, "clientes"],
  [/maestro/i, "maestros"],
  [/usuario/i, "usuarios"],
  [/soporte|ayuda|ticket/i, "soporte"],
];

/** Resuelve el `moduleKey` de una novedad a una clave de módulo de plataforma. */
export function moduloPlataformaDeClave(
  moduleKey: string | null | undefined,
  clavesConocidas?: Iterable<string>,
): string | null {
  const k = moduleKey?.trim().toLowerCase();
  if (!k) return null;
  const conocidas = clavesConocidas ? new Set(clavesConocidas) : null;
  // Coincidencia exacta con una clave del catálogo.
  if (!conocidas || conocidas.has(k)) return k;
  for (const [re, clave] of ALIAS_MODULO) {
    if (re.test(k)) return clave;
  }
  return null;
}

/** Módulo de plataforma al que pertenece una acción de bitácora (null si no se puede afirmar). */
export function moduloDeEvento(
  evento: Pick<EventoAuditoria, "action" | "entity" | "detail">,
  familia: FamiliaProceso,
): string | null {
  const accion = evento.action.trim();
  for (const [prefijo, clave] of MODULO_POR_PREFIJO_ACCION) {
    if (accion === prefijo || accion.startsWith(prefijo)) return clave;
  }
  return MODULO_POR_FAMILIA[familia];
}

export type FiltroPublicacion = {
  /** Claves de módulo publicadas para todos los usuarios (no solo administradores). */
  modulosPublicados: ReadonlySet<string>;
};

/** true si el módulo está publicado; los módulos indeterminados NO se descartan. */
export function moduloPublicadoParaTodos(
  clave: string | null,
  filtro: FiltroPublicacion,
): boolean {
  if (!clave) return true;
  return filtro.modulosPublicados.has(clave);
}

export type ResultadoFiltroEventos = {
  eventos: EventoAuditoria[];
  descartados: number;
  /** Claves de módulo excluidas por no estar publicadas (orden alfabético). */
  modulosExcluidos: string[];
};

/**
 * Deja fuera del uso reportado las acciones de módulos que aún no están
 * publicados para todos los usuarios.
 */
export function filtrarEventosPublicados(params: {
  eventos: readonly EventoAuditoria[];
  clasificar: (evento: EventoAuditoria) => FamiliaProceso;
  filtro: FiltroPublicacion;
}): ResultadoFiltroEventos {
  const excluidos = new Set<string>();
  const eventos: EventoAuditoria[] = [];

  for (const evento of params.eventos) {
    const clave = moduloDeEvento(evento, params.clasificar(evento));
    if (moduloPublicadoParaTodos(clave, params.filtro)) {
      eventos.push(evento);
      continue;
    }
    if (clave) excluidos.add(clave);
  }

  return {
    eventos,
    descartados: params.eventos.length - eventos.length,
    modulosExcluidos: [...excluidos].sort((a, b) => a.localeCompare(b, "es")),
  };
}

/** Estados de funcionalidad que SÍ se le cuentan al cliente. */
export const ESTADO_FUNCIONALIDAD_PUBLICADA = "disponible";

export type ResultadoFiltroCambios<T> = {
  cambios: T[];
  enDesarrollo: number;
  moduloNoPublicado: number;
};

/**
 * Conserva únicamente los cambios de Novedades ya disponibles (no en desarrollo
 * ni planeados) cuyo módulo está publicado para todos los usuarios.
 */
export function filtrarCambiosPublicados<T extends Pick<CambioNovedadContexto, "modulo" | "estadoFuncionalidad">>(params: {
  cambios: readonly T[];
  filtro: FiltroPublicacion;
  clavesConocidas?: Iterable<string>;
}): ResultadoFiltroCambios<T> {
  const cambios: T[] = [];
  let enDesarrollo = 0;
  let moduloNoPublicado = 0;

  for (const cambio of params.cambios) {
    if (cambio.estadoFuncionalidad?.trim().toLowerCase() !== ESTADO_FUNCIONALIDAD_PUBLICADA) {
      enDesarrollo += 1;
      continue;
    }
    const clave = moduloPlataformaDeClave(cambio.modulo, params.clavesConocidas);
    if (!moduloPublicadoParaTodos(clave, params.filtro)) {
      moduloNoPublicado += 1;
      continue;
    }
    cambios.push(cambio);
  }

  return { cambios, enDesarrollo, moduloNoPublicado };
}
