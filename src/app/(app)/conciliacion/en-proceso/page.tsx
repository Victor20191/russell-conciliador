import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader } from "@/components/ui";
import EnProcesoTabla, { type EnProcesoRow } from "./en-proceso-tabla";

export default async function EnProcesoPage() {
  await requirePermiso("conciliaciones:ver");
  // Cartera de lectura: solo los cruces de SUS clientes (Admin/Superadmin todos).
  const alc = await alcanceLecturaUsuario();
  const recs = await prisma.reconciliation.findMany({
    where: {
      status: { in: ["DIFF", "REVIEW"] },
      ...(alc.todos ? {} : { clientId: { in: alc.clientIds } }),
    },
    orderBy: { createdAt: "desc" },
  });

  const rows: EnProcesoRow[] = recs.map((r) => ({
    id: r.id,
    clientName: r.clientName,
    module: r.module,
    period: r.period,
    status: r.status,
    lastActivity: r.lastActivity,
    owner: r.owner,
  }));

  return (
    <div>
      <PageHeader title="Conciliaciones en curso" subtitle={`${recs.length} conciliaciones abiertas. Continúa donde lo dejaste.`} />
      <EnProcesoTabla rows={rows} />
    </div>
  );
}
