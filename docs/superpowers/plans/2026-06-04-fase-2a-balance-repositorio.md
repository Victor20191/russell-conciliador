# Fase 2A · Repositorio de Balance (índice + detalle + diff) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar el repositorio de balances 100% funcional y fiel al prototipo: `/balance` (tabs Clientes / Audit log / Plan estándar), `/balance/[id]` (tabs Detalle por niveles / Validaciones / Versiones, desglose expandible, KPIs ricos, congelar como oficial) y la nueva ruta `/balance/[id]/diff` (comparativo de versiones con 3 vistas).

**Architecture:** Server Components que leen Prisma; interactividad (tabs, expandir/colapsar, vistas de diff) en componentes `"use client"` que reciben los datos como props; mutaciones vía Server Actions (`freezeBalance`) con auditoría + `revalidatePath`.

**Refinamiento de diseño sobre el spec maestro (Json-céntrico, DRY):** el modelo `Balance` ya almacena el detalle como Json (`sums/validations/breakdown/meta`). En lugar de crear las tablas `BalanceVersion`/`BalanceDiff`/`BalanceAuditEntry`, se añaden **columnas Json** `versionHistory`, `diff`, `auditLog` + `lastUpload String?` al modelo `Balance`. Es coherente con el patrón existente, evita 3 tablas para datos demo que solo puebla un balance, y simplifica el cableado RSC→client (números JSON, sin `BigInt`).

**Tech Stack:** Next.js 16.2.7, React 19, Prisma 7, PostgreSQL, Tailwind v4, TypeScript 5, Vitest.

**Restricción Next.js 16:** `params` de páginas es `Promise` (`const { id } = await params`); Server Actions con `"use server"`; consultar `node_modules/next/dist/docs/01-app/` ante dudas.

**Rama:** `finalizacion-lfm`. Reutiliza componentes existentes: `PageHeader, Card, CardHeader, StatCard, Chip, BackLink` (`@/components/ui`), `Icon` (`@/components/icons`), `fmt`, `fmtCompact` (`@/lib/format`). Postgres corriendo y BD sembrada.

**Fuera de alcance de 2A (van en otras fases):** carga real de archivos Excel (el botón "Cargar balance" queda deshabilitado con tooltip), mapeo cuenta→Russell (Fase 2B), estado de resultado (Fase 2C).

---

## Mapa de archivos

**Crear:**
- `src/app/actions/balance.ts` — Server Action `freezeBalance`.
- `src/app/(app)/balance/balance-index-client.tsx` — UI client del índice (3 tabs).
- `src/app/(app)/balance/[id]/balance-detail-client.tsx` — UI client del detalle (3 tabs + breakdown expandible).
- `src/app/(app)/balance/[id]/diff/page.tsx` — Server Component de la ruta diff.
- `src/app/(app)/balance/[id]/diff/balance-diff-client.tsx` — UI client del diff (3 vistas).

**Modificar:**
- `prisma/schema.prisma` — añadir `versionHistory/diff/auditLog Json?` + `lastUpload String?` a `Balance`.
- `prisma/seed.ts` — enriquecer El Zarzal Dic-2025 v3 (versionHistory, diff, auditLog, breakdown con prevBalance/saldoOk + grupo "99") y `lastUpload` en todas las filas.
- `src/lib/format.ts` + `src/lib/format.test.ts` — añadir `fmtPct` (TDD).
- `src/app/(app)/balance/page.tsx` — reescribir como server que delega en `BalanceIndexClient`.
- `src/app/(app)/balance/[id]/page.tsx` — reescribir como server que delega en `BalanceDetailClient`.

---

## Task 2A.1: Esquema — columnas Json en `Balance`

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: Añadir columnas al modelo `Balance`**

En `prisma/schema.prisma`, dentro de `model Balance`, junto a los campos Json existentes (`sums/validations/breakdown/meta`), añadir:
```prisma
  versionHistory Json? // historial de versiones (v3/v2/v1) con metadatos
  diff           Json? // comparativo de la versión oficial vs. la anterior
  auditLog       Json? // bitácora de cargues/congelados por cliente
  lastUpload     String? // fecha-hora de la última carga (display)
```

- [ ] **Step 2: Crear y aplicar la migración**

Run:
```bash
npx prisma migrate dev --name balance_json_columns && npx prisma generate
```
Expected: crea la migración, la aplica, regenera el cliente. `npx prisma migrate status` → "up to date".

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): columnas versionHistory/diff/auditLog/lastUpload en Balance"
```

---

## Task 2A.2: Seed — enriquecer el detalle de El Zarzal

**Files:** Modify `prisma/seed.ts`

- [ ] **Step 1: Enriquecer el breakdown con `prevBalance`/`saldoOk` y el grupo "99"**

En `prisma/seed.ts`, reemplazar el array `breakdown:` del objeto `elZarzalDetail` (el bloque que hoy empieza en `breakdown: [` y termina antes de `meta:`) por esta versión enriquecida (añade `prevBalance` y `saldoOk` a cada item, y un grupo `"99"`):
```ts
    breakdown: [
      { code: "11", name: "Disponible", balance: 1240180300, prevBalance: 980440200, variation: 26.49, mapped: true, critical: true, nature: "D", saldoOk: true, items: [
        { code: "110505", name: "Caja general", balance: 12400000, prevBalance: 8200000, variation: 51.2, std: "1105", mapped: true, critical: false, nature: "D", saldoOk: true },
        { code: "111005", name: "Bancomercial – Bancolombia", balance: 824220500, prevBalance: 612400000, variation: 34.6, std: "1110", mapped: true, critical: false, nature: "D", saldoOk: true },
        { code: "111010", name: "BBVA cta corriente", balance: 312180200, prevBalance: 248500000, variation: 25.6, std: "1110", mapped: true, critical: false, nature: "D", saldoOk: true },
        { code: "111505", name: "Davivienda – ahorros", balance: 91379600, prevBalance: 111340200, variation: -18.1, std: "1110", mapped: true, critical: false, nature: "D", saldoOk: true },
      ] },
      { code: "13", name: "Deudores", balance: 4822140200, prevBalance: 4120550800, variation: 17.0, mapped: true, critical: true, nature: "D", saldoOk: true, items: [
        { code: "130505", name: "Clientes nacionales", balance: 4120180400, prevBalance: 3580200000, variation: 15.1, std: "1305", mapped: true, critical: true, nature: "D", saldoOk: true },
        { code: "130510", name: "Clientes exterior", balance: 552880300, prevBalance: 380440000, variation: 45.3, std: "1305", mapped: true, critical: false, nature: "D", saldoOk: true },
        { code: "133005", name: "Anticipos a proveedores", balance: 188200500, prevBalance: 195300000, variation: -3.6, std: "1330", mapped: true, critical: false, nature: "D", saldoOk: true },
        { code: "139905", name: "Provisión cartera", balance: -39121000, prevBalance: -35440000, variation: 10.4, std: "1399", mapped: true, critical: false, nature: "C", saldoOk: true },
      ] },
      { code: "14", name: "Inventarios", balance: 3280550200, prevBalance: 2980120400, variation: 10.1, mapped: true, critical: true, nature: "D", saldoOk: true, items: [
        { code: "143505", name: "Mercancías no fabricadas", balance: 2120180300, prevBalance: 1981400000, variation: 7.0, std: "14", mapped: true, critical: false, nature: "D", saldoOk: true },
        { code: "143510", name: "Mercancías en tránsito", balance: 480550900, prevBalance: 320100000, variation: 50.1, std: "14", mapped: true, critical: false, nature: "D", saldoOk: true },
        { code: "149905", name: "Provisión obsolescencia", balance: -118200000, prevBalance: -112400000, variation: 5.1, std: null, mapped: false, critical: false, nature: "C", saldoOk: true },
      ] },
      { code: "24", name: "Impuestos, gravámenes y tasas", balance: -440180500, prevBalance: -412550300, variation: 6.7, mapped: true, critical: true, nature: "C", saldoOk: false, items: [
        { code: "240805", name: "IVA generado", balance: 28500000, prevBalance: -120180400, variation: null, std: "24", mapped: true, critical: true, nature: "C", saldoOk: false },
        { code: "240810", name: "IVA descontable", balance: -185220500, prevBalance: -148500000, variation: 24.7, std: "24", mapped: true, critical: false, nature: "C", saldoOk: true },
        { code: "236501", name: "Retefuente", balance: -283460000, prevBalance: -143820000, variation: 97.1, std: "24", mapped: true, critical: true, nature: "C", saldoOk: true },
      ] },
      { code: "99", name: "Sin clasificar (cuentas no mapeadas)", balance: -92800000, prevBalance: -112400000, variation: null, mapped: false, critical: false, nature: "-", saldoOk: false, items: [
        { code: "189965", name: "Diversos – nuevo cliente", balance: 25400000, prevBalance: 0, variation: null, std: null, mapped: false, critical: false, nature: "D", saldoOk: true },
        { code: "149905", name: "Provisión obsolescencia", balance: -118200000, prevBalance: -112400000, variation: 5.1, std: null, mapped: false, critical: false, nature: "C", saldoOk: true },
      ] },
    ],
```

- [ ] **Step 2: Añadir `versionHistory`, `diff` y `auditLog` al `elZarzalDetail`**

En el mismo objeto `elZarzalDetail`, después de la propiedad `meta: {...}` (antes del `}` que cierra el objeto), añadir:
```ts
    versionHistory: [
      { v: "v3", date: "06/Ene/2026 09:14", uploadedBy: "Sandra Paniagua", role: "Cliente — Contadora", file: "Balance ZARZAL Dic-2025_v3.xlsx", size: "284 KB", rows: 412, sumA: 12450320500, balanced: true, note: "Versión final con ajustes solicitados", changes: 18 },
      { v: "v2", date: "28/Dic/2025 16:42", uploadedBy: "Sandra Paniagua", role: "Cliente — Contadora", file: "Balance ZARZAL Dic-2025_v2.xlsx", size: "281 KB", rows: 407, sumA: 12308140200, balanced: true, note: "Corrige clasificación de cartera exterior", changes: 24 },
      { v: "v1", date: "20/Dic/2025 10:05", uploadedBy: "Sandra Paniagua", role: "Cliente — Contadora", file: "Balance ZARZAL Dic-2025_v1.xlsx", size: "276 KB", rows: 402, sumA: 12180440700, balanced: false, note: "Primera versión – descuadra $ 1.4M", changes: 402 },
    ],
    diff: {
      summary: { added: 5, removed: 0, changed: 8, totalAffected: 142180300 },
      rows: [
        { type: "changed", code: "110505", name: "Caja general", before: 8400000, after: 12400000, delta: 4000000 },
        { type: "changed", code: "111005", name: "Bancomercial – Bancolombia", before: 780200000, after: 824220500, delta: 44020500 },
        { type: "added", code: "130510", name: "Clientes exterior", before: 0, after: 552880300, delta: 552880300 },
        { type: "added", code: "143510", name: "Mercancías en tránsito", before: 0, after: 480550900, delta: 480550900 },
        { type: "changed", code: "240805", name: "IVA generado", before: -12500000, after: 28500000, delta: 41000000, flag: "Cambio de naturaleza" },
        { type: "changed", code: "240810", name: "IVA descontable", before: -148500000, after: -185220500, delta: -36720500 },
        { type: "changed", code: "236501", name: "Retefuente", before: -143820000, after: -283460000, delta: -139640000 },
        { type: "added", code: "189965", name: "Diversos – nuevo cliente", before: 0, after: 25400000, delta: 25400000 },
        { type: "added", code: "133005", name: "Anticipos a proveedores", before: 0, after: 188200500, delta: 188200500 },
        { type: "changed", code: "139905", name: "Provisión cartera", before: -35440000, after: -39121000, delta: -3681000 },
        { type: "added", code: "143505", name: "Mercancías no fabricadas (reclas.)", before: 0, after: 2120180300, delta: 2120180300 },
        { type: "changed", code: "130505", name: "Clientes nacionales", before: 3580200000, after: 4120180400, delta: 539980400 },
        { type: "changed", code: "111010", name: "BBVA cta corriente", before: 248500000, after: 312180200, delta: 63680200 },
      ],
    },
    auditLog: [
      { date: "20/Dic/2025 10:05", actor: "Sandra Paniagua", role: "Cliente", action: "Subió balance Dic-2025 v1", ip: "190.85.241.18", details: "276 KB · 402 cuentas · descuadra $ 1.4M" },
      { date: "28/Dic/2025 16:42", actor: "Sandra Paniagua", role: "Cliente", action: "Subió balance Dic-2025 v2", ip: "190.85.241.18", details: "281 KB · 407 cuentas · cuadrado" },
      { date: "03/Ene/2026 14:20", actor: "Manuela Gutiérrez", role: "Auditor senior", action: "Solicitó nueva versión", ip: "interno", details: "Reclasificar cartera exterior y mercancías en tránsito" },
      { date: "06/Ene/2026 09:14", actor: "Sandra Paniagua", role: "Cliente", action: "Subió balance Dic-2025 v3", ip: "190.85.241.18", details: "284 KB · 412 cuentas · cuadrado" },
      { date: "06/Ene/2026 09:40", actor: "Juliana Rincón", role: "Auditor", action: "Ejecutó validaciones automáticas", ip: "interno", details: "4 ok · 4 alertas" },
      { date: "07/Ene/2026 11:10", actor: "Juliana Rincón", role: "Auditor", action: "Mapeó 14 cuentas al estándar", ip: "interno", details: "398 de 412 cuentas mapeadas" },
      { date: "07/Ene/2026 15:35", actor: "Manuela Gutiérrez", role: "Auditor senior", action: "Revisó mapeo y validaciones", ip: "interno", details: "Aprobado para congelar" },
      { date: "08/Ene/2026 11:32", actor: "Manuela Gutiérrez", role: "Auditor senior", action: "Congeló v3 como oficial", ip: "interno", details: "Versión auditada para cierre 2025" },
      { date: "12/Ene/2026 09:02", actor: "Sistema", role: "Auditor", action: "Publicó balance a DIAN y Razonabilidad", ip: "interno", details: "Disponible para módulos downstream" },
    ],
```

- [ ] **Step 3: Añadir `lastUpload` a las filas de balance**

En el `prisma.balance.create(...)` de El Zarzal Dic-2025, añadir `lastUpload: "06/Ene/2026 09:14"` al objeto `data`. En el `prisma.balance.createMany({ data: [...] })`, añadir un `lastUpload` a cada fila:
```ts
      { clientName: "El Zarzal S.A", clientNit: "890.345.872-1", period: "Noviembre 2025", version: "v2", status: "Última", complete: 100, lastUpload: "04/Dic/2025 14:20" },
      { clientName: "El Zarzal S.A", clientNit: "890.345.872-1", period: "Octubre 2025", version: "v1", status: "Única", complete: 100, lastUpload: "05/Nov/2025 09:10" },
      { clientName: "El Zarzal S.A", clientNit: "890.345.872-1", period: "Abril 2026", version: "v2", status: "Con alertas", complete: 97, lastUpload: "05/May/2026 10:42" },
      { clientName: "Inversiones del Pacífico S.A.S", clientNit: "900.451.227-3", period: "Diciembre 2025", version: "v2", isOfficial: true, isFrozen: true, status: "Congelado", complete: 100, lastUpload: "09/Ene/2026 08:30" },
      { clientName: "Inversiones del Pacífico S.A.S", clientNit: "900.451.227-3", period: "Septiembre 2025", version: "v1", status: "Única", complete: 100, lastUpload: "06/Oct/2025 16:00" },
      { clientName: "Comercializadora Andina Ltda", clientNit: "800.234.115-7", period: "Marzo 2026", version: "v4", status: "Última", complete: 88, lastUpload: "10/Abr/2026 12:15" },
      { clientName: "Manufacturas del Sur S.A", clientNit: "830.502.118-9", period: "Octubre 2026", version: "v1", status: "Única", complete: 100, lastUpload: "04/Nov/2026 11:48" },
```

- [ ] **Step 4: Re-sembrar y verificar**

Run:
```bash
npm run db:seed
```
Expected: corre sin error. Verifica con `npx prisma studio` (o consulta) que el balance oficial de El Zarzal Dic-2025 tiene `versionHistory` (3), `diff` y `auditLog` (9) no nulos.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(db): enriquecer detalle de El Zarzal (versiones, diff, auditoría, breakdown)"
```

---

## Task 2A.3: Helper `fmtPct` (TDD)

**Files:** Modify `src/lib/format.ts`; Test `src/lib/format.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `src/lib/format.test.ts`:
```ts
import { fmtPct } from "./format";

test("fmtPct formatea con signo y 1 decimal", () => {
  expect(fmtPct(26.49)).toBe("+26,5%");
  expect(fmtPct(-18.1)).toBe("-18,1%");
  expect(fmtPct(0)).toBe("+0,0%");
});

test("fmtPct devuelve guion para null", () => {
  expect(fmtPct(null)).toBe("—");
});
```

- [ ] **Step 2: Ejecutar para ver el fallo**

Run: `npx vitest run src/lib/format.test.ts`
Expected: FAIL — `fmtPct` no exportada.

- [ ] **Step 3: Implementar**

Añadir al final de `src/lib/format.ts`:
```ts
export const fmtPct = (n: number | null | undefined): string => {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "-";
  return `${sign}${Math.abs(n).toFixed(1).replace(".", ",")}%`;
};
```

- [ ] **Step 4: Ejecutar para ver el éxito**

Run: `npx vitest run src/lib/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "feat: helper fmtPct para variaciones porcentuales"
```

---

## Task 2A.4: Server Action `freezeBalance`

**Files:** Create `src/app/actions/balance.ts`

- [ ] **Step 1: Crear la acción**

Create `src/app/actions/balance.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { verifySession, getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";

export async function freezeBalance(formData: FormData): Promise<void> {
  await verifySession();
  const id = formData.get("id") as string;
  if (!id) return;

  const balance = await prisma.balance.findUnique({ where: { id } });
  if (!balance || balance.isFrozen) return;

  // La versión oficial es única por (cliente, período): se desmarca cualquier otra.
  await prisma.balance.updateMany({
    where: { clientName: balance.clientName, period: balance.period, isOfficial: true },
    data: { isOfficial: false },
  });
  await prisma.balance.update({
    where: { id },
    data: { isOfficial: true, isFrozen: true, status: "Congelado" },
  });

  const user = await getCurrentUser();
  await logAudit({
    user: user?.name ?? "Sistema",
    action: "CONGELÓ BALANCE",
    entity: `${balance.clientName} · ${balance.period}`,
    detail: `Versión ${balance.version} marcada como oficial`,
  });
  revalidatePath("/balance");
  revalidatePath(`/balance/${id}`);
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: sin errores.
```bash
git add src/app/actions/balance.ts
git commit -m "feat: Server Action freezeBalance (congelar versión como oficial)"
```

---

## Task 2A.5: `/balance` — índice con 3 tabs

**Files:** Modify `src/app/(app)/balance/page.tsx`; Create `src/app/(app)/balance/balance-index-client.tsx`

- [ ] **Step 1: Reescribir la página (server)**

Reemplazar **todo** `src/app/(app)/balance/page.tsx` por:
```tsx
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
```

- [ ] **Step 2: Crear el componente client del índice**

Create `src/app/(app)/balance/balance-index-client.tsx`:
```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Card, Chip } from "@/components/ui";

export type PeriodRow = {
  period: string; versions: number; official: string | null; officialId: string | null;
  status: string; complete: number; lastUpload: string;
};
export type ClientGroup = {
  clientName: string; clientNit: string;
  mapped?: number; unmapped?: number; total?: number;
  periodList: PeriodRow[];
};
export type AuditRow = { date: string; actor: string; role: string; action: string; ip: string; details: string };
export type StdAccount = { code: string; name: string; level: number; nature: string; critical: boolean };

type Tab = "clients" | "audit" | "std";

function statusTone(s: string): "ok" | "warn" | "blue" | "ink" {
  if (s === "Congelado") return "blue";
  if (s === "Con alertas") return "warn";
  return "ink";
}

export default function BalanceIndexClient({
  clients, auditRows, std, clientNames,
}: {
  clients: ClientGroup[]; auditRows: AuditRow[]; std: StdAccount[]; clientNames: string[];
}) {
  const [tab, setTab] = useState<Tab>("clients");

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <TabBtn on={tab === "clients"} onClick={() => setTab("clients")} label="Clientes" count={clients.length} />
        <TabBtn on={tab === "audit"} onClick={() => setTab("audit")} label="Audit log" count={auditRows.length} />
        <TabBtn on={tab === "std"} onClick={() => setTab("std")} label="Plan estándar" count={std.length} />
        <button
          disabled
          title="Carga de balance — se habilita al cablear la importación de archivos (fase posterior)"
          className="ml-auto inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-ink-100 px-3 py-1.5 text-[12.5px] font-semibold text-ink-400"
        >
          <Icon name="upload" size={14} /> Cargar balance
        </button>
      </div>

      {tab === "clients" && <ClientsTab clients={clients} />}
      {tab === "audit" && <AuditTab rows={auditRows} clientNames={clientNames} />}
      {tab === "std" && <StandardTab std={std} />}
    </div>
  );
}

function ClientsTab({ clients }: { clients: ClientGroup[] }) {
  return (
    <div className="flex flex-col gap-5">
      {clients.map((c) => (
        <Card key={c.clientName}>
          <div className="flex items-center gap-2.5 border-b border-ink-100 px-4 py-3">
            <span className="text-ink-400"><Icon name="doc" size={16} /></span>
            <h2 className="text-[13px] font-semibold text-ink-800">{c.clientName}</h2>
            <span className="font-mono text-[11px] text-ink-400">{c.clientNit}</span>
            {c.total != null && <span className="ml-2"><Chip label={`${c.mapped}/${c.total} mapeadas`} tone="ink" /></span>}
            {c.unmapped != null && c.unmapped > 0 && <Chip label={`${c.unmapped} sin mapeo`} tone="warn" />}
            <span className="ml-auto text-[11px] text-ink-400">{c.periodList.length} período(s)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                  <th className="px-4 py-2 font-semibold">Período</th>
                  <th className="px-4 py-2 text-right font-semibold">Versiones</th>
                  <th className="px-4 py-2 font-semibold">Versión oficial</th>
                  <th className="px-4 py-2 font-semibold">Estado</th>
                  <th className="px-4 py-2 font-semibold">Completitud</th>
                  <th className="px-4 py-2 font-semibold">Última carga</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {c.periodList.map((p) => (
                  <tr key={p.period} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                    <td className="px-4 py-2.5 font-medium text-ink-800">{p.period}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-600">{p.versions}</td>
                    <td className="px-4 py-2.5">{p.official ? <Chip label={`${p.official} oficial`} tone="ok" /> : <span className="text-ink-400">—</span>}</td>
                    <td className="px-4 py-2.5"><Chip label={p.status} tone={statusTone(p.status)} /></td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-ink-150">
                          <div className={`h-full ${p.complete === 100 ? "bg-ok-500" : "bg-warn-500"}`} style={{ width: `${p.complete}%` }} />
                        </div>
                        <span className="font-mono text-[11px] text-ink-500">{p.complete}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-ink-500">{p.lastUpload}</td>
                    <td className="px-4 py-2.5 text-right">
                      {p.officialId && (
                        <Link href={`/balance/${p.officialId}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-500 hover:underline">
                          Ver <Icon name="chev-r" size={12} />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}

function AuditTab({ rows, clientNames }: { rows: AuditRow[]; clientNames: string[] }) {
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
        <h2 className="text-[13px] font-semibold text-ink-800">Audit log</h2>
        <select className="ml-auto rounded-md border border-ink-200 px-2 py-1 text-[12px] text-ink-700 outline-none">
          {clientNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2 font-semibold">Fecha · hora</th>
              <th className="px-4 py-2 font-semibold">Actor</th>
              <th className="px-4 py-2 font-semibold">Rol</th>
              <th className="px-4 py-2 font-semibold">Acción</th>
              <th className="px-4 py-2 font-semibold">IP</th>
              <th className="px-4 py-2 font-semibold">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-ink-50 last:border-0">
                <td className="px-4 py-2.5 font-mono text-ink-600">{r.date}</td>
                <td className="px-4 py-2.5 text-ink-800">{r.actor}</td>
                <td className="px-4 py-2.5"><Chip label={r.role} tone={r.role.includes("Cliente") ? "blue" : "ink"} /></td>
                <td className="px-4 py-2.5 font-medium text-ink-700">{r.action}</td>
                <td className="px-4 py-2.5 font-mono text-ink-400">{r.ip}</td>
                <td className="px-4 py-2.5 text-ink-500">{r.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function StandardTab({ std }: { std: StdAccount[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const rows = std.filter((s) => !needle || s.code.includes(needle) || s.name.toLowerCase().includes(needle));
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
        <h2 className="text-[13px] font-semibold text-ink-800">Plan de cuentas estándar — Russell Bedford</h2>
        <Chip label={`${rows.length} cuentas`} tone="ink" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filtrar…" className="ml-auto rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2 font-semibold">Código</th>
              <th className="px-4 py-2 font-semibold">Nombre</th>
              <th className="px-4 py-2 font-semibold">Nivel</th>
              <th className="px-4 py-2 font-semibold">Naturaleza</th>
              <th className="px-4 py-2 font-semibold">Crítica</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.code} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                <td className="px-4 py-2.5 font-mono text-ink-600" style={{ paddingLeft: (s.level - 1) * 16 + 16 }}>{s.code}</td>
                <td className={`px-4 py-2.5 text-ink-800 ${s.level === 1 ? "font-bold" : s.level === 2 ? "font-medium" : ""}`}>{s.name}</td>
                <td className="px-4 py-2.5 text-ink-500">Nivel {s.level}</td>
                <td className="px-4 py-2.5"><Chip label={s.nature === "D" ? "Débito" : "Crédito"} tone="ink" /></td>
                <td className="px-4 py-2.5">{s.critical && <Chip label="Crítica" tone="warn" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TabBtn({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${on ? "bg-navy-800 text-white" : "text-ink-600 hover:bg-ink-100"}`}>
      {label}
      <span className={`rounded-full px-1.5 text-[10px] font-semibold ${on ? "bg-white/20 text-white" : "bg-ink-100 text-ink-500"}`}>{count}</span>
    </button>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/balance/page.tsx" "src/app/(app)/balance/balance-index-client.tsx"
git commit -m "feat: /balance con tabs Clientes / Audit log / Plan estándar"
```

---

## Task 2A.6: `/balance/[id]` — detalle con 3 tabs

**Files:** Modify `src/app/(app)/balance/[id]/page.tsx`; Create `src/app/(app)/balance/[id]/balance-detail-client.tsx`

- [ ] **Step 1: Reescribir la página (server)**

Reemplazar **todo** `src/app/(app)/balance/[id]/page.tsx` por:
```tsx
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { PageHeader, StatCard, Chip, BackLink } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtCompact } from "@/lib/format";
import { freezeBalance } from "@/app/actions/balance";
import BalanceDetailClient, {
  type Sums, type Validation, type BreakdownGroup, type Meta, type Version,
} from "./balance-detail-client";

export default async function BalanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const balance = await prisma.balance.findUnique({ where: { id } });
  if (!balance) notFound();

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
            {!balance.isFrozen && (
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
```

- [ ] **Step 2: Crear el componente client del detalle**

Create `src/app/(app)/balance/[id]/balance-detail-client.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Card, Chip } from "@/components/ui";
import { fmt, fmtPct } from "@/lib/format";

export type Sums = { activo: number; pasivo: number; patrimonio: number; ingresos: number; gastos: number; costos: number; utilidad: number };
export type Validation = { id: string; rule: string; status: string; detail: string; count?: number };
export type BreakdownItem = { code: string; name: string; balance: number; prevBalance: number; variation: number | null; std: string | null; mapped: boolean; critical: boolean; nature: string; saldoOk: boolean };
export type BreakdownGroup = { code: string; name: string; balance: number; prevBalance: number; variation: number | null; mapped: boolean; critical: boolean; nature: string; saldoOk: boolean; items: BreakdownItem[] };
export type Meta = { rows: number; mapped: number; unmapped: number; critical: number; file: string; fileSize: string; frozenBy: string; frozenAt: string; uploadedBy: string; uploadedAt: string };
export type Version = { v: string; date: string; uploadedBy: string; role: string; file: string; size: string; rows: number; sumA: number; balanced: boolean; note: string; changes: number };

type Tab = "breakdown" | "validations" | "versions";

export default function BalanceDetailClient({
  breakdown, validations, versions, officialVersion, warnCount,
}: {
  breakdown: BreakdownGroup[]; validations: Validation[]; versions: Version[]; officialVersion: string; warnCount: number;
}) {
  const [tab, setTab] = useState<Tab>("breakdown");
  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center gap-2">
        <TabBtn on={tab === "breakdown"} onClick={() => setTab("breakdown")} label="Detalle por niveles" />
        <TabBtn on={tab === "validations"} onClick={() => setTab("validations")} label="Validaciones" count={warnCount} />
        <TabBtn on={tab === "versions"} onClick={() => setTab("versions")} label="Versiones" count={versions.length} />
      </div>
      {tab === "breakdown" && <BreakdownTab groups={breakdown} />}
      {tab === "validations" && <ValidationsTab validations={validations} />}
      {tab === "versions" && <VersionsTab versions={versions} officialVersion={officialVersion} />}
    </div>
  );
}

function BreakdownTab({ groups }: { groups: BreakdownGroup[] }) {
  const [open, setOpen] = useState<string[]>(["11", "13", "24"]);
  const toggle = (code: string) => setOpen((o) => (o.includes(code) ? o.filter((c) => c !== code) : [...o, code]));
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2 font-semibold">Código</th>
              <th className="px-4 py-2 font-semibold">Cuenta</th>
              <th className="px-4 py-2 font-semibold">Mapeo estándar</th>
              <th className="px-4 py-2 text-right font-semibold">Saldo</th>
              <th className="px-4 py-2 text-right font-semibold">Período anterior</th>
              <th className="px-4 py-2 text-right font-semibold">Var %</th>
              <th className="px-4 py-2 font-semibold">Validación</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const isOpen = open.includes(g.code);
              const is99 = g.code === "99";
              return (
                <FragmentRows key={g.code}>
                  <tr className={`cursor-pointer border-b border-ink-100 ${is99 ? "bg-warn-100" : "bg-ink-50"}`} onClick={() => toggle(g.code)}>
                    <td className="px-4 py-2 font-mono font-semibold text-ink-700">
                      <span className="mr-1 inline-block align-middle"><Icon name={isOpen ? "chev-d" : "chev-r"} size={12} /></span>{g.code}
                    </td>
                    <td className="px-4 py-2 font-semibold text-ink-800">{g.name}{g.critical && <span className="ml-2 align-middle text-warn-500"><Icon name="warn" size={12} /></span>}</td>
                    <td className="px-4 py-2">{g.mapped ? <Chip label="Mapeada" tone="ok" /> : <Chip label="Sin mapeo" tone="warn" />}</td>
                    <td className="px-4 py-2 text-right font-mono font-semibold text-ink-800">{fmt(g.balance)}</td>
                    <td className="px-4 py-2 text-right font-mono text-ink-400">{fmt(g.prevBalance)}</td>
                    <td className={`px-4 py-2 text-right font-mono ${g.variation != null && Math.abs(g.variation) > 25 ? "text-warn-700" : "text-ink-700"}`}>{fmtPct(g.variation)}</td>
                    <td className="px-4 py-2">{!g.saldoOk ? <Chip label="Saldo contrario" tone="err" /> : g.mapped ? <Chip label="OK" tone="ok" /> : null}</td>
                  </tr>
                  {isOpen && g.items.map((a) => (
                    <tr key={a.code} className="border-b border-ink-50 hover:bg-ink-50">
                      <td className="px-4 py-2 pl-9 font-mono text-[11.5px] text-ink-500">{a.code}</td>
                      <td className="px-4 py-2 text-ink-700">{a.name}{a.critical && <span className="ml-2"><Chip label="Crítica" tone="warn" /></span>}</td>
                      <td className="px-4 py-2">{a.std ? <span className="font-mono text-[11.5px] text-blue-500">→ {a.std}</span> : <Chip label="Asignar" tone="warn" />}</td>
                      <td className="px-4 py-2 text-right font-mono text-ink-700">{fmt(a.balance)}</td>
                      <td className="px-4 py-2 text-right font-mono text-ink-400">{fmt(a.prevBalance)}</td>
                      <td className={`px-4 py-2 text-right font-mono ${a.variation != null && Math.abs(a.variation) > 25 ? "text-warn-700" : "text-ink-500"}`}>{fmtPct(a.variation)}</td>
                      <td className="px-4 py-2">{!a.saldoOk && <Chip label="Naturaleza" tone="err" />}</td>
                    </tr>
                  ))}
                </FragmentRows>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ValidationsTab({ validations }: { validations: Validation[] }) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2 font-semibold">Regla</th>
              <th className="px-4 py-2 font-semibold">Estado</th>
              <th className="px-4 py-2 font-semibold">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {validations.map((v) => (
              <tr key={v.id} className="border-b border-ink-50 last:border-0">
                <td className="px-4 py-2.5 font-medium text-ink-800">{v.rule}</td>
                <td className="px-4 py-2.5">{v.status === "ok" ? <Chip label="OK" tone="ok" /> : <Chip label={`${v.count ?? ""} ${v.count === 1 ? "alerta" : "alertas"}`} tone="warn" />}</td>
                <td className="px-4 py-2.5 text-ink-500">{v.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function VersionsTab({ versions, officialVersion }: { versions: Version[]; officialVersion: string }) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2 font-semibold">Versión</th>
              <th className="px-4 py-2 font-semibold">Fecha</th>
              <th className="px-4 py-2 font-semibold">Cargado por</th>
              <th className="px-4 py-2 font-semibold">Archivo</th>
              <th className="px-4 py-2 text-right font-semibold">Cuentas</th>
              <th className="px-4 py-2 text-right font-semibold">Activo</th>
              <th className="px-4 py-2 font-semibold">Cuadrado</th>
              <th className="px-4 py-2 text-right font-semibold">Cambios</th>
              <th className="px-4 py-2 font-semibold">Nota</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v, i) => (
              <tr key={v.v} className="border-b border-ink-50 last:border-0 align-top">
                <td className="px-4 py-2.5">{v.v === officialVersion ? <Chip label={`${v.v} · oficial`} tone="ok" /> : <Chip label={v.v} tone="ink" />}</td>
                <td className="px-4 py-2.5 font-mono text-ink-500">{v.date}</td>
                <td className="px-4 py-2.5"><div className="font-medium text-ink-800">{v.uploadedBy}</div><div className="text-[11px] text-ink-400">{v.role}</div></td>
                <td className="px-4 py-2.5 text-ink-600">{v.file}<div className="text-[11px] text-ink-400">{v.size}</div></td>
                <td className="px-4 py-2.5 text-right font-mono text-ink-700">{v.rows}</td>
                <td className="px-4 py-2.5 text-right font-mono text-ink-700">{fmt(v.sumA)}</td>
                <td className="px-4 py-2.5">{v.balanced ? <Chip label="Sí" tone="ok" /> : <Chip label="Descuadra" tone="err" />}</td>
                <td className="px-4 py-2.5 text-right font-mono text-ink-600">{i === versions.length - 1 ? "—" : `+${v.changes}`}</td>
                <td className="px-4 py-2.5 text-ink-500">{v.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function TabBtn({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${on ? "bg-navy-800 text-white" : "text-ink-600 hover:bg-ink-100"}`}>
      {label}
      {count != null && <span className={`rounded-full px-1.5 text-[10px] font-semibold ${on ? "bg-white/20 text-white" : "bg-ink-100 text-ink-500"}`}>{count}</span>}
    </button>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/balance/[id]/page.tsx" "src/app/(app)/balance/[id]/balance-detail-client.tsx"
git commit -m "feat: /balance/[id] con tabs, breakdown expandible, KPIs y congelar"
```

---

## Task 2A.7: `/balance/[id]/diff` — comparativo de versiones

**Files:** Create `src/app/(app)/balance/[id]/diff/page.tsx`; Create `src/app/(app)/balance/[id]/diff/balance-diff-client.tsx`

- [ ] **Step 1: Crear la página (server)**

Create `src/app/(app)/balance/[id]/diff/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { PageHeader, StatCard, BackLink } from "@/components/ui";
import { fmtCompact } from "@/lib/format";
import BalanceDiffClient, { type DiffData } from "./balance-diff-client";

export default async function BalanceDiffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const balance = await prisma.balance.findUnique({ where: { id } });
  if (!balance || balance.diff == null) notFound();

  const diff = balance.diff as DiffData;

  return (
    <div>
      <div className="mb-3"><BackLink href={`/balance/${id}`} label="Volver al detalle" /></div>
      <PageHeader title={`Comparativo de versiones`} subtitle={`${balance.clientName} · ${balance.period}`} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Cuentas agregadas" value={`+${diff.summary.added}`} tone="ok" />
        <StatCard label="Cuentas eliminadas" value={`−${diff.summary.removed}`} tone="ink" />
        <StatCard label="Cuentas modificadas" value={`~${diff.summary.changed}`} tone="warn" />
        <StatCard label="Total afectado" value={fmtCompact(diff.summary.totalAffected)} tone="blue" />
      </div>

      <div className="mt-5"><BalanceDiffClient diff={diff} version={balance.version} /></div>
    </div>
  );
}
```

- [ ] **Step 2: Crear el componente client del diff**

Create `src/app/(app)/balance/[id]/diff/balance-diff-client.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Card, Chip } from "@/components/ui";
import { fmt } from "@/lib/format";

export type DiffRow = { type: "added" | "removed" | "changed"; code: string; name: string; before: number; after: number; delta: number; flag?: string };
export type DiffData = { summary: { added: number; removed: number; changed: number; totalAffected: number }; rows: DiffRow[] };

type View = "git" | "side" | "sxs";

export default function BalanceDiffClient({ diff, version }: { diff: DiffData; version: string }) {
  const [view, setView] = useState<View>("git");
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <ViewBtn on={view === "git"} onClick={() => setView("git")} label="Git diff" />
        <ViewBtn on={view === "side"} onClick={() => setView("side")} label="Antes / Después" />
        <ViewBtn on={view === "sxs"} onClick={() => setView("sxs")} label="Lado a lado" />
      </div>
      {view === "git" && <GitView rows={diff.rows} />}
      {view === "side" && <SideView rows={diff.rows} />}
      {view === "sxs" && <SxsView rows={diff.rows} version={version} />}
    </div>
  );
}

function sign(t: DiffRow["type"]) { return t === "added" ? "+" : t === "removed" ? "−" : "~"; }

function GitView({ rows }: { rows: DiffRow[] }) {
  return (
    <Card className="overflow-hidden p-0 font-mono text-[12px]">
      {rows.map((r, i) => (
        <div key={i} className={`grid items-center gap-2 border-b border-ink-50 px-3 py-1.5 last:border-0 ${r.type === "added" ? "bg-ok-100" : r.type === "removed" ? "bg-err-100" : ""}`} style={{ gridTemplateColumns: "20px 90px 1fr 130px 130px 120px" }}>
          <span className={`font-bold ${r.type === "added" ? "text-ok-700" : r.type === "removed" ? "text-err-700" : "text-ink-500"}`}>{sign(r.type)}</span>
          <span className="text-ink-600">{r.code}</span>
          <span className="text-ink-800">{r.name}{r.flag && <span className="ml-2"><Chip label={r.flag} tone="err" /></span>}</span>
          <span className={`text-right ${r.type === "changed" ? "text-ink-400 line-through" : "text-ink-500"}`}>{r.type === "added" ? "—" : fmt(r.before)}</span>
          <span className="text-right font-semibold text-ink-800">{r.type === "removed" ? "—" : fmt(r.after)}</span>
          <span className={`text-right ${r.delta > 0 ? "text-ok-700" : "text-err-700"}`}>{r.delta > 0 ? "+" : ""}{fmt(r.delta)}</span>
        </div>
      ))}
    </Card>
  );
}

function SideView({ rows }: { rows: DiffRow[] }) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2 font-semibold">Código</th>
              <th className="px-4 py-2 font-semibold">Cuenta</th>
              <th className="px-4 py-2 font-semibold">Tipo</th>
              <th className="px-4 py-2 text-right font-semibold">v2 (antes)</th>
              <th className="px-4 py-2 text-right font-semibold">v3 (después)</th>
              <th className="px-4 py-2 text-right font-semibold">Δ</th>
              <th className="px-4 py-2 font-semibold">Flag</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`border-b border-ink-50 last:border-0 ${r.type === "added" ? "bg-ok-100" : r.type === "removed" ? "bg-err-100" : ""}`}>
                <td className="px-4 py-2 font-mono text-ink-600">{r.code}</td>
                <td className="px-4 py-2 text-ink-800">{r.name}</td>
                <td className="px-4 py-2">{r.type === "added" ? <Chip label="+ Nueva" tone="ok" /> : r.type === "removed" ? <Chip label="− Eliminada" tone="err" /> : <Chip label="~ Modificada" tone="ink" />}</td>
                <td className="px-4 py-2 text-right font-mono text-ink-500">{r.type === "added" ? "—" : fmt(r.before)}</td>
                <td className="px-4 py-2 text-right font-mono font-semibold text-ink-800">{r.type === "removed" ? "—" : fmt(r.after)}</td>
                <td className={`px-4 py-2 text-right font-mono ${r.delta > 0 ? "text-ok-700" : "text-err-700"}`}>{r.delta > 0 ? "+" : ""}{fmt(r.delta)}</td>
                <td className="px-4 py-2">{r.flag && <Chip label={r.flag} tone="err" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SxsView({ rows, version }: { rows: DiffRow[]; version: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <div className="border-b border-ink-100 px-4 py-3 text-[13px] font-semibold text-ink-800">Versión anterior</div>
        <div className="max-h-[520px] overflow-y-auto">
          <table className="w-full text-[12.5px]">
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={`border-b border-ink-50 ${r.type === "added" ? "bg-ink-50 opacity-40" : ""}`}>
                  <td className="px-4 py-2 font-mono text-ink-500">{r.code}</td>
                  <td className="px-4 py-2 text-ink-700">{r.name}</td>
                  <td className="px-4 py-2 text-right font-mono text-ink-600">{r.type === "added" ? "—" : fmt(r.before)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3 text-[13px] font-semibold text-ink-800">{version} <Chip label="oficial" tone="ok" /></div>
        <div className="max-h-[520px] overflow-y-auto">
          <table className="w-full text-[12.5px]">
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={`border-b border-ink-50 ${r.type === "added" ? "bg-ok-100" : r.delta !== 0 ? "bg-warn-100" : ""}`}>
                  <td className="px-4 py-2 font-mono text-ink-500">{r.code}</td>
                  <td className="px-4 py-2 text-ink-700">{r.name}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold text-ink-800">{r.type === "removed" ? "—" : fmt(r.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ViewBtn({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${on ? "bg-navy-800 text-white" : "text-ink-600 hover:bg-ink-100"}`}>{label}</button>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores; la ruta `/balance/[id]/diff` aparece en el output.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/balance/[id]/diff"
git commit -m "feat: /balance/[id]/diff con vistas Git / Antes-Después / Lado a lado"
```

---

## Task 2A.8: Validación de cierre de Fase 2A

- [ ] **Step 1: Suite completa**

Run:
```bash
npx vitest run && npx tsc --noEmit && npm run lint && npm run build && npx prisma migrate status
```
Expected: tests verdes; sin errores de tipos/lint; build OK; migración up to date.

- [ ] **Step 2: Re-seed limpio**

Run: `npm run db:seed`
Expected: idempotente, sin error.

- [ ] **Step 3: Criterios de aceptación (smoke render — lo ejecuta el controlador)**

Con `npm run dev` y sesión iniciada:
- `/balance`: 3 tabs funcionan. Clientes muestra El Zarzal con 4 períodos (Dic-2025 con badge "v3 oficial", barra verde 100%), badges mapeadas/sin-mapeo. Audit log muestra 9 entradas. Plan estándar lista 31 cuentas con filtro.
- `/balance/<id-oficial-El-Zarzal>`: subtítulo de trazabilidad, 6 KPIs (incl. Validaciones "4 ok / 4 alertas" y Mapeo "398/412"), 3 tabs. Detalle: grupos expandibles (11/13/24 abiertos), columnas Período anterior + Var% + Validación, grupo "99" resaltado, chips "Asignar". Versiones: 3 filas. "Diff de versiones" navega a la ruta diff. Como está congelado, NO aparece "Congelar".
- Un balance NO congelado (p. ej. Abril 2026 v2): muestra el botón "Congelar como oficial"; al pulsarlo persiste (recargar → "Congelado").
- `/balance/<id>/diff`: 4 KPIs y las 3 vistas (Git / Antes-Después / Lado a lado) renderizan los 13 cambios, con el flag "Cambio de naturaleza".

- [ ] **Step 4: Commit final (si hubo ajustes)**

```bash
git add -A && git commit -m "chore: cierre y validación de Fase 2A" || echo "nada que commitear"
```

---

## Notas para el implementador

- **Orden:** 2A.1 → 2A.8.
- **Json-céntrico:** `versionHistory/diff/auditLog` son columnas Json en `Balance`; los componentes reciben números planos (sin `BigInt`).
- **`fmt` vs `fmtCompact`:** las tablas usan `fmt` (cifra completa con separadores); los KPIs usan `fmtCompact` (M/MM). Ambos ya existen en `lib/format`.
- **"Cargar balance" deshabilitado:** la importación real de Excel es de una fase posterior; el botón queda visible pero deshabilitado con tooltip (honesto, no es un control roto silencioso).
- **Sub-planes hermanos (Fase 2):** 2B (mapeo cuenta→Russell) y 2C (estado de resultado) se planifican y ejecutan después de 2A.
- **Sin placeholders pendientes:** todo el código está completo arriba.
