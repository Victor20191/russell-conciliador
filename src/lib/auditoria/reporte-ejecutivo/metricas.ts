// Agregaciones puras de la bitácora de auditoría para el reporte ejecutivo de
// uso y adopción. Sin BD ni IA: recibe filas y produce la base factual.

export type FamiliaProceso =
  | "balance"
  | "inventarios"
  | "conciliaciones"
  | "dian"
  | "clientes"
  | "mapeo"
  | "usuarios"
  | "administracion"
  | "otros";

export const ETIQUETA_FAMILIA: Record<FamiliaProceso, string> = {
  balance: "Balance de comprobación",
  inventarios: "Inventarios",
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
  "inventarios",
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
};

export type SerieDia = {
  fecha: string; // YYYY-MM-DD
  total: number;
};

export type ResumenUsoFactual = {
  periodoDesde: string;
  periodoHasta: string;
  totalAcciones: number;
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
};

const PREFIJOS_BALANCE = [
  "CARGÓ BALANCE",
  "CONGELÓ BALANCE",
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
];

const PREFIJOS_CONCILIACIONES = ["EJECUTÓ", "ENVIÓ A REVISOR", "ACTUALIZÓ PARTIDA"];

const PREFIJOS_DIAN = ["GUARDÓ MAPEO DIAN", "PIDIÓ ANÁLISIS IA"];

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

const ACCIONES_INVENTARIOS_DIRECTAS = [
  "LEYÓ archivo de Inventarios",
  "CARGÓ Inventarios",
  "AGREGÓ ítems a Inventarios",
];

const ACCIONES_INVENTARIOS_POR_DETALLE = [
  "ACTUALIZÓ consolidación de módulo",
  "MARCÓ una diferencia del cruce contable",
  "EDITÓ la marca del cruce contable",
  "RETIRÓ la marca del cruce contable",
  "ELIMINÓ un soporte de la marca del cruce contable",
  "ELIMINÓ DATOS DE MÓDULO",
  "ELIMINÓ DATOS Y PERFILES DE CARGA DE MÓDULO",
];

function coincidePrefijo(action: string, prefijos: string[]): boolean {
  const a = action.trim();
  return prefijos.some((p) => a === p || a.startsWith(p));
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
  if (coincidePrefijo(a, ACCIONES_INVENTARIOS_DIRECTAS)) return "inventarios";
  if (
    coincidePrefijo(a, ACCIONES_INVENTARIOS_POR_DETALLE) &&
    (/\binv\b/i.test(detail) || /inventarios?/i.test(`${entity} ${detail}`))
  ) {
    return "inventarios";
  }
  if (coincidePrefijo(a, PREFIJOS_CONCILIACIONES)) return "conciliaciones";
  if (coincidePrefijo(a, PREFIJOS_DIAN)) return "dian";
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

/** Mapea moduleKey de Novedades → familia medible de adopción. */
export function familiaDesdeModulo(moduleKey: string | null | undefined): FamiliaProceso | null {
  if (!moduleKey) return null;
  const k = moduleKey.trim().toLowerCase();
  if (!k) return null;
  if (k === "balance" || k.includes("balance")) return "balance";
  if (k === "modulos_datos" || k === "inventarios" || k === "inventario" || k === "inv") {
    return "inventarios";
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
  if (path === "/modulos/inv" || path.startsWith("/modulos/inv/")) return "inventarios";
  if (path === "/conciliacion" || path.startsWith("/conciliacion/")) return "conciliaciones";
  if (path === "/dian" || path.startsWith("/dian/")) return "dian";
  if (path === "/config/clientes" || path.startsWith("/config/clientes/")) return "clientes";
  if (path === "/config/mapeo" || path.startsWith("/config/mapeo/")) return "mapeo";
  return null;
}

function aIso(d: Date | string): string {
  if (typeof d === "string") return new Date(d).toISOString();
  return d.toISOString();
}

function diaClave(d: Date | string): string {
  return aIso(d).slice(0, 10);
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
  const porUsuario = new Map<string, number>();
  const porUsuarioFamilia = new Map<string, Map<string, number>>();
  const porUsuarioAccion = new Map<string, Map<string, number>>();
  const porCliente = new Map<number, number>();
  const porDia = new Map<string, number>();
  const usuarios = new Set<string>();
  const clientes = new Set<number>();

  let primera: string | null = null;
  let ultima: string | null = null;

  const ordenados = [...params.eventos].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  for (const e of ordenados) {
    const familia = clasificarFamilia(e.action, e.entity, e.detail);
    const etiquetaFamilia = ETIQUETA_FAMILIA[familia];
    const iso = aIso(e.createdAt);
    if (!primera || iso < primera) primera = iso;
    if (!ultima || iso > ultima) ultima = iso;

    usuarios.add(e.user);
    porFamilia.set(etiquetaFamilia, (porFamilia.get(etiquetaFamilia) ?? 0) + 1);
    porAccion.set(e.action, (porAccion.get(e.action) ?? 0) + 1);
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
    if (!usuario || !Number.isFinite(conexion.total) || conexion.total <= 0) continue;
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
    .map(([fecha, total]) => ({ fecha, total }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  // Evidencia: las más recientes primero (recortada).
  const evidencia: EvidenciaAccion[] = [...ordenados]
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
      };
    });

  return {
    periodoDesde: aIso(params.periodoDesde),
    periodoHasta: aIso(params.periodoHasta),
    totalAcciones: params.eventos.length,
    totalNavegaciones,
    totalConexiones,
    totalUsuarios: usuarios.size,
    totalClientes: clientes.size,
    primeraAccion: primera,
    ultimaAccion: ultima,
    porFamilia: topN(porFamilia, 20),
    navegacionesPorFamilia: topN(porFamiliaNavegacion, 20),
    topAcciones: topN(porAccion, maxTopAcciones),
    topUsuarios,
    detalleUsuarios,
    topClientes,
    serieDiaria,
    evidencia,
  };
}

function recortar(texto: string, max: number): string {
  const t = texto.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

/** Conteos por familia de proceso (clave canónica, no etiqueta). */
export function conteosPorFamiliaCanon(eventos: EventoAuditoria[]): Record<FamiliaProceso, number> {
  const out: Record<FamiliaProceso, number> = {
    balance: 0,
    inventarios: 0,
    conciliaciones: 0,
    dian: 0,
    clientes: 0,
    mapeo: 0,
    usuarios: 0,
    administracion: 0,
    otros: 0,
  };
  for (const e of eventos) {
    const f = clasificarFamilia(e.action, e.entity, e.detail);
    out[f] += 1;
  }
  return out;
}
