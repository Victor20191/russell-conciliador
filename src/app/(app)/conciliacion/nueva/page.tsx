import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { fechaCalendarioISO } from "@/lib/fecha-hora";
import { PageHeader } from "@/components/ui";
import NuevaClient, { type BalanceOpt, type ClientOpt, type ModuleOpt, type StdField } from "./nueva-client";

export default async function NuevaConciliacionPage() {
  await requirePermiso("conciliaciones:crear");
  // El selector ofrece SOLO los clientes de la cartera del usuario (el Staff,
  // único rol que llega aquí, solo ejecuta sobre sus clientes asignados). La
  // server action `executeReconciliation` revalida el alcance de escritura.
  const alc = await alcanceLecturaUsuario();
  const [clients, modules, fields, balances] = await Promise.all([
    prisma.client.findMany({
      where: alc.todos ? {} : { id: { in: alc.clientIds } },
      orderBy: { name: "asc" },
      include: {
        modules: true,
        erp: { select: { name: true } },
        erpsPorProceso: {
          select: {
            process: { select: { code: true } },
            erp: { select: { name: true } },
          },
        },
        sector: { select: { name: true } },
      },
    }),
    prisma.module.findMany({ orderBy: { name: "asc" } }),
    prisma.moduleField.findMany({ orderBy: { order: "asc" } }),
    prisma.balancePruebaEncabezado.findMany({
      where: {
        esOficial: true,
        estaCongelado: true,
        ...(alc.todos ? {} : { clienteId: { in: alc.clientIds } }),
      },
      orderBy: [{ periodoFin: "desc" }, { creadoEn: "desc" }],
      select: {
        id: true,
        clienteId: true,
        periodo: true,
        periodoInicio: true,
        periodoFin: true,
        version: true,
      },
    }),
  ]);

  const clientOpts: ClientOpt[] = clients.map((c) => {
    const asignacionPorCodigo = new Map(
      c.erpsPorProceso.map((asignacion) => [asignacion.process.code, asignacion.erp?.name ?? ""]),
    );
    return {
      id: c.id,
      name: c.name,
      nit: c.nit,
      erpPorProceso: Object.fromEntries(
        modules.map((modulo) => [
          modulo.code,
          asignacionPorCodigo.has(modulo.code)
            ? asignacionPorCodigo.get(modulo.code)!
            : "",
        ]),
      ),
      sector: c.sector?.name ?? "",
      configured: c.modules.filter((m) => m.status === "configured").map((m) => m.moduleId),
    };
  });
  const moduleOpts: ModuleOpt[] = modules.map((m) => ({ id: m.id, code: m.code, name: m.name, icon: m.icon }));
  const balanceOpts: BalanceOpt[] = balances.map((b) => ({
    id: b.id,
    clientId: b.clienteId,
    period: b.periodo,
    periodStart: fechaCalendarioISO(b.periodoInicio),
    periodEnd: fechaCalendarioISO(b.periodoFin),
    version: b.version,
  }));
  const fieldsByModule: Record<number, StdField[]> = {};
  for (const f of fields) {
    (fieldsByModule[f.moduleId] ??= []).push({ key: f.key, label: f.label, type: f.type, required: f.required });
  }

  return (
    <div>
      <PageHeader title="Nueva conciliación" subtitle="Asistente de parametrización y ejecución de un nuevo cruce contable vs. auxiliar." />
      <NuevaClient clients={clientOpts} modules={moduleOpts} balances={balanceOpts} fieldsByModule={fieldsByModule} />
    </div>
  );
}
