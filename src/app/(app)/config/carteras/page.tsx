import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import CarterasClient, {
  type CarteraRow,
  type AsignacionRow,
  type ClientOption,
  type UserOption,
} from "./carteras-client";

type AsigRaw = {
  id: number;
  clientId: number;
  readScope: boolean;
  writeScope: boolean;
  active: boolean;
  validFrom: Date;
  validUntil: Date | null;
  reason: string | null;
};

function estadoDe(active: boolean, validFrom: Date, validUntil: Date | null): AsignacionRow["estado"] {
  const ahora = Date.now();
  if (!active) return "inactivo";
  if (validFrom.getTime() > ahora) return "futuro";
  if (validUntil && validUntil.getTime() < ahora) return "expirado";
  return "vigente";
}

export default async function CarterasPage() {
  // La gestión de cartera es competencia del Senior (PDF).
  await requirePermiso("equipos:asignar");

  const [teams, clients, allUsers] = await Promise.all([
    prisma.team.findMany({
      orderBy: { name: "asc" },
      include: { assignments: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.client.findMany({
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, nit: true },
    }),
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, active: true },
    }),
  ]);

  const clientById = new Map(clients.map((c) => [c.id, c]));
  const userById = new Map(allUsers.map((u) => [u.id, u.name]));

  const carteras: CarteraRow[] = teams.map((t) => {
    // Asignaciones de cartera por equipo: las que aplican a todo el equipo
    // (userId null). Las individuales (userId) se gestionan en Equipos.
    const asigs = (t.assignments as unknown as (AsigRaw & { userId: number | null })[])
      .filter((a) => a.userId == null)
      .map((a): AsignacionRow => {
        const cli = clientById.get(a.clientId);
        return {
          id: a.id,
          clientId: a.clientId,
          clientName: cli?.name ?? `Cliente #${a.clientId}`,
          clientCode: cli?.code ?? "—",
          readScope: a.readScope,
          writeScope: a.writeScope,
          validUntil: a.validUntil ? a.validUntil.toISOString().slice(0, 10) : null,
          reason: a.reason,
          estado: estadoDe(a.active, a.validFrom, a.validUntil),
        };
      });
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      leadName: t.leadUserId != null ? userById.get(t.leadUserId) ?? null : null,
      asignaciones: asigs,
    };
  });

  const clientOptions: ClientOption[] = clients.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    nit: c.nit,
  }));
  const userOptions: UserOption[] = allUsers
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, name: u.name, email: u.email }));

  return <CarterasClient carteras={carteras} clients={clientOptions} users={userOptions} />;
}
