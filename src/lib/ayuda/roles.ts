// Ayuda en pantalla — quién puede hacer cada acción, leído de la MATRIZ viva (puro).
//
// El layout calcula `rolesPorPermiso` con `getMatriz()` y la publicación de módulos (lo mismo
// que usan los candados) y lo pasa al panel; el panel cruza cada `Regla` de la ficha con eso.
// Así, si un administrador cambia un permiso en «Permisos por rol», la ayuda cambia sola.

import type { Matriz } from "@/lib/rbac/catalogo";
import { ROLES_ALCANCE_GLOBAL } from "@/lib/rbac/jerarquia";
import {
  moduloDelPermiso,
  moduloPublicadoParaRol,
  type PlatformModuleState,
} from "@/lib/rbac/modulos-plataforma";
import type { Regla, Via } from "./tipos";

/** Permiso → roles (de los seis de la matriz) que lo tienen y ven su módulo. */
export type RolesAyuda = Record<string, string[]>;

/** Orden de lectura de los roles en la ayuda: de lo operativo a la administración. */
export const ORDEN_ROLES_AYUDA = ["Staff", "Senior", "Gerente", "Socio", "Administrador", "Superadministrador"] as const;

/**
 * Asignaciones que dan alcance de ESCRITURA sobre un cliente. Lo decide `filasResponsables`
 * (`src/app/actions/clients.ts`): staff y senior con `writeScope`; el gerente solo lee.
 */
export const ROLES_ESCRITURA_ASIGNADA: ReadonlySet<string> = new Set(["Staff", "Senior"]);
const ROLES_SENIOR_O_GERENTE: ReadonlySet<string> = new Set(["Senior", "Gerente"]);

type EstadoPublicacion = Pick<PlatformModuleState, "key" | "enabledForNonAdmins" | "configurableForNonAdmins">;

/**
 * Para cada permiso pedido, los roles de la matriz que lo tienen y para los que su módulo está
 * publicado. Los roles legado no entran (la ayuda habla de los seis roles vigentes) y un rol
 * ausente de la matriz no tiene permisos.
 */
export function rolesPorPermiso(
  matriz: Matriz,
  publicacion: Iterable<EstadoPublicacion>,
  permisos: Iterable<string>,
): RolesAyuda {
  const estados = [...publicacion];
  const resultado: RolesAyuda = {};
  for (const permiso of new Set(permisos)) {
    const modulo = moduloDelPermiso(permiso);
    resultado[permiso] = ORDEN_ROLES_AYUDA.filter(
      (rol) => (matriz[rol] ?? []).includes(permiso) && moduloPublicadoParaRol(rol, modulo, estados),
    );
  }
  return resultado;
}

/**
 * ¿El rol cumple la vía, sabiendo qué permisos tiene? Una vía sin permisos es la de lo que solo
 * pide una sesión (`REGLAS.cualquierUsuario`, Mi perfil): la cumple cualquier rol.
 */
export function rolCumpleVia(via: Via, rol: string, tiene: (permiso: string) => boolean): boolean {
  if (via.permisos.length === 0) return via.alcance === "ninguno";
  if (!via.permisos.every(tiene)) return false;
  if (ROLES_ALCANCE_GLOBAL.has(rol)) return true;
  if (via.alcance === "escritura") return ROLES_ESCRITURA_ASIGNADA.has(rol);
  if (via.alcance === "senior_o_gerente") return ROLES_SENIOR_O_GERENTE.has(rol);
  return true;
}

/**
 * Sobre qué clientes puede el rol: `todos` (administradores, en una acción sobre clientes),
 * `propios` (los suyos: asignados o, el Socio, los de sus gerentes) o null (no depende del cliente).
 */
export type AlcanceRol = "todos" | "propios" | null;

export type RolAyuda = { rol: string; alcance: AlcanceRol };

/** Los roles que pueden hacer la acción, en `ORDEN_ROLES_AYUDA`, con su alcance. */
export function rolesDeRegla(regla: Regla, roles: RolesAyuda): RolAyuda[] {
  return ORDEN_ROLES_AYUDA.flatMap((rol) => {
    const vias = regla.filter((v) => rolCumpleVia(v, rol, (p) => (roles[p] ?? []).includes(rol)));
    if (vias.length === 0) return [];
    // Manda la vía menos restrictiva que cumple: si alguna no depende del cliente, no hay alcance.
    const sinCliente = vias.some((v) => v.alcance === "ninguno");
    const alcance: AlcanceRol = sinCliente ? null : ROLES_ALCANCE_GLOBAL.has(rol) ? "todos" : "propios";
    return [{ rol, alcance }];
  });
}

/**
 * ¿El rol del usuario que mira puede hacer la acción? Con un rol de la matriz se usa lo mismo que
 * los chips; con un rol legado (Líder, Auditor, Consulta), sus propios permisos.
 */
export function rolDelUsuarioPuede(
  regla: Regla,
  rol: string,
  roles: RolesAyuda,
  permisosDelUsuario: readonly string[],
): boolean {
  if ((ORDEN_ROLES_AYUDA as readonly string[]).includes(rol)) {
    return rolesDeRegla(regla, roles).some((r) => r.rol === rol);
  }
  return regla.some((v) => rolCumpleVia(v, rol, (p) => permisosDelUsuario.includes(p)));
}

const ETIQUETA_ALCANCE: Record<Exclude<AlcanceRol, null>, string> = {
  todos: "todos los clientes",
  propios: "sus clientes",
};

/** Los roles que operan el día a día: los que lee la ayuda (los administradores no operan). */
export const ROLES_OPERACION = ["Staff", "Senior", "Gerente", "Socio"] as const satisfies readonly (typeof ORDEN_ROLES_AYUDA)[number][];

/**
 * Texto de los chips de roles. Quien consulta la ayuda es la operación (Staff, Senior, Gerente,
 * Socio), así que los administradores NO se listan aunque puedan hacer la acción: repetirlos en
 * cada una confundía (decisión del usuario). Solo es presentación: el permiso no cambia. Si la
 * acción es solo de la administración, se dice así en vez de dejarla sin roles; con los cuatro
 * roles de la operación, «Todos los roles».
 */
export function chipsDeRoles(lista: readonly RolAyuda[]): { texto: string; detalle: string | null }[] {
  const operacion = lista.filter((r) => !ROLES_ALCANCE_GLOBAL.has(r.rol));
  if (operacion.length === 0) {
    if (lista.length === 0) return [];
    return [{ texto: lista.length === 1 ? `Solo el ${lista[0]!.rol}` : "Solo administradores", detalle: null }];
  }
  if (operacion.length === ROLES_OPERACION.length) {
    const porCliente = operacion.some((r) => r.alcance !== null);
    return [{ texto: "Todos los roles", detalle: porCliente ? "cada uno en los clientes que consulta" : null }];
  }
  return operacion.map((r) => ({ texto: r.rol, detalle: r.alcance ? ETIQUETA_ALCANCE[r.alcance] : null }));
}
