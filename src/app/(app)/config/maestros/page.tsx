import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { ROL_SUPERIOR } from "@/lib/rbac/jerarquia";
import MaestrosClient, {
  type Arista,
  type CatalogRow,
  type MaestroPersonaRow,
  type SuperiorRef,
} from "./maestros-client";

const ROLES_MAESTRO = ["Socio", "Gerente", "Senior", "Staff"] as const;

export default async function MaestrosPage() {
  await requirePermiso("maestros:ver");

  const rolesSuperiores = [...new Set(Object.values(ROL_SUPERIOR))];
  const [
    personasBD,
    superioresBD,
    aristasBD,
    asignacionesActivas,
    clientesSocio,
    erpsBD,
    sectoresBD,
    clientesPorErp,
    clientesPorSector,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: [...ROLES_MAESTRO] } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        email: true,
        name: true,
        cedula: true,
        cargo: true,
        role: true,
        initials: true,
        active: true,
      },
    }),
    prisma.user.findMany({
      where: { active: true, role: { in: rolesSuperiores } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
    prisma.userHierarchy.findMany({
      select: { superiorId: true, subordinateId: true },
    }),
    prisma.clientAssignment.groupBy({
      by: ["userId"],
      where: { active: true },
      _count: { _all: true },
    }),
    prisma.client.groupBy({
      by: ["socioId"],
      where: { socioId: { not: null } },
      _count: { _all: true },
    }),
    prisma.erp.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, code: true, name: true, active: true, order: true },
    }),
    prisma.sector.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, code: true, name: true, active: true, order: true },
    }),
    prisma.client.groupBy({
      by: ["erpId"],
      where: { erpId: { not: null } },
      _count: { _all: true },
    }),
    prisma.client.groupBy({
      by: ["sectorId"],
      where: { sectorId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const asignacionesPorUsuario = new Map(
    asignacionesActivas.map((fila) => [fila.userId, fila._count._all]),
  );
  const clientesPorSocio = new Map(
    clientesSocio
      .filter((fila) => fila.socioId != null)
      .map((fila) => [fila.socioId!, fila._count._all]),
  );
  const clientesPorErpId = new Map(
    clientesPorErp
      .filter((fila) => fila.erpId != null)
      .map((fila) => [fila.erpId!, fila._count._all]),
  );
  const clientesPorSectorId = new Map(
    clientesPorSector
      .filter((fila) => fila.sectorId != null)
      .map((fila) => [fila.sectorId!, fila._count._all]),
  );

  const personas: MaestroPersonaRow[] = personasBD.map((p) => ({
    id: p.id,
    email: p.email,
    name: p.name,
    cedula: p.cedula,
    cargo: p.cargo,
    role: p.role,
    initials: p.initials,
    active: p.active,
    asignacionesActivas: asignacionesPorUsuario.get(p.id) ?? 0,
    clientesComoSocio: clientesPorSocio.get(p.id) ?? 0,
  }));
  const superiores: SuperiorRef[] = superioresBD;
  const aristas: Arista[] = aristasBD.map((a) => ({
    superiorId: a.superiorId,
    subordinadoId: a.subordinateId,
  }));
  const erps: CatalogRow[] = erpsBD.map((e) => ({
    id: e.id,
    code: e.code,
    name: e.name,
    active: e.active,
    order: e.order,
    clients: clientesPorErpId.get(e.id) ?? 0,
  }));
  const sectors: CatalogRow[] = sectoresBD.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    active: s.active,
    order: s.order,
    clients: clientesPorSectorId.get(s.id) ?? 0,
  }));

  return (
    <div>
      <PageHeader
        title="Maestros"
        subtitle="Catálogos base de clientes, responsables y asignaciones."
      />
      <MaestrosClient
        personas={personas}
        superiores={superiores}
        aristas={aristas}
        erps={erps}
        sectors={sectors}
      />
    </div>
  );
}
