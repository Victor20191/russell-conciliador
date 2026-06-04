# Fase 3C · KPIs y paneles del Dashboard — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax para tracking.

**Goal:** Alinear `/dashboard` con el prototipo: CTA "Nueva conciliación", 4 KPIs derivados de datos reales (conciliaciones, pendientes en proceso, diferencia neta acumulada, cobertura de parametrización), tabla de conciliaciones recientes clickeable con ERP/Auditor/estado legible, y panel "Actividad del equipo" (feed de auditoría).

**Architecture:** Reescritura del Server Component `dashboard/page.tsx`. Todo derivado de Prisma (sin modelos ni acciones nuevas). La diferencia neta acumulada se agrega desde `ReconciliationRow`; la cobertura desde `ClientModule`; la actividad desde `AuditEntry`.

**Tech Stack:** Next.js 16, Prisma 7, Tailwind v4, TS.

**Rama:** `finalizacion-lfm`. Reutiliza `PageHeader, Card, CardHeader, StatCard, Chip` (`@/components/ui`), `Icon`, `statusChip`/`fmtCompact` (`@/lib/format`).

---

## Task 3C.1: Reescribir el dashboard

**Files:** Modify `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Reemplazar el archivo**

Reemplazar **todo** `src/app/(app)/dashboard/page.tsx` por el código de la sección "Código del dashboard" más abajo.

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/dashboard/page.tsx"
git commit -m "feat: dashboard con KPIs derivados, CTA, tabla clickeable y actividad del equipo"
```

### Código del dashboard

```tsx
import Link from "next/link";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { PageHeader, Card, CardHeader, StatCard, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { statusChip, fmtCompact } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = { OK: "Conciliado", DIFF: "Diferencia", REVIEW: "En revisión" };
function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "··";
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const [recs, diffSum, configuredCount, pendingCount, activity, pendingClients] = await Promise.all([
    prisma.reconciliation.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.reconciliationRow.aggregate({ _sum: { diff: true } }),
    prisma.clientModule.count({ where: { status: "configured" } }),
    prisma.clientModule.count({ where: { status: "pending" } }),
    prisma.auditEntry.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.client.findMany({ where: { modules: { some: { status: "pending" } } }, include: { modules: { where: { status: "pending" }, include: { module: true } } } }),
  ]);

  const inProcess = recs.filter((r) => r.status === "DIFF" || r.status === "REVIEW").length;
  const netDiff = diffSum._sum.diff ?? 0;
  const coverage = configuredCount + pendingCount > 0 ? Math.round((configuredCount / (configuredCount + pendingCount)) * 100) : 0;

  return (
    <div>
      <PageHeader
        title={`Hola, ${user?.name?.split(" ")[0] ?? ""}`}
        subtitle="Resumen de tu trabajo de conciliación y diagnóstico"
        actions={<Link href="/conciliacion/nueva" className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600"><Icon name="play" size={14} /> Nueva conciliación</Link>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Conciliaciones" value={String(recs.length)} hint={`${inProcess} en proceso`} tone="blue" />
        <StatCard label="Pendientes en proceso" value={String(inProcess)} hint="requieren atención" tone={inProcess > 0 ? "warn" : "ok"} />
        <StatCard label="Diferencia neta acumulada" value={fmtCompact(netDiff)} hint="partidas con diferencia" tone={netDiff !== 0 ? "err" : "ok"} />
        <StatCard label="Cobertura parametrización" value={`${coverage}%`} hint={`${configuredCount} módulos configurados`} tone="ink" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Conciliaciones recientes" right={<Link href="/conciliacion/resultados" className="text-[12px] font-medium text-blue-500 hover:underline">Ver todas</Link>} />
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                  <th className="px-4 py-2 font-semibold">ID</th>
                  <th className="px-4 py-2 font-semibold">Cliente</th>
                  <th className="px-4 py-2 font-semibold">Módulo</th>
                  <th className="px-4 py-2 font-semibold">ERP</th>
                  <th className="px-4 py-2 text-right font-semibold">Diferencia</th>
                  <th className="px-4 py-2 font-semibold">Estado</th>
                  <th className="px-4 py-2 font-semibold">Auditor</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {recs.map((r) => (
                  <tr key={r.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                    <td className="px-4 py-2.5 font-mono text-[11.5px] text-ink-500">{r.id}</td>
                    <td className="px-4 py-2.5 text-ink-800">{r.clientName}</td>
                    <td className="px-4 py-2.5 text-ink-600">{r.module}</td>
                    <td className="px-4 py-2.5 text-ink-500">{r.erp}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-700">{r.diff}</td>
                    <td className="px-4 py-2.5"><span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusChip(r.status)}`}>{STATUS_LABEL[r.status] ?? r.status}</span></td>
                    <td className="px-4 py-2.5 text-ink-600">{r.owner}</td>
                    <td className="px-4 py-2.5 text-right"><Link href={`/conciliacion/resultados/${r.id}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-500 hover:underline">Ver <Icon name="chev-r" size={12} /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Actividad del equipo" />
            <div className="divide-y divide-ink-50">
              {activity.map((a) => (
                <div key={a.id} className="flex gap-2.5 px-4 py-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[10px] font-semibold text-white">{initials(a.user)}</div>
                  <div className="text-[12px] text-ink-700">
                    <div><b>{a.user}</b> <span className="text-ink-500">{a.action.toLowerCase()}</span> <b>{a.entity}</b></div>
                    <div className="text-[11px] text-ink-400">{a.detail}</div>
                    <div className="text-[10.5px] text-ink-300">{a.ts}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Parametrización pendiente" />
            <div className="divide-y divide-ink-50">
              {pendingClients.map((c) => (
                <div key={c.id} className="px-4 py-3">
                  <div className="flex items-center justify-between"><span className="text-[12.5px] font-medium text-ink-800">{c.name}</span><span className="font-mono text-[11px] text-ink-400">{c.erp}</span></div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">{c.modules.map((m) => <Chip key={m.id} label={m.module.name} tone="warn" />)}</div>
                </div>
              ))}
              {pendingClients.length === 0 && <div className="px-4 py-6 text-center text-[12.5px] text-ink-400">Sin pendientes 🎉</div>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
```

---

## Task 3C.2: Validación de cierre de Fase 3C (y de la Fase 3)

- [ ] **Step 1: Suite**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build && npx prisma migrate status`
Expected: todo verde.

- [ ] **Step 2: Smoke (lo ejecuta el controlador)**

`/dashboard`: CTA "Nueva conciliación", 4 KPIs derivados (Conciliaciones, Pendientes en proceso, Diferencia neta acumulada, Cobertura %), tabla recientes con ERP/Auditor/estado legible + "Ver" → detalle, panel "Actividad del equipo" con avatares, panel "Parametrización pendiente".

- [ ] **Step 3: Commit final (si aplica)**

```bash
git add -A && git commit -m "chore: cierre y validación de Fase 3C" || echo "nada"
```

---

## Notas
- Sin modelos ni acciones nuevas. KPIs derivados de datos reales (`ReconciliationRow` para diferencia neta, `ClientModule` para cobertura, `AuditEntry` para actividad).
- Cierra la **Fase 3 (Conciliación)** completa (3A + 3B + 3C).
- Sin placeholders pendientes.
