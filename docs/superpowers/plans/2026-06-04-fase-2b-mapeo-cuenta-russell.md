# Fase 2B · Mapeo cuenta-cliente → Russell (`/balance/mapeo`) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la ruta `/balance/mapeo` (que hoy muestra por error el plan estándar global) por la pantalla real del prototipo: parametrización **cuenta del cliente (PUC N4/N6/N8) → cuenta Russell**, con selector editable persistente, KPIs, filtros, resumen por módulo de conciliación y sugerencias IA simuladas.

**Architecture:** Server Component lee Prisma (cuentas del cliente activo vía `searchParams`, catálogo Russell); la edición vive en un componente `"use client"` cuyo `<select>` por fila persiste vía Server Action; resumen por módulo derivado de los mapeos.

**Modelo de datos:** dos tablas nuevas — `ClientAccount` (PUC del cliente, dato editable/persistido) y `RussellOption` (catálogo de 18 cuentas Russell con su módulo de conciliación). El estado ok/partial/missing por módulo es metadata demo (constante en el componente, como las equivalencias de config/modulos); el **conteo** por módulo se deriva en vivo de los mapeos persistidos.

**Tech Stack:** Next.js 16, React 19, Prisma 7, PostgreSQL, Tailwind v4, TS, Vitest.

**Restricción Next 16:** `searchParams` de la página es `Promise` (`const sp = await searchParams`). Server Actions con `"use server"`.

**Rama:** `finalizacion-lfm`. Reutiliza `PageHeader, Card, Chip, StatCard, EmptyState` (`@/components/ui`), `Icon` (`@/components/icons`). Clientes de balance: derivados de `Balance.clientName` (El Zarzal S.A es el único con cuentas sembradas; los demás muestran `EmptyState`).

---

## Mapa de archivos

**Crear:**
- `src/app/actions/mapping.ts` — `updateAccountMapping`, `suggestMappingsAI`.
- `src/app/(app)/balance/mapeo/mapeo-client.tsx` — UI client (selector, KPIs, leyenda, tabla editable, filtros, resumen por módulo).

**Modificar:**
- `prisma/schema.prisma` — modelos `ClientAccount` y `RussellOption`.
- `prisma/seed.ts` — sembrar `RussellOption` (18) y `ClientAccount` (53 de El Zarzal).
- `src/app/(app)/balance/mapeo/page.tsx` — reescribir como server que delega en `MapeoClient`.

---

## Task 2B.1: Esquema — `ClientAccount` y `RussellOption`

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: Añadir los modelos**

Al final de `prisma/schema.prisma`, añadir:
```prisma
// ===== Mapeo cuenta-cliente → Russell (Balance · Mapeo plan estándar) =====
model ClientAccount {
  id          String  @id @default(cuid())
  clientName  String
  code        String
  level       Int // 4 | 6 | 8
  name        String
  russellCode String? // FK lógica a RussellOption.code
  order       Int     @default(0)

  @@unique([clientName, code])
}

model RussellOption {
  code   String  @id // 1105, 1110, 41...
  name   String
  module String? // Caja, Bancos, Cartera, DIAN... (null = no participa en conciliaciones)
}
```

- [ ] **Step 2: Migración**

Run:
```bash
npx prisma migrate dev --name client_account_russell_option && npx prisma generate
```
Expected: migración aplicada; `migrate status` → up to date.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): modelos ClientAccount y RussellOption (mapeo)"
```

---

## Task 2B.2: Seed — catálogo Russell + cuentas de El Zarzal

**Files:** Modify `prisma/seed.ts`

- [ ] **Step 1: Limpieza idempotente**

En el bloque de limpieza de `prisma/seed.ts` (junto a los demás `deleteMany`), añadir al inicio:
```ts
  await prisma.clientAccount.deleteMany();
  await prisma.russellOption.deleteMany();
```

- [ ] **Step 2: Sembrar `RussellOption` y `ClientAccount`**

En `seed.ts`, antes de `console.log("✅ Seed completo.")`, añadir:
```ts
  // ---- Catálogo de cuentas Russell (selector del mapeo) ----
  await prisma.russellOption.createMany({
    data: [
      { code: "1105", name: "Caja", module: "Caja" },
      { code: "1110", name: "Bancos", module: "Bancos" },
      { code: "1115", name: "Cuentas de ahorro", module: "Bancos" },
      { code: "1305", name: "Clientes", module: "Cartera" },
      { code: "1330", name: "Anticipos y avances", module: "Cartera" },
      { code: "1355", name: "Anticipos de impuestos", module: "DIAN" },
      { code: "1399", name: "Provisiones", module: "Cartera" },
      { code: "14", name: "Inventarios", module: "Inventarios" },
      { code: "15", name: "Propiedades, planta y equipo", module: "Activos fijos" },
      { code: "1592", name: "Depreciación acumulada", module: "Activos fijos" },
      { code: "21", name: "Obligaciones financieras", module: "Cuentas por pagar" },
      { code: "22", name: "Proveedores", module: "Cuentas por pagar" },
      { code: "23", name: "Cuentas por pagar", module: "Cuentas por pagar" },
      { code: "24", name: "Impuestos, gravámenes y tasas", module: "DIAN" },
      { code: "25", name: "Obligaciones laborales", module: "Nómina" },
      { code: "41", name: "Ingresos operacionales", module: "Ingresos" },
      { code: "51", name: "Operacionales de admón", module: null },
      { code: "52", name: "Operacionales de ventas", module: null },
    ],
  });

  // ---- PUC del cliente El Zarzal (árbol N4/N6/N8) ----
  const elZarzalTree: [string, number, string, string | null][] = [
    ["1105", 4, "Caja", "1105"], ["110505", 6, "Caja general", "1105"], ["11050501", 8, "Caja Bogotá", "1105"], ["11050502", 8, "Caja Medellín", "1105"], ["11050503", 8, "Caja Cali", "1105"], ["110510", 6, "Caja menor administración", "1105"], ["11051001", 8, "Caja menor — Recepción", "1105"], ["11051002", 8, "Caja menor — Logística", "1105"],
    ["1110", 4, "Bancos", "1110"], ["111005", 6, "Bancolombia", "1110"], ["11100501", 8, "Bancol. cta cte 4178-99201-32", "1110"], ["11100502", 8, "Bancol. cta cte 4178-99201-99", "1110"], ["111010", 6, "BBVA", "1110"], ["11101001", 8, "BBVA cta corriente 0013-0042-19", "1110"], ["111505", 6, "Davivienda — ahorros", "1115"], ["11150501", 8, "Davivienda 04200145887", "1115"],
    ["1305", 4, "Clientes", "1305"], ["130505", 6, "Clientes nacionales", "1305"], ["13050501", 8, "Grandes superficies", "1305"], ["13050502", 8, "Mayoristas", "1305"], ["13050503", 8, "Minoristas", "1305"], ["130510", 6, "Clientes exterior", "1305"], ["133005", 6, "Anticipos a proveedores", "1330"], ["139905", 6, "Provisión cartera deudora", "1399"],
    ["14", 4, "Inventarios", "14"], ["143505", 6, "Mercancías no fabricadas", "14"], ["14350501", 8, "Bodega principal", "14"], ["14350502", 8, "Bodega satélite norte", "14"], ["143510", 6, "Mercancías en tránsito", "14"], ["149905", 6, "Provisión obsolescencia", "14"],
    ["15", 4, "Propiedades, planta y equipo", "15"], ["152405", 6, "Equipo de oficina", "15"], ["152805", 6, "Equipo de cómputo", "15"], ["159205", 6, "Depreciación acum. equipo oficina", "1592"],
    ["21", 4, "Obligaciones financieras", "21"], ["210505", 6, "Bancos nacionales — CP", "21"], ["212010", 6, "Bancos nacionales — LP", "21"],
    ["22", 4, "Proveedores", "22"], ["220505", 6, "Proveedores nacionales", "22"], ["22050501", 8, "Materias primas", "22"], ["22050502", 8, "Servicios contratados", "22"], ["220510", 6, "Proveedores del exterior", "22"],
    ["24", 4, "Impuestos, gravámenes y tasas", "24"], ["240805", 6, "IVA generado", "24"], ["240810", 6, "IVA descontable", "24"], ["236501", 6, "Retención en la fuente", "24"],
    ["25", 4, "Obligaciones laborales", "25"], ["251005", 6, "Cesantías consolidadas", "25"], ["252005", 6, "Intereses sobre cesantías", "25"],
    ["4135", 4, "Ventas — comercio al por mayor", "41"], ["413505", 6, "Mercancía nacional", "41"], ["413510", 6, "Mercancía exportación", "41"],
    ["189965", 6, "Diversos — nuevo cliente", null],
  ];
  await prisma.clientAccount.createMany({
    data: elZarzalTree.map(([code, level, name, russell], i) => ({
      clientName: "El Zarzal S.A", code, level, name, russellCode: russell, order: i,
    })),
  });
```

- [ ] **Step 3: Re-sembrar y verificar**

Run: `npm run db:seed`
Expected: sin error. `ClientAccount` de El Zarzal = 53 filas; `RussellOption` = 18.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(db): sembrar RussellOption (18) y PUC de El Zarzal (53)"
```

---

## Task 2B.3: Server Actions de mapeo

**Files:** Create `src/app/actions/mapping.ts`

- [ ] **Step 1: Crear las acciones**

Create `src/app/actions/mapping.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { verifySession, getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";

export async function updateAccountMapping(formData: FormData): Promise<void> {
  await verifySession();
  const id = formData.get("id") as string;
  const russell = (formData.get("russell") as string) || null;
  if (!id) return;
  await prisma.clientAccount.update({ where: { id }, data: { russellCode: russell } });
  revalidatePath("/balance/mapeo");
}

// IA simulada: asigna a las cuentas sin mapear el RussellOption cuyo código sea
// el prefijo más largo del código de la cuenta (similitud por plan de cuentas).
export async function suggestMappingsAI(formData: FormData): Promise<void> {
  await verifySession();
  const clientName = formData.get("clientName") as string;
  if (!clientName) return;

  const [accounts, options] = await Promise.all([
    prisma.clientAccount.findMany({ where: { clientName, russellCode: null } }),
    prisma.russellOption.findMany(),
  ]);
  const codes = options.map((o) => o.code).sort((a, b) => b.length - a.length); // más largo primero

  let suggested = 0;
  for (const a of accounts) {
    const match = codes.find((c) => a.code.startsWith(c));
    if (match) {
      await prisma.clientAccount.update({ where: { id: a.id }, data: { russellCode: match } });
      suggested += 1;
    }
  }

  const user = await getCurrentUser();
  await logAudit({
    user: user?.name ?? "Sistema",
    action: "SUGIRIÓ MAPEO (IA)",
    entity: `Mapeo · ${clientName}`,
    detail: `${suggested} cuenta(s) mapeadas por similitud`,
  });
  revalidatePath("/balance/mapeo");
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
```bash
git add src/app/actions/mapping.ts
git commit -m "feat: Server Actions updateAccountMapping y suggestMappingsAI"
```

---

## Task 2B.4: `/balance/mapeo` — reescritura

**Files:** Modify `src/app/(app)/balance/mapeo/page.tsx`; Create `src/app/(app)/balance/mapeo/mapeo-client.tsx`

- [ ] **Step 1: Reescribir la página (server)**

Reemplazar **todo** `src/app/(app)/balance/mapeo/page.tsx` por:
```tsx
import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import MapeoClient, { type Account, type RussellOpt } from "./mapeo-client";

export default async function MapeoPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const sp = await searchParams;
  const balances = await prisma.balance.findMany({ select: { clientName: true }, distinct: ["clientName"], orderBy: { clientName: "asc" } });
  const clientNames = balances.map((b) => b.clientName);
  const cliente = sp.cliente && clientNames.includes(sp.cliente) ? sp.cliente : (clientNames.includes("El Zarzal S.A") ? "El Zarzal S.A" : clientNames[0] ?? "");

  const [accounts, options] = await Promise.all([
    prisma.clientAccount.findMany({ where: { clientName: cliente }, orderBy: { order: "asc" } }),
    prisma.russellOption.findMany({ orderBy: { code: "asc" } }),
  ]);

  const acc: Account[] = accounts.map((a) => ({ id: a.id, code: a.code, level: a.level, name: a.name, russellCode: a.russellCode }));
  const opts: RussellOpt[] = options.map((o) => ({ code: o.code, name: o.name, module: o.module }));

  return (
    <div>
      <PageHeader title="Mapeo plan estándar" subtitle="Parametrización de las cuentas del PUC del cliente (cuenta · subcuenta · auxiliar) contra el plan estándar de Russell Bedford y su módulo de conciliación." />
      <MapeoClient clientNames={clientNames} cliente={cliente} accounts={acc} options={opts} />
    </div>
  );
}
```

- [ ] **Step 2: Crear el componente client**

Create `src/app/(app)/balance/mapeo/mapeo-client.tsx`:
```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Card, Chip, StatCard, EmptyState } from "@/components/ui";
import { updateAccountMapping, suggestMappingsAI } from "@/app/actions/mapping";

export type Account = { id: string; code: string; level: number; name: string; russellCode: string | null };
export type RussellOpt = { code: string; name: string; module: string | null };

// Estado de parametrización por módulo (metadata demo; el conteo se deriva de los mapeos).
const MODULE_STATUS: Record<string, "ok" | "partial" | "missing"> = {
  "Caja": "ok", "Bancos": "ok", "Cartera": "partial", "Inventarios": "ok",
  "Activos fijos": "missing", "Cuentas por pagar": "ok", "DIAN": "partial",
  "Nómina": "missing", "Ingresos": "ok",
};
const STATE_LABEL: Record<string, { label: string; tone: "ok" | "warn" | "err" }> = {
  ok: { label: "Parametrizado", tone: "ok" },
  partial: { label: "Parametrizado parcial", tone: "warn" },
  missing: { label: "Sin parametrizar", tone: "err" },
};

export default function MapeoClient({
  clientNames, cliente, accounts, options,
}: {
  clientNames: string[]; cliente: string; accounts: Account[]; options: RussellOpt[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [level, setLevel] = useState<"all" | "4" | "6" | "8">("all");

  const optByCode = useMemo(() => new Map(options.map((o) => [o.code, o])), [options]);
  const stats = useMemo(() => ({
    total: accounts.length,
    n4: accounts.filter((a) => a.level === 4).length,
    n6: accounts.filter((a) => a.level === 6).length,
    n8: accounts.filter((a) => a.level === 8).length,
    mapped: accounts.filter((a) => a.russellCode).length,
  }), [accounts]);
  const modulesOk = Object.values(MODULE_STATUS).filter((s) => s === "ok").length;

  // Conteo por módulo derivado de los mapeos actuales
  const moduleCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of accounts) {
      const opt = a.russellCode ? optByCode.get(a.russellCode) : null;
      if (opt?.module) m[opt.module] = (m[opt.module] ?? 0) + 1;
    }
    return m;
  }, [accounts, optByCode]);

  const rows = accounts
    .filter((a) => level === "all" || a.level === Number(level))
    .filter((a) => !q || a.code.includes(q) || a.name.toLowerCase().includes(q.toLowerCase()));

  const coverage = stats.total > 0 ? Math.round((stats.mapped / stats.total) * 100) : 0;

  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Cliente</div>
          <div className="mt-1 text-[15px] font-semibold text-ink-900">{cliente}</div>
          <div className="mt-1 text-[12px] text-ink-500">PUC del cliente</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Cuentas del cliente</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-ink-900">{stats.total}</div>
          <div className="mt-1 flex gap-1.5">
            <Chip label={`N4 · ${stats.n4}`} tone="ink" /><Chip label={`N6 · ${stats.n6}`} tone="ink" /><Chip label={`N8 · ${stats.n8}`} tone="ink" />
          </div>
        </Card>
        <StatCard label="Parametrizadas" value={String(stats.mapped)} hint={`${coverage}% cobertura`} tone="ok" />
        <StatCard label="Módulos de conciliación" value={`${modulesOk}/9`} hint="Parametrizados para este cliente" tone="blue" />
      </div>

      {/* Leyenda 3 segmentos */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-ink-500">
        <span className="rounded-md bg-ink-50 px-2.5 py-1.5"><b className="text-ink-700">Cuenta del cliente</b> · PUC del ERP (N4/N6/N8)</span>
        <Icon name="chev-r" size={12} />
        <span className="rounded-md bg-ink-50 px-2.5 py-1.5"><b className="text-ink-700">Cuenta Russell</b> · selector contra el estándar</span>
        <Icon name="chev-r" size={12} />
        <span className="rounded-md bg-ink-50 px-2.5 py-1.5"><b className="text-ink-700">Conciliación</b> · módulo + estado</span>
      </div>

      {/* Tabla */}
      <Card className="mt-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
          <h2 className="text-[13px] font-semibold text-ink-800">Parametrización cuenta a cuenta</h2>
          <select
            value={cliente}
            onChange={(e) => router.push(`/balance/mapeo?cliente=${encodeURIComponent(e.target.value)}`)}
            className="rounded-md border border-ink-200 px-2 py-1 text-[12px] text-ink-700 outline-none"
          >
            {clientNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-ink-200 text-[11.5px]">
              {(["all", "4", "6", "8"] as const).map((l) => (
                <button key={l} onClick={() => setLevel(l)} className={`px-2.5 py-1 ${level === l ? "bg-navy-800 text-white" : "bg-white text-ink-600 hover:bg-ink-50"}`}>{l === "all" ? "Todos" : `N${l}`}</button>
              ))}
            </div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar por código o nombre…" className="rounded-md border border-ink-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-blue-400" />
            <form action={suggestMappingsAI}>
              <input type="hidden" name="clientName" value={cliente} />
              <button type="submit" className="inline-flex items-center gap-1.5 rounded-md border border-ai-100 bg-ai-100 px-2.5 py-1.5 text-[12px] font-semibold text-ai-700 hover:opacity-80">
                <Icon name="ai" size={13} /> Sugerencias IA
              </button>
            </form>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon="doc" title="Sin cuentas para este cliente" description="Este cliente no tiene un PUC cargado en el repositorio de mapeo." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                  <th className="px-3 py-2 font-semibold">Nivel</th>
                  <th className="px-3 py-2 font-semibold">Código</th>
                  <th className="px-3 py-2 font-semibold">Nombre cuenta (ERP)</th>
                  <th className="px-3 py-2 font-semibold">Cuenta Russell</th>
                  <th className="px-3 py-2 font-semibold">Módulo · estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const opt = a.russellCode ? optByCode.get(a.russellCode) : null;
                  const mod = opt?.module ?? null;
                  const st = mod ? MODULE_STATUS[mod] : null;
                  return (
                    <tr key={a.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                      <td className="px-3 py-2"><Chip label={`N${a.level}`} tone="ink" /></td>
                      <td className="px-3 py-2 font-mono text-ink-600" style={{ paddingLeft: a.level === 4 ? 12 : a.level === 6 ? 28 : 48 }}>{a.code}</td>
                      <td className="px-3 py-2 text-ink-800">{a.level !== 4 && <span className="mr-1 text-ink-300">└</span>}{a.name}</td>
                      <td className="px-3 py-2">
                        <form action={updateAccountMapping}>
                          <input type="hidden" name="id" value={a.id} />
                          <select name="russell" defaultValue={a.russellCode ?? ""} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="w-full rounded-md border border-ink-200 px-2 py-1 text-[12px] outline-none focus:border-blue-400">
                            <option value="">— Sin parametrizar —</option>
                            {options.map((o) => <option key={o.code} value={o.code}>{o.code} · {o.name}</option>)}
                          </select>
                        </form>
                      </td>
                      <td className="px-3 py-2">
                        {!a.russellCode ? <span className="italic text-ink-400">—</span>
                          : !mod ? <span className="text-ink-500">No participa en conciliaciones</span>
                          : <span className="inline-flex items-center gap-1.5"><Chip label={mod} tone="blue" /><Chip label={STATE_LABEL[st!].label} tone={STATE_LABEL[st!].tone} /></span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-ink-100 px-4 py-2.5 text-[11.5px] text-ink-500">
          <span>{rows.length} cuentas mostradas · {stats.mapped} parametrizadas de {stats.total}</span>
          <span>Última actualización: 08/Ene/2026 11:32 · Manuela Gutiérrez</span>
        </div>
      </Card>

      {/* Resumen por módulo */}
      <Card className="mt-4">
        <div className="border-b border-ink-100 px-4 py-3 text-[13px] font-semibold text-ink-800">Estado de parametrización por módulo</div>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
          {Object.entries(MODULE_STATUS).map(([mod, state]) => (
            <div key={mod} className="rounded-md border border-ink-150 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-ink-800">{mod}</span>
                <Chip label={STATE_LABEL[state].label} tone={STATE_LABEL[state].tone} />
              </div>
              <div className="mt-1 text-[11.5px] text-ink-500">{moduleCounts[mod] ?? 0} cuentas</div>
            </div>
          ))}
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
git add "src/app/(app)/balance/mapeo/page.tsx" "src/app/(app)/balance/mapeo/mapeo-client.tsx"
git commit -m "feat: /balance/mapeo con mapeo cuenta→Russell editable, filtros y resumen"
```

---

## Task 2B.5: Validación de cierre de Fase 2B

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
- `/balance/mapeo`: selector de cliente (El Zarzal por defecto), 4 KPIs (Cliente, Cuentas con pills N4/N6/N8, Parametrizadas % cobertura, Módulos X/9), leyenda 3 segmentos, tabla de 53 cuentas con select editable (muestra el russell mapeado), filtros por nivel + buscador, resumen por módulo (9 tarjetas con estado + conteo derivado).
- Cambiar el select de una cuenta persiste (recargar → se mantiene).
- "Sugerencias IA": mapea la cuenta sin parametrizar (189965 no tiene prefijo russell → queda sin mapear; las demás ya están mapeadas) y registra auditoría.
- Seleccionar otro cliente (sin PUC) muestra `EmptyState`.

- [ ] **Step 4: Commit final (si aplica)**

```bash
git add -A && git commit -m "chore: cierre y validación de Fase 2B" || echo "nada que commitear"
```

---

## Notas
- `russellCode` es FK lógica (no relacional) a `RussellOption.code`, coherente con el estilo del repo (Balance usa `clientName` string, no FK).
- El estado ok/partial/missing por módulo es metadata demo (constante); el **conteo** se deriva de los mapeos persistidos → el resumen reacciona a los cambios reales.
- "Sugerencias IA" = heurística determinista por prefijo de código (similitud de plan de cuentas), persistida y auditada. Sustituible por un LLM real después.
- Sin placeholders pendientes.
