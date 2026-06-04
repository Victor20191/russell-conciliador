import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import BalanceIndexClient, {
  type ClientGroup,
  type PeriodRow,
  type AuditRow,
  type StdAccount,
} from "./balance-index-client";

type AuditEntry = { date: string; actor: string; role: string; action: string; ip: string; details: string };

export default async function BalancePage() {
  const [balances, standard] = await Promise.all([
    prisma.balance.findMany({ orderBy: [{ clientName: "asc" }, { createdAt: "desc" }] }),
    prisma.standardAccount.findMany({ orderBy: { code: "asc" } }),
  ]);

  // Agrupar por cliente → períodos. NOTA: el Map es solo para agregar aquí;
  // a la frontera RSC→client se pasan SOLO objetos planos serializables (periodList).
  type Agg = { clientName: string; clientNit: string; mapped?: number; unmapped?: number; total?: number; periods: Map<string, PeriodRow> };
  const byClient = new Map<string, Agg>();
  for (const b of balances) {
    let g = byClient.get(b.clientName);
    if (!g) {
      g = { clientName: b.clientName, clientNit: b.clientNit ?? "", periods: new Map() };
      byClient.set(b.clientName, g);
    }
    const meta = b.meta as { mapped?: number; unmapped?: number; rows?: number } | null;
    if (meta && (g.mapped == null || b.isOfficial)) {
      g.mapped = meta.mapped; g.unmapped = meta.unmapped; g.total = meta.rows;
    }
    let p = g.periods.get(b.period);
    if (!p) { p = { period: b.period, versions: 0, official: null, officialId: null, status: b.status, complete: b.complete, lastUpload: b.lastUpload ?? "" }; g.periods.set(b.period, p); }
    p.versions += 1;
    if (!p.officialId) p.officialId = b.id; // fallback si ninguna fila es oficial
    if (b.isOfficial) {
      p.official = b.version; p.officialId = b.id; p.status = b.status; p.complete = b.complete; p.lastUpload = b.lastUpload ?? p.lastUpload;
      // El conteo real de versiones del período oficial viene de su versionHistory.
      const vh = b.versionHistory as unknown[] | null;
      if (vh && vh.length > p.versions) p.versions = vh.length;
    }
  }

  const clients: ClientGroup[] = [...byClient.values()].map((g) => ({
    clientName: g.clientName, clientNit: g.clientNit, mapped: g.mapped, unmapped: g.unmapped, total: g.total,
    periodList: [...g.periods.values()],
  }));

  // Audit log: del balance oficial de El Zarzal (demo) — primero con auditLog no nulo
  const withAudit = balances.find((b) => b.auditLog != null);
  const auditLog = (withAudit?.auditLog as AuditEntry[] | null) ?? [];
  const auditRows: AuditRow[] = auditLog;

  const std: StdAccount[] = standard.map((s) => ({
    code: s.code, name: s.name, level: s.level, nature: s.nature, critical: s.critical,
  }));

  const clientNames = clients.map((c) => c.clientName);

  return (
    <div>
      <PageHeader
        title="Balance de comprobación"
        subtitle="Fuente única de los balances cargados por cliente. Versionamiento, validaciones, mapeo y trazabilidad. Lo consumen DIAN, Razonabilidad y Conciliaciones."
      />
      <BalanceIndexClient clients={clients} auditRows={auditRows} std={std} clientNames={clientNames} />
    </div>
  );
}
