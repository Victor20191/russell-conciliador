import type { IconName } from "@/components/icons";

export type PlatformModuleKey =
  | "dashboard"
  | "balance"
  | "mapeo"
  | "conciliaciones"
  | "dian"
  | "auditoria"
  | "clientes"
  | "maestros"
  | "mapeos_dian"
  | "usuarios"
  | "modulos"
  | "roles"
  | "publicacion_modulos"
  | "novedades"
  | "estructura"
  | "prompts";

export type PlatformModuleDefinition = {
  key: PlatformModuleKey;
  label: string;
  description: string;
  group: "Trabajo" | "Configuración";
  icon: IconName;
  order: number;
  enabledForNonAdmins: boolean;
  configurableForNonAdmins: boolean;
};

export type PlatformModuleState = PlatformModuleDefinition & {
  id?: number;
};

export const ROL_SUPERADMINISTRADOR = "Superadministrador";
export const ROLES_ADMINISTRATIVOS = ["Administrador", ROL_SUPERADMINISTRADOR] as const;

export function esRolAdministrativo(role: string | null | undefined): boolean {
  return !!role && ROLES_ADMINISTRATIVOS.includes(role as (typeof ROLES_ADMINISTRATIVOS)[number]);
}

export function esSuperadministrador(role: string | null | undefined): boolean {
  return role === ROL_SUPERADMINISTRADOR;
}

export const MODULOS_PLATAFORMA: PlatformModuleDefinition[] = [
  {
    key: "dashboard",
    label: "Inicio",
    description: "Resumen operativo de la plataforma.",
    group: "Trabajo",
    icon: "home",
    order: 10,
    enabledForNonAdmins: true,
    configurableForNonAdmins: false,
  },
  {
    key: "balance",
    label: "Balance de comprobación",
    description: "Carga, versionamiento y consulta del balance por cliente.",
    group: "Trabajo",
    icon: "doc",
    order: 20,
    enabledForNonAdmins: true,
    configurableForNonAdmins: true,
  },
  {
    key: "mapeo",
    label: "Mapeo plan estándar",
    description: "Parametrización de cuentas contra el plan estándar Russell.",
    group: "Configuración",
    icon: "settings",
    order: 125,
    enabledForNonAdmins: true,
    configurableForNonAdmins: true,
  },
  {
    key: "conciliaciones",
    label: "Conciliaciones",
    description: "Cruces entre contabilidad y módulos auxiliares.",
    group: "Trabajo",
    icon: "play",
    order: 50,
    enabledForNonAdmins: true,
    configurableForNonAdmins: true,
  },
  {
    key: "dian",
    label: "Impuestos DIAN",
    description: "Cruce de declaraciones contra contabilidad.",
    group: "Trabajo",
    icon: "doc",
    order: 60,
    enabledForNonAdmins: true,
    configurableForNonAdmins: true,
  },
  {
    key: "auditoria",
    label: "Auditoría",
    description: "Registro de actividad del sistema.",
    group: "Configuración",
    icon: "log",
    order: 100,
    enabledForNonAdmins: true,
    configurableForNonAdmins: true,
  },
  {
    key: "clientes",
    label: "Clientes",
    description: "Administración de clientes y parámetros de negocio.",
    group: "Configuración",
    icon: "users",
    order: 110,
    enabledForNonAdmins: true,
    configurableForNonAdmins: true,
  },
  {
    key: "maestros",
    label: "Maestros",
    description: "Catálogos base de responsables, ERP y sectores.",
    group: "Configuración",
    icon: "box",
    order: 120,
    enabledForNonAdmins: true,
    configurableForNonAdmins: true,
  },
  {
    key: "mapeos_dian",
    label: "Mapeos DIAN",
    description: "Parametrización de cuentas para formularios DIAN.",
    group: "Configuración",
    icon: "doc",
    order: 130,
    enabledForNonAdmins: true,
    configurableForNonAdmins: true,
  },
  {
    key: "usuarios",
    label: "Usuarios",
    description: "Administración de cuentas de usuario.",
    group: "Configuración",
    icon: "users",
    order: 140,
    enabledForNonAdmins: true,
    configurableForNonAdmins: true,
  },
  {
    key: "modulos",
    label: "Módulos y campos",
    description: "Campos estándar por módulo de conciliación.",
    group: "Configuración",
    icon: "box",
    order: 150,
    enabledForNonAdmins: true,
    configurableForNonAdmins: true,
  },
  {
    key: "roles",
    label: "Permisos por rol",
    description: "Matriz de permisos por cargo.",
    group: "Configuración",
    icon: "settings",
    order: 160,
    enabledForNonAdmins: true,
    configurableForNonAdmins: true,
  },
  {
    key: "publicacion_modulos",
    label: "Publicación de módulos",
    description: "Control de visibilidad para usuarios no superadministradores.",
    group: "Configuración",
    icon: "eye",
    order: 170,
    enabledForNonAdmins: true,
    configurableForNonAdmins: true,
  },
  {
    // Admin-only: NO se publica a no-administradores (enabled=false) y NO es
    // configurable desde Publicación de módulos (configurable=false), de modo
    // que el toggle queda inerte y la única barrera es el permiso novedades:ver
    // (SOLO_ADMIN). Con configurable=false, moduloPublicadoParaRol devuelve true
    // para todos, pero el filtro de permiso lo mantiene admin-only.
    key: "novedades",
    label: "Novedades",
    description: "Changelog y control de versiones de la plataforma.",
    group: "Configuración",
    icon: "bell",
    order: 180,
    enabledForNonAdmins: false,
    configurableForNonAdmins: false,
  },
  {
    // Admin-only, igual que novedades: la visibilidad la gobierna el permiso
    // estructura:ver (SOLO_ADMIN); la publicación de módulos queda inerte
    // (configurable=false ⇒ moduloPublicadoParaRol devuelve true para todos).
    key: "estructura",
    label: "Estructura",
    description: "Mapa de la organización: socios, gerentes, seniors, staff y los clientes que atienden.",
    group: "Configuración",
    icon: "users",
    order: 190,
    enabledForNonAdmins: false,
    configurableForNonAdmins: false,
  },
  {
    // Solo-Superadministrador: la visibilidad la gobierna el permiso
    // prompts:administrar (SOLO_SUPERADMIN); la publicación de módulos queda
    // inerte (configurable=false ⇒ moduloPublicadoParaRol devuelve true).
    key: "prompts",
    label: "Prompts de IA",
    description: "Instrucciones de sistema que la plataforma envía a la IA (extracción de balances y mapeo de cuentas).",
    group: "Configuración",
    icon: "ai",
    order: 200,
    enabledForNonAdmins: false,
    configurableForNonAdmins: false,
  },
];

export const MODULOS_PLATAFORMA_KEYS = new Set<string>(MODULOS_PLATAFORMA.map((m) => m.key));

const DEFAULT_BY_KEY = new Map<string, PlatformModuleDefinition>(
  MODULOS_PLATAFORMA.map((m) => [m.key, m]),
);

export function moduloDelPermiso(permiso: string): string {
  return permiso.split(":")[0] ?? "";
}

export function moduloPublicadoParaRol(
  role: string,
  moduleKey: string,
  states: Iterable<Pick<PlatformModuleState, "key" | "enabledForNonAdmins" | "configurableForNonAdmins">>,
): boolean {
  if (esSuperadministrador(role)) return true;
  const estado = [...states].find((m) => m.key === moduleKey);
  const definicion = estado ?? DEFAULT_BY_KEY.get(moduleKey);
  if (!definicion) return true;
  if (!definicion.configurableForNonAdmins) return true;
  return definicion.enabledForNonAdmins;
}
