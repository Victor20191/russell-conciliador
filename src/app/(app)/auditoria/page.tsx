import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import AuditoriaTabla, { type AuditoriaRow } from "./auditoria-tabla";
import { requirePermiso } from "@/lib/rbac";

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<{ q?: string; user?: string; action?: string }> }) {
  await requirePermiso("auditoria:ver");
  const sp = await searchParams;
  const all = await prisma.auditEntry.findMany({ orderBy: { ts: "desc" } });

  const users = [...new Set(all.map((e) => e.user))].sort();
  const actions = [...new Set(all.map((e) => e.action))].sort();

  const q = (sp.q ?? "").toLowerCase();
  const entries = all.filter((e) =>
    (!q || e.entity.toLowerCase().includes(q) || e.detail.toLowerCase().includes(q)) &&
    (!sp.user || e.user === sp.user) &&
    (!sp.action || e.action === sp.action),
  );

  const rows: AuditoriaRow[] = entries.map((e) => ({
    id: e.id,
    ts: e.ts,
    user: e.user,
    action: e.action,
    entity: e.entity,
    ip: e.ip,
    detail: e.detail,
  }));

  return (
    <div>
      <PageHeader title="Auditoría" subtitle="Bitácora inmutable: trazabilidad de acciones del sistema con usuario, IP y detalle." />
      <AuditoriaTabla rows={rows} users={users} actions={actions} />
    </div>
  );
}
