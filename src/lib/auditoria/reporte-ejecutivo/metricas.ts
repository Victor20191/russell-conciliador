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
  /** Documento trabajado («balance:12», «conciliacion:7-CAR-2026-09»…); null en los registros viejos. */
  document?: string | null;
};

export type ConteoNombrado = {
  nombre: string;
  total: number;
  /**
   * Registros de la bitácora detrás de `total`. Solo viene cuando son más que las
   * operaciones, es decir, cuando el paso se repitió el mismo día sobre el mismo
   * documento y se agrupó (ver `agruparOperaciones`).
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
   * OPERACIONES del período: pasos de trabajo por persona, documento y día, sin
   * los registros automáticos. Ver `agruparOperaciones`.
   */
  totalAcciones: number;
  /**
   * Registros de la bitácora detrás de esas operaciones. Opcional: las
   * instantáneas anteriores a la metodología 4 no lo traen (contaban registros).
   */
  totalRegistros?: number;
  /**
   * Volumen de trabajo detrás de las operaciones (cuentas homologadas, alertas
   * validadas, marcas…), solo lo que no es cero. No se suma a las operaciones: dice
   * cuánto trabajo hubo en cada paso. Opcional: las instantáneas anteriores no lo traen.
   */
  volumen?: ConteoNombrado[];
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
  // Antes que las acciones genéricas «CREÓ…» de administración.
  "CREÓ BORRADOR de balance",
  "RELEYÓ BORRADOR de balance",
  "EXPORTÓ EXCEL DEL BALANCE",
  "EXPORTÓ EXCEL DEL BORRADOR de balance",
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
  "DESHIZO el emparejamiento de un tercero",
  "SUMÓ un tercero de la contabilidad",
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
  // Editar y exportar el borrador o el cargue de un módulo.
  "GUARDÓ cambios en borrador de módulo",
  "EXPORTÓ EXCEL DEL MÓDULO",
  "EXPORTÓ EXCEL DEL BORRADOR DE MÓDULO",
  // Alertas de Novedades del cargue (antes caían en «Otras acciones» y en administración).
  "COMENTÓ ALERTA",
  "APROBÓ ALERTA",
  "EDITÓ COMENTARIO DE ALERTA",
  "EDITÓ APROBACIÓN DE ALERTA",
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

// ── QUÉ ES UNA OPERACIÓN (metodología 7, definida con el usuario el 24/Nov/2026) ─
//
// Una OPERACIÓN es un paso de trabajo de una persona. Hay tres clases:
//
//   · CUENTAN CADA VEZ (`ACCIONES_CADA_VEZ`): cargar un borrador (balance o
//     módulo), aprobar un borrador, crear una marca en un cruce, crear una cuenta
//     del Plan Estándar Russell, reportar un incidente en la Mesa de ayuda, cerrar
//     o abrir un balance, cerrar o desbloquear una conciliación o un impuesto en firme. Dos
//     borradores del mismo cliente el mismo día son dos operaciones; cerrar dos
//     veces, dos; cinco marcas nuevas, cinco.
//   · CUENTAN POR BLOQUES DE 10 (`REGISTROS_POR_BLOQUE`), por persona, documento
//     y día: homologar cuentas y los cambios del Consolidado (35 → 4).
//   · CUENTAN UNA VEZ POR PERSONA, DOCUMENTO Y DÍA: todo lo demás. Validar 5
//     alertas, editar marcas, cargar 10 formularios DIAN, aprobar 10 (en bloque o
//     no) o volver a leer el mismo borrador para corregirlo son una operación ese
//     día; validar alertas de dos balances del mismo cliente son dos. El
//     documento lo anota la bitácora desde el 24/Nov/2026 (`registros_auditoria.
//     documento`: el balance, el borrador, la conciliación del módulo en el
//     período o la revisión de impuestos; en los pasos de patrones, el patrón);
//     en los registros anteriores y en los pasos que no son sobre un documento
//     hace sus veces el cliente (`documentoDeOperacion`). Quitar o retirar algo
//     dentro del trabajo (una marca, un pendiente, una cuenta del Consolidado) es
//     parte de su paso.
//   · NO CUENTAN: descartar, eliminar o borrar cualquier cosa, y lo que la
//     plataforma anota sola mientras la persona hace otra cosa (avisos, muestras
//     automáticas, intentos bloqueados).

/**
 * Registros que la plataforma anota sola como consecuencia de otro paso (aprobar
 * un borrador, guardar un formato) o que no son trabajo (un intento bloqueado, el
 * registro de un despliegue). Se quedan en la bitácora, pero no son operaciones.
 */
export const ACCIONES_AUTOMATICAS: readonly string[] = [
  "CONVENCIÓN RELATIVA A LA CLASE",
  "CAPTURÓ BALANCE POR TERCERO",
  "DETALLE POR TERCERO INCOMPLETO",
  "SIN DETALLE POR TERCERO",
  "DETECTÓ DIFERENCIAS ENTRE BALANCES DEL CORTE",
  "PROPUSO PATRÓN DE ARCHIVO",
  "GENERÓ MUESTRA DE PATRÓN",
  "SIN MUESTRA AUTOMÁTICA DE PATRÓN",
  "CONCILIACIÓN EN FIRME · INTENTO BLOQUEADO",
  "REGISTRÓ DESPLIEGUE",
  "GENERÓ REPORTE IA",
];

/** ¿La plataforma anotó el registro sola (no es una operación de la persona)? */
export function esAccionAutomatica(action: string): boolean {
  return coincidePrefijo(action, ACCIONES_AUTOMATICAS as string[]);
}

/** Descartar, eliminar o borrar algo no es una operación (pedido del usuario, 24/Nov/2026). */
const PREFIJOS_QUE_DESHACEN = ["DESCARTÓ", "ELIMINÓ", "BORRÓ"];

/** ¿El registro NO es una operación (automático, o descarta / elimina / borra algo)? */
export function noEsOperacion(action: string): boolean {
  return esAccionAutomatica(action) || coincidePrefijo(action, PREFIJOS_QUE_DESHACEN);
}

/**
 * Pasos que cuentan CADA VEZ, aunque se repitan el mismo día sobre el mismo
 * cliente: cargar un borrador (balance o módulo), aprobarlo, y cerrar o abrir un
 * balance, una conciliación o un impuesto en firme. «CERRÓ IVA (EN FIRME)»,
 * «DESBLOQUEÓ RETENCIÓN EN LA FUENTE»… salen del nombre del impuesto.
 */
const ACCIONES_CADA_VEZ = [
  // Cada marca nueva explica una diferencia con su monto y su nota (editarla o
  // retirarla sigue agrupado en su paso).
  "MARCÓ una diferencia del",
  "MARCÓ DIFERENCIA DE",
  // Cada cuenta nueva del Plan Estándar Russell y cada incidente reportado en la
  // Mesa de ayuda es algo distinto, con su propio contenido (pedido del usuario).
  "CREÓ CUENTA ESTÁNDAR",
  "REPORTÓ NOVEDAD",
  "CREÓ BORRADOR de balance",
  "PREPARÓ BORRADOR DE INVENTARIOS",
  "LEYÓ archivo de",
  "CARGÓ BALANCE",
  "AGREGÓ ítems a",
  "CERRÓ BALANCE",
  "ABRIÓ BALANCE",
  "CONGELÓ BALANCE",
  "CERRÓ CONCILIACIÓN (EN FIRME)",
  "DESBLOQUEÓ CONCILIACIÓN",
];
const PATRON_CIERRE_IMPUESTO = /^(?:CERRÓ|DESBLOQUEÓ) (?:RETENCIÓN EN LA FUENTE|IVA|ANTICIPOS BIMESTRALES)/;

/** ¿El paso cuenta cada vez (no se agrupa por día)? */
export function cuentaCadaVez(action: string): boolean {
  const a = action.trim();
  return (
    coincidePrefijo(a, ACCIONES_CADA_VEZ)
    // Aprobar el borrador de un módulo: «CARGÓ Cartera», «CARGÓ Nómina»…
    || NOMBRES_MODULOS.some((m) => a === `CARGÓ ${m}`)
    || PATRON_CIERRE_IMPUESTO.test(a)
  );
}

/**
 * Pasos que reúnen varias acciones de la bitácora: homologar una cuenta o dejarla
 * pendiente es el mismo paso; poner, editar o retirar marcas, también. Lo que no
 * está aquí es un paso por sí mismo (su acción). El orden importa: «COMENTÓ
 * ALERTA» es de las alertas del módulo antes que de los comentarios.
 */
const PASOS: ReadonlyArray<{ paso: string; prefijos: readonly string[] }> = [
  {
    paso: "HOMOLOGÓ CUENTAS DEL BALANCE",
    prefijos: ["ASIGNÓ CUENTA ESTÁNDAR", "MARCÓ CUENTA PENDIENTE POR ASIGNAR", "QUITÓ PENDIENTE POR ASIGNAR"],
  },
  { paso: "VALIDÓ ALERTAS DEL BALANCE", prefijos: ["VALIDÓ alerta de balance", "REVIRTIÓ validación de alerta"] },
  {
    paso: "ATENDIÓ ALERTAS DEL MÓDULO",
    prefijos: ["COMENTÓ ALERTA", "APROBÓ ALERTA", "EDITÓ COMENTARIO DE ALERTA", "EDITÓ APROBACIÓN DE ALERTA"],
  },
  {
    paso: "MARCÓ DIFERENCIAS DEL CRUCE",
    prefijos: [
      "MARCÓ una diferencia del",
      "EDITÓ la marca del",
      "RETIRÓ la marca del",
      "CAMBIÓ lo que explica una marca",
      "USÓ en otro renglón una marca",
      "QUITÓ de un renglón una marca",
      "RELACIONÓ terceros con una marca",
      "QUITÓ un tercero de la relación con una marca",
    ],
  },
  { paso: "MARCÓ DIFERENCIAS DE IMPUESTOS", prefijos: ["MARCÓ DIFERENCIA DE", "QUITÓ MARCA DE"] },
  {
    paso: "TRABAJÓ EL CRUCE POR TERCERO",
    prefijos: [
      "EMPAREJÓ",
      "SEPARÓ un tercero",
      "RETIRÓ la separación de un tercero",
      "DESHIZO el emparejamiento de un tercero",
      "SUMÓ un tercero de la contabilidad",
    ],
  },
  // Eliminar un comentario o un soporte no cuenta (`noEsOperacion`).
  { paso: "COMENTÓ", prefijos: ["COMENTÓ", "EDITÓ un comentario"] },
];

/** Paso de los patrones de archivo: crear, subir la muestra, editar, aprobar… */
export const PASO_PATRON = "TRABAJÓ UN PATRÓN DE ARCHIVO";

/**
 * Pasos que se hacen renglón por renglón y cuentan una operación por cada N
 * registros del mismo documento y día, redondeando hacia arriba: homologar 1 a 10
 * cuentas es 1, 11 a 20 es 2, 35 es 4. Se cuentan asignaciones: asignar de una vez
 * todo un grupo de cuentas es un registro.
 */
export const REGISTROS_POR_BLOQUE: Readonly<Record<string, number>> = {
  "HOMOLOGÓ CUENTAS DEL BALANCE": 10,
  "ACTUALIZÓ consolidación de módulo": 10,
};

/** El paso de trabajo al que pertenece una acción de la bitácora. */
export function pasoDeAccion(action: string): string {
  const a = action.trim();
  for (const { paso, prefijos } of PASOS) {
    if (coincidePrefijo(a, prefijos as string[])) return paso;
  }
  if (a.includes("PATRÓN")) return PASO_PATRON;
  return a;
}

const MODULO_POR_CODIGO: Record<string, string> = {
  INV: "Inventarios",
  AFI: "Activos Fijos",
  CAR: "Cartera",
  CXP: "Cuentas por Pagar",
  ING: "Ingresos",
  NOM: "Nómina",
};

/** «12:fila-3» → 12: las validaciones de alertas anotan el balance en la entidad desde siempre. */
const BALANCE_EN_ENTIDAD = /^(\d+):/;

/**
 * El documento del paso: el que anotó la bitácora (el balance, el borrador, la
 * conciliación del período o la revisión de impuestos); en los pasos de patrones,
 * el patrón («Cartera · SIESA v2»; algunas acciones lo anotan con el código del
 * módulo); en las validaciones de alertas viejas, el balance de su entidad; y si no
 * hay nada de eso (registros anteriores al 24/Nov/2026), el cliente.
 */
export function documentoDeOperacion(e: EventoAuditoria, paso: string): string {
  if (paso === PASO_PATRON) {
    const [primero = "", ...resto] = e.entity.split(" · ").map((s) => s.trim());
    return ["patron", MODULO_POR_CODIGO[primero] ?? primero, ...resto].join("|");
  }
  const anotado = e.document?.trim();
  if (anotado) return anotado;
  if (paso === "VALIDÓ ALERTAS DEL BALANCE") {
    const balance = BALANCE_EN_ENTIDAD.exec(e.entity.trim())?.[1];
    if (balance) return `balance:${balance}`;
  }
  return e.clientId != null ? `cliente|${e.clientId}` : "sin-cliente";
}

/**
 * Una operación de uso: el primer registro del grupo, su paso de trabajo y
 * cuántos registros de la bitácora reúne.
 */
export type OperacionUso = EventoAuditoria & { paso: string; registros: number };

/**
 * Convierte registros de bitácora en OPERACIONES (ver arriba): quita lo que no es
 * operación, deja una a una las que cuentan cada vez y agrupa las demás por
 * persona, paso, documento y día (UTC, el mismo día con el que se arma la serie
 * diaria). Cada operación conserva el primer registro del grupo, así que el orden
 * de entrada se mantiene. No modifica los eventos.
 */
export function agruparOperaciones(eventos: readonly EventoAuditoria[]): OperacionUso[] {
  const operaciones: OperacionUso[] = [];
  const grupos = new Map<string, OperacionUso>();
  for (const e of eventos) {
    if (noEsOperacion(e.action)) continue;
    const paso = pasoDeAccion(e.action);
    if (cuentaCadaVez(e.action)) {
      operaciones.push({ ...e, paso, registros: 1 });
      continue;
    }
    const clave = [e.user.trim(), paso, documentoDeOperacion(e, paso), diaClave(e.createdAt)].join("|");
    const grupo = grupos.get(clave);
    // Los pasos por bloque abren una operación nueva cada N registros: 35 cuentas
    // homologadas son 4 operaciones (10 + 10 + 10 + 5).
    if (grupo && grupo.registros < (REGISTROS_POR_BLOQUE[paso] ?? Infinity)) {
      grupo.registros += 1;
      continue;
    }
    const operacion = { ...e, paso, registros: 1 };
    grupos.set(clave, operacion);
    operaciones.push(operacion);
  }
  return operaciones;
}

/**
 * Qué se cuenta en el volumen de trabajo: cada registro de estas acciones es una
 * unidad (una cuenta homologada, una alerta validada, una marca…).
 */
const VOLUMEN_DE_TRABAJO: ReadonlyArray<{ etiqueta: string; singular: string; prefijos: readonly string[] }> = [
  { etiqueta: "cuentas homologadas", singular: "cuenta homologada", prefijos: ["ASIGNÓ CUENTA ESTÁNDAR"] },
  {
    etiqueta: "alertas validadas",
    singular: "alerta validada",
    prefijos: ["VALIDÓ alerta de balance", "APROBÓ ALERTA", "COMENTÓ ALERTA"],
  },
  { etiqueta: "marcas", singular: "marca", prefijos: ["MARCÓ una diferencia del", "MARCÓ DIFERENCIA DE"] },
  { etiqueta: "cambios del Consolidado", singular: "cambio del Consolidado", prefijos: ["ACTUALIZÓ consolidación de módulo"] },
  { etiqueta: "formularios DIAN cargados", singular: "formulario DIAN cargado", prefijos: ["IMPORTÓ FORMULARIO DIAN"] },
  { etiqueta: "formularios DIAN confirmados", singular: "formulario DIAN confirmado", prefijos: ["CONFIRMÓ FORMULARIO DIAN"] },
];

/** Volumen de trabajo de los registros dados, en el orden fijo de arriba y sin ceros. */
export function volumenDeTrabajo(eventos: readonly EventoAuditoria[]): ConteoNombrado[] {
  return VOLUMEN_DE_TRABAJO.map(({ etiqueta, singular, prefijos }) => {
    const total = eventos.filter((e) => coincidePrefijo(e.action, prefijos as string[])).length;
    return { nombre: total === 1 ? singular : etiqueta, total };
  }).filter((v) => v.total > 0);
}

/** «779 cuentas homologadas · 159 alertas validadas · 35 marcas» (vacío si no hay volumen). */
export function textoVolumen(volumen: readonly ConteoNombrado[] | null | undefined): string {
  return (volumen ?? []).map((v) => `${new Intl.NumberFormat("es-CO").format(v.total)} ${v.nombre}`).join(" · ");
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

  // Desde aquí se cuentan OPERACIONES, no registros (ver `agruparOperaciones`):
  // las acciones se nombran por su paso de trabajo.
  const operaciones = agruparOperaciones(ordenados);

  for (const e of operaciones) {
    const familia = clasificarFamilia(e.action, e.entity, e.detail);
    const etiquetaFamilia = ETIQUETA_FAMILIA[familia];

    usuarios.add(e.user);
    porFamilia.set(etiquetaFamilia, (porFamilia.get(etiquetaFamilia) ?? 0) + 1);
    porAccion.set(e.paso, (porAccion.get(e.paso) ?? 0) + 1);
    registrosPorAccion.set(e.paso, (registrosPorAccion.get(e.paso) ?? 0) + e.registros);
    porUsuario.set(e.user, (porUsuario.get(e.user) ?? 0) + 1);

    let ua = porUsuarioAccion.get(e.user);
    if (!ua) {
      ua = new Map();
      porUsuarioAccion.set(e.user, ua);
    }
    ua.set(e.paso, (ua.get(e.paso) ?? 0) + 1);

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
        accion: e.paso,
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
    volumen: volumenDeTrabajo(ordenados),
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
