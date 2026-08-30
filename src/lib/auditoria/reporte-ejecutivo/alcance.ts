// Alcance del reporte para gerencia: SOLO se cuenta y se cuenta lo que ya está
// publicado para todos los usuarios y no sigue en desarrollo.
//
// Tres filtros, todos PUROS (sin BD ni IA):
//  1) Novedades: se descarta todo cambio cuyo estado de funcionalidad no sea
//     «disponible» (en_desarrollo / planeada) o cuyo módulo no esté publicado.
//  2) Uso: se descartan las acciones de bitácora de módulos no publicados
//     (p. ej. Perfiles de carga, Prompts de IA, Parámetros, Novedades), para no
//     mencionarle al cliente actividad de herramientas que aún no puede operar.
//  3) Navegación: se conservan únicamente rutas de familias operativas cuyo
//     módulo está publicado; rutas administrativas o desconocidas no se agrupan
//     como «Otras acciones».
//
// Qué está publicado lo decide `enabledForNonAdmins` del catálogo/BD de
// `PlatformModule`; el llamador lo resuelve y pasa el conjunto de claves.

import type { CambioNovedadContexto } from "./adopcion";
import {
  FAMILIAS_OPERATIVAS,
  familiaDesdeRuta,
  type ConteoNavegacionRuta,
  type EventoAuditoria,
  type FamiliaProceso,
} from "./metricas";

/** Módulo de plataforma «dueño» de cada familia de proceso (null = indeterminado). */
export const MODULO_POR_FAMILIA: Record<FamiliaProceso, string | null> = {
  balance: "balance",
  inventarios: "modulos_datos",
  conciliaciones: "conciliaciones",
  dian: "dian",
  clientes: "clientes",
  mapeo: "mapeo",
  usuarios: "usuarios",
  administracion: null,
  otros: null,
};

/**
 * Rutas conocidas → módulo de plataforma. Las más específicas van primero para
 * no confundir configuración con el módulo operativo de igual nombre.
 */
const MODULO_POR_RUTA: Array<[string, string]> = [
  ["/config/reportes-ejecutivos", "auditoria"],
  ["/config/publicacion-modulos", "publicacion_modulos"],
  ["/config/conceptos-nomina", "modulos_datos"],
  ["/config/perfiles-carga", "perfiles_carga"],
  ["/config/prevalidador", "parametros"],
  ["/config/parametros", "parametros"],
  ["/config/prompts", "prompts"],
  ["/config/permisos", "roles"],
  ["/config/modulos", "modulos"],
  ["/config/clientes", "clientes"],
  ["/config/maestros", "maestros"],
  ["/config/mapeo", "mapeo"],
  ["/config/dian", "mapeos_dian"],
  ["/config/usuarios", "usuarios"],
  ["/config/entorno", "entorno"],
  ["/config/soporte", "soporte"],
  ["/conciliacion", "conciliaciones"],
  ["/modulos", "modulos_datos"],
  ["/balance", "balance"],
  ["/auditoria", "auditoria"],
  ["/estructura", "estructura"],
  ["/novedades", "novedades"],
  ["/reportes", "soporte"],
  ["/soporte", "soporte"],
  ["/dashboard", "dashboard"],
  ["/dian", "dian"],
];

function normalizarRuta(ruta: string): string {
  return ruta.trim().toLowerCase().split(/[?#]/, 1)[0]?.replace(/\/+$/, "") || "/";
}

/** Módulo dueño de una navegación; null cuando la ruta no pertenece al catálogo conocido. */
export function moduloDeNavegacion(ruta: string): string | null {
  const path = normalizarRuta(ruta);
  for (const [prefijo, modulo] of MODULO_POR_RUTA) {
    if (path === prefijo || path.startsWith(`${prefijo}/`)) return modulo;
  }
  return null;
}

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

export type ResultadoFiltroNavegaciones = {
  navegaciones: ConteoNavegacionRuta[];
  descartadas: number;
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

/** Conserva únicamente visitas de familias operativas disponibles para todos. */
export function filtrarNavegacionesPublicadas(params: {
  navegaciones: readonly ConteoNavegacionRuta[];
  filtro: FiltroPublicacion;
}): ResultadoFiltroNavegaciones {
  const excluidos = new Set<string>();
  const navegaciones: ConteoNavegacionRuta[] = [];
  let descartadas = 0;

  for (const navegacion of params.navegaciones) {
    const clave = moduloDeNavegacion(navegacion.ruta);
    const familia = familiaDesdeRuta(navegacion.ruta);
    if (
      clave &&
      familia &&
      FAMILIAS_OPERATIVAS.includes(familia) &&
      moduloPublicadoParaTodos(clave, params.filtro)
    ) {
      navegaciones.push(navegacion);
      continue;
    }
    descartadas += navegacion.total;
    if (clave && !moduloPublicadoParaTodos(clave, params.filtro)) excluidos.add(clave);
  }

  return {
    navegaciones,
    descartadas,
    modulosExcluidos: [...excluidos].sort((a, b) => a.localeCompare(b, "es")),
  };
}

/** Estados de funcionalidad que SÍ se le cuentan al cliente. */
export const ESTADO_FUNCIONALIDAD_PUBLICADA = "disponible";

export type ResultadoFiltroCambios<T> = {
  cambios: T[];
  enDesarrollo: number;
  moduloNoPublicado: number;
  /** Cambios descartados porque su `moduleKey` no resuelve a un módulo de la plataforma. */
  sinModulo: number;
};

/**
 * Conserva únicamente los cambios de Novedades ya disponibles (no en desarrollo
 * ni planeados) cuyo módulo está publicado para todos los usuarios.
 *
 * A diferencia del uso, aquí el criterio es CERRADO: un cambio que no se puede
 * ubicar en un módulo de la plataforma tampoco se le cuenta al cliente. Suelen
 * ser mejoras internas o técnicas (notificaciones, refactors) que solo llenaban
 * el grupo «No se puede medir» sin decirle nada a gerencia.
 */
export function filtrarCambiosPublicados<T extends Pick<CambioNovedadContexto, "modulo" | "estadoFuncionalidad">>(params: {
  cambios: readonly T[];
  filtro: FiltroPublicacion;
  clavesConocidas?: Iterable<string>;
}): ResultadoFiltroCambios<T> {
  const cambios: T[] = [];
  let enDesarrollo = 0;
  let moduloNoPublicado = 0;
  let sinModulo = 0;

  for (const cambio of params.cambios) {
    if (cambio.estadoFuncionalidad?.trim().toLowerCase() !== ESTADO_FUNCIONALIDAD_PUBLICADA) {
      enDesarrollo += 1;
      continue;
    }
    const clave = moduloPlataformaDeClave(cambio.modulo, params.clavesConocidas);
    if (!clave) {
      sinModulo += 1;
      continue;
    }
    if (!moduloPublicadoParaTodos(clave, params.filtro)) {
      moduloNoPublicado += 1;
      continue;
    }
    cambios.push(cambio);
  }

  return { cambios, enDesarrollo, moduloNoPublicado, sinModulo };
}
