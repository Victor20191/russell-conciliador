# Fase 3A · Detalle del cruce de conciliación — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el detalle del cruce `/conciliacion/resultados/[id]` (KPIs, tabla por cuenta con materialidad, panel lateral con tabs Comentarios/Detalle/Acciones y persistencia real de comentarios y estado de partida), y enriquecer `/conciliacion/en-proceso` (última actividad, estados de proceso, filas clickeables) y `/conciliacion/resultados` (filas clickeables al detalle).

**Architecture:** Server Components leen Prisma; el detalle del cruce delega su interactividad (selección de fila, tabs, filtros) a un componente `"use client"`; las mutaciones (comentar, marcar estado de partida, enviar a revisor) son Server Actions con auditoría + `revalidatePath`.

**Tech Stack:** Next.js 16, React 19, Prisma 7, PostgreSQL, Tailwind v4, TS, Vitest.

**Restricción Next 16:** `params` de páginas es `Promise` (`const { id } = await params`). Server Actions con `"use server"`.

**Rama:** `finalizacion-lfm`. Reutiliza `PageHeader, Card, StatCard, Chip, BackLink, EmptyState` (`@/components/ui`), `Icon` (`@/components/icons`), `fmt`, `fmtCompact`, `fmtPct` (`@/lib/format`), `logAudit` (`@/lib/audit`).

**Fuera de alcance de 3A:** asistente de nueva conciliación (3B), KPIs del dashboard (3C), exportación Excel/PDF (deshabilitada), reasignación de auditor con selector (botón deshabilitado).

---

## Mapa de archivos

**Crear:**
- `src/app/actions/reconciliation.ts` — `addReconciliationComment`, `setRowStatus`, `sendToReviewer`.
- `src/app/(app)/conciliacion/resultados/[id]/page.tsx` — server del detalle.
- `src/app/(app)/conciliacion/resultados/[id]/cruce-client.tsx` — UI client del detalle.

**Modificar:**
- `prisma/schema.prisma` — `ReconciliationRow`, `ReconciliationComment`, campos nuevos en `Reconciliation`.
- `prisma/seed.ts` — `lastActivity` en recs en proceso + REC-2026-0431 con 9 filas y 3 comentarios.
- `src/app/(app)/conciliacion/resultados/page.tsx` — filas clickeables.
- `src/app/(app)/conciliacion/en-proceso/page.tsx` — columna actividad, estados, filas clickeables.

---

## Task 3A.1: Esquema — filas, comentarios y campos del cruce

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: Extender `Reconciliation` y añadir relaciones**

En `model Reconciliation`, añadir estos campos (junto a los existentes) y las relaciones:
```prisma
  cutoff       String?
  runAt        String?
  runBy        String?
  lastActivity String?
  materiality  Int      @default(2000000)
  rows         ReconciliationRow[]
  comments     ReconciliationComment[]
```

- [ ] **Step 2: Añadir los modelos nuevos**

Después de `model Reconciliation`, añadir:
```prisma
model ReconciliationRow {
  id               String         @id @default(cuid())
  reconciliation   Reconciliation @relation(fields: [reconciliationId], references: [id], onDelete: Cascade)
  reconciliationId String
  cuenta           String
  desc             String
  cont             Int // saldo contabilidad
  mod              Int // saldo módulo
  diff             Int
  items            Int            @default(0)
  manualStatus     String? // conciliada | excepcion | ajuste (override del estado por materialidad)
  order            Int            @default(0)
}

model ReconciliationComment {
  id               String         @id @default(cuid())
  reconciliation   Reconciliation @relation(fields: [reconciliationId], references: [id], onDelete: Cascade)
  reconciliationId String
  cuenta           String
  who              String
  initials         String
  text             String
  time             String
  createdAt        DateTime       @default(now())
}
```

- [ ] **Step 3: Migración**

Run:
```bash
npx prisma migrate dev --name reconciliation_rows_comments && npx prisma generate
```
Expected: aplicada; migrate status up to date.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): ReconciliationRow, ReconciliationComment y campos de cruce"
```

---

## Task 3A.2: Seed — cruce REC-2026-0431 + actividad

**Files:** Modify `prisma/seed.ts`

- [ ] **Step 1: Limpieza idempotente**

En el bloque de limpieza de `prisma/seed.ts`, añadir **antes** de `await prisma.reconciliation.deleteMany();`:
```ts
  await prisma.reconciliationComment.deleteMany();
  await prisma.reconciliationRow.deleteMany();
```

- [ ] **Step 2: Añadir `lastActivity` a las conciliaciones recientes**

En el `prisma.reconciliation.createMany({ data: [...] })` existente, añadir `lastActivity` a las filas con estado DIFF/REVIEW (REC-2026-0412, 0407, 0403):
```ts
      { id: "REC-2026-0412", clientName: "Agroindustrias del Cauca Ltda.", module: "Cartera", period: "Mar 2026", erp: "SIIGO", status: "DIFF", diff: "$ 4.218.500", items: 7, date: "21/Abr/2026", owner: "J. Rincón", lastActivity: "hace 2 h" },
      { id: "REC-2026-0407", clientName: "Logística Andina Express S.A.", module: "Cuentas por pagar", period: "Mar 2026", erp: "SAP", status: "DIFF", diff: "$ 12.044.180", items: 18, date: "20/Abr/2026", owner: "C. Aristizábal", lastActivity: "hoy 09:40" },
      { id: "REC-2026-0403", clientName: "Inversiones del Pacífico S.A.S", module: "Cartera", period: "Mar 2026", erp: "SIESA", status: "REVIEW", diff: "$ 805.220", items: 3, date: "18/Abr/2026", owner: "J. Rincón", lastActivity: "ayer 17:12" },
```
(Las otras 3 filas — 0418, 0398, 0394 — quedan igual, sin `lastActivity`.)

- [ ] **Step 3: Sembrar el cruce REC-2026-0431 con filas y comentarios**

En `seed.ts`, antes de `console.log("✅ Seed completo.")`, añadir:
```ts
  // ---- Cruce detallado REC-2026-0431 (Inventarios · Inversiones del Pacífico) ----
  const crossRows: [string, string, number, number, number, number][] = [
    ["143505", "Mercancías no fabricadas por la empresa", 412580450, 412580450, 0, 124],
    ["143510", "Materias primas", 188204000, 188204000, 0, 86],
    ["143515", "Productos en proceso", 74215300, 72850450, -1364850, 41],
    ["143520", "Materiales, repuestos y accesorios", 56118200, 56340800, 222600, 33],
    ["143524", "Producto terminado", 245118400, 240218400, -4900000, 58],
    ["143530", "Envases y empaques", 18445000, 18445000, 0, 22],
    ["143599", "Otros inventarios", 9120000, 10845200, 1725200, 14],
    ["148015", "Provisión obsolescencia", -12450000, -12450000, 0, 1],
    ["143580", "Inventarios en tránsito", 31200000, 29420000, -1780000, 6],
  ];
  await prisma.reconciliation.create({
    data: {
      id: "REC-2026-0431", clientName: "Inversiones del Pacífico S.A.S", module: "Inventarios",
      period: "Marzo 2026", erp: "SIESA", status: "REVIEW", diff: "-$ 6.097.050", items: 4,
      date: "03/May/2026", owner: "J. Rincón", cutoff: "31/Mar/2026", runAt: "03/May/2026 09:14",
      runBy: "Juliana Rincón", materiality: 2000000, lastActivity: "hace 12 min",
      rows: { create: crossRows.map(([cuenta, desc, cont, mod, diff, items], i) => ({ cuenta, desc, cont, mod, diff, items, order: i })) },
      comments: {
        create: [
          { cuenta: "143515", who: "Carlos Aristizábal", initials: "CA", time: "hace 38 min", text: "La diferencia de $ 1.364.850 corresponde a una orden de producción que el ERP cerró el 01/Abr pero en contabilidad quedó del período. Verificar con planta." },
          { cuenta: "143515", who: "Juliana Rincón", initials: "JR", time: "hace 21 min", text: "Confirmado con Andrea (planta). Se reclasifica para abril. Marco como observación cerrada al recibir el ajuste contable." },
          { cuenta: "143524", who: "Juliana Rincón", initials: "JR", time: "hace 8 min", text: "Diferencia material — $ 4.900.000. Pendiente conciliar con kárdex de bodega 02 (sur). Solicito a María revisión." },
        ],
      },
    },
  });
```

- [ ] **Step 4: Re-sembrar y verificar**

Run: `npm run db:seed`
Expected: sin error. REC-2026-0431 con 9 filas y 3 comentarios.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(db): sembrar cruce REC-2026-0431 con filas, comentarios y actividad"
```

---

## Task 3A.3: Server Actions del cruce

**Files:** Create `src/app/actions/reconciliation.ts`

- [ ] **Step 1: Crear las acciones**

Create `src/app/actions/reconciliation.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { verifySession, getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";

export async function addReconciliationComment(formData: FormData): Promise<void> {
  await verifySession();
  const reconciliationId = formData.get("reconciliationId") as string;
  const cuenta = formData.get("cuenta") as string;
  const text = ((formData.get("text") as string) ?? "").trim();
  if (!reconciliationId || !cuenta || !text) return;

  const user = await getCurrentUser();
  await prisma.reconciliationComment.create({
    data: {
      reconciliationId, cuenta,
      who: user?.name ?? "Usuario",
      initials: user?.initials ?? "··",
      text, time: "ahora",
    },
  });
  await logAudit({ user: user?.name ?? "Sistema", action: "COMENTÓ", entity: `Cuenta ${cuenta}`, detail: `Cruce ${reconciliationId}` });
  revalidatePath(`/conciliacion/resultados/${reconciliationId}`);
}

export async function setRowStatus(formData: FormData): Promise<void> {
  await verifySession();
  const rowId = formData.get("rowId") as string;
  const status = formData.get("status") as string; // conciliada | excepcion | ajuste
  const reconciliationId = formData.get("reconciliationId") as string;
  if (!rowId || !["conciliada", "excepcion", "ajuste"].includes(status)) return;

  const row = await prisma.reconciliationRow.update({ where: { id: rowId }, data: { manualStatus: status } });
  const user = await getCurrentUser();
  const labels: Record<string, string> = { conciliada: "marcó como conciliada", excepcion: "marcó como excepción", ajuste: "solicitó ajuste contable" };
  await logAudit({ user: user?.name ?? "Sistema", action: "ACTUALIZÓ PARTIDA", entity: `Cuenta ${row.cuenta}`, detail: labels[status] });
  if (reconciliationId) revalidatePath(`/conciliacion/resultados/${reconciliationId}`);
}

export async function sendToReviewer(formData: FormData): Promise<void> {
  await verifySession();
  const id = formData.get("id") as string;
  if (!id) return;
  await prisma.reconciliation.update({ where: { id }, data: { status: "REVIEW" } });
  const user = await getCurrentUser();
  await logAudit({ user: user?.name ?? "Sistema", action: "ENVIÓ A REVISOR", entity: `Cruce ${id}`, detail: "Marcado en revisión" });
  revalidatePath(`/conciliacion/resultados/${id}`);
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
```bash
git add src/app/actions/reconciliation.ts
git commit -m "feat: Server Actions de comentarios, estado de partida y envío a revisor"
```

---

## Task 3A.4: `/conciliacion/resultados/[id]` — detalle del cruce

**Files:** Create `src/app/(app)/conciliacion/resultados/[id]/page.tsx`; Create `src/app/(app)/conciliacion/resultados/[id]/cruce-client.tsx`

- [ ] **Step 1: Crear la página (server)**

Create `src/app/(app)/conciliacion/resultados/[id]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { PageHeader, StatCard, BackLink, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtCompact, fmtPct } from "@/lib/format";
import { sendToReviewer } from "@/app/actions/reconciliation";
import CruceClient, { type Row, type Comment } from "./cruce-client";

export default async function CruceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await prisma.reconciliation.findUnique({
    where: { id },
    include: { rows: { orderBy: { order: "asc" } }, comments: { orderBy: { createdAt: "asc" } } },
  });
  if (!rec) notFound();

  const rows: Row[] = rec.rows.map((r) => ({ id: r.id, cuenta: r.cuenta, desc: r.desc, cont: r.cont, mod: r.mod, diff: r.diff, items: r.items, manualStatus: r.manualStatus }));
  const comments: Comment[] = rec.comments.map((c) => ({ id: c.id, cuenta: c.cuenta, who: c.who, initials: c.initials, text: c.text, time: c.time }));

  const totals = rows.reduce((t, r) => ({ cont: t.cont + r.cont, mod: t.mod + r.mod, diff: t.diff + r.diff }), { cont: 0, mod: 0, diff: 0 });
  const itemsDiff = rows.filter((r) => r.diff !== 0).length;
  const diffPct = totals.cont !== 0 ? (totals.diff / totals.cont) * 100 : 0;

  return (
    <div>
      <div className="mb-3"><BackLink href="/conciliacion/resultados" label="Resultados de conciliación" /></div>
      <PageHeader
        title={`${rec.clientName} · ${rec.module}`}
        subtitle={`Resultado del cruce ${rec.id} · Período ${rec.period}${rec.cutoff ? ` · Corte ${rec.cutoff}` : ""} · ERP ${rec.erp}${rec.runAt ? ` · Ejecutado ${rec.runAt} por ${rec.runBy}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <button disabled title="Exportación — fase posterior" className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-ink-100 px-2.5 py-2 text-[12px] font-semibold text-ink-400"><Icon name="download" size={13} /> Excel</button>
            <button disabled title="Exportación — fase posterior" className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-ink-100 px-2.5 py-2 text-[12px] font-semibold text-ink-400"><Icon name="download" size={13} /> PDF</button>
            <form action={sendToReviewer}>
              <input type="hidden" name="id" value={rec.id} />
              <button type="submit" className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600"><Icon name="send" size={14} /> Enviar a revisor</button>
            </form>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon="play" title="Sin detalle de cruce" description="Esta conciliación no tiene el detalle por cuenta cargado en el repositorio." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Saldo contabilidad" value={fmtCompact(totals.cont)} tone="blue" />
            <StatCard label="Saldo módulo" value={fmtCompact(totals.mod)} tone="ink" />
            <StatCard label="Diferencia neta" value={fmtCompact(totals.diff)} hint={fmtPct(diffPct)} tone={totals.diff !== 0 ? "err" : "ok"} />
            <StatCard label="Partidas con diferencia" value={`${itemsDiff} / ${rows.length}`} hint={`${comments.length} comentario(s)`} tone="warn" />
          </div>
          <CruceClient reconciliationId={rec.id} materiality={rec.materiality} rows={rows} comments={comments} totals={totals} diffPct={diffPct} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Crear el componente client**

Create `src/app/(app)/conciliacion/resultados/[id]/cruce-client.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Card, Chip } from "@/components/ui";
import { fmt, fmtPct } from "@/lib/format";
import { addReconciliationComment, setRowStatus } from "@/app/actions/reconciliation";

export type Row = { id: string; cuenta: string; desc: string; cont: number; mod: number; diff: number; items: number; manualStatus: string | null };
export type Comment = { id: string; cuenta: string; who: string; initials: string; text: string; time: string };

function statusOf(diff: number, materiality: number, manual: string | null): { label: string; tone: "ok" | "warn" | "err" | "ink" } {
  if (manual === "conciliada") return { label: "Conciliada", tone: "ok" };
  if (manual === "excepcion") return { label: "Excepción", tone: "ink" };
  if (manual === "ajuste") return { label: "Ajuste solicitado", tone: "warn" };
  if (diff === 0) return { label: "Conciliado", tone: "ok" };
  if (Math.abs(diff) > materiality) return { label: "Diferencia material", tone: "err" };
  return { label: "Diferencia menor", tone: "warn" };
}

export default function CruceClient({
  reconciliationId, materiality, rows, comments,
}: {
  reconciliationId: string; materiality: number; rows: Row[]; comments: Comment[];
  totals: { cont: number; mod: number; diff: number }; diffPct: number;
}) {
  const [filter, setFilter] = useState<"all" | "diff">("all");
  const [selected, setSelected] = useState<string>(rows[0]?.cuenta ?? "");
  const [tab, setTab] = useState<"comments" | "detalle" | "acciones">("comments");

  const commentsByAccount = (cuenta: string) => comments.filter((c) => c.cuenta === cuenta);
  const shown = rows.filter((r) => filter === "all" || r.diff !== 0);
  const sel = rows.find((r) => r.cuenta === selected) ?? rows[0];

  return (
    <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
      {/* Tabla */}
      <Card className="lg:col-span-2">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
          <button onClick={() => setFilter("all")} className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${filter === "all" ? "bg-navy-800 text-white" : "bg-ink-100 text-ink-600"}`}>Todas {rows.length}</button>
          <button onClick={() => setFilter("diff")} className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${filter === "diff" ? "bg-navy-800 text-white" : "bg-err-100 text-err-700"}`}>Con diferencia {rows.filter((r) => r.diff !== 0).length}</button>
          <span className="ml-auto"><Chip label={`Materialidad: ${fmt(materiality)}`} tone="ink" /></span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                <th className="px-3 py-2 font-semibold">Cuenta</th>
                <th className="px-3 py-2 font-semibold">Descripción</th>
                <th className="px-3 py-2 text-right font-semibold">Contab.</th>
                <th className="px-3 py-2 text-right font-semibold">Módulo</th>
                <th className="px-3 py-2 text-right font-semibold">Diferencia</th>
                <th className="px-3 py-2 text-right font-semibold">% Var.</th>
                <th className="px-3 py-2 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const st = statusOf(r.diff, materiality, r.manualStatus);
                const variation = r.cont !== 0 ? (r.diff / r.cont) * 100 : 0;
                const nc = commentsByAccount(r.cuenta).length;
                return (
                  <tr key={r.id} onClick={() => setSelected(r.cuenta)} className={`cursor-pointer border-b border-ink-50 last:border-0 ${selected === r.cuenta ? "bg-blue-50" : "hover:bg-ink-50"}`}>
                    <td className="px-3 py-2 font-mono text-ink-700">{r.cuenta}{nc > 0 && <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-ai-100 px-1.5 text-[10px] font-semibold text-ai-700"><Icon name="msg" size={9} />{nc}</span>}</td>
                    <td className="px-3 py-2 text-ink-700">{r.desc}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-700">{fmt(r.cont)}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-700">{fmt(r.mod)}</td>
                    <td className={`px-3 py-2 text-right font-mono ${r.diff === 0 ? "text-ink-400" : r.diff > 0 ? "text-ok-700" : "text-err-700"}`}>{fmt(r.diff)}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-500">{r.diff === 0 ? "—" : fmtPct(variation)}</td>
                    <td className="px-3 py-2"><Chip label={st.label} tone={st.tone} /></td>
                  </tr>
                );
              })}
              <tr className="bg-navy-800 text-white">
                <td className="px-3 py-2.5 font-semibold" colSpan={2}>TOTALES</td>
                <td className="px-3 py-2.5 text-right font-mono">{fmt(rows.reduce((s, r) => s + r.cont, 0))}</td>
                <td className="px-3 py-2.5 text-right font-mono">{fmt(rows.reduce((s, r) => s + r.mod, 0))}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[#FF9991]">{fmt(rows.reduce((s, r) => s + r.diff, 0))}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[#FF9991]" colSpan={2}>{fmtPct(rows.reduce((s, r) => s + r.cont, 0) !== 0 ? (rows.reduce((s, r) => s + r.diff, 0) / rows.reduce((s, r) => s + r.cont, 0)) * 100 : 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Panel lateral */}
      {sel && (
        <Card className="self-start">
          <div className="border-b border-ink-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[12px] text-ink-500">{sel.cuenta}</span>
              <Chip label={statusOf(sel.diff, materiality, sel.manualStatus).label} tone={statusOf(sel.diff, materiality, sel.manualStatus).tone} />
              <span className="ml-auto"><Chip label={`${sel.items} ítems`} tone="ink" /></span>
            </div>
            <h3 className="mt-1 text-[13px] font-semibold text-ink-800">{sel.desc}</h3>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-[12px]">
            <KV label="Saldo contabilidad" value={fmt(sel.cont)} />
            <KV label="Saldo módulo" value={fmt(sel.mod)} />
            <KV label="Diferencia" value={fmt(sel.diff)} />
            <KV label="Variación" value={sel.cont !== 0 ? fmtPct((sel.diff / sel.cont) * 100) : "—"} />
          </div>
          <div className="flex items-center gap-1 border-y border-ink-100 px-3 py-1.5">
            <PanelTab on={tab === "comments"} onClick={() => setTab("comments")} label="Comentarios" count={commentsByAccount(sel.cuenta).length} />
            <PanelTab on={tab === "detalle"} onClick={() => setTab("detalle")} label="Detalle" />
            <PanelTab on={tab === "acciones"} onClick={() => setTab("acciones")} label="Acciones" />
          </div>

          {tab === "comments" && (
            <div className="px-4 py-3">
              <div className="flex flex-col gap-3">
                {commentsByAccount(sel.cuenta).length === 0 && <p className="text-[12px] text-ink-400">Sin comentarios para esta cuenta.</p>}
                {commentsByAccount(sel.cuenta).map((c) => (
                  <div key={c.id} className="flex gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[10px] font-semibold text-white">{c.initials}</div>
                    <div className="text-[12px] text-ink-700">
                      <div><b>{c.who}</b> <span className="text-ink-400">· {c.time}</span></div>
                      <div className="mt-0.5 leading-snug">{c.text}</div>
                    </div>
                  </div>
                ))}
              </div>
              <form action={addReconciliationComment} className="mt-3">
                <input type="hidden" name="reconciliationId" value={reconciliationId} />
                <input type="hidden" name="cuenta" value={sel.cuenta} />
                <textarea name="text" rows={3} placeholder="Escribe una observación o asigna a un compañero con @…" className="w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-blue-400" />
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[11px] text-ink-400">Visible para auditores asignados al cruce</span>
                  <button type="submit" className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600"><Icon name="send" size={13} /> Comentar</button>
                </div>
              </form>
            </div>
          )}

          {tab === "detalle" && (
            <div className="grid grid-cols-1 gap-2 px-4 py-3 text-[12px]">
              <KV label="Bodegas afectadas" value="BOD-01, BOD-02" />
              <KV label="Última transacción" value="31/03/2026 23:48" />
              <KV label="Origen del registro" value="SIESA módulo INV" />
              <button disabled title="Descarga — fase posterior" className="mt-1 inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-ink-100 px-2.5 py-1.5 text-[12px] font-semibold text-ink-400"><Icon name="download" size={13} /> Descargar detalle de la cuenta</button>
            </div>
          )}

          {tab === "acciones" && (
            <div className="flex flex-col gap-2 px-4 py-3">
              <RowAction reconciliationId={reconciliationId} rowId={sel.id} status="conciliada" icon="check" label="Marcar como conciliada manualmente" />
              <button disabled title="Reasignación — fase posterior" className="inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-ink-150 px-2.5 py-2 text-left text-[12.5px] text-ink-400"><Icon name="users" size={14} /> Asignar a otro auditor</button>
              <RowAction reconciliationId={reconciliationId} rowId={sel.id} status="ajuste" icon="warn" label="Solicitar ajuste contable" />
              <RowAction reconciliationId={reconciliationId} rowId={sel.id} status="excepcion" icon="x" label="Marcar como excepción" danger />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function RowAction({ reconciliationId, rowId, status, icon, label, danger }: { reconciliationId: string; rowId: string; status: string; icon: "check" | "warn" | "x"; label: string; danger?: boolean }) {
  return (
    <form action={setRowStatus}>
      <input type="hidden" name="reconciliationId" value={reconciliationId} />
      <input type="hidden" name="rowId" value={rowId} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-[12.5px] ${danger ? "border-err-100 bg-err-100 text-err-700 hover:opacity-80" : "border-ink-150 text-ink-700 hover:bg-ink-50"}`}><Icon name={icon} size={14} /> {label}</button>
    </form>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className="mt-0.5 font-mono text-ink-800">{value}</div>
    </div>
  );
}

function PanelTab({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-[12px] font-medium ${on ? "bg-ink-100 text-ink-900" : "text-ink-500 hover:bg-ink-50"}`}>{label}{count != null && count > 0 && <span className="rounded-full bg-ai-100 px-1 text-[10px] font-semibold text-ai-700">{count}</span>}</button>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores; `/conciliacion/resultados/[id]` en el output.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/conciliacion/resultados/[id]"
git commit -m "feat: detalle del cruce con KPIs, tabla por cuenta y panel de acciones/comentarios"
```

---

## Task 3A.5: Listas clickeables (en-proceso + resultados)

**Files:** Modify `src/app/(app)/conciliacion/resultados/page.tsx`; Modify `src/app/(app)/conciliacion/en-proceso/page.tsx`

- [ ] **Step 1: Hacer clickeables las filas de `/conciliacion/resultados`**

En `src/app/(app)/conciliacion/resultados/page.tsx`:
(a) Añadir el import de Link al inicio:
```tsx
import Link from "next/link";
```
(b) Reemplazar la columna "Responsable" `<td>` (la última, `<td className="px-4 py-2.5 text-ink-600">{r.owner}</td>`) por la celda de responsable + una celda de acción con enlace:
```tsx
                  <td className="px-4 py-2.5 text-ink-600">{r.owner}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/conciliacion/resultados/${r.id}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-500 hover:underline">Ver <Icon name="chev-r" size={12} /></Link>
                  </td>
```
(c) Añadir el import de Icon: `import { Icon } from "@/components/icons";` y una `<th>` vacía al final del thead:
```tsx
                <th className="px-4 py-2.5 font-semibold">Responsable</th>
                <th className="px-4 py-2.5"></th>
```

- [ ] **Step 2: Enriquecer `/conciliacion/en-proceso`**

Reemplazar **todo** `src/app/(app)/conciliacion/en-proceso/page.tsx` por:
```tsx
import Link from "next/link";
import prisma from "@/lib/prisma";
import { PageHeader, Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";

const PROCESS_LABEL: Record<string, { label: string; tone: "warn" | "err" }> = {
  DIFF: { label: "Diferencia abierta", tone: "err" },
  REVIEW: { label: "En revisión", tone: "warn" },
};

export default async function EnProcesoPage() {
  const recs = await prisma.reconciliation.findMany({
    where: { status: { in: ["DIFF", "REVIEW"] } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader title="Conciliaciones en curso" subtitle={`${recs.length} conciliaciones abiertas. Continúa donde lo dejaste.`} />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                <th className="px-4 py-2.5 font-semibold">ID</th>
                <th className="px-4 py-2.5 font-semibold">Cliente</th>
                <th className="px-4 py-2.5 font-semibold">Módulo</th>
                <th className="px-4 py-2.5 font-semibold">Período</th>
                <th className="px-4 py-2.5 font-semibold">Estado</th>
                <th className="px-4 py-2.5 font-semibold">Última actividad</th>
                <th className="px-4 py-2.5 font-semibold">Auditor</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {recs.map((r) => {
                const st = PROCESS_LABEL[r.status] ?? { label: r.status, tone: "warn" as const };
                return (
                  <tr key={r.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                    <td className="px-4 py-2.5 font-mono text-[11.5px] text-ink-500">{r.id}</td>
                    <td className="px-4 py-2.5 text-ink-800">{r.clientName}</td>
                    <td className="px-4 py-2.5 text-ink-600">{r.module}</td>
                    <td className="px-4 py-2.5 text-ink-600">{r.period}</td>
                    <td className="px-4 py-2.5"><Chip label={st.label} tone={st.tone} /></td>
                    <td className="px-4 py-2.5 text-ink-500">{r.lastActivity ?? "—"}</td>
                    <td className="px-4 py-2.5 text-ink-600">{r.owner}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/conciliacion/resultados/${r.id}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-500 hover:underline">Abrir <Icon name="chev-r" size={12} /></Link>
                    </td>
                  </tr>
                );
              })}
              {recs.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-ink-400">Sin conciliaciones en proceso</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/conciliacion/resultados/page.tsx" "src/app/(app)/conciliacion/en-proceso/page.tsx"
git commit -m "feat: listas de conciliación clickeables + actividad y estados de proceso"
```

---

## Task 3A.6: Validación de cierre de Fase 3A

- [ ] **Step 1: Suite**

Run:
```bash
npx vitest run && npx tsc --noEmit && npm run lint && npm run build && npx prisma migrate status
```
Expected: todo verde.

- [ ] **Step 2: Re-seed**

Run: `npm run db:seed`

- [ ] **Step 3: Criterios de aceptación (smoke — lo ejecuta el controlador)**

Con `npm run dev` + sesión:
- `/conciliacion/en-proceso`: filas con estado de proceso, última actividad, "Abrir" → detalle. REC-2026-0431 aparece.
- `/conciliacion/resultados`: filas con "Ver" → detalle.
- `/conciliacion/resultados/REC-2026-0431`: header con runId/cliente/módulo/ejecutado, 4 KPIs (Saldo contab. / módulo / Diferencia neta -0,6% / Partidas 4/9), tabla de 9 cuentas con estado por materialidad (143524 "Diferencia material"), badge de comentarios (143515:2, 143524:1), fila TOTALES. Filtro "Con diferencia" reduce a 5.
- Panel lateral: seleccionar una cuenta muestra KV + tabs. Comentarios: hilo + agregar comentario **persiste** (recargar → aparece). Acciones: "Marcar como conciliada" cambia el estado de la partida y **persiste**. "Enviar a revisor" funciona. Excel/PDF/Asignar deshabilitados.

- [ ] **Step 4: Commit final (si aplica)**

```bash
git add -A && git commit -m "chore: cierre y validación de Fase 3A" || echo "nada que commitear"
```

---

## Notas
- Saldos como `Int` (todos < 2.100 M, caben en INTEGER de Postgres). KPIs/totales derivados de las filas.
- Umbral de materialidad: se usa el del código del prototipo ($2.000.000) almacenado en `Reconciliation.materiality`; el badge muestra ese valor real (corrige la inconsistencia del prototipo que mostraba $500.000).
- Estado de partida: derivado por materialidad, con override manual persistido (`manualStatus`) desde las Acciones.
- Diferidos (deshabilitados, fase posterior): export Excel/PDF, descarga de detalle, reasignación de auditor con selector.
- Sin placeholders pendientes.
