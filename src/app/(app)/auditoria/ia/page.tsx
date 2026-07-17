import prisma from "@/lib/prisma";
import { PageHeader, Card, StatCard, Chip } from "@/components/ui";
import { fmt, fmtDateTime, fmtNum, MESES_LARGOS } from "@/lib/format";
import { inicioMesColombia, partesFechaHoraColombia } from "@/lib/fecha-hora";
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

const num = (v: unknown) => Number(v ?? 0);
const normalizarNit = (nit: string | null | undefined) => {
  const limpio = String(nit ?? "").replace(/\D/g, "");
  return limpio || null;
};

type ClienteInfo = { key: string; label: string };
type ClienteResumen = ClienteInfo & { llamadas: number; costoCop: number; costoUsd: number };

export default async function ConsumoIAPage() {
  // SOLO el Superadministrador (permiso auditoria:ia). Redirige si no cumple.
  await requirePermiso("auditoria:ia");

  const ahora = new Date();
  const partesAhora = partesFechaHoraColombia(ahora)!;
  const inicioMes = inicioMesColombia(ahora);
  const whereMes = { creadoEn: { gte: inicioMes } };

  const [resumenMes, escaneosMes, porTipo, consumoMesCliente, totalHist, detalle, trm] = await Promise.all([
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
    prisma.consumoIA.findMany({
      where: whereMes,
      select: { clienteId: true, nitDetectado: true, archivoNombre: true, costoCop: true, costoUsd: true },
    }),
    prisma.consumoIA.aggregate({ _sum: { costoCop: true }, _count: true }),
    prisma.consumoIA.findMany({
      orderBy: { creadoEn: "desc" },
      take: 500,
      select: {
        id: true, creadoEn: true, tipoOperacion: true, modelo: true, clienteId: true, nitDetectado: true,
        usuarioNombre: true, archivoNombre: true,
        tokensEntrada: true, tokensSalida: true, tokensCacheCreacion: true, tokensCacheLectura: true,
        costoUsd: true, trm: true, costoCop: true,
      },
    }),
    getTRM(),
  ]);

  // Resolver nombres de cliente. clienteId es FK suave; para extracciones previas
  // a la confirmación se usa el NIT detectado o, si falta, el archivo cuando sus
  // llamadas de mapeo apuntan a un único cliente.
  const clientes = await prisma.client.findMany({ select: { id: true, name: true, nit: true } });
  const nombreCliente = new Map(clientes.map((c) => [c.id, c.name]));
  const clientePorNit = new Map(
    clientes.flatMap((c) => {
      const nit = normalizarNit(c.nit);
      return nit ? [[nit, { id: c.id, name: c.name }] as const] : [];
    }),
  );
  const candidatosArchivo = new Map<string, Set<number>>();
  for (const c of [...consumoMesCliente, ...detalle]) {
    if (c.clienteId == null || !c.archivoNombre) continue;
    const set = candidatosArchivo.get(c.archivoNombre) ?? new Set<number>();
    set.add(c.clienteId);
    candidatosArchivo.set(c.archivoNombre, set);
  }
  const clientePorArchivo = new Map<string, { id: number; name: string }>();
  for (const [archivo, ids] of candidatosArchivo) {
    if (ids.size !== 1) continue;
    const id = [...ids][0];
    clientePorArchivo.set(archivo, { id, name: nombreCliente.get(id) ?? `Cliente #${id}` });
  }
  const clienteInfo = (id: number | null, nitDetectado?: string | null, archivoNombre?: string | null): ClienteInfo => {
    if (id != null) return { key: `id:${id}`, label: nombreCliente.get(id) ?? `Cliente #${id}` };
    const nit = normalizarNit(nitDetectado);
    const porNit = nit ? clientePorNit.get(nit) : null;
    if (porNit) return { key: `id:${porNit.id}`, label: porNit.name };
    const porArchivo = archivoNombre ? clientePorArchivo.get(archivoNombre) : null;
    if (porArchivo) return { key: `id:${porArchivo.id}`, label: porArchivo.name };
    return { key: "sin-cliente", label: "— (sin cliente)" };
  };

  const costoMes = num(resumenMes._sum.costoCop);
  const costoUsdMes = num(resumenMes._sum.costoUsd);
  const tokensMes =
    num(resumenMes._sum.tokensEntrada) + num(resumenMes._sum.tokensSalida) +
    num(resumenMes._sum.tokensCacheCreacion) + num(resumenMes._sum.tokensCacheLectura);
  const llamadasMes = resumenMes._count;
  const costoHist = num(totalHist._sum.costoCop);
  const llamadasHist = totalHist._count;

  const mesLabel = `${MESES_LARGOS[partesAhora.mes - 1]} ${partesAhora.anio}`;
  const maxTipo = Math.max(1, ...porTipo.map((t) => num(t._sum.costoCop)));
  const resumenClienteMap = new Map<string, ClienteResumen>();
  for (const c of consumoMesCliente) {
    const info = clienteInfo(c.clienteId, c.nitDetectado, c.archivoNombre);
    const actual = resumenClienteMap.get(info.key) ?? { ...info, llamadas: 0, costoCop: 0, costoUsd: 0 };
    actual.llamadas += 1;
    actual.costoCop += num(c.costoCop);
    actual.costoUsd += num(c.costoUsd);
    resumenClienteMap.set(info.key, actual);
  }
  const porCliente = [...resumenClienteMap.values()].sort((a, b) => b.costoCop - a.costoCop).slice(0, 12);
  const maxCliente = Math.max(1, ...porCliente.map((c) => c.costoCop));

  const rows: ConsumoRow[] = detalle.map((d) => ({
    id: d.id,
    ts: fmtDateTime(d.creadoEn),
    tipo: tipoLabel(d.tipoOperacion),
    modelo: d.modelo,
    cliente: clienteInfo(d.clienteId, d.nitDetectado, d.archivoNombre).label,
    usuario: d.usuarioNombre,
    archivo: d.archivoNombre,
    tokens: num(d.tokensEntrada) + num(d.tokensSalida) + num(d.tokensCacheCreacion) + num(d.tokensCacheLectura),
    costoUsd: num(d.costoUsd),
    trm: num(d.trm),
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
                const costo = c.costoCop;
                return (
                  <li key={c.key}>
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[12.5px] text-ink-800">
                        {c.label}
                        <span className="ml-1.5 text-[11px] text-ink-400">{fmtNum(c.llamadas)} llamada(s) · US$ {c.costoUsd.toFixed(4)}</span>
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
