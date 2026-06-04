import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { PageHeader, StatCard, BackLink } from "@/components/ui";
import { fmtCompact } from "@/lib/format";
import BalanceDiffClient, { type DiffData } from "./balance-diff-client";

export default async function BalanceDiffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const balance = await prisma.balance.findUnique({ where: { id } });
  if (!balance || balance.diff == null) notFound();

  const diff = balance.diff as DiffData;

  return (
    <div>
      <div className="mb-3"><BackLink href={`/balance/${id}`} label="Volver al detalle" /></div>
      <PageHeader title={`Comparativo de versiones`} subtitle={`${balance.clientName} · ${balance.period}`} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Cuentas agregadas" value={`+${diff.summary.added}`} tone="ok" />
        <StatCard label="Cuentas eliminadas" value={`−${diff.summary.removed}`} tone="ink" />
        <StatCard label="Cuentas modificadas" value={`~${diff.summary.changed}`} tone="warn" />
        <StatCard label="Total afectado" value={fmtCompact(diff.summary.totalAffected)} tone="blue" />
      </div>

      <div className="mt-5"><BalanceDiffClient diff={diff} version={balance.version} /></div>
    </div>
  );
}
