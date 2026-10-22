// Crear un cliente sin perderlo de vista (puro). La cartera de cada rol sale de las asignaciones:
// el gerente, el senior y el staff por estar asignados al cliente, y el socio por sus gerentes.
// Crear un cliente con otros responsables lo dejaba fuera de la cartera de quien lo creó: lo veía
// en la lista pero ya no lo podía editar. Los administradores tienen alcance global.

import { ROLES_ALCANCE_GLOBAL, ROL_SOCIO } from "@/lib/rbac/jerarquia";

export type ResponsablesNuevos = { gerenteId: number; seniorId: number; staffIds: readonly number[] };

/**
 * El motivo para no crear el cliente con estos responsables, o null si queda en la cartera de quien
 * lo crea. `gerentesDelSocio`: los gerentes que reportan al usuario (solo se usa si es socio).
 */
export function motivoClienteFueraDeCartera(
  creador: { id: number; rol: string },
  r: ResponsablesNuevos,
  gerentesDelSocio: ReadonlySet<number>,
): string | null {
  if (ROLES_ALCANCE_GLOBAL.has(creador.rol)) return null;
  switch (creador.rol) {
    case ROL_SOCIO:
      return gerentesDelSocio.has(r.gerenteId)
        ? null
        : "Elige como gerente a uno de los gerentes que te reportan: si no, el cliente quedaría fuera de tu cartera.";
    case "Gerente":
      return r.gerenteId === creador.id ? null : "Quedas como gerente (valida) del cliente que creas: elígete en «Gerente».";
    case "Senior":
      return r.seniorId === creador.id ? null : "Quedas como senior (revisa) del cliente que creas: elígete en «Senior».";
    case "Staff":
      return r.staffIds.includes(creador.id) ? null : "Inclúyete como staff del cliente que creas.";
    default:
      return "Tu rol no tiene cartera de clientes: pide a un gerente, a un socio o a un administrador que cree el cliente.";
  }
}
