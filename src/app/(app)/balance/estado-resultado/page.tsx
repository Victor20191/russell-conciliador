import Link from "next/link";
import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader, Card, StatCard, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtNum, fmtPct } from "@/lib/format";
import ErExportActions, { type ErLine } from "./er-export-actions";
import ErSelectors from "./er-selectors";

function varPct(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}
const money = (n: number) => `${n < 0 ? "-" : ""}$ ${fmtNum(Math.abs(n))} M`;

export default async function EstadoResultadoPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string; periodo?: string }>;
}) {
  await requirePermiso("balance:ver");
  const puedeVerMapeo = (await authorizePermiso("mapeo:ver")).ok;
  const sp = await searchParams;
  // Solo la cartera del usuario alimenta el selector; el cliente/período de la
  // URL se valida contra esa lista (sin fuga del estado de resultado ajeno).
  const alc = await alcanceLecturaUsuario();
  // Balances oficiales con estado de resultado cargado (filtrado en memoria; pocos registros)
  const officials = (
    await prisma.balance.findMany({
      where: { isOfficial: true, ...(alc.todos ? {} : { clientName: { in: alc.clientNames } }) },
      select: { clientName: true, period: true, incomeStatement: true },
      orderBy: [{ clientName: "asc" }, { period: "asc" }],
    })
  ).filter((o) => o.incomeStatement != null);

  const clientNames = [...new Set(officials.map((o) => o.clientName))];
  const cliente = sp.cliente && clientNames.includes(sp.cliente) ? sp.cliente : (clientNames.includes("El Zarzal S.A") ? "El Zarzal S.A" : clientNames[0] ?? "");
  const periodsForClient = officials.filter((o) => o.clientName === cliente).map((o) => o.period);
  const periodo = sp.periodo && periodsForClient.includes(sp.periodo) ? sp.periodo : periodsForClient[0] ?? "";

  const selected = officials.find((o) => o.clientName === cliente && o.period === periodo);
  const lines = (selected?.incomeStatement as ErLine[] | null) ?? [];

  const find = (needle: string) => lines.find((l) => l.concept.toLowerCase().includes(needle));
  const ingresos = lines[0]?.current ?? 0;
  const bruta = find("utilidad bruta");
  const operacional = find("utilidad operacional");
  const neta = find("utilidad neta");
  const margin = (n: number | undefined) => (ingresos && n != null ? `Margen ${(Math.abs(n) / ingresos * 100).toFixed(1)}%` : "");
  const ingresosVar = lines[0] ? varPct(lines[0].current, lines[0].prior) : null;

  return (
    <div>
      <PageHeader
        title="Estado de Resultado"
        subtitle="Consolidación del Estado de Resultado por período bajo el plan estándar. Comparativo vs. año anterior y presupuesto."
        actions={puedeVerMapeo ? (
          <Link href="/config/mapeo" className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600">
            <Icon name="settings" size={14} /> Ajustar mapeo
          </Link>
        ) : null}
      />

      {lines.length === 0 ? (
        <EmptyState icon="chart" title="Sin estado de resultado" description="Este cliente/período no tiene un estado de resultado consolidado en el repositorio." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Ingresos operacionales" value={money(ingresos)} hint={ingresosVar != null ? `${fmtPct(ingresosVar)} vs año anterior` : ""} tone="ok" />
            <StatCard label="Utilidad bruta" value={money(bruta?.current ?? 0)} hint={margin(bruta?.current)} tone="ink" />
            <StatCard label="Utilidad operacional" value={money(operacional?.current ?? 0)} hint={margin(operacional?.current)} tone="ink" />
            <StatCard label="Utilidad neta" value={money(neta?.current ?? 0)} hint={margin(neta?.current)} tone="ok" />
          </div>

          <Card className="mt-5">
            <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
              <h2 className="text-[13px] font-semibold text-ink-800">Estado de Resultado · {cliente} · {periodo}</h2>
              <div className="ml-auto"><ErSelectors clientNames={clientNames} cliente={cliente} periods={periodsForClient} periodo={periodo} /></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                    <th className="px-4 py-2 font-semibold">Concepto (plan estándar)</th>
                    <th className="px-4 py-2 text-right font-semibold">2025</th>
                    <th className="px-4 py-2 text-right font-semibold">2024</th>
                    <th className="px-4 py-2 text-right font-semibold">Var %</th>
                    <th className="px-4 py-2 text-right font-semibold">Presup.</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => {
                    const v = varPct(l.current, l.prior);
                    return (
                      <tr key={i} className={`${l.bold ? "bg-ink-50 font-semibold text-ink-900" : "text-ink-700"} ${l.sep ? "border-t-2 border-ink-200" : "border-b border-ink-50"}`}>
                        <td className="px-4 py-2">{l.concept}</td>
                        <td className="px-4 py-2 text-right font-mono">{money(l.current)}</td>
                        <td className="px-4 py-2 text-right font-mono text-ink-500">{money(l.prior)}</td>
                        <td className={`px-4 py-2 text-right font-mono ${v == null ? "text-ink-400" : v >= 0 ? "text-ok-700" : "text-err-700"}`}>{fmtPct(v)}</td>
                        <td className="px-4 py-2 text-right font-mono text-ink-500">{money(l.budget)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ErExportActions cliente={cliente} periodo={periodo} lines={lines} />
          </Card>
        </>
      )}
    </div>
  );
}
