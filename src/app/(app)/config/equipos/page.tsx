import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import EquiposClient, {
  type TeamRow,
  type MemberRow,
  type UserOption,
  type RoleOption,
} from "./equipos-client";

type UsuarioRef = { id: number; name: string; email: string };
type TeamConMiembros = {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  leadUserId: number | null;
  members: {
    id: number;
    userId: number;
    role: { code: string; name: string } | null;
    validFrom: Date;
    validUntil: Date | null;
    active: boolean;
    reason: string | null;
  }[];
};

// Construye las filas con el estado de vigencia. Vive a nivel de módulo (no en
// el cuerpo del componente) porque depende de la hora actual (Date.now), que
// es impura para el render de un Server Component.
function construirFilas(teams: TeamConMiembros[], allUsers: UsuarioRef[]): TeamRow[] {
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
        return {
          id: m.id,
          userId: m.userId,
          userName: u?.name ?? `Usuario #${m.userId}`,
          userEmail: u?.email ?? null,
          roleCode: m.role?.code ?? null,
          roleName: m.role?.name ?? null,
          validUntil: m.validUntil ? m.validUntil.toISOString().slice(0, 10) : null,
          reason: m.reason,
          estado: estadoDe(m.active, m.validFrom, m.validUntil),
        };
      }),
    };
  });
}

export default async function EquiposPage() {
  // La gestión de equipos y cartera es competencia del Senior (PDF).
  await requirePermiso("equipos:asignar");

  const [teams, allUsers, roles] = await Promise.all([
    prisma.team.findMany({
      orderBy: { name: "asc" },
      include: {
        members: {
          include: { role: { select: { code: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    // userId/leadUserId son FK lógicas: traemos todos para resolver nombres,
    // y filtramos los activos para el selector de "agregar integrante".
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, active: true },
    }),
    prisma.role.findMany({
      where: { active: true },
      orderBy: { rank: "desc" },
      select: { code: true, name: true },
    }),
  ]);

  const rows = construirFilas(teams, allUsers);
  const userOptions: UserOption[] = allUsers
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, name: u.name, email: u.email }));
  const roleOptions: RoleOption[] = roles.map((r) => ({ code: r.code, name: r.name }));

  return <EquiposClient teams={rows} users={userOptions} roles={roleOptions} />;
}
