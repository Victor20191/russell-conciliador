# Fase 7 · Calendario + Auditoría — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans. Steps usan checkbox (`- [ ]`).

**Goal:** Construir `/calendario` (calendario tributario y de requerimientos: 4 KPIs, navegación de mes, 3 vistas Mes/Semana/Día, filtros por tipo y cliente, eventos DIAN/ICA/Requerimientos, paneles "Próximos vencimientos" y "Asignación por cliente"; "Nuevo evento" persiste) y enriquecer `/auditoria` (toolbar de filtros, columna IP de origen).

**Architecture:** Server Components leen Prisma; el calendario es un componente `"use client"` que computa la grilla del mes y las vistas desde su estado; crear evento es una Server Action. Auditoría filtra vía `searchParams` en el server, con una barra de filtros client.

**Modelo de datos:** `CalendarEvent` (fecha real + tipo/título/subtítulo/cliente); se extiende `AuditEntry` con `ip`.

**Tech Stack:** Next.js 16, Prisma 7, PostgreSQL, Tailwind v4, TS.

**Restricción Next 16:** `params`/`searchParams` son `Promise`. Server Actions con `"use server"`.

**Rama:** `finalizacion-lfm`. Reutiliza `PageHeader, Card, Chip, EmptyState` (`@/components/ui`), `Modal` (`@/components/modal`), `Icon` (`@/components/icons`).

**Fuera de alcance (diferido):** export iCal y export CSV (botones deshabilitados); edición/eliminación de eventos.

---

## Mapa de archivos

**Crear:**
- `src/app/actions/calendario.ts` — `createCalendarEvent`.
- `src/app/(app)/calendario/calendario-client.tsx` — UI calendario (client).
- `src/app/(app)/auditoria/auditoria-filters.tsx` — barra de filtros (client).

**Modificar:**
- `prisma/schema.prisma` — modelo `CalendarEvent` + `AuditEntry.ip`.
- `prisma/seed.ts` — 19 eventos + `ip` en las entradas de auditoría.
- `src/lib/audit.ts` — `logAudit` setea `ip: "interno"`.
- `src/app/(app)/calendario/page.tsx` — reescribir (server).
- `src/app/(app)/auditoria/page.tsx` — filtros + columna IP (server).

---

## Task 7.1: Esquema

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: Extender `AuditEntry` y añadir `CalendarEvent`**

En `model AuditEntry`, añadir el campo (junto a los existentes):
```prisma
  ip String?
```
Al final de `prisma/schema.prisma`, añadir:
```prisma
model CalendarEvent {
  id       String   @id @default(cuid())
  date     DateTime
  type     String // dian | ica | req
  title    String
  subtitle String
  clientId String? // id de cliente de calendario: zarzal, pacif...
  order    Int      @default(0)
}
```

- [ ] **Step 2: Migración**

Run:
```bash
npx prisma migrate dev --name calendario_auditoria && npx prisma generate
```
Expected: aplicada; migrate status up to date.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): modelo CalendarEvent + ip en AuditEntry"
```

---

## Task 7.2: Seed

**Files:** Modify `prisma/seed.ts`

- [ ] **Step 1: Limpieza idempotente**

En el bloque de limpieza, añadir:
```ts
  await prisma.calendarEvent.deleteMany();
```

- [ ] **Step 2: `ip` en las entradas de auditoría existentes**

En el `prisma.auditEntry.createMany({ data: [...] })` existente, añadir `ip` a cada una de las 6 filas (valores demo):
```ts
      { ts: "03/May/2026 09:14:22", user: "Juliana Rincón", action: "EJECUTÓ", entity: "Cruce REC-2026-0431", detail: "Inventarios · Inversiones del Pacífico · Marzo 2026", ip: "190.85.241.18" },
      { ts: "03/May/2026 09:13:48", user: "Juliana Rincón", action: "GUARDÓ MAPEO", entity: "Cuentas (Inventarios)", detail: "7 cuentas auto, 1 reasignada por similitud, 1 sin mapeo", ip: "190.85.241.18" },
      { ts: "03/May/2026 09:11:02", user: "Juliana Rincón", action: "GUARDÓ MAPEO", entity: "Campos (Inventarios)", detail: "10 de 10 campos requeridos cubiertos", ip: "190.85.241.18" },
      { ts: "03/May/2026 09:08:17", user: "Juliana Rincón", action: "CARGÓ ARCHIVO", entity: "INV_PACIFICO_MAR2026.xlsx", detail: "4.821 filas · 12 columnas · 1,4 MB", ip: "190.85.241.18" },
      { ts: "03/May/2026 09:07:55", user: "Juliana Rincón", action: "INICIÓ", entity: "Parametrización", detail: "Cliente C-1042 · Módulo Inventarios", ip: "190.85.241.18" },
      { ts: "02/May/2026 17:41:09", user: "María Bermúdez", action: "ASIGNÓ", entity: "REC-2026-0431", detail: "Asignado a Juliana Rincón con prioridad media", ip: "interno" },
```

- [ ] **Step 3: Sembrar los eventos del calendario**

Antes de `console.log("✅ Seed completo.")`, añadir:
```ts
  // ---- Calendario (Mayo 2026) ----
  const calEvents: [number, string, string, string | null, string][] = [
    [8, "dian", "IVA Bimestre 2", null, "NITs terminados en 1-2"],
    [9, "dian", "IVA Bimestre 2", null, "NITs 3-4"],
    [12, "dian", "Retención en la fuente Abr", null, "NITs 1-2"],
    [13, "dian", "Retención en la fuente Abr", null, "NITs 3-4"],
    [14, "dian", "Retención en la fuente Abr", null, "NITs 5-6"],
    [21, "dian", "Información exógena", null, "Grandes contribuyentes"],
    [15, "ica", "ICA Bogotá Bim 2", null, "Régimen común"],
    [18, "ica", "ICA Medellín Bim 2", null, "Anticipo bimestral"],
    [26, "ica", "ICA Cali anual", null, "Última cuota"],
    [5, "req", "RFA-INTERIM Q1", "zarzal", "Cierre marzo"],
    [5, "req", "Cierre mensual abril", "pacif", "Inventarios + cartera"],
    [7, "req", "Cuentas por pagar", "andina", "Conciliación con proveedores"],
    [12, "req", "Nómina abril", "valle", "Soporte planilla"],
    [15, "req", "RFA-CIERRE jun", "agrocol", "Documentos preliminares"],
    [19, "req", "Activos fijos", "zarzal", "Inventario físico"],
    [20, "req", "Conciliación bancaria", "andina", "Abril 2026"],
    [22, "req", "Estados financieros", "pacif", "Borrador trimestre"],
    [27, "req", "Cierre mayo", "zarzal", "Preparación de cuentas"],
    [28, "req", "Impuestos consolidado", "valle", "Provisión mensual"],
  ];
  await prisma.calendarEvent.createMany({
    data: calEvents.map(([day, type, title, clientId, subtitle], i) => ({ date: new Date(2026, 4, day), type, title, clientId, subtitle, order: i })),
  });
```

- [ ] **Step 4: Re-sembrar y verificar**

Run: `npm run db:seed`
Expected: sin error. 19 eventos de calendario; entradas de auditoría con `ip`.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(db): sembrar eventos de calendario + ip en auditoría"
```

---

## Task 7.3: `logAudit` con `ip` + Server Action de calendario

**Files:** Modify `src/lib/audit.ts`; Create `src/app/actions/calendario.ts`

- [ ] **Step 1: `logAudit` setea ip "interno"**

En `src/lib/audit.ts`, en el `prisma.auditEntry.create`, añadir `ip: "interno"` al `data`:
```ts
  await prisma.auditEntry.create({
    data: { ts: stamp(), user, action, entity, detail, ip: "interno" },
  });
```

- [ ] **Step 2: Crear la acción de calendario**

Create `src/app/actions/calendario.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { verifySession, getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";

export async function createCalendarEvent(formData: FormData): Promise<void> {
  await verifySession();
  const dateStr = formData.get("date") as string; // YYYY-MM-DD
  const type = (formData.get("type") as string) || "req";
  const title = ((formData.get("title") as string) ?? "").trim();
  const subtitle = ((formData.get("subtitle") as string) ?? "").trim();
  const clientId = (formData.get("clientId") as string) || null;
  if (!dateStr || !title) return;

  const [y, m, d] = dateStr.split("-").map(Number);
  await prisma.calendarEvent.create({ data: { date: new Date(y, m - 1, d), type, title, subtitle, clientId: type === "req" ? clientId : null, order: 999 } });
  const user = await getCurrentUser();
  await logAudit({ user: user?.name ?? "Sistema", action: "CREÓ EVENTO", entity: title, detail: `${type} · ${dateStr}` });
  revalidatePath("/calendario");
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit`
```bash
git add src/lib/audit.ts src/app/actions/calendario.ts
git commit -m "feat: ip en logAudit + Server Action createCalendarEvent"
```

---

## Task 7.4: `/calendario` — UI

**Files:** Modify `src/app/(app)/calendario/page.tsx`; Create `src/app/(app)/calendario/calendario-client.tsx`

- [ ] **Step 1: Página (server)**

Reemplazar **todo** `src/app/(app)/calendario/page.tsx` por:
```tsx
import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import CalendarioClient, { type Evt } from "./calendario-client";

export default async function CalendarioPage() {
  const events = await prisma.calendarEvent.findMany({ orderBy: { date: "asc" } });
  const evts: Evt[] = events.map((e) => {
    const d = new Date(e.date);
    return { id: e.id, day: d.getDate(), month: d.getMonth(), year: d.getFullYear(), type: e.type, title: e.title, subtitle: e.subtitle, clientId: e.clientId };
  });
  return (
    <div>
      <PageHeader title="Calendario" subtitle="Requerimientos por cliente, vencimientos tributarios DIAN y declaraciones ICA municipales en una sola vista." />
      <CalendarioClient events={evts} />
    </div>
  );
}
```

- [ ] **Step 2: Componente client**

Create `src/app/(app)/calendario/calendario-client.tsx`:
```tsx
"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { Card, Chip } from "@/components/ui";
import { Modal } from "@/components/modal";
import { createCalendarEvent } from "@/app/actions/calendario";

export type Evt = { id: string; day: number; month: number; year: number; type: string; title: string; subtitle: string; clientId: string | null };

const CAL_CLIENTS: { id: string; name: string; nit: string; color: string }[] = [
  { id: "zarzal", name: "El Zarzal S.A", nit: "900.451.227-3", color: "#1f6feb" },
  { id: "pacif", name: "Inversiones del Pacífico", nit: "901.224.118-6", color: "#a855f7" },
  { id: "andina", name: "Comercializadora Andina", nit: "830.114.998-2", color: "#0a8048" },
  { id: "valle", name: "Distribuciones del Valle", nit: "890.331.052-5", color: "#b9651b" },
  { id: "agrocol", name: "Agrocol S.A.S", nit: "900.512.770-1", color: "#dc2626" },
];
const TYPE_COLOR: Record<string, string> = { dian: "#dc2626", ica: "#b9651b", req: "#1f6feb" };
const TYPE_LABEL: Record<string, string> = { dian: "DIAN", ica: "ICA", req: "Requerimiento" };
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DAYNAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function clientOf(id: string | null) { return CAL_CLIENTS.find((c) => c.id === id) ?? null; }
function colorOf(e: Evt) { return e.type === "req" ? clientOf(e.clientId)?.color ?? "#1f6feb" : TYPE_COLOR[e.type]; }

export default function CalendarioClient({ events }: { events: Evt[] }) {
  const [my, setMy] = useState({ y: 2026, m: 4 });
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [filter, setFilter] = useState({ dian: true, ica: true, req: true, client: "all" });
  const [selectedDay, setSelectedDay] = useState(11);
  const [creating, setCreating] = useState(false);

  const monthEvents = useMemo(() => events.filter((e) => e.year === my.y && e.month === my.m), [events, my]);
  const visible = useMemo(() => monthEvents.filter((e) => {
    if (!filter[e.type as "dian" | "ica" | "req"]) return false;
    if (filter.client !== "all") { if (!e.clientId) return false; if (e.clientId !== filter.client) return false; }
    return true;
  }), [monthEvents, filter]);

  const eventsByDay = useMemo(() => {
    const m: Record<number, Evt[]> = {};
    visible.forEach((e) => { (m[e.day] ??= []).push(e); });
    return m;
  }, [visible]);

  const cells = useMemo(() => {
    const first = new Date(my.y, my.m, 1);
    const last = new Date(my.y, my.m + 1, 0);
    const start = (first.getDay() + 6) % 7;
    const arr: (number | null)[] = [];
    for (let i = 0; i < start; i++) arr.push(null);
    for (let d = 1; d <= last.getDate(); d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [my]);

  const goPrev = () => setMy((s) => (s.m === 0 ? { y: s.y - 1, m: 11 } : { y: s.y, m: s.m - 1 }));
  const goNext = () => setMy((s) => (s.m === 11 ? { y: s.y + 1, m: 0 } : { y: s.y, m: s.m + 1 }));

  const dianCount = monthEvents.filter((e) => e.type === "dian").length;
  const icaCount = monthEvents.filter((e) => e.type === "ica").length;
  const reqCount = monthEvents.filter((e) => e.type === "req").length;

  // Semana: la que contiene selectedDay (Lun-Dom)
  const weekDays = useMemo(() => {
    const d = new Date(my.y, my.m, selectedDay);
    const off = (d.getDay() + 6) % 7;
    const monday = selectedDay - off;
    return Array.from({ length: 7 }, (_, i) => monday + i).filter((x) => x >= 1 && x <= new Date(my.y, my.m + 1, 0).getDate());
  }, [my, selectedDay]);

  const upcoming = useMemo(() => visible.filter((e) => e.day >= 10 && e.day <= 18).sort((a, b) => a.day - b.day), [visible]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button disabled title="Exportación — fase posterior" className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-ink-100 px-2.5 py-2 text-[12px] font-semibold text-ink-400"><Icon name="download" size={13} /> Exportar iCal</button>
        <button onClick={() => setCreating(true)} className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600"><Icon name="plus" size={14} /> Nuevo evento</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Eventos del mes" value={visible.length} hint={`${MONTHS[my.m]} ${my.y}`} color="#142b4a" />
        <Kpi label="Requerimientos clientes" value={reqCount} hint={`${CAL_CLIENTS.length} clientes activos`} color="#1f6feb" />
        <Kpi label="Vencimientos DIAN" value={dianCount} hint="IVA · Retención · Exógena" color="#dc2626" />
        <Kpi label="ICA municipal" value={icaCount} hint="3 municipios" color="#b9651b" />
      </div>

      {/* Control */}
      <Card className="mt-5">
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 px-4 py-3">
          <div className="flex items-center gap-1">
            <button onClick={goPrev} className="rounded p-1.5 text-ink-500 hover:bg-ink-100"><Icon name="chev-l" size={15} /></button>
            <span className="min-w-[130px] text-center text-[13px] font-semibold text-ink-800">{MONTHS[my.m]} {my.y}</span>
            <button onClick={goNext} className="rounded p-1.5 text-ink-500 hover:bg-ink-100"><Icon name="chev-r" size={15} /></button>
            <button onClick={() => setMy({ y: 2026, m: 4 })} className="ml-1 rounded-md border border-ink-200 px-2.5 py-1 text-[12px] text-ink-600 hover:bg-ink-50">Hoy</button>
          </div>
          <div className="flex overflow-hidden rounded-md border border-ink-200 text-[12px]">
            {(["day", "week", "month"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`px-2.5 py-1 ${view === v ? "bg-navy-900 text-white" : "bg-white text-ink-600 hover:bg-ink-50"}`}>{v === "day" ? "Día" : v === "week" ? "Semana" : "Mes"}</button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {(["req", "dian", "ica"] as const).map((t) => (
              <label key={t} className="flex items-center gap-1.5 text-[12px] text-ink-600"><input type="checkbox" checked={filter[t]} onChange={() => setFilter((f) => ({ ...f, [t]: !f[t] }))} /><span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLOR[t] }} />{TYPE_LABEL[t]}</label>
            ))}
            <select value={filter.client} onChange={(e) => setFilter((f) => ({ ...f, client: e.target.value }))} className="rounded-md border border-ink-200 px-2 py-1 text-[12px] outline-none">
              <option value="all">Todos los clientes</option>
              {CAL_CLIENTS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {view === "month" && (
          <div>
            <div className="grid grid-cols-7 border-b border-ink-100 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{DAYNAMES.map((d) => <div key={d} className="px-3 py-1.5">{d}</div>)}</div>
            <div className="grid grid-cols-7">
              {cells.map((d, idx) => (
                <div key={idx} className="min-h-[108px] border-b border-r border-ink-50 p-1.5" style={d === 11 && my.m === 4 && my.y === 2026 ? { background: "#fffdf3" } : undefined}>
                  {d != null && (
                    <>
                      <button onClick={() => { setSelectedDay(d); setView("day"); }} className="mb-1 text-[12px] font-medium text-ink-600 hover:text-blue-500">{d}</button>
                      <div className="flex flex-col gap-1">
                        {(eventsByDay[d] ?? []).slice(0, 3).map((e) => (
                          <div key={e.id} className="truncate rounded px-1.5 py-0.5 text-[10.5px] text-ink-700" style={{ background: colorOf(e) + "1f", borderLeft: `2px solid ${colorOf(e)}` }} title={e.title}>{e.title}</div>
                        ))}
                        {(eventsByDay[d]?.length ?? 0) > 3 && <span className="text-[10px] text-ink-400">+{eventsByDay[d].length - 3} más</span>}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {view === "week" && (
          <div className="grid grid-cols-7">
            {weekDays.map((d) => (
              <div key={d} className="min-h-[320px] border-r border-ink-50 p-2" style={d === 11 && my.m === 4 ? { background: "#fffdf3" } : undefined}>
                <div className="mb-2 text-[12px] font-semibold text-ink-700">{d}</div>
                <div className="flex flex-col gap-1.5">
                  {(eventsByDay[d] ?? []).map((e) => (
                    <div key={e.id} className="rounded px-2 py-1 text-[11px] text-ink-700" style={{ background: colorOf(e) + "1f", borderLeft: `3px solid ${colorOf(e)}` }}><div className="font-medium">{e.title}</div>{e.type === "req" && <div className="text-[10px] text-ink-500">{clientOf(e.clientId)?.name}</div>}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {view === "day" && (
          <div className="p-4">
            <div className="mb-3 text-[13px] font-semibold text-ink-800">{selectedDay} de {MONTHS[my.m].toLowerCase()}, {my.y}</div>
            <div className="flex flex-col gap-2">
              {(eventsByDay[selectedDay] ?? []).length === 0 && <div className="text-[12.5px] text-ink-400">Sin eventos programados para este día.</div>}
              {(eventsByDay[selectedDay] ?? []).map((e) => (
                <div key={e.id} className="flex items-center gap-3 rounded-md border border-ink-150 px-3 py-2.5" style={{ borderLeft: `4px solid ${colorOf(e)}` }}>
                  <div className="flex-1"><div className="text-[13px] font-semibold text-ink-800">{e.title}</div><div className="text-[11.5px] text-ink-500">{e.type === "req" ? `${clientOf(e.clientId)?.name} · NIT ${clientOf(e.clientId)?.nit}` : e.subtitle}</div></div>
                  <Chip label={TYPE_LABEL[e.type]} tone="ink" />
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Paneles */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="border-b border-ink-100 px-4 py-3 text-[13px] font-semibold text-ink-800">Próximos vencimientos · 7 días</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500"><th className="px-4 py-2 font-semibold">Fecha</th><th className="px-4 py-2 font-semibold">Tipo</th><th className="px-4 py-2 font-semibold">Evento</th><th className="px-4 py-2 font-semibold">Cliente / Detalle</th><th className="px-4 py-2 font-semibold">Estado</th></tr></thead>
              <tbody>
                {upcoming.map((e) => (
                  <tr key={e.id} className="border-b border-ink-50 last:border-0">
                    <td className="px-4 py-2 font-mono text-ink-600">{String(e.day).padStart(2, "0")}/{MONTHS[my.m].slice(0, 3)}</td>
                    <td className="px-4 py-2"><span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: TYPE_COLOR[e.type] + "1f", color: TYPE_COLOR[e.type] }}>{TYPE_LABEL[e.type]}</span></td>
                    <td className="px-4 py-2 text-ink-800">{e.title}</td>
                    <td className="px-4 py-2 text-ink-500">{e.type === "req" ? clientOf(e.clientId)?.name : e.subtitle}</td>
                    <td className="px-4 py-2"><Chip label={e.day <= 12 ? "Próximo" : "Programado"} tone={e.day <= 12 ? "warn" : "ink"} /></td>
                  </tr>
                ))}
                {upcoming.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-400">Sin vencimientos en la ventana.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <div className="border-b border-ink-100 px-4 py-3 text-[13px] font-semibold text-ink-800">Asignación por cliente · {MONTHS[my.m]}</div>
          <div className="divide-y divide-ink-50">
            {CAL_CLIENTS.map((c) => {
              const n = monthEvents.filter((e) => e.clientId === c.id).length;
              return (
                <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="h-8 w-2 rounded" style={{ background: c.color }} />
                  <div className="flex-1"><div className="text-[12.5px] font-medium text-ink-800">{c.name}</div><div className="font-mono text-[11px] text-ink-400">NIT {c.nit}</div></div>
                  <div className="text-right"><div className="font-mono text-[15px] font-semibold" style={{ color: c.color }}>{n}</div><div className="text-[10px] text-ink-400">requerim.</div></div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {creating && (
        <Modal open onClose={() => setCreating(false)} title="Nuevo evento">
          <form action={createCalendarEvent} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1"><span className="text-[11.5px] font-medium text-ink-600">Fecha</span><input type="date" name="date" defaultValue="2026-05-15" className="rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400" /></label>
            <label className="flex flex-col gap-1"><span className="text-[11.5px] font-medium text-ink-600">Tipo</span><select name="type" defaultValue="req" className="rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none"><option value="req">Requerimiento</option><option value="dian">DIAN</option><option value="ica">ICA</option></select></label>
            <label className="flex flex-col gap-1"><span className="text-[11.5px] font-medium text-ink-600">Título</span><input name="title" placeholder="Título del evento" className="rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400" /></label>
            <label className="flex flex-col gap-1"><span className="text-[11.5px] font-medium text-ink-600">Subtítulo / detalle</span><input name="subtitle" className="rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400" /></label>
            <label className="flex flex-col gap-1"><span className="text-[11.5px] font-medium text-ink-600">Cliente (si es requerimiento)</span><select name="clientId" defaultValue="zarzal" className="rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none">{CAL_CLIENTS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <div className="mt-1 flex justify-end gap-2"><button type="button" onClick={() => setCreating(false)} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] text-ink-600 hover:bg-ink-50">Cancelar</button><button type="submit" className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600">Crear evento</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, color }: { label: string; value: number; hint: string; color: string }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">{label}</div>
      <div className="mt-1.5 font-mono text-2xl font-semibold" style={{ color }}>{value}</div>
      <div className="mt-1 text-[12px] text-ink-500">{hint}</div>
    </Card>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/calendario/page.tsx" "src/app/(app)/calendario/calendario-client.tsx"
git commit -m "feat: /calendario con 3 vistas, filtros, KPIs, paneles y nuevo evento"
```

---

## Task 7.5: `/auditoria` — filtros + columna IP

**Files:** Modify `src/app/(app)/auditoria/page.tsx`; Create `src/app/(app)/auditoria/auditoria-filters.tsx`

- [ ] **Step 1: Barra de filtros (client)**

Create `src/app/(app)/auditoria/auditoria-filters.tsx`:
```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";

export default function AuditoriaFilters({ users, actions }: { users: string[]; actions: string[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.push(`/auditoria?${next.toString()}`);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2 rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1.5 text-ink-400">
        <Icon name="search" size={14} />
        <input defaultValue={sp.get("q") ?? ""} onChange={(e) => set("q", e.target.value)} placeholder="Buscar entidad o detalle…" className="w-52 bg-transparent text-[12.5px] text-ink-700 outline-none placeholder:text-ink-400" />
      </div>
      <select value={sp.get("user") ?? ""} onChange={(e) => set("user", e.target.value)} className="rounded-md border border-ink-200 px-2 py-1.5 text-[12.5px] text-ink-700 outline-none"><option value="">Todos los usuarios</option>{users.map((u) => <option key={u} value={u}>{u}</option>)}</select>
      <select value={sp.get("action") ?? ""} onChange={(e) => set("action", e.target.value)} className="rounded-md border border-ink-200 px-2 py-1.5 text-[12.5px] text-ink-700 outline-none"><option value="">Todas las acciones</option>{actions.map((a) => <option key={a} value={a}>{a}</option>)}</select>
      <button disabled title="Exportación — fase posterior" className="ml-auto inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-ink-100 px-2.5 py-1.5 text-[12px] font-semibold text-ink-400"><Icon name="download" size={13} /> Exportar CSV</button>
    </div>
  );
}
```

- [ ] **Step 2: Reescribir la página (server, con filtros + IP)**

Reemplazar **todo** `src/app/(app)/auditoria/page.tsx` por:
```tsx
import prisma from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import AuditoriaFilters from "./auditoria-filters";

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<{ q?: string; user?: string; action?: string }> }) {
  const sp = await searchParams;
  const all = await prisma.auditEntry.findMany({ orderBy: { ts: "desc" } });

  const users = [...new Set(all.map((e) => e.user))].sort();
  const actions = [...new Set(all.map((e) => e.action))].sort();

  const q = (sp.q ?? "").toLowerCase();
  const entries = all.filter((e) =>
    (!q || e.entity.toLowerCase().includes(q) || e.detail.toLowerCase().includes(q)) &&
    (!sp.user || e.user === sp.user) &&
    (!sp.action || e.action === sp.action),
  );

  const actionTone = (a: string) => {
    if (a.includes("EJECUTÓ") || a.includes("INICIÓ")) return "bg-blue-100 text-navy-700";
    if (a.includes("GUARDÓ") || a.includes("CARGÓ")) return "bg-ok-100 text-ok-700";
    if (a.includes("ASIGNÓ")) return "bg-ai-100 text-ai-700";
    return "bg-ink-100 text-ink-600";
  };

  return (
    <div>
      <PageHeader title="Auditoría" subtitle="Bitácora inmutable: trazabilidad de acciones del sistema con usuario, IP y detalle." />
      <Card>
        <div className="border-b border-ink-100 px-4 py-3"><AuditoriaFilters users={users} actions={actions} /></div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                <th className="px-4 py-2.5 font-semibold">Fecha y hora</th>
                <th className="px-4 py-2.5 font-semibold">Usuario</th>
                <th className="px-4 py-2.5 font-semibold">Acción</th>
                <th className="px-4 py-2.5 font-semibold">Entidad</th>
                <th className="px-4 py-2.5 font-semibold">IP origen</th>
                <th className="px-4 py-2.5 font-semibold">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11.5px] text-ink-500">{e.ts}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-800">{e.user}</td>
                  <td className="px-4 py-2.5"><span className={`inline-flex rounded px-2 py-0.5 text-[10.5px] font-semibold ${actionTone(e.action)}`}>{e.action}</span></td>
                  <td className="px-4 py-2.5 text-ink-700">{e.entity}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11.5px] text-ink-400">{e.ip ?? "—"}</td>
                  <td className="px-4 py-2.5 text-ink-500">{e.detail}</td>
                </tr>
              ))}
              {entries.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-400">Sin entradas que coincidan con el filtro.</td></tr>}
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
git add "src/app/(app)/auditoria/page.tsx" "src/app/(app)/auditoria/auditoria-filters.tsx"
git commit -m "feat: /auditoria con filtros (usuario/acción/búsqueda) y columna IP"
```

---

## Task 7.6: Validación de cierre de Fase 7 (y del proyecto)

- [ ] **Step 1: Suite**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build && npx prisma migrate status`
Expected: todo verde.

- [ ] **Step 2: Re-seed**

Run: `npm run db:seed`

- [ ] **Step 3: Criterios de aceptación (smoke — lo ejecuta el controlador)**

Con `npm run dev` + sesión:
- `/calendario`: 4 KPIs (Eventos del mes / Requerimientos / DIAN / ICA), navegación de mes, 3 vistas (Mes con grilla Lun-Dom y eventos por celda; Semana; Día), filtros por tipo (checkboxes) y cliente, paneles "Próximos vencimientos · 7 días" y "Asignación por cliente". "Nuevo evento" crea uno y aparece en la grilla (persiste).
- `/auditoria`: toolbar de filtros (buscador, usuario, acción), columna IP origen. Filtrar por usuario/acción reduce filas.

- [ ] **Step 4: Commit final (si aplica)**

```bash
git add -A && git commit -m "chore: cierre y validación de Fase 7 (y del proyecto)" || echo "nada"
```

---

## Notas
- `CalendarEvent.date` como `DateTime` (2026-05-DD); el componente computa la grilla/vistas desde el estado. Colores de cliente como constante de referencia (`CAL_CLIENTS`).
- "Hoy" reinicia a Mayo 2026 (mes de los eventos demo). Export iCal/CSV diferidos.
- `logAudit` setea `ip:"interno"`; las entradas demo de cliente llevan IP real.
- Cierra la **Fase 7** y, con ella, todas las fases planificadas del proyecto (4 Razonabilidad descartada por el usuario).
- Sin placeholders pendientes.
