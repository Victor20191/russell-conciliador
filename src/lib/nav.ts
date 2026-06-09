import type { IconName } from "@/components/icons";

export type NavChild = {
  label: string;
  href: string;
  count?: number;
  permiso?: string;
  modulo?: string;
};
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
  modulo?: string;
};

// Estructura del menú — rutas reales (App Router) que reemplazan el enrutado por estado del prototipo
export const workNav: NavItem[] = [
  { label: "Inicio", href: "/dashboard", icon: "home", permiso: "dashboard:ver", modulo: "dashboard" },
  {
    label: "Balance de comprobación",
    href: "/balance",
    icon: "doc",
    permiso: "balance:ver",
    modulo: "balance",
    children: [
      { label: "Mapeo plan estándar", href: "/balance/mapeo", permiso: "mapeo:ver", modulo: "mapeo" },
      { label: "Estado de Resultado", href: "/balance/estado-resultado", permiso: "balance:ver", modulo: "balance" },
      { label: "Balance", href: "/balance", permiso: "balance:ver", modulo: "balance" },
    ],
  },
  {
    label: "Conciliaciones",
    href: "/conciliacion/nueva",
    icon: "play",
    permiso: "conciliaciones:ver",
    modulo: "conciliaciones",
    children: [
      { label: "Nueva conciliación", href: "/conciliacion/nueva", permiso: "conciliaciones:crear", modulo: "conciliaciones" },
      { label: "En proceso", href: "/conciliacion/en-proceso", count: 4, permiso: "conciliaciones:ver", modulo: "conciliaciones" },
      { label: "Resultados", href: "/conciliacion/resultados", permiso: "conciliaciones:ver", modulo: "conciliaciones" },
    ],
  },
  { label: "Impuestos · DIAN", href: "/dian", icon: "doc", count: 2, permiso: "dian:ver", modulo: "dian" },
  { label: "Auditoría", href: "/auditoria", icon: "log", permiso: "auditoria:ver", modulo: "auditoria" },
];

export const configNav: NavItem[] = [
  { label: "Publicación de módulos", href: "/config/publicacion-modulos", icon: "eye", permiso: "publicacion_modulos:ver", modulo: "publicacion_modulos" },
  { label: "Módulos y campos", href: "/config/modulos", icon: "settings", permiso: "modulos:ver", modulo: "modulos" },
  { label: "Clientes", href: "/config/clientes", icon: "users", permiso: "clientes:configurar", modulo: "clientes" },
  { label: "Mapeos DIAN", href: "/config/dian", icon: "doc", permiso: "mapeos_dian:ver", modulo: "mapeos_dian" },
  { label: "Equipos", href: "/config/equipos", icon: "users", permiso: "equipos:asignar", modulo: "equipos" },
  { label: "Cartera clientes", href: "/config/carteras", icon: "folder", permiso: "equipos:asignar", modulo: "equipos" },
  { label: "Usuarios", href: "/config/usuarios", icon: "users", permiso: "usuarios:ver", modulo: "usuarios" },
  { label: "Permisos por rol", href: "/config/permisos", icon: "settings", permiso: "roles:configurar", modulo: "roles" },
];
