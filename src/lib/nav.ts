import type { IconName } from "@/components/icons";

export type NavChild = { label: string; href: string; count?: number };
export type NavItem = {
  label: string;
  href: string;
  icon: IconName;
  count?: number;
  children?: NavChild[];
  // Permiso canónico requerido para VER el ítem. Debe coincidir con el guard
  // de la página (requirePermiso) para que el menú no muestre enlaces que la
  // página luego deniega, ni oculte pantallas a las que el usuario sí entra.
  permiso?: string;
};

// Estructura del menú — rutas reales (App Router) que reemplazan el enrutado por estado del prototipo
export const workNav: NavItem[] = [
  { label: "Inicio", href: "/dashboard", icon: "home" },
  {
    label: "Balance de comprobación",
    href: "/balance",
    icon: "doc",
    children: [
      { label: "Mapeo plan estándar", href: "/balance/mapeo" },
      { label: "Estado de Resultado", href: "/balance/estado-resultado" },
      { label: "Balance", href: "/balance" },
      { label: "Razonabilidad", href: "/razonabilidad", count: 9 },
    ],
  },
  {
    label: "Nueva conciliación",
    href: "/conciliacion/nueva",
    icon: "play",
    children: [
      { label: "En proceso", href: "/conciliacion/en-proceso", count: 4 },
      { label: "Resultados", href: "/conciliacion/resultados" },
    ],
  },
  { label: "Impuestos · DIAN", href: "/dian", icon: "doc", count: 2 },
  {
    label: "Requerimientos",
    href: "/requerimientos",
    icon: "folder",
    children: [
      { label: "Plantillas", href: "/requerimientos" },
      { label: "Repositorios", href: "/requerimientos/repositorios" },
      { label: "Presentaciones", href: "/requerimientos/presentaciones" },
    ],
  },
  { label: "Calendario", href: "/calendario", icon: "calendar" },
  { label: "Auditoría", href: "/auditoria", icon: "log", permiso: "auditoria:ver" },
];

export const configNav: NavItem[] = [
  { label: "Módulos y campos", href: "/config/modulos", icon: "settings", permiso: "modulos:ver" },
  { label: "Clientes", href: "/config/clientes", icon: "users", permiso: "clientes:configurar" },
  { label: "Mapeos DIAN", href: "/config/dian", icon: "doc", permiso: "mapeos_dian:ver" },
  { label: "Equipos", href: "/config/equipos", icon: "users", permiso: "equipos:asignar" },
  { label: "Carteras", href: "/config/carteras", icon: "folder", permiso: "equipos:asignar" },
  { label: "Usuarios", href: "/config/usuarios", icon: "users", permiso: "usuarios:ver" },
  { label: "Permisos por rol", href: "/config/permisos", icon: "settings", permiso: "roles:configurar" },
];
