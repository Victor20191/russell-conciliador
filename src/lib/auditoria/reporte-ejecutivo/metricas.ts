// Agregaciones puras de la bitácora de auditoría para el reporte ejecutivo de
// uso y adopción. Sin BD ni IA: recibe filas y produce la base factual.
import type { UsuariosActivos } from "./usuarios-activos";

export type FamiliaProceso =
  | "balance"
  | "modulos"
  | "conciliaciones"
  | "dian"
  | "clientes"
  | "mapeo"
  | "usuarios"
  | "administracion"
  | "otros";

export const ETIQUETA_FAMILIA: Record<FamiliaProceso, string> = {
  balance: "Balance de comprobación",
  // Los seis módulos (INV, AFI, CAR, CXP, ING, NOM) son un solo módulo de la
  // plataforma (`modulos_datos`): se miden juntos, como se publican.
  modulos: "Módulos de conciliación",
  conciliaciones: "Conciliaciones",
  dian: "Impuestos · DIAN",
  clientes: "Clientes",
  mapeo: "Mapeo de cuentas",
  usuarios: "Usuarios y estructura",
  administracion: "Administración de plataforma",
  otros: "Otras acciones",
};

/** Familias operativas que prioriza el resumen ejecutivo. */
export const FAMILIAS_OPERATIVAS: FamiliaProceso[] = [
  "balance",
  "modulos",
  "conciliaciones",
  "dian",
  "clientes",
  "mapeo",
];

export type EventoAuditoria = {
  user: string;
  action: string;
  entity: string;
  detail: string;
  clientId: number | null;
  createdAt: Date | string;
};

export type ConteoNombrado = {
  nombre: string;
  total: number;
  /**
   * Registros de la bitácora detrás de `total`. Solo viene cuando son más que las
   * operaciones, es decir, cuando la acción se registra una vez por fila y se
   * agrupó (ver `ACCIONES_POR_FILA`).
   */
  registros?: number;
};

export type ConteoUsuario = {
  usuario: string;
  /** Correo corporativo del usuario; null si el nombre de la bitácora no resuelve a una cuenta. */
  correo: string | null;
  total: number;
  porFamilia: ConteoNombrado[];
};

export type ConteoConexionUsuario = {
  usuario: string;
  total: number;
};

/** Conteo agregado de visitas a una ruta, proveniente de AccessLog. */
export type ConteoNavegacionRuta = {
  ruta: string;
  total: number;
};

export type DetalleActividadUsuario = {
  usuario: string;
  /** Correo corporativo del usuario; null si el nombre de la bitácora no resuelve a una cuenta. */
  correo: string | null;
  conexiones: number;
  totalAcciones: number;
  accionesPrincipales: ConteoNombrado[];
  porFamilia: ConteoNombrado[];
};

export type ConteoCliente = {
  clienteId: number;
  nombre: string;
  total: number;
};

export type EvidenciaAccion = {
  fecha: string;
  usuario: string;
  accion: string;
  entidad: string;
  detalle: string;
  familia: FamiliaProceso;
  clienteId: number | null;
  /** Registros agrupados en esta operación; solo viene cuando son más de uno. */
  registros?: number;
};

export type SerieDia = {
  fecha: string; // YYYY-MM-DD
  total: number;
  usuarios?: { usuario: string; total: number }[];
};

export type ResumenUsoFactual = {
  periodoDesde: string;
  periodoHasta: string;
  /**
   * OPERACIONES del período: las acciones que se registran una vez por fila
   * (homologar una cuenta, validar una alerta, marcar una diferencia…) cuentan
   * una sola vez por persona, acción, cliente y día. Ver `agruparOperaciones`.
   */
  totalAcciones: number;
  /**
   * Registros de la bitácora detrás de esas operaciones. Opcional: las
   * instantáneas anteriores a la metodología 4 no lo traen (contaban registros).
   */
  totalRegistros?: number;
  /** Visitas de navegación; nunca se suman a totalAcciones. */
  totalNavegaciones: number;
  totalConexiones: number;
  totalUsuarios: number;
  totalClientes: number;
  primeraAccion: string | null;
  ultimaAccion: string | null;
  porFamilia: ConteoNombrado[];
  /** Visitas agrupadas por familia, separadas de las operaciones auditables. */
  navegacionesPorFamilia: ConteoNombrado[];
  topAcciones: ConteoNombrado[];
  topUsuarios: ConteoUsuario[];
  detalleUsuarios: DetalleActividadUsuario[];
  topClientes: ConteoCliente[];
  serieDiaria: SerieDia[];
  evidencia: EvidenciaAccion[];
  /**
   * «Usuarios activos: X de Y» sobre las cuentas del equipo. Opcional: las
   * instantáneas guardadas antes de este indicador no lo traen, y tampoco lo
   * lleva el resumen si no se pudo medir.
   */
  usuariosActivos?: UsuariosActivos;
};

const PREFIJOS_BALANCE = [
  "CARGÓ BALANCE",
  "CONGELÓ BALANCE",
  // «Cerrar balance» / «Abrir balance» desde el 17/Oct/2026 (antes congelar/descongelar).
  "CERRÓ BALANCE",
  "ABRIÓ BALANCE",
  "ASIGNÓ CUENTA ESTÁNDAR",
  "DESCARTÓ BORRADOR",
  "GUARDÓ cambios en balance",
  "ASOCIÓ CLIENTE y perfil a borrador",
  "VALIDÓ alerta de balance",
  "REVIRTIÓ validación de alerta",
  "ELIMINÓ cuenta del balance",
  "GUARDÓ PERFIL de carga de balance",
  "GUARDÓ NOTAS de carga de balance",
  "GUARDÓ PREFERENCIAS de carga de balance",
  "ELIMINÓ PERFIL de carga de balance",
  "ELIMINÓ CORRECCIÓN de carga de balance",
  "LIMPIÓ CORRECCIONES de carga de balance",
  "MARCÓ CUENTA PENDIENTE POR ASIGNAR",
  "QUITÓ PENDIENTE POR ASIGNAR",
  // El prevalidador revisa los balances del cliente: su aprobación es parte del balance.
  "APROBÓ PREVALIDADOR",
  "REVOCÓ APROBACIÓN DEL PREVALIDADOR",
  "AGREGÓ TERCEROS AL BALANCE",
  "REEMPLAZÓ TERCEROS AGREGADOS",
  "QUITÓ TERCEROS AGREGADOS",
  "DETALLE POR TERCERO INCOMPLETO",
  "SIN DETALLE POR TERCERO",
  "CONVENCIÓN RELATIVA A LA CLASE",
];

const PREFIJOS_CONCILIACIONES = ["EJECUTÓ", "ENVIÓ A REVISOR", "ACTUALIZÓ PARTIDA"];

const PREFIJOS_DIAN = ["GUARDÓ MAPEO DIAN", "PIDIÓ ANÁLISIS IA"];

/**
 * Impuestos · DIAN: todo lo que nombra a la DIAN, el calendario tributario, el
 * Régimen Simple y las acciones de las revisiones de cada impuesto, que llevan el
 * nombre del impuesto («CREÓ REVISIÓN DE IVA», «MARCÓ DIFERENCIA DE RETENCIÓN»,
 * «CERRÓ RETENCIÓN EN LA FUENTE (EN FIRME)»…).
 */
const PATRON_IMPUESTOS =
  /\bDIAN\b|CALENDARIO TRIBUTARIO|RÉGIMEN SIMPLE|(?:REVISIÓN|DIFERENCIA|MARCA|CRUCE) DE (?:RETENCIÓN|IVA|RST)|^(?:CERRÓ|DESBLOQUEÓ) (?:RETENCIÓN EN LA FUENTE|IVA|ANTICIPOS BIMESTRALES)/;

/** Nombres de los módulos tal como entran en «CARGÓ <módulo>». */
const NOMBRES_MODULOS = ["Inventarios", "Activos Fijos", "Cartera", "Cuentas por Pagar", "Ingresos", "Nómina"];

/**
 * Módulos de conciliación (los seis): lectura y carga del archivo, Consolidado,
 * marcas del cruce, cruce por tercero, cierre en firme y el formato propio de
 * sus archivos. Antes solo contaban las de Inventarios y el resto caía en «Otras
 * acciones» (161 de sus 350 en nov/2026 eran del Consolidado de otros módulos).
 */
const PREFIJOS_MODULOS = [
  "LEYÓ archivo de",
  "AGREGÓ ítems a",
  "ACTUALIZÓ consolidación de módulo",
  "MARCÓ una diferencia del",
  "EDITÓ la marca del",
  "RETIRÓ la marca del",
  "ELIMINÓ un soporte de la marca del",
  "CAMBIÓ lo que explica una marca",
  "USÓ en otro renglón una marca",
  "QUITÓ de un renglón una marca",
  "RELACIONÓ terceros con una marca",
  "QUITÓ un tercero de la relación con una marca",
  "EMPAREJÓ",
  "SEPARÓ un tercero",
  "RETIRÓ la separación de un tercero",
  "ELIMINÓ DATOS DE MÓDULO",
  "ELIMINÓ DATOS Y PERFILES DE CARGA DE MÓDULO",
  "DOCUMENTÓ archivo original de módulo",
  "NOMBRÓ agrupador del borrador",
  "QUITÓ clase de agrupador",
  "CAMBIÓ LA AGRUPACIÓN DEL",
  "CAMBIÓ la fecha de corte del cargue",
  // El de impuestos («… DEL CRUCE DE IVA») ya se resolvió antes.
  "ESCOGIÓ EL BALANCE DEL CRUCE",
  "CERRÓ CONCILIACIÓN (EN FIRME)",
  "DESBLOQUEÓ CONCILIACIÓN",
  "CONCILIACIÓN EN FIRME",
  "PREPARÓ BORRADOR DE INVENTARIOS",
  "CORRIGIÓ LECTURA DE INVENTARIOS",
  "DESCARTÓ LECTURA DE INVENTARIOS",
  "AGREGÓ APLICATIVO DESDE LA CARGA",
  "QUITÓ CUENTA DE CONCILIACIÓN",
  "AGREGÓ SUBGRUPO DE CONCILIACIÓN",
  "QUITÓ SUBGRUPO DE CONCILIACIÓN",
  "QUITÓ PAREJA DE DEPRECIACIÓN",
  "ELIMINÓ concepto de nómina",
];

/** Conexiones e integraciones: configuración técnica, no conciliación. */
const PATRON_ADMIN_TECNICA = /CONEXIÓN|SMTP/;

const PREFIJOS_CLIENTES = [
  "CREÓ CLIENTE",
  "ACTUALIZÓ CLIENTE",
  "ELIMINÓ CLIENTE",
  "CAMBIÓ ESTADO DE MÓDULO",
  "IMPORTÓ CLIENTES",
];

const PREFIJOS_MAPEO = [
  "CREÓ MAPEO CLIENTE",
  "EDITÓ MAPEO CLIENTE",
  "CONFIRMÓ MAPEO CLIENTE",
  "REASIGNÓ MAPEO CLIENTE",
  "ELIMINÓ MAPEO CLIENTE",
  "CREÓ SUBGRUPO",
  "EDITÓ SUBGRUPO",
  "ELIMINÓ SUBGRUPO",
  // Plan estándar y mapeo del PUC del cliente («ASIGNÓ CUENTA ESTÁNDAR» es del balance
  // y se resuelve antes).
  "CREÓ CUENTA ESTÁNDAR",
  "EDITÓ CUENTA ESTÁNDAR",
  "ELIMINÓ CUENTA ESTÁNDAR",
  "HOMOLOGÓ CUENTA CLIENTE",
  "ALINEÓ MAPEO CON GRUPO",
  "DECLARÓ EXCEPCIÓN DE MAPEO",
];

const PREFIJOS_USUARIOS = [
  "CREÓ USUARIO",
  "EDITÓ USUARIO",
  "ELIMINÓ USUARIO",
  "DESBLOQUEÓ USUARIO",
  "IMPORTÓ MAESTROS",
  "CREÓ MAESTRO PERSONA",
  "EDITÓ MAESTRO PERSONA",
  "ELIMINÓ MAESTRO PERSONA",
  "CARGÓ FOTOS DE USUARIOS",
  "ACTUALIZÓ SU FOTO",
  "QUITÓ SU FOTO",
];

const PREFIJOS_ADMIN = [
  "CAMBIÓ NIVEL DE ACCESO",
  "EDITÓ PROMPT IA",
  "RESTAURÓ PROMPT IA",
  "EDITÓ UMBRAL DE ALERTAS",
  "RESTAURÓ UMBRAL DE ALERTAS",
  "CREÓ VERSIÓN",
  "EDITÓ VERSIÓN",
  "ELIMINÓ VERSIÓN",
  "CREÓ CAMBIO",
  "EDITÓ CAMBIO",
  "ELIMINÓ CAMBIO",
  "GENERÓ REPORTE IA",
  "AGREGÓ CAMPO",
  "EDITÓ CAMPO",
  "ELIMINÓ CAMPO",
  "REORDENÓ CAMPO",
  "ELIMINÓ ERP",
  "ELIMINÓ SECTOR",
  "CREÓ",
  "EDITÓ",
  "ELIMINÓ",
];

function coincidePrefijo(action: string, prefijos: string[]): boolean {
  const a = action.trim();
  return prefijos.some((p) => a === p || a.startsWith(p));
}

function esAccionDeModulo(a: string): boolean {
  if (coincidePrefijo(a, PREFIJOS_MODULOS)) return true;
  // Carga del módulo y perfiles de carga de cada módulo («CARGÓ Cartera»,
  // «EDITÓ PERFIL de carga de Nómina»…).
  if (NOMBRES_MODULOS.some((m) => a === `CARGÓ ${m}` || a.endsWith(`de carga de ${m}`))) return true;
  // Formato propio de los archivos de los módulos (patrones de archivo).
  return a.includes("PATRÓN");
}

/**
 * Clasifica una acción de bitácora en familia de proceso.
 * Algunas acciones ambiguas (p. ej. "COMENTÓ") se desambiguan con entity/detail.
 */
export function clasificarFamilia(
  action: string,
  entity = "",
  detail = "",
): FamiliaProceso {
  const a = action.trim();
  const ctx = `${entity} ${detail}`.toLowerCase();

  if (coincidePrefijo(a, PREFIJOS_BALANCE)) return "balance";
  // Impuestos antes que módulos: «ESCOGIÓ EL BALANCE DEL CRUCE DE IVA» es de impuestos.
  if (coincidePrefijo(a, PREFIJOS_DIAN) || PATRON_IMPUESTOS.test(a)) return "dian";
  if (esAccionDeModulo(a)) return "modulos";
  if (PATRON_ADMIN_TECNICA.test(a)) return "administracion";
  if (coincidePrefijo(a, PREFIJOS_CONCILIACIONES)) return "conciliaciones";
  if (coincidePrefijo(a, PREFIJOS_CLIENTES)) return "clientes";
  if (coincidePrefijo(a, PREFIJOS_MAPEO)) return "mapeo";
  if (coincidePrefijo(a, PREFIJOS_USUARIOS)) return "usuarios";

  // Plan estándar (acciones cortas CREÓ/EDITÓ/ELIMINÓ sin sufijo) vs admin genérico.
  if (a === "CREÓ" || a === "EDITÓ" || a === "ELIMINÓ") {
    // Cuentas estándar y subgrupos ya cubiertos arriba si llevan prefijo;
    // las acciones cortas del plan estándar van a mapeo.
    return "mapeo";
  }

  if (coincidePrefijo(a, PREFIJOS_ADMIN)) return "administracion";

  if (a === "COMENTÓ") {
    if (ctx.includes("dian") || ctx.includes("renglón") || ctx.includes("renglon")) return "dian";
    if (ctx.includes("cruce") || ctx.includes("cuenta")) return "conciliaciones";
    if (ctx.includes("balance")) return "balance";
    return "otros";
  }

  // Antes que «BORRADOR»: «PREPARÓ BORRADOR DE INVENTARIOS» no es del balance.
  if (a.includes("INVENTARIO") || a.includes("MÓDULO")) return "modulos";
  if (a.includes("BALANCE") || a.includes("BORRADOR")) return "balance";
  if (a.includes("MAPEO") && a.includes("DIAN")) return "dian";
  if (a.includes("MAPEO")) return "mapeo";
  if (a.includes("CLIENTE")) return "clientes";
  if (a.includes("USUARIO") || a.includes("MAESTRO")) return "usuarios";
  if (a.includes("REPORTE") || a.includes("VERSIÓN") || a.includes("VERSION") || a.includes("PROMPT") || a.includes("UMBRAL") || a.includes("PERMISO") || a.includes("ACCESO") || a.includes("CAMPO")) {
    return "administracion";
  }

  return "otros";
}

/**
 * Acciones que la bitácora registra UNA VEZ POR FILA: homologar las 80 cuentas de
 * un balance deja 80 «ASIGNÓ CUENTA ESTÁNDAR», validar sus alertas otros tantos
 * «VALIDÓ alerta de balance», y cada cambio del Consolidado se autoguarda con su
 * propio registro. Contadas una a una, el reporte medía clics y no trabajo: en
 * nov/2026, 777 de las 1.019 acciones de «Balance de comprobación» eran
 * homologaciones cuenta por cuenta.
 *
 * Para medir uso, cada una cuenta como UNA operación por persona, acción, cliente
 * y día (`agruparOperaciones`). Se comparan por prefijo, como las familias.
 */
export const ACCIONES_POR_FILA: readonly string[] = [
  // Balance: homologación, pendientes y alertas, cuenta por cuenta.
  "ASIGNÓ CUENTA ESTÁNDAR",
  "MARCÓ CUENTA PENDIENTE POR ASIGNAR",
  "QUITÓ PENDIENTE POR ASIGNAR",
  "VALIDÓ alerta de balance",
  "REVIRTIÓ validación de alerta",
  "ELIMINÓ cuenta del balance",
  // Mapeo del cliente y plan estándar, cuenta por cuenta.
  "HOMOLOGÓ CUENTA CLIENTE",
  "CREÓ MAPEO CLIENTE",
  "EDITÓ MAPEO CLIENTE",
  "CONFIRMÓ MAPEO CLIENTE",
  "REASIGNÓ MAPEO CLIENTE",
  "ELIMINÓ MAPEO CLIENTE",
  "CREÓ CUENTA ESTÁNDAR",
  "EDITÓ CUENTA ESTÁNDAR",
  "ELIMINÓ CUENTA ESTÁNDAR",
  // Módulos: cada cambio del Consolidado, cada marca, cada tercero emparejado.
  "ACTUALIZÓ consolidación de módulo",
  "MARCÓ una diferencia del",
  "EDITÓ la marca del",
  "RETIRÓ la marca del",
  "ELIMINÓ un soporte de la marca del",
  "CAMBIÓ lo que explica una marca",
  "USÓ en otro renglón una marca",
  "QUITÓ de un renglón una marca",
  "RELACIONÓ terceros con una marca",
  "QUITÓ un tercero de la relación con una marca",
  "EMPAREJÓ",
  "SEPARÓ un tercero",
  "RETIRÓ la separación de un tercero",
  "QUITÓ CUENTA DE CONCILIACIÓN",
  // Impuestos: marcas de los renglones.
  "MARCÓ DIFERENCIA DE",
  "QUITÓ MARCA DE",
  // Comentarios: cada mensaje de una conversación.
  "COMENTÓ",
  "EDITÓ un comentario",
  "ELIMINÓ un comentario",
];

/** ¿La acción se registra una vez por fila (cuenta, alerta, marca…)? */
export function esAccionPorFila(action: string): boolean {
  return coincidePrefijo(action, ACCIONES_POR_FILA as string[]);
}

/** Una operación de uso: el primer registro del grupo y cuántos registros agrupa. */
export type OperacionUso = EventoAuditoria & { registros: number };

/**
 * Convierte registros de bitácora en OPERACIONES. Las acciones por fila
 * (`ACCIONES_POR_FILA`) se agrupan en una sola por persona, acción, cliente y día
 * (UTC, el mismo día con el que se arma la serie diaria); el resto queda una a una.
 * Cada operación conserva el primer registro del grupo, así que el orden de
 * entrada se mantiene. No modifica los eventos recibidos.
 */
export function agruparOperaciones(eventos: readonly EventoAuditoria[]): OperacionUso[] {
  const operaciones: OperacionUso[] = [];
  const grupos = new Map<string, OperacionUso>();
  for (const e of eventos) {
    if (!esAccionPorFila(e.action)) {
      operaciones.push({ ...e, registros: 1 });
      continue;
    }
    const clave = [e.user.trim(), e.action.trim(), e.clientId ?? "-", diaClave(e.createdAt)].join("|");
    const grupo = grupos.get(clave);
    if (grupo) {
      grupo.registros += 1;
      continue;
    }
    const operacion = { ...e, registros: 1 };
    grupos.set(clave, operacion);
    operaciones.push(operacion);
  }
  return operaciones;
}

/** Mapea moduleKey de Novedades → familia medible de adopción. */
export function familiaDesdeModulo(moduleKey: string | null | undefined): FamiliaProceso | null {
  if (!moduleKey) return null;
  const k = moduleKey.trim().toLowerCase();
  if (!k) return null;
  if (k === "balance" || k.includes("balance")) return "balance";
  if (
    k === "modulos_datos" ||
    k === "inventarios" ||
    k === "inventario" ||
    ["inv", "afi", "car", "cxp", "ing", "nom"].includes(k)
  ) {
    return "modulos";
  }
  if (k === "conciliaciones" || k.includes("concili")) return "conciliaciones";
  if (k === "dian" || k.includes("dian") || k.includes("impuesto")) return "dian";
  if (k === "clientes" || k.includes("cliente")) return "clientes";
  if (k === "mapeo" || k.includes("mapeo") || k.includes("cuenta")) return "mapeo";
  if (k === "usuarios" || k === "estructura" || k.includes("usuario") || k.includes("maestro")) return "usuarios";
  if (
    k === "novedades" ||
    k === "auditoria" ||
    k === "roles" ||
    k === "modulos" ||
    k === "prompts" ||
    k === "parametros" ||
    k === "publicacion_modulos" ||
    k.includes("admin")
  ) {
    return "administracion";
  }
  return null;
}

/**
 * Clasifica una ruta visitada en una familia para el bloque de consultas.
 * La publicación se filtra antes, en `alcance.ts`; aquí solo se etiqueta.
 */
export function familiaDesdeRuta(ruta: string): FamiliaProceso | null {
  const path = ruta.trim().toLowerCase().split(/[?#]/, 1)[0]?.replace(/\/+$/, "") || "/";
  if (path === "/balance" || path.startsWith("/balance/")) return "balance";
  if (path === "/modulos" || path.startsWith("/modulos/")) return "modulos";
  if (path === "/conciliacion" || path.startsWith("/conciliacion/")) return "conciliaciones";
  if (path === "/dian" || path.startsWith("/dian/")) return "dian";
  if (path === "/impuestos" || path.startsWith("/impuestos/")) return "dian";
  if (path === "/config/clientes" || path.startsWith("/config/clientes/")) return "clientes";
  if (path === "/config/mapeo" || path.startsWith("/config/mapeo/") || path === "/config/mapeo-cliente") return "mapeo";
  return null;
}

function aIso(d: Date | string): string {
  if (typeof d === "string") return new Date(d).toISOString();
  return d.toISOString();
}

function diaClave(d: Date | string): string {
  return aIso(d).slice(0, 10);
}

/** Actor técnico sin persona identificada; no modifica la bitácora original. */
function esActorSistema(usuario: string): boolean {
  const normalizado = usuario.trim().replace(/\s+/g, " ");
  return /^sistema(?:\s*\([^()]*\))?$/i.test(normalizado);
}

function topN(map: Map<string, number>, n: number): ConteoNombrado[] {
  return Array.from(map.entries())
    .map(([nombre, total]) => ({ nombre, total }))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, n);
}

/**
 * Calcula el resumen factual de uso a partir de eventos de auditoría del período.
 * `nombresClientes` resuelve clientId → etiqueta legible (opcional).
 */
export function calcularResumenUso(params: {
  eventos: EventoAuditoria[];
  conexiones?: ConteoConexionUsuario[];
  navegaciones?: ConteoNavegacionRuta[];
  periodoDesde: Date | string;
  periodoHasta: Date | string;
  nombresClientes?: Map<number, string> | Record<number, string>;
  /** nombre de usuario (como queda en la bitácora) → correo. */
  correosUsuarios?: Map<string, string> | Record<string, string>;
  /**
   * Nombres de las cuentas que EXISTEN en la plataforma (`User.name`). Cuando se
   * pasa, la bitácora se acota a ellas: el reporte mide el uso de los usuarios
   * de Russell, no el de actores técnicos o cuentas ya borradas que quedaron en
   * el histórico. Sin este parámetro no se filtra nada (compatibilidad).
   */
  usuariosRegistrados?: Iterable<string> | null;
  /**
   * Indicador de usuarios activos, ya calculado por `calcularUsuariosActivos`
   * (mide cuentas, no eventos: no se deriva de las filas de este resumen). Se
   * incluye tal cual en el resultado cuando viene.
   */
  usuariosActivos?: UsuariosActivos | null;
  maxTopAcciones?: number;
  maxTopUsuarios?: number;
  maxTopClientes?: number;
  maxEvidencia?: number;
  maxAccionesPorUsuario?: number;
}): ResumenUsoFactual {
  const maxTopAcciones = params.maxTopAcciones ?? 15;
  const maxTopUsuarios = params.maxTopUsuarios ?? 12;
  const maxTopClientes = params.maxTopClientes ?? 10;
  const maxEvidencia = params.maxEvidencia ?? 50;
  const maxAccionesPorUsuario = params.maxAccionesPorUsuario ?? 5;

  const nombreCliente = (id: number): string => {
    if (params.nombresClientes instanceof Map) {
      return params.nombresClientes.get(id) ?? `Cliente #${id}`;
    }
    if (params.nombresClientes && id in params.nombresClientes) {
      return params.nombresClientes[id] ?? `Cliente #${id}`;
    }
    return `Cliente #${id}`;
  };

  const correoUsuario = (nombre: string): string | null => {
    const fuente = params.correosUsuarios;
    if (!fuente) return null;
    const valor = fuente instanceof Map ? fuente.get(nombre) : fuente[nombre];
    const correo = valor?.trim();
    return correo ? correo : null;
  };

  const porFamilia = new Map<string, number>();
  const porAccion = new Map<string, number>();
  const registrosPorAccion = new Map<string, number>();
  const porUsuario = new Map<string, number>();
  const porUsuarioFamilia = new Map<string, Map<string, number>>();
  const porUsuarioAccion = new Map<string, Map<string, number>>();
  const porCliente = new Map<number, number>();
  const porDia = new Map<string, number>();
  const porDiaUsuario = new Map<string, Map<string, number>>();
  const usuarios = new Set<string>();
  const clientes = new Set<number>();

  let primera: string | null = null;
  let ultima: string | null = null;

  // Cuentas vigentes de la plataforma. Si no se declaran, no se filtra por esto.
  const registrados = params.usuariosRegistrados
    ? new Set(Array.from(params.usuariosRegistrados, (nombre) => nombre.trim()).filter(Boolean))
    : null;
  const esUsuarioDeLaApp = (usuario: string): boolean => !registrados || registrados.has(usuario.trim());

  const ordenados = params.eventos
    .filter((e) => !esActorSistema(e.user) && esUsuarioDeLaApp(e.user) && e.action !== "GENERÓ REPORTE IA")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Primera y última se leen de los registros: una operación agrupada empieza en
  // su primer registro, pero el último puede ser posterior.
  for (const e of ordenados) {
    const iso = aIso(e.createdAt);
    if (!primera || iso < primera) primera = iso;
    if (!ultima || iso > ultima) ultima = iso;
  }

  // Desde aquí se cuentan OPERACIONES, no registros (ver `ACCIONES_POR_FILA`).
  const operaciones = agruparOperaciones(ordenados);

  for (const e of operaciones) {
    const familia = clasificarFamilia(e.action, e.entity, e.detail);
    const etiquetaFamilia = ETIQUETA_FAMILIA[familia];

    usuarios.add(e.user);
    porFamilia.set(etiquetaFamilia, (porFamilia.get(etiquetaFamilia) ?? 0) + 1);
    porAccion.set(e.action, (porAccion.get(e.action) ?? 0) + 1);
    registrosPorAccion.set(e.action, (registrosPorAccion.get(e.action) ?? 0) + e.registros);
    porUsuario.set(e.user, (porUsuario.get(e.user) ?? 0) + 1);

    let ua = porUsuarioAccion.get(e.user);
    if (!ua) {
      ua = new Map();
      porUsuarioAccion.set(e.user, ua);
    }
    ua.set(e.action, (ua.get(e.action) ?? 0) + 1);

    let uf = porUsuarioFamilia.get(e.user);
    if (!uf) {
      uf = new Map();
      porUsuarioFamilia.set(e.user, uf);
    }
    uf.set(etiquetaFamilia, (uf.get(etiquetaFamilia) ?? 0) + 1);

    if (e.clientId != null) {
      clientes.add(e.clientId);
      porCliente.set(e.clientId, (porCliente.get(e.clientId) ?? 0) + 1);
    }

    const dia = diaClave(e.createdAt);
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
    let usuariosDia = porDiaUsuario.get(dia);
    if (!usuariosDia) {
      usuariosDia = new Map();
      porDiaUsuario.set(dia, usuariosDia);
    }
    usuariosDia.set(e.user, (usuariosDia.get(e.user) ?? 0) + 1);
  }

  const topUsuariosRaw = topN(porUsuario, maxTopUsuarios);
  const topUsuarios: ConteoUsuario[] = topUsuariosRaw.map((u) => ({
    usuario: u.nombre,
    correo: correoUsuario(u.nombre),
    total: u.total,
    porFamilia: topN(porUsuarioFamilia.get(u.nombre) ?? new Map(), 6),
  }));

  const conexionesPorUsuario = new Map<string, number>();
  for (const conexion of params.conexiones ?? []) {
    const usuario = conexion.usuario.trim();
    if (!usuario || esActorSistema(usuario) || !esUsuarioDeLaApp(usuario)) continue;
    if (!Number.isFinite(conexion.total) || conexion.total <= 0) continue;
    conexionesPorUsuario.set(
      usuario,
      (conexionesPorUsuario.get(usuario) ?? 0) + Math.floor(conexion.total),
    );
  }

  // La tabla detallada no es un top: conserva la unión completa entre quienes
  // iniciaron sesión y quienes dejaron acciones auditables en el período.
  const usuariosDetalle = new Set([...porUsuario.keys(), ...conexionesPorUsuario.keys()]);
  const detalleUsuarios: DetalleActividadUsuario[] = Array.from(usuariosDetalle)
    .map((usuario) => ({
      usuario,
      correo: correoUsuario(usuario),
      conexiones: conexionesPorUsuario.get(usuario) ?? 0,
      totalAcciones: porUsuario.get(usuario) ?? 0,
      accionesPrincipales: topN(
        porUsuarioAccion.get(usuario) ?? new Map(),
        maxAccionesPorUsuario,
      ),
      porFamilia: topN(porUsuarioFamilia.get(usuario) ?? new Map(), 6),
    }))
    .sort(
      (a, b) =>
        b.totalAcciones - a.totalAcciones ||
        b.conexiones - a.conexiones ||
        a.usuario.localeCompare(b.usuario, "es"),
    );

  const totalConexiones = Array.from(conexionesPorUsuario.values()).reduce(
    (total, conexiones) => total + conexiones,
    0,
  );

  const porFamiliaNavegacion = new Map<string, number>();
  let totalNavegaciones = 0;
  for (const navegacion of params.navegaciones ?? []) {
    const ruta = navegacion.ruta.trim();
    if (!ruta || !Number.isFinite(navegacion.total) || navegacion.total <= 0) continue;
    const total = Math.floor(navegacion.total);
    const familia = familiaDesdeRuta(ruta);
    if (!familia) continue;
    const etiqueta = ETIQUETA_FAMILIA[familia];
    totalNavegaciones += total;
    porFamiliaNavegacion.set(etiqueta, (porFamiliaNavegacion.get(etiqueta) ?? 0) + total);
  }

  const topClientes: ConteoCliente[] = Array.from(porCliente.entries())
    .map(([clienteId, total]) => ({
      clienteId,
      nombre: nombreCliente(clienteId),
      total,
    }))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, maxTopClientes);

  const serieDiaria: SerieDia[] = Array.from(porDia.entries())
    .map(([fecha, total]) => ({
      fecha,
      total,
      usuarios: Array.from(porDiaUsuario.get(fecha) ?? [])
        .map(([usuario, cantidad]) => ({ usuario, total: cantidad }))
        .sort((a, b) => b.total - a.total || a.usuario.localeCompare(b.usuario, "es")),
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  // Evidencia: las operaciones más recientes primero (recortada).
  const evidencia: EvidenciaAccion[] = [...operaciones]
    .reverse()
    .slice(0, maxEvidencia)
    .map((e) => {
      const familia = clasificarFamilia(e.action, e.entity, e.detail);
      return {
        fecha: aIso(e.createdAt),
        usuario: e.user,
        accion: e.action,
        entidad: recortar(e.entity, 120),
        detalle: recortar(e.detail, 200),
        familia,
        clienteId: e.clientId,
        ...(e.registros > 1 ? { registros: e.registros } : {}),
      };
    });

  // Las acciones agrupadas llevan cuántos registros reúnen; las demás, no.
  const topAcciones: ConteoNombrado[] = topN(porAccion, maxTopAcciones).map((a) => {
    const registros = registrosPorAccion.get(a.nombre) ?? a.total;
    return registros > a.total ? { ...a, registros } : a;
  });

  return {
    periodoDesde: aIso(params.periodoDesde),
    periodoHasta: aIso(params.periodoHasta),
    totalAcciones: operaciones.length,
    totalRegistros: ordenados.length,
    totalNavegaciones,
    totalConexiones,
    totalUsuarios: usuarios.size,
    totalClientes: clientes.size,
    primeraAccion: primera,
    ultimaAccion: ultima,
    porFamilia: topN(porFamilia, 20),
    navegacionesPorFamilia: topN(porFamiliaNavegacion, 20),
    topAcciones,
    topUsuarios,
    detalleUsuarios,
    topClientes,
    serieDiaria,
    evidencia,
    ...(params.usuariosActivos ? { usuariosActivos: params.usuariosActivos } : {}),
  };
}

function recortar(texto: string, max: number): string {
  const t = texto.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

/**
 * Operaciones por familia de proceso (clave canónica, no etiqueta), con las
 * mismas reglas que `calcularResumenUso`: sin actores técnicos, solo las cuentas
 * declaradas y con las acciones por fila agrupadas.
 */
export function conteosPorFamiliaCanon(
  eventos: EventoAuditoria[],
  usuariosRegistrados?: Iterable<string> | null,
): Record<FamiliaProceso, number> {
  const out: Record<FamiliaProceso, number> = {
    balance: 0,
    modulos: 0,
    conciliaciones: 0,
    dian: 0,
    clientes: 0,
    mapeo: 0,
    usuarios: 0,
    administracion: 0,
    otros: 0,
  };
  const registrados = usuariosRegistrados
    ? new Set(Array.from(usuariosRegistrados, (nombre) => nombre.trim()).filter(Boolean))
    : null;
  const medibles = eventos.filter(
    (e) =>
      !esActorSistema(e.user) &&
      e.action !== "GENERÓ REPORTE IA" &&
      (!registrados || registrados.has(e.user.trim())),
  );
  for (const e of agruparOperaciones(medibles)) {
    const f = clasificarFamilia(e.action, e.entity, e.detail);
    out[f] += 1;
  }
  return out;
}
