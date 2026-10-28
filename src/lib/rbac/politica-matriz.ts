import { PERMISOS, ROLES_MATRIZ } from "./catalogo";
import { ROL_SUPERADMINISTRADOR } from "./modulos-plataforma";

const rolesCanonicos = new Set<string>(ROLES_MATRIZ);
const permisosReservados = new Set(
  PERMISOS.filter((p) => p.roles.length === 1 && p.roles[0] === ROL_SUPERADMINISTRADOR)
    .map((p) => p.code),
);

/** La facultad de configurar roles no permite administrar la autoridad del Superadministrador. */
export function puedeEditarRolMatriz(actor: string, destino: string): boolean {
  return rolesCanonicos.has(destino)
    && (destino !== ROL_SUPERADMINISTRADOR || actor === ROL_SUPERADMINISTRADOR);
}

/** Los niveles de un módulo mixto no conceden ni revocan permisos reservados de forma indirecta. */
export function puedeGestionarPermisoMatriz(actor: string, permiso: string): boolean {
  return actor === ROL_SUPERADMINISTRADOR || !permisosReservados.has(permiso);
}
