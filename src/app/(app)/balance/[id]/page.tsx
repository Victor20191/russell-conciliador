import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { clientIdPorNombre } from "@/lib/rbac/contexto";
import { PageHeader, StatCard, Chip, BackLink } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtCompact } from "@/lib/format";
import { freezeBalance } from "@/app/actions/balance";
import BalanceDetailClient, {
  type Sums, type Validation, type BreakdownGroup, type Meta, type Version,
} from "./balance-detail-client";
import { parseId } from "@/lib/ids";

export default async function BalanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermiso("balance:ver");
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) notFound();
  const balance = await prisma.balance.findUnique({ where: { id } });
  if (!balance) notFound();

  // Editar (congelar) exige, además del permiso de rol, ALCANCE de escritura
  // sobre el cliente de ESTE balance (cartera): así el botón se oculta para
  // quien no podría ejecutar la acción.
  const puedeEditar = (
    await authorizePermiso("balance:editar", { clientId: await clientIdPorNombre(balance.clientName) })
  ).ok;

  const sums = balance.sums as Sums | null;
  const validations = (balance.validations as Validation[] | null) ?? [];
  const breakdown = (balance.breakdown as BreakdownGroup[] | null) ?? [];
  const meta = balance.meta as Meta | null;
  const versions = (balance.versionHistory as Version[] | null) ?? [];
  const hasDiff = balance.diff != null;

  const okCount = validations.filter((v) => v.status === "ok").length;
  const warnCount = validations.filter((v) => v.status === "warn").length;

  return (
    <div>
      <div className="mb-3"><BackLink href="/balance" label="Balance de comprobación" /></div>
      <PageHeader
        title={balance.clientName}
        subtitle={`${balance.period} · versión ${balance.version}`}
        actions={
          <div className="flex items-center gap-2">
            {hasDiff && (
              <a href={`/balance/${id}/diff`} className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-3 py-2 text-[12.5px] font-medium text-ink-700 hover:bg-ink-50">
                <Icon name="log" size={14} /> Diff de versiones
              </a>
            )}
            {!balance.isFrozen && puedeEditar && (
              <form action={freezeBalance}>
                <input type="hidden" name="id" value={id} />
                <button type="submit" className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600">
                  <Icon name="check" size={14} /> Congelar como oficial
                </button>
              </form>
            )}
            {balance.isFrozen && <Chip label="Congelado" tone="blue" />}
          </div>
        }
      />

      {meta && (
        <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-500">
          <span className="inline-flex items-center gap-1"><Icon name="upload" size={12} /> {meta.uploadedBy} · {meta.uploadedAt}</span>
          {balance.isFrozen && <span className="inline-flex items-center gap-1 text-ok-700"><Icon name="check" size={12} /> Congelada por {meta.frozenBy} · {meta.frozenAt}</span>}
          <span className="font-mono">{meta.file} · {meta.fileSize} · {meta.rows} cuentas</span>
        </p>
      )}

      {!sums && (
        <div className="rounded-lg border border-ink-150 bg-white p-6 text-[13px] text-ink-500">
          Esta versión no tiene detalle contable cargado. El detalle completo está en la versión oficial congelada.
        </div>
      )}

      {sums && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Activo" value={fmtCompact(sums.activo)} tone="blue" />
            <StatCard label="Pasivo" value={fmtCompact(sums.pasivo)} tone="ink" />
            <StatCard label="Patrimonio" value={fmtCompact(sums.patrimonio)} tone="ink" />
            <StatCard label="Utilidad" value={fmtCompact(sums.utilidad)} tone="ok" />
            <StatCard label="Validaciones" value={`${okCount} ok`} hint={warnCount > 0 ? `${warnCount} alerta(s)` : "Sin alertas"} tone={warnCount > 0 ? "warn" : "ok"} />
            {meta && <StatCard label="Mapeo al estándar" value={`${meta.mapped}/${meta.rows}`} hint={`${meta.critical} críticas`} tone="ink" />}
          </div>

          <BalanceDetailClient
            breakdown={breakdown}
            validations={validations}
            versions={versions}
            officialVersion={balance.version}
            warnCount={warnCount}
          />
        </>
      )}
    </div>
  );
}
