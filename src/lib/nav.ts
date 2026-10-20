import type { IconName } from "@/components/icons";
import { MODULOS_IMPORT } from "@/lib/modulos/descriptores";
import { nombreModuloFabrica, PREVALIDADOR_MODULOS_ORDEN } from "@/lib/balance/prevalidador/catalogo";

export type NavChild = {
  label: string;
  href: string;
  count?: number;
  permiso?: string;
  /** Otro permiso con el que la página también deja entrar (basta uno de los dos). */
  permisoAlterno?: string;
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
  /** Otro permiso con el que la página también deja entrar (basta uno de los dos). */
  permisoAlterno?: string;
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
      // Con solo `balance:revisar` se entra a revisar (en modo consulta) y descartar borradores.
      { label: "Borrador Balance", href: "/balance/borradores", permiso: "balance:crear", permisoAlterno: "balance:revisar", modulo: "balance" },
      // Cargue AISLADO (CxC/CxP): no pasa por borradores ni por `/balance`, así que
      // necesita su propia entrada para no quedar invisible.
    ],
  },
  {
    label: "Conciliaciones",
    href: "/conciliacion/nueva",
    icon: "reconcile",
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
  { label: "Impuestos · DIAN", href: "/dian", icon: "tax", count: 2, permiso: "dian:ver", modulo: "dian" },
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

export type NavSeccion = { titulo: string; items: NavItem[] };

// Debajo de «Trabajo», el menú se agrupa por PARA QUÉ sirve cada pantalla (19/Oct/2026,
// pedido del usuario: antes todo iba bajo un solo «Configuración»). Una sección sin
// entradas visibles para el usuario no se muestra. Las entradas de los catálogos, de
// Clientes y equipo y de Parametrización se ven con el permiso de CONSULTA (todos los
// roles, desde el 19/Oct/2026); cada pantalla decide quién edita.
// Cada entrada principal tiene un símbolo propio: en la barra colapsada es
// la única referencia visual antes de consultar su etiqueta o expandirla.
export const configSecciones: NavSeccion[] = [
  {
    // Lo que se homologa en la operación diaria. El plan Russell y la homologación de
    // cada cliente van primero (5/Oct/2026, pedido del usuario).
    titulo: "Catálogos contables",
    items: [
      // «Plan Estándar Russell» se llamaba «Mapeo plan estándar».
      { label: "Plan Estándar Russell", href: "/config/mapeo", icon: "move-tree", permiso: "mapeo:ver", modulo: "mapeo" },
      // Homologación del PUC de cada cliente. Vivía como pestaña del plan estándar;
      // se separó porque es trabajo por cliente y no configuración del plan Russell.
      // Comparte permiso y módulo con aquella pantalla.
      { label: "Mapeo cuentas cliente", href: "/config/mapeo-cliente", icon: "account-link", permiso: "mapeo:ver", modulo: "mapeo" },
      // Carga masiva del catálogo de conceptos de nómina (cliente/código/concepto/cuenta).
      // Es la misma memoria del Consolidado del módulo NOM, por eso comparte su permiso.
      { label: "Conceptos de nómina", href: "/config/conceptos-nomina", icon: "wallet", permiso: "modulos_datos:ver", modulo: "modulos_datos" },
      { label: "Mapeos DIAN", href: "/config/dian", icon: "file-check", permiso: "mapeos_dian:ver", modulo: "mapeos_dian" },
    ],
  },
  {
    // Quién es quién: los clientes, las personas y la estructura de equipos.
    titulo: "Clientes y equipo",
    items: [
      { label: "Clientes", href: "/config/clientes", icon: "building", permiso: "clientes:ver", modulo: "clientes" },
      { label: "Usuarios", href: "/config/usuarios", icon: "users", permiso: "usuarios:ver", modulo: "usuarios" },
      { label: "Estructura", href: "/estructura", icon: "hierarchy", permiso: "estructura:ver", modulo: "estructura" },
    ],
  },
  {
    // Criterios que valen para todos los clientes, en el balance y en los módulos.
    titulo: "Parametrización",
    items: [
      {
        // Comparte permiso y clave de módulo con «Parámetros de alertas»: ambos son criterios de la
        // firma; todos los consultan y los editan Gerente, Socio y administradores
        // (`parametros:administrar`). Cada módulo de conciliación tiene su sub-ruta
        // (`/config/prevalidador/cxp`) con sus prefijos del prevalidador y las cuentas que concilia, en
        // el orden del informe del prevalidador. La vista con todos los módulos juntos se retiró del menú
        // el 5/Oct/2026 (repetía los mismos formularios): `/config/prevalidador` lleva al primer módulo.
        label: "Filtros de cuentas",
        href: "/config/prevalidador",
        icon: "filter",
        permiso: "parametros:ver",
        permisoAlterno: "parametros:administrar",
        modulo: "parametros",
        children: [
          ...PREVALIDADOR_MODULOS_ORDEN.map((codigo) => ({
            label: nombreModuloFabrica(codigo),
            href: `/config/prevalidador/${codigo.toLowerCase()}`,
            permiso: "parametros:ver",
            permisoAlterno: "parametros:administrar",
            modulo: "parametros",
          })),
        ],
      },
      { label: "Parámetros de alertas", href: "/config/parametros", icon: "sliders", permiso: "parametros:ver", permisoAlterno: "parametros:administrar", modulo: "parametros" },
    ],
  },
  {
    // Manejo de la plataforma: solo la ven los administradores.
    titulo: "Administración",
    items: [
      { label: "Permisos por rol", href: "/config/permisos", icon: "shield", permiso: "roles:configurar", modulo: "roles" },
      { label: "Maestros", href: "/config/maestros", icon: "database", permiso: "maestros:ver", modulo: "maestros" },
      { label: "Módulos y campos", href: "/config/modulos", icon: "grid", permiso: "modulos:ver", modulo: "modulos" },
      { label: "Publicación de módulos", href: "/config/publicacion-modulos", icon: "eye", permiso: "publicacion_modulos:ver", modulo: "publicacion_modulos" },
      {
        // Memoria de carga por fuente: el balance en la raíz y cada módulo del motor
        // genérico en su propia sub-ruta (`/config/perfiles-carga/inv`, …). Los hijos
        // se derivan del catálogo de descriptores, igual que «Módulos de conciliación».
        label: "Perfiles de carga",
        href: "/config/perfiles-carga",
        icon: "upload",
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
      { label: "Conexiones e integraciones", href: "/config/conexiones", icon: "link", permiso: "conexiones:ver", modulo: "conexiones" },
      { label: "Prompts de IA", href: "/config/prompts", icon: "ai", permiso: "prompts:administrar", modulo: "prompts" },
      { label: "Novedades", href: "/novedades", icon: "bell", permiso: "novedades:ver", modulo: "novedades" },
      { label: "Reportes para gerencia", href: "/config/reportes-ejecutivos", icon: "chart", permiso: "auditoria:reporte_ejecutivo", modulo: "auditoria", roles: ["Superadministrador"] },
    ],
  },
  {
    // Al final, junto al usuario.
    titulo: "Ayuda",
    items: [
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
    ],
  },
];

// Las mismas entradas en una lista plana y en el mismo orden, para quien recorre todo
// el menú sin importar la sección (ubicación de las novedades, etiquetas de accesos).
export const configNav: NavItem[] = configSecciones.flatMap((s) => s.items);
