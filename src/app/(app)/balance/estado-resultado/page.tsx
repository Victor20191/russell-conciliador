import Link from "next/link";
import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader, Card, StatCard, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtNum } from "@/lib/format";
import { reconstruirBalance, construirEstadoResultado } from "@/lib/balance/calcular";
import { getCuentasEstandar } from "@/lib/balance/cuentas-estandar";
import ErExportActions, { type ErLine } from "./er-export-actions";
import ErSelectors from "./er-selectors";

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
  // Balances oficiales (encabezados) de la cartera del usuario.
  const officials = await prisma.balancePruebaEncabezado.findMany({
    where: { esOficial: true, ...(alc.todos ? {} : { clienteId: { in: alc.clientIds } }) },
    select: { id: true, nombreCliente: true, periodo: true },
    orderBy: [{ nombreCliente: "asc" }, { periodo: "asc" }],
  });

  const clientNames = [...new Set(officials.map((o) => o.nombreCliente))];
  const cliente = sp.cliente && clientNames.includes(sp.cliente) ? sp.cliente : (clientNames.includes("El Zarzal S.A") ? "El Zarzal S.A" : clientNames[0] ?? "");
  const periodsForClient = officials.filter((o) => o.nombreCliente === cliente).map((o) => o.periodo);
  const periodo = sp.periodo && periodsForClient.includes(sp.periodo) ? sp.periodo : periodsForClient[0] ?? "";

  // El estado de resultado se DERIVA del detalle del balance oficial seleccionado.
  const selected = officials.find((o) => o.nombreCliente === cliente && o.periodo === periodo);
  let lines: ErLine[] = [];
  if (selected) {
    const [det, cuentasEstandar] = await Promise.all([
      prisma.balancePruebaDetalle.findMany({
        where: { encabezadoId: selected.id },
        select: { cuenta8: true, nombreCuenta: true, cuenta6Russell: true, saldoInicial: true, debitos: true, creditos: true, saldoFinal: true },
      }),
      getCuentasEstandar(),
    ]);
    const calc = reconstruirBalance(
      det.map((f) => ({
        cuenta8: f.cuenta8, nombreCuenta: f.nombreCuenta, cuenta6Russell: f.cuenta6Russell,
        saldoInicial: Number(f.saldoInicial), debitos: Number(f.debitos), creditos: Number(f.creditos), saldoFinal: Number(f.saldoFinal),
      })),
      cuentasEstandar,
    );
    lines = construirEstadoResultado(calc);
  }

  const find = (needle: string) => lines.find((l) => l.concept.toLowerCase().includes(needle));
  const ingresos = lines[0]?.current ?? 0;
  const bruta = find("utilidad bruta");
  const operacional = find("utilidad operacional");
  const neta = find("utilidad neta");
  const margin = (n: number | undefined) => (ingresos && n != null ? `Margen ${(Math.abs(n) / ingresos * 100).toFixed(1)}%` : "");

  return (
    <div>
      <PageHeader
        title="Estado de Resultado"
        subtitle="Consolidación del Estado de Resultado por período bajo el plan estándar."
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
            <StatCard label="Ingresos operacionales" value={money(ingresos)} tone="ok" />
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
                    <th className="px-4 py-2 text-right font-semibold">Valor del período</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className={`${l.bold ? "bg-ink-50 font-semibold text-ink-900" : "text-ink-700"} ${l.sep ? "border-t-2 border-ink-200" : "border-b border-ink-50"}`}>
                      <td className="px-4 py-2">{l.concept}</td>
                      <td className="px-4 py-2 text-right font-mono">{money(l.current)}</td>
                    </tr>
                  ))}
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
