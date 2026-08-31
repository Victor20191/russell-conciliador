import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import ClientesClient, {
  type ClientRow,
  type ModuleRef,
  type DianFormRef,
  type Personas,
  type Arista,
} from "./clientes-client";
import { requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { nextClientCode } from "@/lib/client-code";
import { ROL_POR_FUNCION, ROL_SOCIO } from "@/lib/rbac/jerarquia";
import { esCodigoProcesoErp } from "@/lib/erp-procesos";

export default async function ClientesPage() {
  await requirePermiso("clientes:configurar");
  // Cartera administrable: el Senior solo gestiona los clientes donde es
  // responsable; Admin/Superadmin administran todos.
  const alc = await alcanceLecturaUsuario();
  const whereCliente = alc.todos ? {} : { id: { in: alc.clientIds } };
  const [clients, modules, dianFormsBD, erpsBD, procesosErpBD, sectoresBD, usuarios, aristasBD, asignaciones] = await Promise.all([
    prisma.client.findMany({
      where: whereCliente,
      orderBy: { name: "asc" },
      include: {
        modules: true,
        dianForms: true,
        erp: { select: { name: true } },
        erpsPorProceso: {
          select: {
            erpId: true,
            status: true,
            process: { select: { code: true } },
            erp: { select: { name: true } },
          },
        },
        sector: { select: { name: true } },
      },
    }),
    prisma.module.findMany({ orderBy: { name: "asc" } }),
    prisma.dianForm.findMany({
      orderBy: { code: "asc" },
      select: { id: true, name: true, code: true },
    }),
    prisma.erp.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, active: true } }),
    prisma.erpProcess.findMany({
      where: { active: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { code: true, name: true },
    }),
    prisma.sector.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true, active: true },
    }),
    prisma.userHierarchy.findMany({
      select: { superiorId: true, subordinateId: true },
    }),
    prisma.clientAssignment.findMany({
      where: { active: true, ...(alc.todos ? {} : { clientId: { in: alc.clientIds } }) },
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
    socios: activosDeRol(ROL_SOCIO),
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

  const rows: ClientRow[] = clients.map((c) => {
    const contabilidad = c.erpsPorProceso.find((asignacion) => asignacion.process.code === "CONT");
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      nit: c.nit,
      tipo: c.tipo,
      erpId: contabilidad ? contabilidad.erpId : c.erpId,
      erpName: contabilidad ? (contabilidad.erp?.name ?? null) : (c.erp?.name ?? null),
      erpsPorProceso: c.erpsPorProceso.map((asignacion) => ({
        processCode: asignacion.process.code,
        erpId: asignacion.erpId,
        erpName: asignacion.erp?.name ?? null,
        status: asignacion.status,
      })),
      sectorId: c.sectorId,
      sectorName: c.sector?.name ?? null,
      socioId: c.socioId,
      socioName: c.socioId != null ? (nombrePorId.get(c.socioId) ?? null) : null,
      modules: c.modules.map((m) => ({ moduleId: m.moduleId, status: m.status })),
      dianFormIds: c.dianForms.map((f) => f.formId),
      responsables: responsablesPorCliente.get(c.id) ?? [],
    };
  });
  const mods: ModuleRef[] = modules.map((m) => ({ id: m.id, name: m.name }));
  const dianForms: DianFormRef[] = dianFormsBD.map((f) => ({
    id: f.id,
    name: f.name,
    code: f.code,
  }));
  const erps = erpsBD.map((e) => ({ id: e.id, name: e.name, active: e.active }));
  const erpProcesses = procesosErpBD.flatMap((proceso) =>
    esCodigoProcesoErp(proceso.code)
      ? [{ code: proceso.code, name: proceso.name }]
      : [],
  );
  const sectors = sectoresBD.map((s) => ({ id: s.id, name: s.name }));
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
        dianForms={dianForms}
        erps={erps}
        erpProcesses={erpProcesses}
        sectors={sectors}
        nextCode={nextCode}
        personas={personas}
        aristas={aristas}
      />
    </div>
  );
}
