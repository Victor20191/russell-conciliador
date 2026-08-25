import { configNav, workNav, type NavChild, type NavItem } from "@/lib/nav";
import type { PlatformModuleState } from "@/lib/rbac/modulos-plataforma";

export type MenuNovedad = {
  clave: string;
  etiqueta: string;
  href: string;
};

export type RutaNovedad = {
  clave: string;
  etiqueta: string;
  grupo: "Trabajo" | "Configuración";
  menus: MenuNovedad[];
};

export type OpcionesCatalogoNovedades = {
  /** Claves de módulos visibles/habilitados para el usuario. */
  modulosVisibles?: Iterable<string>;
  /** Claves de módulos en desarrollo que deben ocultarse. */
  modulosEnDesarrollo?: Iterable<string>;
  /** Estados de publicación de módulos de la plataforma. */
  modulos?: Iterable<Pick<PlatformModuleState, "key" | "enabledForNonAdmins" | "configurableForNonAdmins">>;
  /** Permisos del usuario actual para filtrar pantallas a las que tiene acceso. */
  permisos?: Iterable<string>;
  /** Rol del usuario actual. */
  rol?: string | null;
  /** Si es true, omite el filtro de módulos en desarrollo. */
  incluirEnDesarrollo?: boolean;
};

function claveDesdeHref(href: string): string {
  return href.replace(/^\//, "").replaceAll("/", ":") || "inicio";
}

function menusDeItem(
  item: NavItem,
  puedeVerItem?: (nav: NavItem | NavChild) => boolean,
): MenuNovedad[] {
  if (item.children?.length) {
    const hijos = puedeVerItem ? item.children.filter(puedeVerItem) : item.children;
    return hijos.map((hijo) => ({
      clave: claveDesdeHref(hijo.href),
      etiqueta: hijo.label,
      href: hijo.href,
    }));
  }
  return [
    {
      clave: claveDesdeHref(item.href),
      etiqueta: item.label,
      href: item.href,
    },
  ];
}

/** Catálogo de pantallas reales del menú: primero la ruta, luego el ítem de esa ruta. */
export function catalogoUbicacionesNovedad(opciones?: OpcionesCatalogoNovedades): RutaNovedad[] {
  let modulosEnDesarrolloSet: Set<string> | null = null;
  if (opciones?.modulosEnDesarrollo) {
    modulosEnDesarrolloSet = new Set(opciones.modulosEnDesarrollo);
  } else if (opciones?.modulos && !opciones.incluirEnDesarrollo) {
    modulosEnDesarrolloSet = new Set(
      [...opciones.modulos]
        .filter((m) => m.configurableForNonAdmins && !m.enabledForNonAdmins)
        .map((m) => m.key),
    );
  }

  const modulosVisiblesSet = opciones?.modulosVisibles ? new Set(opciones.modulosVisibles) : null;
  const permSet = opciones?.permisos ? new Set(opciones.permisos) : null;
  const rol = opciones?.rol;

  const puedeVer = (it: NavItem | NavChild): boolean => {
    if (modulosEnDesarrolloSet && it.modulo && modulosEnDesarrolloSet.has(it.modulo)) {
      return false;
    }
    if (modulosVisiblesSet && it.modulo && !modulosVisiblesSet.has(it.modulo)) {
      return false;
    }
    if (permSet && it.permiso && !permSet.has(it.permiso)) {
      return false;
    }
    if (rol && it.roles && !it.roles.includes(rol)) {
      return false;
    }
    return true;
  };

  const trabajo: RutaNovedad[] = [];
  for (const item of workNav) {
    if (!puedeVer(item)) continue;
    const menus = menusDeItem(item, puedeVer);
    if (menus.length === 0) continue;
    trabajo.push({
      clave: `trabajo:${claveDesdeHref(item.href)}`,
      etiqueta: item.label,
      grupo: "Trabajo" as const,
      menus,
    });
  }

  const menusConfig: MenuNovedad[] = [];
  for (const item of configNav) {
    if (!puedeVer(item)) continue;
    const menus = menusDeItem(item, puedeVer);
    menusConfig.push(...menus);
  }

  const resultado: RutaNovedad[] = [...trabajo];
  if (menusConfig.length > 0) {
    resultado.push({
      clave: "configuracion",
      etiqueta: "Configuración",
      grupo: "Configuración",
      menus: menusConfig,
    });
  }

  return resultado;
}

export function resolverUbicacionNovedad(
  rutaClave: string,
  menuClave: string,
  catalogoOpciones?: RutaNovedad[] | OpcionesCatalogoNovedades,
): { ruta: RutaNovedad; menu: MenuNovedad } | null {
  const catalogo = Array.isArray(catalogoOpciones)
    ? catalogoOpciones
    : catalogoUbicacionesNovedad(catalogoOpciones);
  const ruta = catalogo.find((item) => item.clave === rutaClave);
  if (!ruta) return null;
  const menu = ruta.menus.find((item) => item.clave === menuClave);
  if (!menu) return null;
  return { ruta, menu };
}

export function etiquetaUbicacionNovedad(ruta?: string | null, menu?: string | null): string | null {
  if (!ruta && !menu) return null;
  if (ruta && menu && ruta !== menu) return `${ruta} · ${menu}`;
  return ruta || menu || null;
}
