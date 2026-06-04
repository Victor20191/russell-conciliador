# Fase 6B · Requerimientos — Repositorios de recepción — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans. Steps usan checkbox (`- [ ]`).

**Goal:** Construir los repositorios de recepción: `/requerimientos/repositorios` (lista con 4 KPIs y tabla de repositorios) y `/requerimientos/repositorios/[id]` (detalle: header, 4 KPIs, tabs Documentos/Actividad; documentos agrupados por familia, expandibles, con filtro; marcar documento recibido y enviar recordatorio **persisten**).

**Architecture:** Server Components leen Prisma; el detalle delega filtro/expansión/tabs a un componente `"use client"`; marcar recibido y recordar son Server Actions. Se añade sub-navegación de Requerimientos (Plantillas / Repositorios) al sidebar.

**Modelo de datos:** `ReqRepository`, `ReqRepoFamily`, `ReqRepoItem`, `ReqRepoActivity`. Los contadores agregados son metadata (los ítems son una muestra, igual que el prototipo).

**Tech Stack:** Next.js 16, Prisma 7, PostgreSQL, Tailwind v4, TS.

**Restricción Next 16:** `params` es `Promise`. Server Actions con `"use server"`.

**Rama:** `finalizacion-lfm`. Reutiliza `PageHeader, Card, Chip, StatCard, BackLink` (`@/components/ui`), `Icon` (`@/components/icons`).

**Fuera de alcance (6C/diferido):** presentaciones (6C — el botón "Generar presentación" queda deshabilitado); carga real de archivos (se simula "marcar recibido"); export/descargar (diferido).

---

## Mapa de archivos

**Crear:**
- `src/app/actions/repositorios.ts` — `markRepoItemReceived`, `sendRepoReminder`.
- `src/app/(app)/requerimientos/repositorios/page.tsx` — lista (server).
- `src/app/(app)/requerimientos/repositorios/[id]/page.tsx` — detalle (server).
- `src/app/(app)/requerimientos/repositorios/[id]/repo-client.tsx` — UI detalle (client).

**Modificar:**
- `prisma/schema.prisma` — modelos nuevos.
- `prisma/seed.ts` — 4 repos + REPO-014 (familias/ítems/actividad).
- `src/lib/nav.ts` — Requerimientos como grupo con hijos Plantillas/Repositorios.

---

## Task 6B.1: Esquema Repositorios

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: Añadir los modelos**

Al final de `prisma/schema.prisma`, añadir:
```prisma
model ReqRepository {
  id           String          @id // REPO-2026-014
  consec       String
  templateCode String
  clientName   String
  nit          String
  period       String
  cutoff       String
  sentAt       String
  sentBy       String
  deadline     String
  daysLeft     Int             @default(0)
  total        Int             @default(0)
  received     Int             @default(0)
  pending      Int             @default(0)
  overdue      Int             @default(0)
  progress     Int             @default(0)
  status       String // Completo | Vencido parcial | En recepción
  families     ReqRepoFamily[]
  activity     ReqRepoActivity[]
}

model ReqRepoFamily {
  id           String        @id @default(cuid())
  repository   ReqRepository @relation(fields: [repositoryId], references: [id], onDelete: Cascade)
  repositoryId String
  code         String // F1
  name         String
  total        Int           @default(0)
  received     Int           @default(0)
  pending      Int           @default(0)
  order        Int           @default(0)
  items        ReqRepoItem[]
}

model ReqRepoItem {
  id       String        @id @default(cuid())
  family   ReqRepoFamily @relation(fields: [familyId], references: [id], onDelete: Cascade)
  familyId String
  idx      Int
  doc      String
  due      String
  status   String // received | pending | overdue
  file     String?
  size     String?
  by       String?
  at       String?
  order    Int           @default(0)
}

model ReqRepoActivity {
  id           String        @id @default(cuid())
  repository   ReqRepository @relation(fields: [repositoryId], references: [id], onDelete: Cascade)
  repositoryId String
  at           String
  actor        String
  role         String // Cliente | Auditor | Auto
  action       String
  detail       String
  order        Int           @default(0)
}
```

- [ ] **Step 2: Migración**

Run:
```bash
npx prisma migrate dev --name requerimientos_repositorios && npx prisma generate
```
Expected: aplicada; migrate status up to date.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): modelos de repositorios de recepción (Requerimientos)"
```

---

## Task 6B.2: Seed Repositorios

**Files:** Modify `prisma/seed.ts`

- [ ] **Step 1: Limpieza idempotente**

En el bloque de limpieza, al inicio, añadir:
```ts
  await prisma.reqRepoActivity.deleteMany();
  await prisma.reqRepoItem.deleteMany();
  await prisma.reqRepoFamily.deleteMany();
  await prisma.reqRepository.deleteMany();
```

- [ ] **Step 2: Sembrar repositorios + detalle de REPO-014**

Antes de `console.log("✅ Seed completo.")`, añadir:
```ts
  // ---- Repositorios (lista) ----
  await prisma.reqRepository.createMany({
    data: [
      { id: "REPO-2026-014", consec: "RFA 001 – 2026 ZZ", templateCode: "RFA-CIERRE v3.2", clientName: "El Zarzal S.A", nit: "890.345.872-1", period: "Cierre 2025", cutoff: "31/Dic/2025", sentAt: "06/Ene/2026 09:14", sentBy: "Manuela Gutiérrez", deadline: "23/Ene/2026", daysLeft: -2, total: 78, received: 64, pending: 11, overdue: 3, progress: 82, status: "Vencido parcial" },
      { id: "REPO-2026-013", consec: "RFA 006 – 2026 ZZ", templateCode: "RFA-LEGALES v2.1", clientName: "El Zarzal S.A", nit: "890.345.872-1", period: "Abril 2026", cutoff: "30/Abr/2026", sentAt: "22/Abr/2026 11:08", sentBy: "Manuela Gutiérrez", deadline: "08/May/2026", daysLeft: 0, total: 38, received: 35, pending: 3, overdue: 0, progress: 92, status: "En recepción" },
      { id: "REPO-2026-012", consec: "RFA 002 – 2026 IP", templateCode: "RFA-CIERRE v3.2", clientName: "Inversiones del Pacífico S.A.S", nit: "900.451.227-3", period: "Cierre 2025", cutoff: "31/Dic/2025", sentAt: "08/Ene/2026 14:30", sentBy: "Carlos Aristizábal", deadline: "25/Ene/2026", daysLeft: -2, total: 78, received: 78, pending: 0, overdue: 0, progress: 100, status: "Completo" },
      { id: "REPO-2026-010", consec: "RFA 028 – 2026 MS", templateCode: "RFA-PRECIERRE v1.1", clientName: "Manufacturas del Sur S.A", nit: "830.502.118-9", period: "Pre-cierre Oct 2026", cutoff: "31/Oct/2026", sentAt: "05/Nov/2026 13:02", sentBy: "Manuela Gutiérrez", deadline: "19/Nov/2026", daysLeft: 11, total: 54, received: 18, pending: 36, overdue: 0, progress: 33, status: "En recepción" },
    ],
  });

  // ---- Detalle de REPO-2026-014: familias + ítems ----
  type RItem = [number, string, string, string | null, string | null, string | null, string | null]; // idx, doc, status, file, size, by, at
  const repoFams: { code: string; name: string; total: number; received: number; pending: number; items: RItem[] }[] = [
    { code: "F1", name: "Información General", total: 12, received: 12, pending: 0, items: [
      [1, "Políticas contables NIIF actualizadas", "received", "Politicas_NIIF_2025.pdf", "1.2 MB", "Sandra Paniagua", "08/Ene/2026 10:14"],
      [2, "Balance de comprobación oct/nov/dic 2025 (Excel por cuenta y terceros)", "received", "Balance ZARZAL Dic-2025_v3.xlsx", "284 KB", "Sandra Paniagua", "06/Ene/2026 09:14"],
      [4, "RUT actualizado", "received", "RUT_Zarzal_2026.pdf", "212 KB", "Sandra Carrillo", "07/Ene/2026 16:42"],
      [5, "Certificado de Cámara de Comercio actualizado", "received", "CCC_Zarzal_2026.pdf", "487 KB", "Sandra Carrillo", "07/Ene/2026 16:42"],
    ] },
    { code: "F2", name: "Efectivo y Equivalentes de Efectivo", total: 4, received: 4, pending: 0, items: [
      [1, "Extractos bancarios oct-dic 2025 (PDF)", "received", "Extractos_Q4_2025.zip", "8.4 MB", "Sandra Paniagua", "10/Ene/2026 09:30"],
      [2, "Conciliaciones bancarias oct-dic 2025", "received", "Conciliaciones_Q4_2025.xlsx", "412 KB", "Sandra Paniagua", "10/Ene/2026 09:35"],
      [4, "Políticas de manejo y custodia del fondo de cajas", "received", "Politica_Caja.pdf", "320 KB", "Sandra Carrillo", "08/Ene/2026 11:02"],
    ] },
    { code: "F3", name: "Cuentas Comerciales por Cobrar", total: 8, received: 6, pending: 0, items: [
      [2, "Estado de cartera por clientes y edades", "received", "Cartera_Edades_Dic25.xlsx", "680 KB", "Sandra Paniagua", "12/Ene/2026 14:12"],
      [3, "Detalle cartera castigada vigencia 2025", "overdue", null, null, null, null],
      [6, "Cuentas pendientes de cobro a empleados", "received", "CxC_Empleados.xlsx", "68 KB", "Alejandra Henao", "14/Ene/2026 10:08"],
      [7, "Cuentas por cobrar a particulares", "overdue", null, null, null, null],
    ] },
    { code: "F4", name: "Inventarios", total: 5, received: 3, pending: 2, items: [
      [1, "Estado de existencias al corte (costo y unidades)", "received", "Inventario_Dic25.xlsx", "1.4 MB", "Sandra Paniagua", "13/Ene/2026 16:18"],
      [3, "Conciliación módulo inventarios vs contabilidad oct-dic", "pending", null, null, null, null],
      [5, "Reporte de ajustes de inventario realizados en el año", "pending", null, null, null, null],
    ] },
    { code: "F5", name: "Propiedad, Planta y Equipo", total: 7, received: 5, pending: 2, items: [
      [1, "Conciliación módulo PPE vs contabilidad — diciembre 2025", "received", "Conc_PPE_Dic25.xlsx", "258 KB", "Sandra Paniagua", "14/Ene/2026 09:14"],
      [3, "Carpeta física con facturas de compra y venta", "pending", null, null, null, null],
      [7, "Registro en sistema del avalúo por activo", "pending", null, null, null, null],
    ] },
    { code: "F11", name: "Asientos Diarios (JE)", total: 1, received: 0, pending: 0, items: [
      [1, "Excel de Journal Entries 01/Ene–31/Dic 2025", "overdue", null, null, null, null],
    ] },
    { code: "F13", name: "Provisión de Renta", total: 30, received: 18, pending: 12, items: [
      [1, "Declaración de renta 2024 + recibo de pago", "received", "DR_2024.pdf", "1.1 MB", "Sandra Paniagua", "16/Ene/2026 11:05"],
      [2, "Balance enero–diciembre 2025 por terceros NIIF y Fiscal", "pending", null, null, null, null],
      [4, "Anexo activos fijos fiscal y NIIF", "received", "AF_Fiscal_NIIF.xlsx", "412 KB", "Sandra Paniagua", "16/Ene/2026 11:08"],
    ] },
  ];
  for (let fi = 0; fi < repoFams.length; fi++) {
    const f = repoFams[fi];
    await prisma.reqRepoFamily.create({
      data: { repositoryId: "REPO-2026-014", code: f.code, name: f.name, total: f.total, received: f.received, pending: f.pending, order: fi,
        items: { create: f.items.map(([idx, doc, status, file, size, by, at], i) => ({ idx, doc, due: "23/Ene/2026", status, file, size, by, at, order: i })) } },
    });
  }

  await prisma.reqRepoActivity.createMany({
    data: [
      { repositoryId: "REPO-2026-014", at: "06/Ene/2026 09:14", actor: "Manuela Gutiérrez", role: "Auditor", action: "Envió requerimiento y creó repositorio", detail: "78 ítems · vencimiento 23/Ene/2026", order: 0 },
      { repositoryId: "REPO-2026-014", at: "06/Ene/2026 09:14", actor: "Sandra Paniagua", role: "Cliente", action: "Cargó Balance v3", detail: "F1 · ítem 2 · 284 KB", order: 1 },
      { repositoryId: "REPO-2026-014", at: "07/Ene/2026 16:42", actor: "Sandra Carrillo", role: "Cliente", action: "Cargó 2 documentos", detail: "F1 · RUT, CCC", order: 2 },
      { repositoryId: "REPO-2026-014", at: "08/Ene/2026 10:14", actor: "Sandra Paniagua", role: "Cliente", action: "Cargó políticas NIIF", detail: "F1 · ítem 1", order: 3 },
      { repositoryId: "REPO-2026-014", at: "12/Ene/2026 14:08", actor: "Sandra Paniagua", role: "Cliente", action: "Cargó 2 documentos de cartera", detail: "F3 · ítems 1, 2", order: 4 },
      { repositoryId: "REPO-2026-014", at: "15/Ene/2026 11:30", actor: "Sandra Paniagua", role: "Cliente", action: "Cargó 4 documentos", detail: "F3 · ítems 4, 5, 8 + F4", order: 5 },
      { repositoryId: "REPO-2026-014", at: "24/Ene/2026 08:00", actor: "Sistema", role: "Auto", action: "3 ítems vencidos", detail: "F3 ítems 3, 7 · F11 ítem 1", order: 6 },
      { repositoryId: "REPO-2026-014", at: "25/Ene/2026 09:15", actor: "Manuela Gutiérrez", role: "Auditor", action: "Envió recordatorio", detail: "a Sandra Paniagua, Sandra Carrillo", order: 7 },
    ],
  });
```

- [ ] **Step 3: Re-sembrar y verificar**

Run: `npm run db:seed`
Expected: sin error. 4 repos, REPO-014 con 7 familias + ítems, 8 eventos.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(db): sembrar repositorios y detalle de REPO-2026-014"
```

---

## Task 6B.3: Server Actions Repositorios

**Files:** Create `src/app/actions/repositorios.ts`

- [ ] **Step 1: Crear las acciones**

Create `src/app/actions/repositorios.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { verifySession, getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";

export async function markRepoItemReceived(formData: FormData): Promise<void> {
  await verifySession();
  const itemId = formData.get("itemId") as string;
  const repositoryId = formData.get("repositoryId") as string;
  if (!itemId || !repositoryId) return;

  const item = await prisma.reqRepoItem.findUnique({ where: { id: itemId }, include: { family: true } });
  if (!item || item.status === "received") return;
  const wasOverdue = item.status === "overdue";

  const user = await getCurrentUser();
  await prisma.reqRepoItem.update({ where: { id: itemId }, data: { status: "received", file: "documento_cargado.pdf", size: "1.0 MB", by: user?.name ?? "Cliente", at: "ahora" } });
  await prisma.reqRepoFamily.update({ where: { id: item.familyId }, data: { received: { increment: 1 }, pending: wasOverdue ? undefined : { decrement: 1 } } });

  const repo = await prisma.reqRepository.findUnique({ where: { id: repositoryId } });
  if (repo) {
    const received = repo.received + 1;
    const pending = wasOverdue ? repo.pending : repo.pending - 1;
    const overdue = wasOverdue ? repo.overdue - 1 : repo.overdue;
    const progress = repo.total > 0 ? Math.round((received / repo.total) * 100) : 0;
    await prisma.reqRepository.update({ where: { id: repo.id }, data: { received, pending, overdue, progress, status: pending + overdue === 0 ? "Completo" : repo.status } });
  }

  await prisma.reqRepoActivity.create({ data: { repositoryId, at: "ahora", actor: user?.name ?? "Cliente", role: "Cliente", action: "Cargó un documento", detail: `${item.family.code} · ${item.doc.slice(0, 50)}`, order: 999 } });
  await logAudit({ user: user?.name ?? "Sistema", action: "RECIBIÓ DOCUMENTO", entity: repositoryId, detail: item.doc.slice(0, 60) });
  revalidatePath(`/requerimientos/repositorios/${repositoryId}`);
  revalidatePath("/requerimientos/repositorios");
}

export async function sendRepoReminder(formData: FormData): Promise<void> {
  await verifySession();
  const repositoryId = formData.get("repositoryId") as string;
  if (!repositoryId) return;
  const user = await getCurrentUser();
  await prisma.reqRepoActivity.create({ data: { repositoryId, at: "ahora", actor: user?.name ?? "Auditor", role: "Auditor", action: "Envió recordatorio", detail: "a los contactos con documentos pendientes", order: 999 } });
  await logAudit({ user: user?.name ?? "Sistema", action: "ENVIÓ RECORDATORIO", entity: repositoryId, detail: "Documentos pendientes" });
  revalidatePath(`/requerimientos/repositorios/${repositoryId}`);
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
```bash
git add src/app/actions/repositorios.ts
git commit -m "feat: Server Actions markRepoItemReceived y sendRepoReminder"
```

---

## Task 6B.4: UI — lista, detalle y sub-nav

**Files:** Modify `src/lib/nav.ts`; Create `repositorios/page.tsx`, `repositorios/[id]/page.tsx`, `repositorios/[id]/repo-client.tsx`.

- [ ] **Step 1: Sub-nav de Requerimientos**

En `src/lib/nav.ts`, reemplazar el ítem de Requerimientos:
```ts
  { label: "Requerimientos", href: "/requerimientos", icon: "folder" },
```
por:
```ts
  {
    label: "Requerimientos",
    href: "/requerimientos",
    icon: "folder",
    children: [
      { label: "Plantillas", href: "/requerimientos" },
      { label: "Repositorios", href: "/requerimientos/repositorios" },
    ],
  },
```

- [ ] **Step 2: Lista de repositorios (server)**

Create `src/app/(app)/requerimientos/repositorios/page.tsx`:
```tsx
import Link from "next/link";
import prisma from "@/lib/prisma";
import { PageHeader, Card, Chip, StatCard } from "@/components/ui";
import { Icon } from "@/components/icons";

function deadlineHint(daysLeft: number): { text: string; cls: string } {
  if (daysLeft < 0) return { text: `Hace ${Math.abs(daysLeft)} días`, cls: "text-err-700" };
  if (daysLeft === 0) return { text: "Hoy", cls: "text-warn-700" };
  return { text: `En ${daysLeft} días`, cls: daysLeft <= 3 ? "text-warn-700" : "text-ink-400" };
}
function statusTone(s: string): "ok" | "err" | "blue" { return s === "Completo" ? "ok" : s === "Vencido parcial" ? "err" : "blue"; }

export default async function RepositoriosPage() {
  const repos = await prisma.reqRepository.findMany({ orderBy: { id: "desc" } });
  const sum = (k: "received" | "pending" | "overdue") => repos.reduce((a, r) => a + r[k], 0);

  return (
    <div>
      <PageHeader title="Repositorios de información" subtitle="Cada requerimiento abre un repositorio donde el cliente carga la documentación. Trazabilidad por documento: usuario, fecha, archivo y estado vs. fecha límite." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Repositorios activos" value={String(repos.length)} tone="blue" />
        <StatCard label="Documentos recibidos" value={String(sum("received"))} tone="ok" />
        <StatCard label="Pendientes" value={String(sum("pending"))} tone="warn" />
        <StatCard label="Vencidos" value={String(sum("overdue"))} tone="err" />
      </div>
      <Card className="mt-5">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500"><th className="px-4 py-2 font-semibold">Consecutivo</th><th className="px-4 py-2 font-semibold">Cliente</th><th className="px-4 py-2 font-semibold">Período</th><th className="px-4 py-2 font-semibold">Enviado</th><th className="px-4 py-2 font-semibold">Vencimiento</th><th className="px-4 py-2 font-semibold">Progreso</th><th className="px-4 py-2 font-semibold">Estado</th><th className="px-4 py-2"></th></tr></thead>
            <tbody>
              {repos.map((r) => {
                const dl = deadlineHint(r.daysLeft);
                return (
                  <tr key={r.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                    <td className="px-4 py-2.5 font-mono text-ink-600">{r.consec}</td>
                    <td className="px-4 py-2.5"><div className="text-ink-800">{r.clientName}</div><div className="font-mono text-[11px] text-ink-400">NIT {r.nit}</div></td>
                    <td className="px-4 py-2.5 text-ink-600">{r.period}</td>
                    <td className="px-4 py-2.5 text-ink-600">{r.sentAt}<div className="text-[11px] text-ink-400">por {r.sentBy}</div></td>
                    <td className="px-4 py-2.5 text-ink-600">{r.deadline}<div className={`text-[11px] ${dl.cls}`}>{dl.text}</div></td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2"><span className="font-mono text-[11px] text-ink-500">{r.received}/{r.total}</span><div className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-150"><div className={`h-full ${r.progress === 100 ? "bg-ok-500" : r.overdue > 0 ? "bg-err-500" : "bg-warn-500"}`} style={{ width: `${r.progress}%` }} /></div></div>
                    </td>
                    <td className="px-4 py-2.5"><Chip label={r.status} tone={statusTone(r.status)} /></td>
                    <td className="px-4 py-2.5 text-right"><Link href={`/requerimientos/repositorios/${r.id}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-500 hover:underline">Abrir <Icon name="chev-r" size={12} /></Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Detalle (server)**

Create `src/app/(app)/requerimientos/repositorios/[id]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { PageHeader, StatCard, BackLink } from "@/components/ui";
import { Icon } from "@/components/icons";
import { sendRepoReminder } from "@/app/actions/repositorios";
import RepoClient, { type Family, type Activity } from "./repo-client";

export default async function RepoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await prisma.reqRepository.findUnique({
    where: { id },
    include: { families: { orderBy: { order: "asc" }, include: { items: { orderBy: { order: "asc" } } } }, activity: { orderBy: { order: "asc" } } },
  });
  if (!repo) notFound();

  const families: Family[] = repo.families.map((f) => ({ id: f.id, code: f.code, name: f.name, total: f.total, received: f.received, pending: f.pending, items: f.items.map((it) => ({ id: it.id, idx: it.idx, doc: it.doc, due: it.due, status: it.status, file: it.file, size: it.size, by: it.by, at: it.at })) }));
  const activity: Activity[] = repo.activity.map((a) => ({ id: a.id, at: a.at, actor: a.actor, role: a.role, action: a.action, detail: a.detail }));

  return (
    <div>
      <div className="mb-3"><BackLink href="/requerimientos/repositorios" label="Repositorios" /></div>
      <PageHeader
        title={`Repositorio ${repo.consec}`}
        subtitle={`${repo.clientName} · ${repo.period} · Enviado ${repo.sentAt} por ${repo.sentBy} · Vencimiento ${repo.deadline} · ${repo.templateCode}`}
        actions={
          <div className="flex items-center gap-2">
            <form action={sendRepoReminder}><input type="hidden" name="repositoryId" value={repo.id} /><button type="submit" className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-3 py-2 text-[12.5px] font-medium text-ink-700 hover:bg-ink-50"><Icon name="send" size={14} /> Enviar recordatorio</button></form>
            <button disabled title="Descarga — fase posterior" className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-ink-100 px-3 py-2 text-[12px] font-semibold text-ink-400"><Icon name="download" size={14} /> Descargar todo</button>
            <button disabled title="Presentaciones — Fase 6C" className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-ink-100 px-3 py-2 text-[12px] font-semibold text-ink-400"><Icon name="play" size={14} /> Generar presentación</button>
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total ítems" value={String(repo.total)} tone="blue" />
        <StatCard label="Recibidos" value={String(repo.received)} tone="ok" />
        <StatCard label="Pendientes" value={String(repo.pending)} tone="warn" />
        <StatCard label="Vencidos" value={String(repo.overdue)} tone="err" />
      </div>
      <RepoClient repositoryId={repo.id} families={families} activity={activity} />
    </div>
  );
}
```

- [ ] **Step 4: Detalle (client)**

Create `src/app/(app)/requerimientos/repositorios/[id]/repo-client.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Card, Chip } from "@/components/ui";
import { markRepoItemReceived } from "@/app/actions/repositorios";

export type Item = { id: string; idx: number; doc: string; due: string; status: string; file: string | null; size: string | null; by: string | null; at: string | null };
export type Family = { id: string; code: string; name: string; total: number; received: number; pending: number; items: Item[] };
export type Activity = { id: string; at: string; actor: string; role: string; action: string; detail: string };

function itemStatus(s: string): { label: string; tone: "ok" | "warn" | "err" } {
  if (s === "received") return { label: "Recibido", tone: "ok" };
  if (s === "overdue") return { label: "Vencido", tone: "err" };
  return { label: "Pendiente", tone: "warn" };
}

export default function RepoClient({ repositoryId, families, activity }: { repositoryId: string; families: Family[]; activity: Activity[] }) {
  const [tab, setTab] = useState<"docs" | "activity">("docs");
  const [filter, setFilter] = useState<"all" | "received" | "pending" | "overdue">("all");
  const [open, setOpen] = useState<string[]>(families.map((f) => f.id));
  const toggle = (id: string) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center gap-2">
        <TabBtn on={tab === "docs"} onClick={() => setTab("docs")} label="Documentos" />
        <TabBtn on={tab === "activity"} onClick={() => setTab("activity")} label="Actividad" count={activity.length} />
        {tab === "docs" && (
          <div className="ml-auto flex gap-1.5">
            {(["all", "received", "pending", "overdue"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${filter === f ? "bg-navy-800 text-white" : "bg-ink-100 text-ink-600"}`}>{f === "all" ? "Todos" : f === "received" ? "Recibidos" : f === "pending" ? "Pendientes" : "Vencidos"}</button>
            ))}
          </div>
        )}
      </div>

      {tab === "docs" ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500"><th className="px-3 py-2 font-semibold">#</th><th className="px-3 py-2 font-semibold">Documento</th><th className="px-3 py-2 font-semibold">Vence</th><th className="px-3 py-2 font-semibold">Estado</th><th className="px-3 py-2 font-semibold">Archivo</th><th className="px-3 py-2 font-semibold">Cargado por</th><th className="px-3 py-2 font-semibold">Fecha</th><th className="px-3 py-2"></th></tr></thead>
              <tbody>
                {families.map((fam) => {
                  const items = fam.items.filter((it) => filter === "all" || it.status === filter);
                  if (filter !== "all" && items.length === 0) return null;
                  const isOpen = open.includes(fam.id);
                  return (
                    <FragmentRows key={fam.id}>
                      <tr className="cursor-pointer border-b border-ink-100 bg-ink-50" onClick={() => toggle(fam.id)}>
                        <td className="px-3 py-2 font-mono font-semibold text-ink-700"><span className="mr-1 inline-block align-middle"><Icon name={isOpen ? "chev-d" : "chev-r"} size={12} /></span>{fam.code}</td>
                        <td className="px-3 py-2 font-semibold text-ink-800">{fam.name}</td>
                        <td className="px-3 py-2 text-ink-500" colSpan={6}>{fam.received}/{fam.total} recibidos · {fam.pending} pendientes</td>
                      </tr>
                      {isOpen && items.map((it) => {
                        const st = itemStatus(it.status);
                        return (
                          <tr key={it.id} className="border-b border-ink-50 hover:bg-ink-50">
                            <td className="px-3 py-2 pl-7 font-mono text-[11px] text-ink-500">{fam.code}.{it.idx}</td>
                            <td className="px-3 py-2 text-ink-700">{it.doc}</td>
                            <td className="px-3 py-2 text-ink-500">{it.due}</td>
                            <td className="px-3 py-2"><Chip label={st.label} tone={st.tone} /></td>
                            <td className="px-3 py-2 text-ink-600">{it.file ? <span className="inline-flex items-center gap-1"><Icon name="doc" size={12} />{it.file} <span className="text-ink-400">({it.size})</span></span> : "—"}</td>
                            <td className="px-3 py-2 text-ink-600">{it.by ?? "—"}</td>
                            <td className="px-3 py-2 text-ink-500">{it.at ?? "—"}</td>
                            <td className="px-3 py-2 text-right">
                              {it.status === "received" ? (
                                <button disabled title="Descarga — fase posterior" className="cursor-not-allowed rounded p-1 text-ink-300"><Icon name="download" size={13} /></button>
                              ) : (
                                <form action={markRepoItemReceived}><input type="hidden" name="itemId" value={it.id} /><input type="hidden" name="repositoryId" value={repositoryId} /><button type="submit" title="Marcar recibido" className="inline-flex items-center gap-1 rounded-md border border-ok-100 bg-ok-100 px-2 py-1 text-[11px] font-semibold text-ok-700 hover:opacity-80"><Icon name="check" size={11} /> Recibir</button></form>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </FragmentRows>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500"><th className="px-4 py-2 font-semibold">Fecha · hora</th><th className="px-4 py-2 font-semibold">Actor</th><th className="px-4 py-2 font-semibold">Rol</th><th className="px-4 py-2 font-semibold">Acción</th><th className="px-4 py-2 font-semibold">Detalle</th></tr></thead>
              <tbody>
                {activity.map((a) => (
                  <tr key={a.id} className="border-b border-ink-50 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-ink-600">{a.at}</td>
                    <td className="px-4 py-2.5 text-ink-800">{a.actor}</td>
                    <td className="px-4 py-2.5"><Chip label={a.role} tone={a.role === "Cliente" ? "blue" : a.role === "Auditor" ? "ink" : "warn"} /></td>
                    <td className="px-4 py-2.5 font-medium text-ink-700">{a.action}</td>
                    <td className="px-4 py-2.5 text-ink-500">{a.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function FragmentRows({ children }: { children: React.ReactNode }) { return <>{children}</>; }
function TabBtn({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count?: number }) {
  return <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium ${on ? "bg-navy-800 text-white" : "text-ink-600 hover:bg-ink-100"}`}>{label}{count != null && <span className={`rounded-full px-1.5 text-[10px] font-semibold ${on ? "bg-white/20" : "bg-ink-100 text-ink-500"}`}>{count}</span>}</button>;
}
```

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores; rutas `/requerimientos/repositorios` y `/requerimientos/repositorios/[id]` en el output.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nav.ts "src/app/(app)/requerimientos/repositorios"
git commit -m "feat: repositorios de recepción (lista + detalle con documentos y actividad) + sub-nav"
```

---

## Task 6B.5: Validación de cierre de Fase 6B

- [ ] **Step 1: Suite**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build && npx prisma migrate status`
Expected: todo verde.

- [ ] **Step 2: Re-seed**

Run: `npm run db:seed`

- [ ] **Step 3: Criterios de aceptación (smoke — lo ejecuta el controlador)**

Con `npm run dev` + sesión:
- Sidebar: Requerimientos ahora tiene hijos Plantillas / Repositorios.
- `/requerimientos/repositorios`: 4 KPIs (Activos 4 / Recibidos 195 / Pendientes 50 / Vencidos 3), tabla de 4 repos con progreso (barra) y estado (Completo/Vencido parcial/En recepción), vencimiento con "Hace N días"/"En N días". "Abrir" → detalle.
- `/requerimientos/repositorios/REPO-2026-014`: header, 4 KPIs (78/64/11/3), tabs Documentos/Actividad. Documentos: 7 familias expandibles con ítems (Recibido/Pendiente/Vencido, archivo, cargado por, fecha); filtro Todos/Recibidos/Pendientes/Vencidos. Actividad: timeline de 8 eventos con roles.
- **Persistencia**: en un ítem pendiente/vencido, "Recibir" lo marca recibido y actualiza KPIs (recargar → persiste, contador sube). "Enviar recordatorio" agrega un evento a la Actividad.

- [ ] **Step 4: Commit final (si aplica)**

```bash
git add -A && git commit -m "chore: cierre y validación de Fase 6B" || echo "nada"
```

---

## Notas
- Contadores agregados como metadata; ítems = muestra (igual que el prototipo). "Recibir" actualiza ítem + contadores de familia/repo + actividad.
- "Generar presentación a cliente" deshabilitado (Fase 6C). Descargas/export diferidas.
- Sub-nav de Requerimientos añadida (Plantillas/Repositorios) al sidebar.
- Sin placeholders pendientes.
