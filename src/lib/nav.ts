import type { IconName } from "@/components/icons";
import { MODULOS_IMPORT } from "@/lib/modulos/descriptores";

export type NavChild = {
  label: string;
  href: string;
  count?: number;
  permiso?: string;
  modulo?: string;
  roles?: readonly string[];
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
  roles?: readonly string[];
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
      { label: "Balance", href: "/balance", permiso: "balance:ver", modulo: "balance" },
      { label: "Borrador Balance", href: "/balance/borradores", permiso: "balance:crear", modulo: "balance" },
      // Cargue AISLADO (CxC/CxP): no pasa por borradores ni por `/balance`, así que
      // necesita su propia entrada para no quedar invisible.
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
  {
    // Motor genérico de módulos de conciliación (Inventarios, Cartera, CxP,
    // Ingresos, Activos Fijos, Nómina). Los hijos se derivan del catálogo de
    // descriptores: agregar un descriptor lo publica aquí solo. Los borradores
    // de cada módulo NO van en el menú: viven como pestaña dentro del módulo
    // (`/modulos/[codigo]/borradores`, ver `pestanas-modulo.tsx`).
    label: "Módulos de conciliación",
    href: `/modulos/${(Object.values(MODULOS_IMPORT)[0]?.codigo ?? "INV").toLowerCase()}`,
    icon: "box",
    permiso: "modulos_datos:ver",
    modulo: "modulos_datos",
    children: Object.values(MODULOS_IMPORT).map((m) => ({
      label: m.label,
      href: `/modulos/${m.codigo.toLowerCase()}`,
      permiso: "modulos_datos:ver",
      modulo: "modulos_datos",
    })),
  },
  { label: "Impuestos · DIAN", href: "/dian", icon: "doc", count: 2, permiso: "dian:ver", modulo: "dian" },
  {
    label: "Auditoría",
    href: "/auditoria",
    icon: "log",
    permiso: "auditoria:ver",
    modulo: "auditoria",
    children: [
      // "Accesos y tráfico" solo es visible para admins (permiso auditoria:accesos);
      // los roles de consulta ven únicamente el registro de acciones.
      { label: "Registro de acciones", href: "/auditoria", permiso: "auditoria:ver", modulo: "auditoria" },
      { label: "Accesos y tráfico", href: "/auditoria/accesos", permiso: "auditoria:accesos", modulo: "auditoria" },
      // Consumo y costos de IA: SOLO el Superadministrador (permiso auditoria:ia).
      { label: "Consumo de IA", href: "/auditoria/ia", permiso: "auditoria:ia", modulo: "auditoria" },
      // Medición del modelo de lectura de balances: mismo permiso (Superadmin).
      { label: "Lectura de balances", href: "/auditoria/lectura", permiso: "auditoria:ia", modulo: "auditoria" },
    ],
  },
];

export const configNav: NavItem[] = [
  { label: "Reportes para gerencia", href: "/config/reportes-ejecutivos", icon: "doc", permiso: "auditoria:reporte_ejecutivo", modulo: "auditoria", roles: ["Superadministrador"] },
  { label: "Publicación de módulos", href: "/config/publicacion-modulos", icon: "eye", permiso: "publicacion_modulos:ver", modulo: "publicacion_modulos" },
  { label: "Módulos y campos", href: "/config/modulos", icon: "settings", permiso: "modulos:ver", modulo: "modulos" },
  { label: "Clientes", href: "/config/clientes", icon: "users", permiso: "clientes:configurar", modulo: "clientes" },
  { label: "Maestros", href: "/config/maestros", icon: "box", permiso: "maestros:ver", modulo: "maestros" },
  { label: "Mapeo plan estándar", href: "/config/mapeo", icon: "settings", permiso: "mapeo:ver", modulo: "mapeo" },
  // Carga masiva del catálogo de conceptos de nómina (cliente/código/concepto/cuenta).
  // Es la misma memoria del Consolidado del módulo NOM, por eso comparte su permiso.
  { label: "Conceptos de nómina", href: "/config/conceptos-nomina", icon: "box", permiso: "modulos_datos:editar", modulo: "modulos_datos" },
  { label: "Mapeos DIAN", href: "/config/dian", icon: "doc", permiso: "mapeos_dian:ver", modulo: "mapeos_dian" },
  { label: "Usuarios", href: "/config/usuarios", icon: "users", permiso: "usuarios:ver", modulo: "usuarios" },
  { label: "Permisos por rol", href: "/config/permisos", icon: "settings", permiso: "roles:configurar", modulo: "roles" },
  { label: "Estructura", href: "/estructura", icon: "users", permiso: "estructura:ver", modulo: "estructura" },
  { label: "Novedades", href: "/novedades", icon: "bell", permiso: "novedades:ver", modulo: "novedades" },
  { label: "Prompts de IA", href: "/config/prompts", icon: "ai", permiso: "prompts:administrar", modulo: "prompts" },
  { label: "Parámetros de alertas", href: "/config/parametros", icon: "settings", permiso: "parametros:administrar", modulo: "parametros" },
  { label: "Entorno e Integraciones", href: "/config/entorno", icon: "settings", permiso: "entorno:administrar", modulo: "entorno" },
  // Comparte permiso y clave de módulo con «Parámetros de alertas»: ambos son
  // criterios de la firma que fija quien administra la herramienta.
  { label: "Cuentas del prevalidador", href: "/config/prevalidador", icon: "chart", permiso: "parametros:administrar", modulo: "parametros" },
  {
    // Memoria de carga por fuente: el balance en la raíz y cada módulo del motor
    // genérico en su propia sub-ruta (`/config/perfiles-carga/inv`, …). Los hijos
    // se derivan del catálogo de descriptores, igual que «Módulos de conciliación».
    label: "Perfiles de carga",
    href: "/config/perfiles-carga",
    icon: "ai",
    permiso: "perfiles_carga:administrar",
    modulo: "perfiles_carga",
    children: [
      { label: "Balance", href: "/config/perfiles-carga", permiso: "perfiles_carga:administrar", modulo: "perfiles_carga" },
      ...Object.values(MODULOS_IMPORT).map((m) => ({
        label: m.label,
        href: `/config/perfiles-carga/${m.codigo.toLowerCase()}`,
        permiso: "perfiles_carga:administrar",
        modulo: "perfiles_carga",
      })),
    ],
  },
  {
    label: "Mesa de ayuda",
    href: "/reportes",
    icon: "help",
    permiso: "soporte:ver",
    modulo: "soporte",
    children: [
      { label: "Ayuda", href: "/reportes", permiso: "soporte:ver", modulo: "soporte" },
      { label: "Gestión de reportes", href: "/config/soporte", permiso: "soporte:administrar", modulo: "soporte" },
    ],
  },
];
