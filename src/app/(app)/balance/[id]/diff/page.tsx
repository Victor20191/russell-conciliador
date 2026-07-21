import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { PageHeader, StatCard, BackLink } from "@/components/ui";
import { fmtCompact } from "@/lib/format";
import { reconstruirBalance, aplanarBreakdown, compararBalances } from "@/lib/balance/calcular";
import { getCuentasEstandar } from "@/lib/balance/cuentas-estandar";
import BalanceDiffClient, { type DiffData } from "./balance-diff-client";
import { parseId } from "@/lib/ids";

// Convierte las filas Decimal del detalle a la forma numérica que espera reconstruirBalance.
const aFilas = (detalles: { cuenta8: string; nombreCuenta: string; cuenta6Russell: string | null; saldoInicial: unknown; debitos: unknown; creditos: unknown; saldoFinal: unknown }[]) =>
  detalles.map((f) => ({
    cuenta8: f.cuenta8, nombreCuenta: f.nombreCuenta, cuenta6Russell: f.cuenta6Russell,
    saldoInicial: Number(f.saldoInicial), debitos: Number(f.debitos), creditos: Number(f.creditos), saldoFinal: Number(f.saldoFinal),
  }));

export default async function BalanceDiffPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermiso("balance:ver");
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) notFound();
  const selectDet = { cuenta8: true, nombreCuenta: true, cuenta6Russell: true, saldoInicial: true, debitos: true, creditos: true, saldoFinal: true } as const;
  const balance = await prisma.balancePruebaEncabezado.findUnique({
    where: { id },
    include: { detalles: { select: selectDet } },
  });
  if (!balance) notFound();

  // Alcance por cartera: leer este balance exige READ sobre su cliente.
  await requirePermiso("balance:ver", { clientId: balance.clienteId });

  // Versión anterior (cargada antes de esta) del mismo cliente/período.
  const [previa, cuentasEstandar] = await Promise.all([
    prisma.balancePruebaEncabezado.findFirst({
      where: { clienteId: balance.clienteId, periodo: balance.periodo, creadoEn: { lt: balance.creadoEn } },
      orderBy: { creadoEn: "desc" },
      include: { detalles: { select: selectDet } },
    }),
    getCuentasEstandar(),
  ]);
  if (!previa) notFound();

  const calcActual = reconstruirBalance(aFilas(balance.detalles), cuentasEstandar);
  const calcPrev = reconstruirBalance(aFilas(previa.detalles), cuentasEstandar);
  const diff: DiffData = compararBalances(aplanarBreakdown(calcPrev.breakdown), aplanarBreakdown(calcActual.breakdown));

  return (
    <div>
      <div className="mb-3"><BackLink href={`/balance/${id}`} label="Volver al detalle" /></div>
      <PageHeader title={`Comparativo de versiones`} subtitle={`${balance.nombreCliente} · ${balance.periodo}`} />

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
