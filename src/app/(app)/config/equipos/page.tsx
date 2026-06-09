import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { ROLES_LIDER_EQUIPO, ROLES_INTEGRANTE_EQUIPO } from "@/lib/rbac/catalogo";
import EquiposClient, {
  type TeamRow,
  type MemberRow,
  type UserOption,
} from "./equipos-client";

type UsuarioRef = { id: number; name: string; email: string; role: string };
type TeamConMiembros = {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  leadUserId: number | null;
  members: {
    id: number;
    userId: number;
    validFrom: Date;
    validUntil: Date | null;
    active: boolean;
    reason: string | null;
  }[];
};

// Construye las filas con el estado de vigencia. Vive a nivel de módulo (no en
// el cuerpo del componente) porque depende de la hora actual (Date.now), que
// es impura para el render de un Server Component.
function construirFilas(
  teams: TeamConMiembros[],
  allUsers: UsuarioRef[],
  roleNameByCode: Map<string, string>,
): TeamRow[] {
  const userById = new Map(allUsers.map((u) => [u.id, u] as const));
  const ahora = Date.now();
  const estadoDe = (active: boolean, validFrom: Date, validUntil: Date | null): MemberRow["estado"] => {
    if (!active) return "inactivo";
    if (validFrom.getTime() > ahora) return "futuro";
    if (validUntil && validUntil.getTime() < ahora) return "expirado";
    return "vigente";
  };

  return teams.map((t) => {
    const lead = t.leadUserId != null ? userById.get(t.leadUserId) : undefined;
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      active: t.active,
      leadName: lead?.name ?? null,
      members: t.members.map((m): MemberRow => {
        const u = userById.get(m.userId);
        // El rol del integrante es SIEMPRE su rol del sistema (con el que fue
        // creado). Se deriva en vivo de User.role, no de un valor almacenado.
        const roleCode = u?.role ?? null;
        return {
          id: m.id,
          userId: m.userId,
          userName: u?.name ?? `Usuario #${m.userId}`,
          userEmail: u?.email ?? null,
          roleCode,
          roleName: roleCode ? roleNameByCode.get(roleCode) ?? roleCode : null,
          validUntil: m.validUntil ? m.validUntil.toISOString().slice(0, 10) : null,
          reason: m.reason,
          estado: estadoDe(m.active, m.validFrom, m.validUntil),
        };
      }),
    };
  });
}

const ROLES_LIDER = new Set<string>(ROLES_LIDER_EQUIPO);
const ROLES_INTEGRANTE = new Set<string>(ROLES_INTEGRANTE_EQUIPO);

export default async function EquiposPage() {
  // La gestión de equipos y cartera es competencia del Senior (PDF).
  await requirePermiso("equipos:asignar");

  const [teams, allUsers, roles] = await Promise.all([
    prisma.team.findMany({
      orderBy: { name: "asc" },
      include: {
        members: { orderBy: { createdAt: "asc" } },
      },
    }),
    // userId/leadUserId son FK lógicas: traemos todos para resolver nombres,
    // y filtramos los activos para el selector de "agregar integrante".
    // role se usa para mostrar el rol del sistema de cada integrante.
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, active: true, role: true },
    }),
    // Sin filtro `active`: necesitamos también nombres de roles inactivos/legado
    // para resolver el rol del sistema de cualquier integrante.
    prisma.role.findMany({ select: { code: true, name: true } }),
  ]);

  const roleNameByCode = new Map(roles.map((r) => [r.code, r.name] as const));
  const rows = construirFilas(teams, allUsers, roleNameByCode);
  // Integrantes: solo el Staff (rol operativo) puede agregarse a la cuadrilla.
  const userOptions: UserOption[] = allUsers
    .filter((u) => u.active && ROLES_INTEGRANTE.has(u.role))
    .map((u) => ({ id: u.id, name: u.name, email: u.email }));
  // Solo los Senior (responsables) pueden quedar como líder del equipo.
  const leaderOptions: UserOption[] = allUsers
    .filter((u) => u.active && ROLES_LIDER.has(u.role))
    .map((u) => ({ id: u.id, name: u.name, email: u.email }));

  return <EquiposClient teams={rows} users={userOptions} leaders={leaderOptions} />;
}
