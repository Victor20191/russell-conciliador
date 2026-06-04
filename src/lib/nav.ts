import type { IconName } from "@/components/icons";

export type NavChild = { label: string; href: string; count?: number };
export type NavItem = {
  label: string;
  href: string;
  icon: IconName;
  count?: number;
  children?: NavChild[];
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
  { label: "Auditoría", href: "/auditoria", icon: "log" },
];

export const configNav: NavItem[] = [
  { label: "Módulos y campos", href: "/config/modulos", icon: "settings" },
  { label: "Clientes", href: "/config/clientes", icon: "users" },
  { label: "Mapeos DIAN", href: "/config/dian", icon: "doc" },
];
