import prisma from "@/lib/prisma";
import { PageHeader, Card, StatCard, Chip } from "@/components/ui";
import { fmt, fmtNum, MESES, MESES_LARGOS } from "@/lib/format";
import { requirePermiso } from "@/lib/rbac";
import { getTRM } from "@/lib/ia/trm";
import ConsumoTabla, { type ConsumoRow } from "./consumo-tabla";

// Etiquetas legibles del tipo de operación de IA.
const TIPO_LABEL: Record<string, string> = {
  extraccion_tabular: "Extracción (Excel/CSV)",
  extraccion_pdf: "Extracción (PDF/documento)",
  mapeo_ia: "Mapeo de cuentas",
};
const tipoLabel = (t: string) => TIPO_LABEL[t] ?? t;
// Un "escaneo de documento" = una extracción (el mapeo es un paso posterior del
// mismo documento, con 1 o varias llamadas).
const TIPOS_ESCANEO = ["extraccion_tabular", "extraccion_pdf"];

const p2 = (n: number) => String(n).padStart(2, "0");
const fmtTS = (d: Date) =>
  `${p2(d.getDate())}/${MESES[d.getMonth()]}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
const num = (v: unknown) => Number(v ?? 0);

export default async function ConsumoIAPage() {
  // SOLO el Superadministrador (permiso auditoria:ia). Redirige si no cumple.
  await requirePermiso("auditoria:ia");

  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const whereMes = { creadoEn: { gte: inicioMes } };

  const [resumenMes, escaneosMes, porTipo, porCliente, totalHist, detalle, trm] = await Promise.all([
    prisma.consumoIA.aggregate({
      where: whereMes,
      _sum: {
        costoCop: true, costoUsd: true,
        tokensEntrada: true, tokensSalida: true, tokensCacheCreacion: true, tokensCacheLectura: true,
      },
      _count: true,
    }),
    prisma.consumoIA.count({ where: { ...whereMes, tipoOperacion: { in: TIPOS_ESCANEO } } }),
    prisma.consumoIA.groupBy({
      by: ["tipoOperacion"],
      where: whereMes,
      _sum: { costoCop: true },
      _count: true,
    }),
    prisma.consumoIA.groupBy({
      by: ["clienteId"],
      where: whereMes,
      _sum: { costoCop: true },
      _count: true,
      orderBy: { _sum: { costoCop: "desc" } },
      take: 12,
    }),
    prisma.consumoIA.aggregate({ _sum: { costoCop: true }, _count: true }),
    prisma.consumoIA.findMany({
      orderBy: { creadoEn: "desc" },
      take: 500,
      select: {
        id: true, creadoEn: true, tipoOperacion: true, modelo: true, clienteId: true,
        usuarioNombre: true, archivoNombre: true,
        tokensEntrada: true, tokensSalida: true, tokensCacheCreacion: true, tokensCacheLectura: true,
        costoCop: true,
      },
    }),
    getTRM(),
  ]);

  // Resolver nombres de cliente (clienteId es FK suave: no hay join).
  const idsClientes = [
    ...new Set(
      [...porCliente.map((c) => c.clienteId), ...detalle.map((d) => d.clienteId)].filter(
        (id): id is number => typeof id === "number",
      ),
    ),
  ];
  const clientes = idsClientes.length
    ? await prisma.client.findMany({ where: { id: { in: idsClientes } }, select: { id: true, name: true } })
    : [];
  const nombreCliente = new Map(clientes.map((c) => [c.id, c.name]));
  const etiquetaCliente = (id: number | null) =>
    id == null ? "— (sin cliente)" : nombreCliente.get(id) ?? `Cliente #${id}`;

  const costoMes = num(resumenMes._sum.costoCop);
  const costoUsdMes = num(resumenMes._sum.costoUsd);
  const tokensMes =
    num(resumenMes._sum.tokensEntrada) + num(resumenMes._sum.tokensSalida) +
    num(resumenMes._sum.tokensCacheCreacion) + num(resumenMes._sum.tokensCacheLectura);
  const llamadasMes = resumenMes._count;
  const costoHist = num(totalHist._sum.costoCop);
  const llamadasHist = totalHist._count;

  const mesLabel = `${MESES_LARGOS[ahora.getMonth()]} ${ahora.getFullYear()}`;
  const maxTipo = Math.max(1, ...porTipo.map((t) => num(t._sum.costoCop)));
  const maxCliente = Math.max(1, ...porCliente.map((c) => num(c._sum.costoCop)));

  const rows: ConsumoRow[] = detalle.map((d) => ({
    id: d.id,
    ts: fmtTS(d.creadoEn),
    tipo: tipoLabel(d.tipoOperacion),
    modelo: d.modelo,
    cliente: etiquetaCliente(d.clienteId),
    usuario: d.usuarioNombre,
    archivo: d.archivoNombre,
    tokens: num(d.tokensEntrada) + num(d.tokensSalida) + num(d.tokensCacheCreacion) + num(d.tokensCacheLectura),
    costoCop: num(d.costoCop),
  }));

  return (
    <div>
      <PageHeader
        title="Consumo de IA"
        subtitle="Tokens y costos de los escaneos de documentos con IA (Claude). El gasto se convierte a pesos colombianos con la TRM oficial vigente."
        actions={<Chip label={`TRM ${fmt(Math.round(trm))} / USD`} tone="ai" />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Gasto · ${mesLabel}`} value={fmt(Math.round(costoMes))} tone="ink" hint={`US$ ${costoUsdMes.toFixed(2)}`} />
        <StatCard label="Escaneos del mes" value={fmtNum(escaneosMes)} tone="blue" hint="documentos leídos por IA" />
        <StatCard label="Llamadas a la IA" value={fmtNum(llamadasMes)} tone="ink" hint="extracción + mapeo" />
        <StatCard label="Tokens del mes" value={fmtNum(tokensMes)} tone="ink" />
      </div>

      <p className="mb-4 text-[12px] text-ink-500">
        Acumulado histórico: <span className="font-semibold text-ink-700">{fmt(Math.round(costoHist))}</span> en{" "}
        {fmtNum(llamadasHist)} llamada(s).
      </p>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-[13px] font-semibold text-ink-800">Gasto por tipo de operación · {mesLabel}</h2>
          {porTipo.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-ink-400">Sin consumo este mes.</p>
          ) : (
            <ul className="space-y-2.5">
              {porTipo.map((t) => {
                const costo = num(t._sum.costoCop);
                return (
                  <li key={t.tipoOperacion}>
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[12.5px] text-ink-800">
                        {tipoLabel(t.tipoOperacion)}
                        <span className="ml-1.5 text-[11px] text-ink-400">{fmtNum(t._count)} llamada(s)</span>
                      </span>
                      <span className="shrink-0 font-mono text-[12px] font-semibold text-ink-700">{fmt(Math.round(costo))}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.round((costo / maxTipo) * 100)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-[13px] font-semibold text-ink-800">Gasto por cliente · {mesLabel}</h2>
          {porCliente.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-ink-400">Sin consumo este mes.</p>
          ) : (
            <ul className="space-y-2.5">
              {porCliente.map((c) => {
                const costo = num(c._sum.costoCop);
                return (
                  <li key={String(c.clienteId)}>
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[12.5px] text-ink-800">
                        {etiquetaCliente(c.clienteId)}
                        <span className="ml-1.5 text-[11px] text-ink-400">{fmtNum(c._count)} llamada(s)</span>
                      </span>
                      <span className="shrink-0 font-mono text-[12px] font-semibold text-ink-700">{fmt(Math.round(costo))}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full bg-navy-700" style={{ width: `${Math.round((costo / maxCliente) * 100)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <ConsumoTabla rows={rows} />
    </div>
  );
}
