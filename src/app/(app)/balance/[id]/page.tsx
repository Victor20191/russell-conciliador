import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { PageHeader, Card, CardHeader, StatCard, Chip, BackLink } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtCompact, fmt } from "@/lib/format";

type Sums = {
  activo: number; pasivo: number; patrimonio: number;
  ingresos: number; gastos: number; costos: number; utilidad: number;
};
type Validation = { id: string; rule: string; status: string; detail: string; count?: number };
type BreakdownItem = { code: string; name: string; balance: number; variation: number | null; std: string | null; mapped: boolean };
type BreakdownGroup = {
  code: string; name: string; balance: number; prevBalance: number;
  variation: number; mapped: boolean; critical: boolean; nature: string;
  items: BreakdownItem[];
};
type Meta = {
  rows: number; mapped: number; unmapped: number; critical: number;
  file: string; fileSize: string; frozenBy: string; frozenAt: string;
  uploadedBy: string; uploadedAt: string;
};

export default async function BalanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const balance = await prisma.balance.findUnique({ where: { id } });
  if (!balance) notFound();

  const sums = balance.sums as Sums | null;
  const validations = (balance.validations as Validation[] | null) ?? [];
  const breakdown = (balance.breakdown as BreakdownGroup[] | null) ?? [];
  const meta = balance.meta as Meta | null;

  const vStatusTone = (s: string) => (s === "ok" ? "ok" : s === "warn" ? "warn" : "err");

  return (
    <div>
      <div className="mb-3"><BackLink href="/balance" label="Balance de comprobación" /></div>
      <PageHeader
        title={`${balance.clientName}`}
        subtitle={`${balance.period} · versión ${balance.version}`}
        actions={
          <>
            {balance.isFrozen && <Chip label="Congelado" tone="blue" />}
            {balance.isOfficial && <Chip label="Oficial" tone="ok" />}
          </>
        }
      />

      {!sums && (
        <Card className="p-6 text-[13px] text-ink-500">
          Esta versión no tiene detalle contable cargado en el repositorio. El detalle
          completo (sumas, validaciones y desglose) está disponible en la versión oficial congelada.
        </Card>
      )}

      {sums && (
        <>
          {/* Sumas */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Activo" value={fmtCompact(sums.activo)} tone="blue" />
            <StatCard label="Pasivo" value={fmtCompact(sums.pasivo)} tone="ink" />
            <StatCard label="Patrimonio" value={fmtCompact(sums.patrimonio)} tone="ink" />
            <StatCard label="Utilidad" value={fmtCompact(sums.utilidad)} tone="ok" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
            <StatCard label="Ingresos" value={fmtCompact(sums.ingresos)} tone="ink" />
            <StatCard label="Gastos" value={fmtCompact(sums.gastos)} tone="ink" />
            <StatCard label="Costos" value={fmtCompact(sums.costos)} tone="ink" />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* Validaciones */}
            <Card>
              <CardHeader title="Validaciones automáticas" />
              <div className="divide-y divide-ink-50">
                {validations.map((v) => (
                  <div key={v.id} className="flex items-start gap-2.5 px-4 py-2.5">
                    <span className={v.status === "ok" ? "text-ok-500" : v.status === "warn" ? "text-warn-500" : "text-err-500"}>
                      <Icon name={v.status === "ok" ? "check" : "warn"} size={14} />
                    </span>
                    <div className="flex-1">
                      <div className="text-[12.5px] font-medium text-ink-800">{v.rule}</div>
                      <div className="text-[11.5px] text-ink-500">{v.detail}</div>
                    </div>
                    {v.count != null && <Chip label={String(v.count)} tone={vStatusTone(v.status)} />}
                  </div>
                ))}
              </div>
            </Card>

            {/* Metadatos */}
            {meta && (
              <Card className="lg:col-span-2">
                <CardHeader title="Trazabilidad del cargue" />
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-[12.5px]">
                  <Field label="Archivo" value={meta.file} mono />
                  <Field label="Tamaño" value={meta.fileSize} />
                  <Field label="Filas" value={String(meta.rows)} />
                  <Field label="Cuentas mapeadas" value={`${meta.mapped} / ${meta.rows}`} />
                  <Field label="Sin mapeo" value={String(meta.unmapped)} />
                  <Field label="Críticas" value={String(meta.critical)} />
                  <Field label="Cargado por" value={meta.uploadedBy} />
                  <Field label="Fecha cargue" value={meta.uploadedAt} />
                  <Field label="Congelado por" value={meta.frozenBy} />
                  <Field label="Fecha congelado" value={meta.frozenAt} />
                </div>
              </Card>
            )}
          </div>

          {/* Desglose */}
          <Card className="mt-5">
            <CardHeader title="Desglose por grupo (nivel 2)" />
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                    <th className="px-4 py-2 font-semibold">Código</th>
                    <th className="px-4 py-2 font-semibold">Cuenta</th>
                    <th className="px-4 py-2 text-right font-semibold">Saldo</th>
                    <th className="px-4 py-2 text-right font-semibold">Var. %</th>
                    <th className="px-4 py-2 font-semibold">Estándar</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((g) => (
                    <GroupRows key={g.code} group={g} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function GroupRows({ group }: { group: BreakdownGroup }) {
  return (
    <>
      <tr className="border-b border-ink-100 bg-ink-50">
        <td className="px-4 py-2 font-mono font-semibold text-ink-700">{group.code}</td>
        <td className="px-4 py-2 font-semibold text-ink-800">
          {group.name}
          {group.critical && <span className="ml-2"><Chip label="crítica" tone="err" /></span>}
        </td>
        <td className="px-4 py-2 text-right font-mono font-semibold text-ink-800">{fmt(group.balance)}</td>
        <td className="px-4 py-2 text-right font-mono text-ink-600">{group.variation != null ? `${group.variation}%` : "—"}</td>
        <td className="px-4 py-2"></td>
      </tr>
      {group.items.map((it) => (
        <tr key={it.code} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
          <td className="px-4 py-2 pl-8 font-mono text-[11.5px] text-ink-500">{it.code}</td>
          <td className="px-4 py-2 text-ink-700">{it.name}</td>
          <td className="px-4 py-2 text-right font-mono text-ink-700">{fmt(it.balance)}</td>
          <td className="px-4 py-2 text-right font-mono text-ink-500">{it.variation != null ? `${it.variation}%` : "—"}</td>
          <td className="px-4 py-2">
            {it.mapped ? (
              <span className="font-mono text-[11.5px] text-ink-500">{it.std}</span>
            ) : (
              <Chip label="sin mapeo" tone="warn" />
            )}
          </td>
        </tr>
      ))}
    </>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className={`mt-0.5 text-ink-800 ${mono ? "font-mono text-[12px]" : ""}`}>{value}</div>
    </div>
  );
}
