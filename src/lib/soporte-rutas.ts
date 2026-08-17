import { configNav, workNav, type NavItem } from "@/lib/nav";

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

function claveDesdeHref(href: string): string {
  return href.replace(/^\//, "").replaceAll("/", ":") || "inicio";
}

function menusDeItem(item: NavItem): MenuNovedad[] {
  if (item.children?.length) {
    return item.children.map((hijo) => ({
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
export function catalogoUbicacionesNovedad(): RutaNovedad[] {
  const trabajo = workNav.map((item) => ({
    clave: `trabajo:${claveDesdeHref(item.href)}`,
    etiqueta: item.label,
    grupo: "Trabajo" as const,
    menus: menusDeItem(item),
  }));
  return [
    ...trabajo,
    {
      clave: "configuracion",
      etiqueta: "Configuración",
      grupo: "Configuración",
      menus: configNav.map((item) => ({
        clave: claveDesdeHref(item.href),
        etiqueta: item.label,
        href: item.href,
      })),
    },
  ];
}

export function resolverUbicacionNovedad(
  rutaClave: string,
  menuClave: string,
): { ruta: RutaNovedad; menu: MenuNovedad } | null {
  const ruta = catalogoUbicacionesNovedad().find((item) => item.clave === rutaClave);
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
