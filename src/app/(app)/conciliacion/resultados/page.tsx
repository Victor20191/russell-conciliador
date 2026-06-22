import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader } from "@/components/ui";
import ResultadosTabla, { type ResultadoRow } from "./resultados-tabla";

export default async function ResultadosPage() {
  await requirePermiso("conciliaciones:ver");
  // Cartera de lectura: cada usuario ve solo los cruces de SUS clientes
  // (Admin/Superadmin ven todos). Filtra por la FK clientId (fail-closed:
  // un cruce sin clientId no se muestra a usuarios con cartera).
  const alc = await alcanceLecturaUsuario();
  const recs = await prisma.reconciliation.findMany({
    where: alc.todos ? {} : { clientId: { in: alc.clientIds } },
    orderBy: { createdAt: "desc" },
  });

  const rows: ResultadoRow[] = recs.map((r) => ({
    id: r.id,
    clientName: r.clientName,
    module: r.module,
    period: r.period,
    erp: r.erp,
    diff: r.diff,
    items: r.items,
    status: r.status,
    owner: r.owner,
  }));

  return (
    <div>
      <PageHeader
        title="Resultados de conciliación"
        subtitle="Histórico de cruces ejecutados entre contabilidad y módulos auxiliares"
      />
      <ResultadosTabla rows={rows} />
    </div>
  );
}
