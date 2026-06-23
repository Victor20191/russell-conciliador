// ============================================================
// Construcción del ÁRBOL ORGANIZACIONAL para el módulo "Estructura".
//
// Función PURA (sin Prisma/BD): a partir de los usuarios, las aristas de
// jerarquia_usuarios y las asignaciones de cliente, arma un árbol navegable
// Socio → Gerente → Senior → Staff, con los clientes que atiende cada
// persona. Para el Socio (que no se asigna directamente) los clientes se
// DERIVAN de sus gerentes subordinados, reutilizando la misma regla que usa
// la autorización (derivarAsignacionesSocio en jerarquia.ts) para que la
// vista y los permisos cuenten siempre lo mismo.
//
// El resultado es JSON-serializable (sin Date) para pasarlo del loader RSC
// al client component. La vigencia de las asignaciones se filtra en el
// loader (por fecha), no aquí: esta función no conoce el reloj.
// ============================================================

import { FUNCION_POR_ROL, ROL_SOCIO, derivarAsignacionesSocio } from "@/lib/rbac/jerarquia";

export type ClienteRef = { id: number; code: string; name: string };

export type PersonaNodo = {
  id: number;
  name: string;
  role: string;
  initials: string;
  cargo: string | null;
  /** Subordinados DIRECTOS (siguiente nivel jerárquico), ya ordenados. */
  subordinadoIds: number[];
  /** Clientes que atiende: directos por asignación; derivados para el Socio. */
  clientes: ClienteRef[];
};

/** Personas sin superior asignado, agrupadas por rol (para no esconderlas). */
export type GrupoHuerfanos = {
  gerentes: number[];
  seniors: number[];
  staff: number[];
};

export type ResumenEstructura = {
  socios: number;
  gerentes: number;
  seniors: number;
  staff: number;
  clientes: number;
};

export type EstructuraArbol = {
  /** Todos los nodos del árbol indexados por id (solo roles de jerarquía). */
  nodos: Record<number, PersonaNodo>;
  /** Raíces: los Socios (cima de la jerarquía), ordenados por nombre. */
  raices: number[];
  huerfanos: GrupoHuerfanos;
  resumen: ResumenEstructura;
};

// ----- Formas planas de entrada (como salen de Prisma) -----
export type UsuarioInput = {
  id: number;
  name: string;
  role: string;
  initials: string;
  cargo: string | null;
  active: boolean;
};
export type AristaInput = { superiorId: number; subordinateId: number };
export type AsignacionInput = { clientId: number; userId: number; role: string };
export type ClienteInput = { id: number; code: string; name: string };

/** Roles que forman parte del árbol organizacional (Socio + los asignables). */
const ROLES_ARBOL: ReadonlySet<string> = new Set([ROL_SOCIO, ...Object.keys(FUNCION_POR_ROL)]);

/**
 * Arma el árbol organizacional a partir de las cuatro tablas planas.
 * Solo considera usuarios ACTIVOS; las aristas hacia usuarios inactivos o
 * desconocidos se ignoran (su subordinado queda como "sin superior").
 */
export function construirArbol(
  usuarios: UsuarioInput[],
  aristas: AristaInput[],
  asignaciones: AsignacionInput[],
  clientes: ClienteInput[],
): EstructuraArbol {
  const activos = usuarios.filter((u) => u.active);
  const porId = new Map<number, UsuarioInput>(activos.map((u) => [u.id, u]));
  const clientePorId = new Map<number, ClienteInput>(clientes.map((c) => [c.id, c]));

  // Subordinados directos por superior; y quién tiene al menos un superior.
  const subordinadosDe = new Map<number, number[]>();
  const tieneSuperior = new Set<number>();
  for (const a of aristas) {
    // Solo aristas entre usuarios activos del árbol.
    const sup = porId.get(a.superiorId);
    const sub = porId.get(a.subordinateId);
    if (!sup || !sub || !ROLES_ARBOL.has(sup.role) || !ROLES_ARBOL.has(sub.role)) continue;
    const lista = subordinadosDe.get(a.superiorId);
    if (lista) lista.push(a.subordinateId);
    else subordinadosDe.set(a.superiorId, [a.subordinateId]);
    tieneSuperior.add(a.subordinateId);
  }

  // Clientes directos por usuario (todas sus asignaciones, dedup por cliente).
  const clientesDirectos = new Map<number, Set<number>>();
  for (const asg of asignaciones) {
    if (!porId.has(asg.userId) || !clientePorId.has(asg.clientId)) continue;
    const set = clientesDirectos.get(asg.userId);
    if (set) set.add(asg.clientId);
    else clientesDirectos.set(asg.userId, new Set([asg.clientId]));
  }

  const ordenarPorNombre = (ids: number[]): number[] =>
    [...ids].sort((a, b) => (porId.get(a)?.name ?? "").localeCompare(porId.get(b)?.name ?? "", "es"));

  const refsDeClientes = (clientIds: Iterable<number>): ClienteRef[] =>
    [...clientIds]
      .map((id) => clientePorId.get(id))
      .filter((c): c is ClienteInput => !!c)
      .map((c) => ({ id: c.id, code: c.code, name: c.name }))
      .sort((a, b) => a.code.localeCompare(b.code, "es"));

  const clientesDe = (u: UsuarioInput): ClienteRef[] => {
    if (u.role !== ROL_SOCIO) return refsDeClientes(clientesDirectos.get(u.id) ?? []);
    // Socio: derivación de lectura sobre los clientes de sus GERENTES
    // subordinados (función "gerente"), con la misma regla que la autorización.
    const gerentes = new Set(
      (subordinadosDe.get(u.id) ?? []).filter((sid) => porId.get(sid)?.role === "Gerente"),
    );
    const deGerentes = asignaciones.filter(
      (a) => a.role === "gerente" && gerentes.has(a.userId) && clientePorId.has(a.clientId),
    );
    const clientIds = derivarAsignacionesSocio(u.id, deGerentes)
      .map((a) => a.clientId)
      .filter((id): id is number => typeof id === "number");
    return refsDeClientes(clientIds);
  };

  const subordinadosArbol = (id: number): number[] =>
    ordenarPorNombre(
      (subordinadosDe.get(id) ?? []).filter((sid) => {
        const s = porId.get(sid);
        return !!s && ROLES_ARBOL.has(s.role);
      }),
    );

  const nodos: Record<number, PersonaNodo> = {};
  for (const u of activos) {
    if (!ROLES_ARBOL.has(u.role)) continue;
    nodos[u.id] = {
      id: u.id,
      name: u.name,
      role: u.role,
      initials: u.initials,
      cargo: u.cargo,
      subordinadoIds: subordinadosArbol(u.id),
      clientes: clientesDe(u),
    };
  }

  const huerfanos: GrupoHuerfanos = { gerentes: [], seniors: [], staff: [] };
  for (const u of activos) {
    if (u.role === ROL_SOCIO || tieneSuperior.has(u.id) || !ROLES_ARBOL.has(u.role)) continue;
    if (u.role === "Gerente") huerfanos.gerentes.push(u.id);
    else if (u.role === "Senior") huerfanos.seniors.push(u.id);
    else if (u.role === "Staff") huerfanos.staff.push(u.id);
  }

  const porRol = (rol: string): number =>
    activos.reduce((n, u) => (u.role === rol ? n + 1 : n), 0);

  return {
    nodos,
    raices: ordenarPorNombre(activos.filter((u) => u.role === ROL_SOCIO).map((u) => u.id)),
    huerfanos: {
      gerentes: ordenarPorNombre(huerfanos.gerentes),
      seniors: ordenarPorNombre(huerfanos.seniors),
      staff: ordenarPorNombre(huerfanos.staff),
    },
    resumen: {
      socios: porRol(ROL_SOCIO),
      gerentes: porRol("Gerente"),
      seniors: porRol("Senior"),
      staff: porRol("Staff"),
      clientes: clientes.length,
    },
  };
}
