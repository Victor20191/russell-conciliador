import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import ClientesClient, {
  type ClientRow,
  type ModuleRef,
  type Personas,
  type Arista,
} from "./clientes-client";
import { requirePermiso } from "@/lib/rbac";
import { nextClientCode } from "@/lib/client-code";
import { ROL_POR_FUNCION } from "@/lib/rbac/jerarquia";

export default async function ClientesPage() {
  await requirePermiso("clientes:configurar");
  const [clients, modules, usuarios, aristasBD, asignaciones] = await Promise.all([
    prisma.client.findMany({
      orderBy: { name: "asc" },
      include: { modules: true },
    }),
    prisma.module.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true, active: true },
    }),
    prisma.userHierarchy.findMany({
      select: { superiorId: true, subordinateId: true },
    }),
    prisma.clientAssignment.findMany({
      where: { active: true },
      select: { clientId: true, userId: true, role: true },
    }),
  ]);

  // Candidatos a responsable: solo usuarios ACTIVOS con el rol exacto de
  // cada función. Los nombres se resuelven con la lista completa para poder
  // mostrar responsables ya asignados aunque el usuario esté inactivo.
  const nombrePorId = new Map(usuarios.map((u) => [u.id, u.name]));
  const activosDeRol = (rol: string) =>
    usuarios
      .filter((u) => u.active && u.role === rol)
      .map((u) => ({ id: u.id, name: u.name }));
  const personas: Personas = {
    gerentes: activosDeRol(ROL_POR_FUNCION.gerente),
    seniors: activosDeRol(ROL_POR_FUNCION.senior),
    staffs: activosDeRol(ROL_POR_FUNCION.staff),
  };
  const aristas: Arista[] = aristasBD.map((a) => ({
    superiorId: a.superiorId,
    subordinadoId: a.subordinateId,
  }));

  const responsablesPorCliente = new Map<number, ClientRow["responsables"]>();
  for (const a of asignaciones) {
    const lista = responsablesPorCliente.get(a.clientId) ?? [];
    lista.push({
      funcion: a.role,
      userId: a.userId,
      name: nombrePorId.get(a.userId) ?? `Usuario ${a.userId}`,
    });
    responsablesPorCliente.set(a.clientId, lista);
  }

  const rows: ClientRow[] = clients.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    nit: c.nit,
    erp: c.erp,
    sector: c.sector,
    modules: c.modules.map((m) => ({ moduleId: m.moduleId, status: m.status })),
    responsables: responsablesPorCliente.get(c.id) ?? [],
  }));
  const mods: ModuleRef[] = modules.map((m) => ({ id: m.id, name: m.name }));
  const erps = [...new Set(clients.map((c) => c.erp))].sort();
  const sectors = [...new Set(clients.map((c) => c.sector))].sort();
  const nextCode = nextClientCode(clients.map((c) => c.code));

  return (
    <div>
      <PageHeader
        title="Clientes y parametrizaciones"
        subtitle="Estado por cliente y módulo: parametrizado, pendiente o no activo."
      />
      <ClientesClient
        clients={rows}
        modules={mods}
        erps={erps}
        sectors={sectors}
        nextCode={nextCode}
        personas={personas}
        aristas={aristas}
      />
    </div>
  );
}
