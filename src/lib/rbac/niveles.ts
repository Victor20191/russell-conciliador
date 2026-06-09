// ============================================================
// Niveles de acceso por MÓDULO — capa de presentación sobre la
// matriz granular `roles_permisos` (permisos "<modulo>:<accion>").
//
// La autoridad real de la app sigue siendo el permiso granular que
// leen los guards (ver src/lib/rbac/*). Esta capa agrupa las acciones
// de cada módulo en NIVELES ordenados y acumulativos, para que el
// Administrador edite la matriz como una sola opción por celda
// (rol × módulo) en lugar de marcar permiso por permiso.
//
// Conceder un nivel = conceder TODAS las acciones de ese nivel y de
// los inferiores para el módulo. Quitar = volver a "Ninguno".
//
// Mapeo acción → nivel (ACCION_NIVEL):
//   ver                              → Ver
//   comentar                         → Comentar
//   crear · editar · ejecutar · revisar → Operar
//   configurar · asignar · supervisar · eliminar → Administrar
//
// Un módulo solo OFRECE los niveles para los que tiene al menos una
// acción en el catálogo (más "Ninguno", siempre disponible).
// ============================================================

import type { IconName } from "@/components/icons";

export type Nivel = "ninguno" | "ver" | "comentar" | "operar" | "administrar";

/** Niveles en orden ascendente de poder. */
export const NIVELES: Nivel[] = ["ninguno", "ver", "comentar", "operar", "administrar"];

/** Rango numérico: define el orden y la acumulación (mayor incluye menores). */
export const NIVEL_RANK: Record<Nivel, number> = {
  ninguno: 0,
  ver: 1,
  comentar: 2,
  operar: 3,
  administrar: 4,
};

export type NivelTone = "ink" | "ok" | "blue" | "warn" | "ai";

export type NivelMeta = {
  nivel: Nivel;
  label: string;
  icon: IconName | null;
  tone: NivelTone; // el cliente lo traduce a clases Tailwind
  hint: string;
};

export const NIVEL_META: Record<Nivel, NivelMeta> = {
  ninguno: { nivel: "ninguno", label: "Ninguno", icon: null, tone: "ink", hint: "Sin acceso al módulo." },
  ver: { nivel: "ver", label: "Ver", icon: "eye", tone: "ok", hint: "Solo lectura y consulta." },
  comentar: { nivel: "comentar", label: "Comentar", icon: "msg", tone: "blue", hint: "Ver y participar en las conversaciones." },
  operar: { nivel: "operar", label: "Operar", icon: "play", tone: "warn", hint: "Crear, editar, ejecutar y revisar." },
  administrar: { nivel: "administrar", label: "Administrar", icon: "settings", tone: "ai", hint: "Configurar, asignar, supervisar y eliminar." },
};

/** A qué nivel pertenece cada ACCIÓN del catálogo de permisos. */
export const ACCION_NIVEL: Record<string, Nivel> = {
  ver: "ver",
  comentar: "comentar",
  crear: "operar",
  editar: "operar",
  ejecutar: "operar",
  revisar: "operar",
  configurar: "administrar",
  asignar: "administrar",
  supervisar: "administrar",
  eliminar: "administrar",
};

/** Nivel de una acción; las desconocidas se tratan como administrar (fail-safe restrictivo). */
export function nivelDeAccion(action: string): Nivel {
  return ACCION_NIVEL[action] ?? "administrar";
}

/** Forma mínima de un permiso para resolver niveles. */
export type PermisoLite = { id: number; code: string; module: string; action: string };

/**
 * Niveles que un módulo OFRECE en el dropdown: siempre "Ninguno", más
 * los niveles para los que existe al menos una acción del módulo.
 */
export function nivelesDeModulo(perms: PermisoLite[]): Nivel[] {
  const presentes = new Set<Nivel>();
  for (const p of perms) presentes.add(nivelDeAccion(p.action));
  const ofrecidos = NIVELES.filter((n) => n !== "ninguno" && presentes.has(n));
  return ["ninguno", ...ofrecidos];
}

/**
 * IDs de permiso que concede un nivel en un módulo (acumulativo): toda
 * acción cuyo nivel sea ≤ al nivel elegido. "Ninguno" → conjunto vacío.
 */
export function permisosDeNivel(perms: PermisoLite[], nivel: Nivel): number[] {
  const tope = NIVEL_RANK[nivel];
  return perms.filter((p) => NIVEL_RANK[nivelDeAccion(p.action)] <= tope).map((p) => p.id);
}

/**
 * Nivel ACTUAL de una celda para mostrar: el más alto con al menos un
 * permiso concedido. Una concesión no acumulativa (p.ej. solo "revisar")
 * se representa por su nivel (Operar); al guardarla se normaliza.
 */
export function nivelActual(perms: PermisoLite[], grantedIds: Set<number>): Nivel {
  let mejor: Nivel = "ninguno";
  for (const p of perms) {
    if (!grantedIds.has(p.id)) continue;
    const t = nivelDeAccion(p.action);
    if (NIVEL_RANK[t] > NIVEL_RANK[mejor]) mejor = t;
  }
  return mejor;
}

// ----- Árbol de presentación (filas de la matriz) -----
// Etiquetas y orden tomados de la navegación real (src/lib/nav.ts). Los
// submódulos con permiso propio (mapeo, razonabilidad, presentaciones)
// se anidan bajo su módulo padre como sub-filas.

export type ModuloItem = {
  module: string;
  label: string;
  icon: IconName;
  hijos?: { module: string; label: string }[];
};

export type GrupoModulos = { grupo: string; items: ModuloItem[] };

export const ARBOL_MODULOS: GrupoModulos[] = [
  {
    grupo: "Trabajo",
    items: [
      { module: "dashboard", label: "Inicio", icon: "home" },
      {
        module: "balance",
        label: "Balance de comprobación",
        icon: "doc",
        hijos: [
          { module: "mapeo", label: "Mapeo plan estándar" },
          { module: "razonabilidad", label: "Razonabilidad" },
        ],
      },
      { module: "conciliaciones", label: "Conciliaciones", icon: "play" },
      { module: "dian", label: "Impuestos · DIAN", icon: "doc" },
      {
        module: "requerimientos",
        label: "Requerimientos",
        icon: "folder",
        hijos: [{ module: "presentaciones", label: "Presentaciones" }],
      },
      { module: "calendario", label: "Calendario", icon: "calendar" },
      { module: "auditoria", label: "Auditoría", icon: "log" },
    ],
  },
  {
    grupo: "Configuración y administración",
    items: [
      { module: "clientes", label: "Clientes", icon: "users" },
      { module: "equipos", label: "Equipos de trabajo", icon: "users" },
      { module: "mapeos_dian", label: "Mapeos DIAN", icon: "doc" },
      { module: "usuarios", label: "Usuarios", icon: "users" },
      { module: "modulos", label: "Módulos y campos", icon: "box" },
      { module: "roles", label: "Permisos por rol", icon: "settings" },
      { module: "publicacion_modulos", label: "Publicación de módulos", icon: "eye" },
    ],
  },
];
