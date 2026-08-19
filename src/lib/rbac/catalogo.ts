// ============================================================
// Catálogo RBAC — Roles, permisos y matriz rol×permiso.
//
// FUENTE ÚNICA DE VERDAD, compartida por:
//   - el seed de BD            (prisma/seed-rbac.ts)
//   - las pruebas de permisos  (src/lib/rbac/permisos.test.ts)
// Así la validación refleja EXACTAMENTE lo que se siembra.
//
// Derivado de:
//   - "RB_GCT Roles y Responsabilidades – Área de Revisoría Fiscal"
//     (Russell Bedford, 04-jun-2026): los 5 roles y su segregación.
//   - La navegación real de la plataforma (src/lib/nav.ts): de ahí
//     salen los módulos protegibles (balance, conciliaciones, dian,
//     auditoría, clientes, usuarios…).
//
// Convención de `code` de rol: respeta los valores ya usados en
// usuarios.rol (capitalizados). "Administrador" es compartido por el
// PDF y el sistema legado → una sola fila.
// ============================================================

export type RolCatalogo = {
  code: string;
  name: string;
  description: string;
  rank: number; // legado/transición: alimenta ROLE_RANK/can(). La autoridad real es la MATRIZ.
  isOperative: boolean; // true SOLO para Staff (único que escribe/ejecuta)
  isSystem: boolean;
  legacy?: boolean;
};

export const ROLES: RolCatalogo[] = [
  // ----- Roles de plataforma -----
  {
    code: "Superadministrador", name: "Superadministrador", rank: 6, isOperative: false, isSystem: true,
    description: "Controla la publicación visual de módulos y conserva acceso completo a la administración de la plataforma.",
  },
  // ----- Roles del PDF (Área de Revisoría Fiscal) -----
  {
    code: "Socio", name: "Socio", rank: 5, isOperative: false, isSystem: true,
    description: "Consulta global. Vela por la calidad y la promesa de valor al cliente.",
  },
  {
    code: "Gerente", name: "Gerente", rank: 4, isOperative: false, isSystem: true,
    description: "Consulta y supervisión del cumplimiento de su cartera (Senior y Staff).",
  },
  {
    code: "Senior", name: "Senior", rank: 3, isOperative: false, isSystem: true,
    description: "Consulta y revisión. Valida la info del cliente, delega, revisa al Staff, configura clientes y asigna responsables por cliente.",
  },
  {
    code: "Staff", name: "Staff", rank: 2, isOperative: true, isSystem: true,
    description: "Único rol operativo. Ejecuta pruebas y conciliaciones, sube información, elabora papeles de trabajo y documenta diferencias.",
  },
  {
    code: "Administrador", name: "Administrador", rank: 4, isOperative: false, isSystem: true,
    description: "Administra la herramienta: parámetros, adecuaciones, actualizaciones y ajustes del sistema.",
  },
  // ----- Roles legado (compatibilidad: no dejar usuarios huérfanos) -----
  // Su mapeo a los roles del PDF está PENDIENTE de confirmación del
  // usuario; por eso NO reciben filas en la matriz (siguen con can()).
  {
    code: "Consulta", name: "Consulta (legado)", rank: 1, isOperative: false, isSystem: true, legacy: true,
    description: "Rol legado. Mapeo a los roles del PDF pendiente de confirmación.",
  },
  {
    code: "Auditor", name: "Auditor (legado)", rank: 2, isOperative: false, isSystem: true, legacy: true,
    description: "Rol legado. Mapeo a los roles del PDF pendiente de confirmación.",
  },
  {
    code: "Líder", name: "Líder (legado)", rank: 3, isOperative: false, isSystem: true, legacy: true,
    description: "Rol legado. Mapeo a los roles del PDF pendiente de confirmación.",
  },
];

export const ROLES_PDF = ["Socio", "Gerente", "Senior", "Staff", "Administrador"] as const;
export const ROLES_MATRIZ = ["Superadministrador", ...ROLES_PDF] as const;
export const ROLES_LEGADO = ["Consulta", "Auditor", "Líder"] as const;

export type Permiso = {
  code: string; // "<modulo>:<accion>" — llave canónica usada por los gates en código
  module: string;
  action: string;
  label: string;
  description?: string;
  roles: string[]; // roles del PDF que tienen el permiso (fuente de la MATRIZ)
};

// ----- Grupos de roles para legibilidad de la matriz -----
//
// DECISIÓN EXPLÍCITA · Superadministrador: administra la PLATAFORMA
// (usuarios, roles, módulos, publicación, configuración) pero NO opera
// datos de auditoría: ningún permiso operativo (crear/editar/ejecutar de
// balance, mapeo, conciliaciones, dian) ni de revisión/supervisión. La
// segregación del PDF ("Staff: único rol operativo") aplica también a él.
// Si el negocio decide lo contrario, agregarlo al grupo correspondiente
// y correr `npm run db:sync:rbac -- --aplicar`.
const SOLO_SUPERADMIN = ["Superadministrador"];
const ADMIN_PLATAFORMA = ["Superadministrador", "Administrador"];
const TODOS = ["Socio", "Gerente", "Senior", "Staff", "Administrador", "Superadministrador"];
const CONSULTA_Y_ADMIN = ["Socio", "Gerente", "Senior", "Administrador", "Superadministrador"]; // todos menos Staff
const SUPERVISORES = ["Gerente", "Socio"];
const SOLO_STAFF = ["Staff"];
// Cargar balance: el Staff (operativo) + los administradores de plataforma
// (alcance global), para que Administrador/Superadministrador también puedan
// cargar balances. NO incluye editar/congelar, que sigue siendo SOLO_STAFF.
const STAFF_Y_ADMIN = ["Staff", "Administrador", "Superadministrador"];
const SOLO_SENIOR = ["Senior"];
const SOLO_ADMIN = ADMIN_PLATAFORMA;
// El Senior asigna los responsables por cliente (PDF); el Administrador, como
// administrador de la plataforma, también gestiona la configuración de negocio
// (clientes y sus responsables).
const SENIOR_Y_ADMIN = ["Senior", "Administrador", "Superadministrador"];

export const PERMISOS: Permiso[] = [
  // ===== Lectura (consulta) — módulos derivados de nav.ts =====
  { code: "dashboard:ver", module: "dashboard", action: "ver", label: "Ver inicio", roles: TODOS },
  { code: "balance:ver", module: "balance", action: "ver", label: "Ver balance de comprobación", roles: TODOS },
  { code: "mapeo:ver", module: "mapeo", action: "ver", label: "Ver mapeo del plan estándar", roles: TODOS },
  { code: "conciliaciones:ver", module: "conciliaciones", action: "ver", label: "Ver conciliaciones", roles: TODOS },
  { code: "dian:ver", module: "dian", action: "ver", label: "Ver Impuestos · DIAN", roles: TODOS },
  { code: "clientes:ver", module: "clientes", action: "ver", label: "Ver clientes", roles: TODOS },
  { code: "auditoria:ver", module: "auditoria", action: "ver", label: "Ver registro de auditoría", roles: CONSULTA_Y_ADMIN },
  // Accesos y tráfico de rutas: expone la actividad de TODOS los usuarios
  // (quién entra, cuándo, a qué ruta) → admin-only, más restringido que la
  // bitácora de acciones (`auditoria:ver`).
  { code: "auditoria:accesos", module: "auditoria", action: "accesos", label: "Ver accesos y tráfico de rutas", roles: SOLO_ADMIN },
  // Reporte ejecutivo de uso y adopción: combina bitácora operativa + novedades
  // liberadas y expone información global de todos los usuarios y clientes.
  { code: "auditoria:reporte_ejecutivo", module: "auditoria", action: "reporte_ejecutivo", label: "Generar reporte ejecutivo de uso y adopción", roles: SOLO_SUPERADMIN },
  // Consumo y costos de IA (tokens y gasto de los escaneos con Claude). Información
  // de costos de la plataforma → SOLO el Superadministrador (más restringido aún
  // que la analítica de accesos, que es admin-only).
  { code: "auditoria:ia", module: "auditoria", action: "ia", label: "Ver consumo y costos de IA", roles: SOLO_SUPERADMIN },
  { code: "usuarios:ver", module: "usuarios", action: "ver", label: "Ver usuarios", roles: SOLO_ADMIN },
  { code: "maestros:ver", module: "maestros", action: "ver", label: "Ver maestros", roles: SOLO_ADMIN },
  { code: "modulos:ver", module: "modulos", action: "ver", label: "Ver módulos y campos", roles: SOLO_ADMIN },
  { code: "mapeos_dian:ver", module: "mapeos_dian", action: "ver", label: "Ver mapeos DIAN", roles: SENIOR_Y_ADMIN },

  // ===== Conversación (comentar) — participar en las conversaciones del
  // módulo. Lectura+colaboración: todos los roles del PDF pueden comentar
  // (la supervisión de Socio/Gerente/Senior se ejerce vía conversación).
  // Para datos de cliente exige, además, ALCANCE de lectura (cartera). =====
  { code: "balance:comentar", module: "balance", action: "comentar", label: "Comentar en balance", roles: TODOS },
  { code: "conciliaciones:comentar", module: "conciliaciones", action: "comentar", label: "Comentar en conciliaciones", roles: TODOS },
  { code: "dian:comentar", module: "dian", action: "comentar", label: "Comentar en Impuestos · DIAN", roles: TODOS },
  { code: "clientes:comentar", module: "clientes", action: "comentar", label: "Comentar en clientes", roles: TODOS },
  { code: "modulos_datos:comentar", module: "modulos_datos", action: "comentar", label: "Comentar en módulos de conciliación", roles: TODOS },
  // Comentarios a nivel de RENGLÓN del BORRADOR (staging). Se migran al definitivo al confirmar.
  { code: "modulos_borrador:ver", module: "modulos_borrador", action: "ver", label: "Ver comentarios del borrador de módulos", roles: TODOS },
  { code: "modulos_borrador:comentar", module: "modulos_borrador", action: "comentar", label: "Comentar en el borrador de módulos", roles: TODOS },

  // ===== Operativo (crear/editar/ejecutar) — SOLO Staff (excepto la carga
  // de balance, abierta también a administradores de plataforma) =====
  { code: "balance:crear", module: "balance", action: "crear", label: "Cargar balance", roles: STAFF_Y_ADMIN },
  { code: "balance:editar", module: "balance", action: "editar", label: "Editar balance", roles: SOLO_STAFF },
  { code: "balance:eliminar", module: "balance", action: "eliminar", label: "Eliminar balances y perfiles de carga", roles: SOLO_ADMIN },
  { code: "mapeo:editar", module: "mapeo", action: "editar", label: "Editar mapeo del plan estándar", roles: SOLO_STAFF },
  { code: "conciliaciones:crear", module: "conciliaciones", action: "crear", label: "Crear conciliación", roles: SOLO_STAFF },
  { code: "conciliaciones:editar", module: "conciliaciones", action: "editar", label: "Editar conciliación", roles: SOLO_STAFF },
  { code: "conciliaciones:ejecutar", module: "conciliaciones", action: "ejecutar", label: "Ejecutar conciliación", roles: SOLO_STAFF },
  { code: "dian:editar", module: "dian", action: "editar", label: "Editar declaración DIAN", roles: SOLO_STAFF },

  // ===== Revisión — SOLO Senior (revisa el trabajo del Staff) =====
  { code: "balance:revisar", module: "balance", action: "revisar", label: "Revisar balance", roles: SOLO_SENIOR },
  { code: "conciliaciones:revisar", module: "conciliaciones", action: "revisar", label: "Revisar conciliación", roles: SOLO_SENIOR },

  // ===== Datos de módulos (Inventarios, Cartera, CxP, Ingresos, Activos Fijos, Nómina) =====
  { code: "modulos_datos:ver", module: "modulos_datos", action: "ver", label: "Ver datos de módulos", roles: TODOS },
  { code: "modulos_datos:crear", module: "modulos_datos", action: "crear", label: "Cargar datos de módulos", roles: STAFF_Y_ADMIN },
  { code: "modulos_datos:editar", module: "modulos_datos", action: "editar", label: "Editar consolidación de módulos", roles: STAFF_Y_ADMIN },
  { code: "modulos_datos:eliminar", module: "modulos_datos", action: "eliminar", label: "Eliminar datos de módulos", roles: SOLO_ADMIN },

  // ===== Supervisión — Gerente y Socio =====
  { code: "clientes:supervisar", module: "clientes", action: "supervisar", label: "Supervisar cartera de clientes", roles: SUPERVISORES },

  // ===== Configuración de negocio — SOLO Senior =====
  { code: "clientes:crear", module: "clientes", action: "crear", label: "Crear cliente", roles: SENIOR_Y_ADMIN },
  { code: "clientes:editar", module: "clientes", action: "editar", label: "Editar cliente", roles: SENIOR_Y_ADMIN },
  { code: "clientes:configurar", module: "clientes", action: "configurar", label: "Configurar parámetros del cliente", roles: SENIOR_Y_ADMIN },
  { code: "mapeos_dian:configurar", module: "mapeos_dian", action: "configurar", label: "Configurar mapeos DIAN", roles: SENIOR_Y_ADMIN },

  // ===== Administración de la herramienta — SOLO Administrador =====
  // Parametrización del PLAN ESTÁNDAR Russell (catálogo global de cuentas
  // estándar): crear/editar/eliminar cuentas estándar. Es administración de la
  // herramienta (no datos de un cliente) → SOLO Administrador, distinta de
  // `mapeo:editar` (Staff, que mapea las cuentas del PUC del cliente).
  { code: "mapeo:administrar", module: "mapeo", action: "administrar", label: "Administrar plan estándar Russell", roles: SOLO_ADMIN },
  { code: "usuarios:crear", module: "usuarios", action: "crear", label: "Crear usuario", roles: SOLO_ADMIN },
  { code: "usuarios:editar", module: "usuarios", action: "editar", label: "Editar usuario", roles: SOLO_ADMIN },
  { code: "usuarios:eliminar", module: "usuarios", action: "eliminar", label: "Desactivar usuario", roles: SOLO_ADMIN },
  { code: "maestros:administrar", module: "maestros", action: "administrar", label: "Administrar maestros", roles: SOLO_ADMIN },
  { code: "roles:ver", module: "roles", action: "ver", label: "Ver matriz de roles y permisos", roles: SOLO_ADMIN },
  { code: "roles:configurar", module: "roles", action: "configurar", label: "Editar permisos por rol", roles: SOLO_ADMIN },
  { code: "modulos:configurar", module: "modulos", action: "configurar", label: "Configurar módulos y campos", roles: SOLO_ADMIN },
  { code: "dian:configurar", module: "dian", action: "configurar", label: "Configurar formularios DIAN", roles: SOLO_ADMIN },
  { code: "publicacion_modulos:ver", module: "publicacion_modulos", action: "ver", label: "Ver publicación de módulos", roles: SOLO_SUPERADMIN },
  { code: "publicacion_modulos:configurar", module: "publicacion_modulos", action: "configurar", label: "Configurar publicación de módulos", roles: SOLO_SUPERADMIN },

  // ===== Estructura · mapa organizacional (solo lectura) — SOLO Administrador =====
  // Visualiza la jerarquía Socio→Gerente→Senior→Staff y los clientes que
  // atiende cada persona. Módulo admin-only: la visibilidad la da este permiso
  // (no la publicación de módulos, inerte para `estructura`). Sin acción de
  // administrar: es de pura consulta (los datos se editan en Usuarios/Clientes).
  { code: "estructura:ver", module: "estructura", action: "ver", label: "Ver estructura de equipos", roles: SOLO_ADMIN },

  // ===== Novedades · changelog + control de versiones — SOLO Administrador =====
  // Módulo admin-only (por ahora): los administradores consultan el avance de la
  // plataforma y administran su contenido. La visibilidad real la da este
  // permiso (no la publicación de módulos, que para `novedades` queda inerte).
  { code: "novedades:ver", module: "novedades", action: "ver", label: "Ver novedades", roles: SOLO_ADMIN },
  { code: "novedades:administrar", module: "novedades", action: "administrar", label: "Administrar novedades", roles: SOLO_ADMIN },

  // ===== Reportes / novedades internas — todos los usuarios =====
  // Cualquier rol autenticado monta novedades y consulta todos los tickets
  // internos. Solo Administrador y Superadministrador (Xentria) cambian
  // estados y documentan la solución.
  { code: "soporte:ver", module: "soporte", action: "ver", label: "Ver reportes", roles: TODOS },
  { code: "soporte:crear", module: "soporte", action: "crear", label: "Crear reporte", roles: TODOS },
  { code: "soporte:administrar", module: "soporte", action: "administrar", label: "Administrar reportes", roles: SOLO_ADMIN },

  // ===== Prompts de IA — SOLO Superadministrador =====
  // Ver y editar los prompts de sistema que la plataforma envía a la IA
  // (extracción de balances, mapeo de cuentas). Es configuración global de la
  // plataforma (afecta a todos los clientes), no datos de un cliente → SOLO el
  // Superadministrador, igual que el consumo de IA (`auditoria:ia`).
  { code: "prompts:administrar", module: "prompts", action: "administrar", label: "Administrar prompts de IA", roles: SOLO_SUPERADMIN },

  // ===== Parámetros de la plataforma — Administrador y Superadministrador =====
  // Umbrales que separan los avisos informativos de las alertas accionables en el
  // balance (diferencias y saldos contrarios). Es un criterio de MATERIALIDAD de la
  // firma, no un dato de cliente: lo fija quien administra la herramienta.
  { code: "parametros:administrar", module: "parametros", action: "administrar", label: "Administrar parámetros de alertas", roles: SOLO_ADMIN },

  // ===== Perfiles de carga de balances — Administrador y Superadministrador =====
  // Formatos memorizados por huella, correcciones por cuenta y preferencias de
  // carga de CADA cliente. Determinan cómo la plataforma interpreta los archivos
  // (y cuándo se salta la IA): es parametrización técnica de la herramienta, no
  // trabajo de auditoría → sale de la ficha del cliente y de las pantallas de
  // balance y queda en Configuración › Perfiles de carga, admin-only.
  { code: "perfiles_carga:administrar", module: "perfiles_carga", action: "administrar", label: "Administrar perfiles de carga (balances y módulos)", roles: SOLO_ADMIN },
];

// ----- MATRIZ rol×permiso derivada del catálogo (solo roles del PDF) -----
export type Matriz = Record<string, string[]>;

export const MATRIZ: Matriz = (() => {
  const m: Matriz = {};
  for (const r of ROLES_MATRIZ) m[r] = [];
  for (const p of PERMISOS) {
    for (const r of p.roles) {
      (m[r] ??= []).push(p.code);
    }
  }
  return m;
})();

// ============================================================
// Mapeo de roles LEGADO → rol del PDF.
//
// El sistema actual usa Consulta/Auditor/Líder/Administrador. El PDF
// define Socio/Gerente/Senior/Staff/Administrador. Esta es la
// equivalencia recomendada (el usuario confirma el caso ambiguo).
//
// Se realiza como HERENCIA DE PERMISOS en la matriz (ver
// matrizConLegado): cada rol legado obtiene los permisos de su rol
// del PDF, SIN reescribir usuarios.rol y SIN tocar nav.ts/can(). Es la
// vía segura: los usuarios existentes conservan su rol y ranking, y la
// matriz queda completa para cuando la app autorice por permisos.
//
// La conversión real de usuarios.rol (Auditor→Staff, Líder→Senior) es
// opcional y se deja lista en prisma/backfill-roles.ts (dry-run).
// ============================================================

export type MapeoLegado = {
  legacy: string;
  pdf: string | null; // rol del PDF equivalente (null = sin equivalente directo → solo lectura)
  confidence: "alta" | "media";
  rationale: string;
};

export const MAPEO_LEGADO_PDF: MapeoLegado[] = [
  {
    legacy: "Administrador", pdf: "Administrador", confidence: "alta",
    rationale: "Mismo rol: administra la herramienta. Identidad (misma columna, no cambia).",
  },
  {
    legacy: "Auditor", pdf: "Staff", confidence: "alta",
    rationale: "Es quien ejecuta el trabajo operativo de auditoría → único rol operativo del PDF.",
  },
  {
    legacy: "Líder", pdf: "Senior", confidence: "alta",
    rationale: "Configura clientes, asigna responsables y revisa al Staff; coincide con los gates minRole:'Líder' de nav.ts.",
  },
  {
    legacy: "Consulta", pdf: null, confidence: "media",
    rationale: "Solo-lectura y rol por defecto de usuarios nuevos. Sin equivalente 'viewer junior' en el PDF: se trata como lectura general. Reasignar caso por caso (¿Socio/Gerente/Senior?).",
  },
];

// Permisos de "lectura general": los `:ver` disponibles para todos los
// roles del PDF (marcados porque incluso el Staff los tiene). Es el
// conjunto que hereda "Consulta" al no tener equivalente en el PDF.
export const PERMISOS_LECTURA_GENERAL: string[] = PERMISOS
  .filter((p) => p.action === "ver" && p.roles.includes("Staff"))
  .map((p) => p.code);

/**
 * Matriz rol×permiso COMPLETA: los 5 roles del PDF + los roles legado,
 * a los que se les hereda el conjunto de permisos de su rol del PDF
 * (o la lectura general si no hay equivalente). Es la que siembra
 * prisma/seed-rbac.ts para que NINGÚN rol quede sin permisos.
 */
export function matrizConLegado(): Matriz {
  const m: Matriz = {};
  for (const r of ROLES_MATRIZ) m[r] = [...(MATRIZ[r] ?? [])];
  for (const map of MAPEO_LEGADO_PDF) {
    if (map.legacy === map.pdf) continue; // identidad (Administrador): ya está
    m[map.legacy] = map.pdf ? [...(MATRIZ[map.pdf] ?? [])] : [...PERMISOS_LECTURA_GENERAL];
  }
  return m;
}
