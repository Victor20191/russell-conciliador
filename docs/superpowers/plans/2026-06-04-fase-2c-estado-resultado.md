# Fase 2C · Estado de Resultado (`/balance/estado-resultado`) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el stub de `/balance/estado-resultado` por la pantalla real: 4 KPIs (ingresos, utilidad bruta/operacional/neta con márgenes y % vs año anterior), tabla comparativa 2025/2024/Var%/Presupuesto con subtotales en negrita, y selector de cliente/período.

**Architecture:** Server Component que lee el estado de resultado (Json en el balance oficial del cliente/período activo) y renderiza KPIs derivados + tabla; los selectores son un pequeño componente `"use client"` que navega vía `searchParams`. `Var %` se calcula en el servidor.

**Modelo de datos:** columna Json `incomeStatement` en `Balance` (coherente con `versionHistory/diff/auditLog`). Los KPIs se **derivan** de las líneas (no se almacenan), igual de fiel y más correcto que el prototipo (que los tenía quemados).

**Tech Stack:** Next.js 16, Prisma 7, PostgreSQL, Tailwind v4, TS.

**Restricción Next 16:** `searchParams` es `Promise`.

**Rama:** `finalizacion-lfm`. Reutiliza `PageHeader, Card, StatCard, EmptyState, BackLink` (`@/components/ui`), `Icon`, `fmtNum`, `fmtPct` (`@/lib/format`).

---

## Mapa de archivos

**Crear:**
- `src/app/(app)/balance/estado-resultado/er-selectors.tsx` — selectores cliente/período (client).

**Modificar:**
- `prisma/schema.prisma` — `incomeStatement Json?` en `Balance`.
- `prisma/seed.ts` — sembrar las 13 líneas del ER de El Zarzal Dic-2025.
- `src/app/(app)/balance/estado-resultado/page.tsx` — reescribir (server).

---

## Task 2C.1: Esquema — `incomeStatement` en Balance

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: Añadir la columna**

En `model Balance`, junto a `versionHistory/diff/auditLog`, añadir:
```prisma
  incomeStatement Json? // líneas del estado de resultado (concepto, 2025, 2024, presupuesto)
```

- [ ] **Step 2: Migración**

Run:
```bash
npx prisma migrate dev --name balance_income_statement && npx prisma generate
```
Expected: aplicada; migrate status up to date.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): columna incomeStatement en Balance"
```

---

## Task 2C.2: Seed — Estado de Resultado de El Zarzal

**Files:** Modify `prisma/seed.ts`

- [ ] **Step 1: Añadir `incomeStatement` al `elZarzalDetail`**

En `prisma/seed.ts`, en el objeto `elZarzalDetail`, después de `auditLog: [...]` (antes del `}` que cierra el objeto), añadir:
```ts
    incomeStatement: [
      { concept: "Ingresos por ventas", current: 28940, prior: 25740, budget: 28000, bold: true, sep: false },
      { concept: "Devoluciones y descuentos", current: -1240, prior: -980, budget: -1200, bold: false, sep: false },
      { concept: "Costo de ventas", current: -16280, prior: -14620, budget: -16500, bold: false, sep: false },
      { concept: "Utilidad bruta", current: 11420, prior: 10140, budget: 10300, bold: true, sep: true },
      { concept: "Gastos de administración", current: -3680, prior: -3420, budget: -3700, bold: false, sep: false },
      { concept: "Gastos de ventas", current: -2940, prior: -2680, budget: -3100, bold: false, sep: false },
      { concept: "Depreciaciones y amortizaciones", current: -620, prior: -580, budget: -650, bold: false, sep: false },
      { concept: "Utilidad operacional", current: 4180, prior: 3460, budget: 2850, bold: true, sep: true },
      { concept: "Ingresos no operacionales", current: 420, prior: 380, budget: 300, bold: false, sep: false },
      { concept: "Gastos financieros", current: -680, prior: -620, budget: -700, bold: false, sep: false },
      { concept: "Diferencia en cambio", current: -180, prior: 140, budget: 0, bold: false, sep: false },
      { concept: "Impuesto de renta", current: -900, prior: -820, budget: -850, bold: false, sep: false },
      { concept: "Utilidad neta del ejercicio", current: 2840, prior: 2540, budget: 1600, bold: true, sep: true },
    ],
```

- [ ] **Step 2: Re-sembrar**

Run: `npm run db:seed`
Expected: sin error; el balance oficial de El Zarzal Dic-2025 tiene `incomeStatement` con 13 líneas.

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(db): sembrar estado de resultado de El Zarzal Dic-2025"
```

---

## Task 2C.3: `/balance/estado-resultado` — reescritura

**Files:** Modify `src/app/(app)/balance/estado-resultado/page.tsx`; Create `src/app/(app)/balance/estado-resultado/er-selectors.tsx`

- [ ] **Step 1: Crear los selectores (client)**

Create `src/app/(app)/balance/estado-resultado/er-selectors.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";

export default function ErSelectors({
  clientNames, cliente, periods, periodo,
}: {
  clientNames: string[]; cliente: string; periods: string[]; periodo: string;
}) {
  const router = useRouter();
  const go = (c: string, p: string) =>
    router.push(`/balance/estado-resultado?cliente=${encodeURIComponent(c)}&periodo=${encodeURIComponent(p)}`);
  return (
    <div className="flex items-center gap-2">
      <select value={cliente} onChange={(e) => go(e.target.value, "")} className="rounded-md border border-ink-200 px-2 py-1.5 text-[12.5px] text-ink-700 outline-none">
        {clientNames.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <select value={periodo} onChange={(e) => go(cliente, e.target.value)} className="rounded-md border border-ink-200 px-2 py-1.5 text-[12.5px] text-ink-700 outline-none">
        {periods.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Reescribir la página (server)**

Reemplazar **todo** `src/app/(app)/balance/estado-resultado/page.tsx` por:
```tsx
import Link from "next/link";
import prisma from "@/lib/prisma";
import { PageHeader, Card, StatCard, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtNum, fmtPct } from "@/lib/format";
import ErSelectors from "./er-selectors";

type ErLine = { concept: string; current: number; prior: number; budget: number; bold: boolean; sep: boolean };

function varPct(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}
const money = (n: number) => `$ ${fmtNum(Math.abs(n))} M`;

export default async function EstadoResultadoPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string; periodo?: string }>;
}) {
  const sp = await searchParams;
  // Balances oficiales con estado de resultado cargado (filtrado en memoria; pocos registros)
  const officials = (
    await prisma.balance.findMany({
      where: { isOfficial: true },
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
        actions={
          <Link href="/balance/mapeo" className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600">
            <Icon name="settings" size={14} /> Ajustar mapeo
          </Link>
        }
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
            <div className="flex items-center justify-end gap-2 border-t border-ink-100 px-4 py-2.5">
              <button disabled title="Exportación — fase posterior" className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-ink-100 px-2.5 py-1.5 text-[12px] font-semibold text-ink-400"><Icon name="download" size={13} /> Excel</button>
              <button disabled title="Exportación — fase posterior" className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-ink-100 px-2.5 py-1.5 text-[12px] font-semibold text-ink-400"><Icon name="download" size={13} /> PDF</button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores; la ruta `/balance/estado-resultado` aparece en el output.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/balance/estado-resultado/page.tsx" "src/app/(app)/balance/estado-resultado/er-selectors.tsx"
git commit -m "feat: /balance/estado-resultado con KPIs derivados y tabla comparativa"
```

---

## Task 2C.4: Validación de cierre de Fase 2C

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
- `/balance/estado-resultado`: 4 KPIs (Ingresos operacionales "$ 28.940 M" con "+12,4% vs año anterior"; Utilidad bruta con "Margen 39,5%"; operacional "Margen 14,4%"; neta "Margen 9,8%").
- Tabla con 13 líneas; subtotales (Utilidad bruta/operacional/neta) en negrita con borde superior; Var% calculada y coloreada (verde/rojo); valores en millones.
- Selector cliente/período (El Zarzal · Diciembre 2025 por defecto).
- "Ajustar mapeo" navega a `/balance/mapeo`. Excel/PDF deshabilitados (exportación posterior).

- [ ] **Step 4: Commit final (si aplica)**

```bash
git add -A && git commit -m "chore: cierre y validación de Fase 2C" || echo "nada que commitear"
```

---

## Notas
- `incomeStatement` es Json en `Balance` (coherente con el resto del detalle). KPIs y Var% derivados (no almacenados) → más correctos que el prototipo.
- Exportación Excel/PDF deshabilitada (fase posterior); "Ajustar mapeo" enlaza con 2B.
- Con esto se cierra la **Fase 2 (Balance)** completa (2A + 2B + 2C).
- Sin placeholders pendientes.
