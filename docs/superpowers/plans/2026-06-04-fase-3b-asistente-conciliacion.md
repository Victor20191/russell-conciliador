# Fase 3B · Asistente de nueva conciliación (`/conciliacion/nueva`) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el stub de `/conciliacion/nueva` por el asistente real del prototipo: selección de alcance (cliente·módulo·período·corte) → carga de muestra → mapeo de campos asistido por IA (con confianza) → mapeo de cuentas → confirmación → ejecución del cruce, que **persiste** una nueva conciliación con sus partidas, marca el módulo como parametrizado y registra auditoría, redirigiendo al detalle del cruce (Fase 3A).

**Architecture:** Página server que provee catálogos (clientes, módulos, campos estándar por módulo); un componente `"use client"` mantiene el estado del wizard (paso, selección, mapeos editables); la ejecución final es una Server Action (`executeReconciliation`) que escribe en Prisma, registra auditoría y `redirect()` al nuevo cruce. La carga de archivo y la inferencia IA se **simulan con datos demo** (constantes del prototipo) — la forma de los datos es la que consumiría un parser/LLM real, cableables después.

**Tech Stack:** Next.js 16, React 19, Prisma 7, PostgreSQL, Tailwind v4, TS.

**Reutiliza modelos de 3A** (Reconciliation + ReconciliationRow) y `ClientModule` — **no se crean tablas nuevas**.

**Restricción Next 16:** Server Actions con `"use server"`; `redirect` de `next/navigation` lanza (no usar con useActionState).

**Rama:** `finalizacion-lfm`. Reutiliza `PageHeader, Card, Chip, EmptyState` (`@/components/ui`), `Icon` (`@/components/icons`), `confidenceClass`, `fmt` (`@/lib/format`).

**Fuera de alcance (simulado/diferido):** parsing real de Excel (la "carga" muestra metadatos demo), inferencia IA real (datos demo), persistencia granular de FieldMapping/AccountMapping (el outcome persistido es la conciliación + el módulo configurado).

---

## Mapa de archivos

**Crear:**
- `src/components/stepper.tsx` — indicador de pasos (compartido).
- `src/app/(app)/conciliacion/nueva/nueva-client.tsx` — wizard (client).

**Modificar:**
- `src/app/actions/reconciliation.ts` — añadir `executeReconciliation`.
- `src/app/(app)/conciliacion/nueva/page.tsx` — reescribir (server: catálogos).

---

## Task 3B.1: Componente `Stepper`

**Files:** Create `src/components/stepper.tsx`

- [ ] **Step 1: Crear el componente**

Create `src/components/stepper.tsx`:
```tsx
import { Icon } from "@/components/icons";

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="mb-5 flex items-center gap-2">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${done ? "bg-ok-500 text-white" : active ? "bg-navy-700 text-white" : "bg-ink-150 text-ink-500"}`}>
              {done ? <Icon name="check" size={12} /> : i + 1}
            </div>
            <span className={`text-[12.5px] ${active ? "font-semibold text-ink-900" : "text-ink-500"}`}>{s}</span>
            {i < steps.length - 1 && <span className="mx-1 h-px w-8 bg-ink-200" />}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
```bash
git add src/components/stepper.tsx
git commit -m "feat: componente Stepper para asistentes"
```

---

## Task 3B.2: Server Action `executeReconciliation`

**Files:** Modify `src/app/actions/reconciliation.ts`

- [ ] **Step 1: Añadir la acción**

Al final de `src/app/actions/reconciliation.ts`, añadir el import de `redirect` (junto a los imports existentes) y la acción:
```ts
import { redirect } from "next/navigation";
```
```ts
// Partidas demo del cruce de Inventarios (mismas que el cruce de referencia).
const DEMO_CROSS_ROWS: [string, string, number, number, number, number][] = [
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

export async function executeReconciliation(formData: FormData): Promise<void> {
  await verifySession();
  const clientId = formData.get("clientId") as string;
  const moduleId = formData.get("moduleId") as string;
  const period = formData.get("period") as string;
  const cutoff = (formData.get("cutoff") as string) || "";
  if (!clientId || !moduleId || !period) return;

  const [client, mod, user] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId } }),
    prisma.module.findUnique({ where: { id: moduleId } }),
    getCurrentUser(),
  ]);
  if (!client || !mod) return;

  const n = await prisma.reconciliation.count();
  const id = `REC-2026-${5000 + n}`;
  const totalDiff = DEMO_CROSS_ROWS.reduce((s, r) => s + r[4], 0);
  const itemsDiff = DEMO_CROSS_ROWS.filter((r) => r[4] !== 0).length;

  await prisma.reconciliation.create({
    data: {
      id, clientName: client.name, clientId: client.id, module: mod.name, period,
      erp: client.erp, status: "REVIEW", diff: fmtSigned(totalDiff), items: itemsDiff,
      date: "hoy", owner: user?.name ?? "Auditor", cutoff, runAt: "hoy", runBy: user?.name ?? "Auditor",
      materiality: 2000000, lastActivity: "ahora",
      rows: { create: DEMO_CROSS_ROWS.map(([cuenta, desc, cont, modBal, diff, items], i) => ({ cuenta, desc, cont, mod: modBal, diff, items, order: i })) },
    },
  });

  // Marca el módulo del cliente como parametrizado
  await prisma.clientModule.upsert({
    where: { clientId_moduleId: { clientId, moduleId } },
    create: { clientId, moduleId, status: "configured" },
    update: { status: "configured" },
  });

  await logAudit({ user: user?.name ?? "Sistema", action: "EJECUTÓ", entity: `Cruce ${id}`, detail: `${mod.name} · ${client.name} · ${period}` });
  redirect(`/conciliacion/resultados/${id}`);
}

function fmtSigned(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$ ${Math.abs(n).toLocaleString("es-CO")}`;
}
```

> `getCurrentUser` y `logAudit` ya están importados al inicio del archivo (Fase 3A).

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
```bash
git add src/app/actions/reconciliation.ts
git commit -m "feat: Server Action executeReconciliation (crea cruce + parametriza módulo)"
```

---

## Task 3B.3: `/conciliacion/nueva` — el asistente

**Files:** Modify `src/app/(app)/conciliacion/nueva/page.tsx`; Create `src/app/(app)/conciliacion/nueva/nueva-client.tsx`

- [ ] **Step 1: Reescribir la página (server)**

Reemplazar **todo** `src/app/(app)/conciliacion/nueva/page.tsx` por:
```tsx
import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import NuevaClient, { type ClientOpt, type ModuleOpt, type StdField } from "./nueva-client";

export default async function NuevaConciliacionPage() {
  const [clients, modules, fields] = await Promise.all([
    prisma.client.findMany({ orderBy: { name: "asc" }, include: { modules: true } }),
    prisma.module.findMany({ orderBy: { name: "asc" } }),
    prisma.moduleField.findMany({ orderBy: { order: "asc" } }),
  ]);

  const clientOpts: ClientOpt[] = clients.map((c) => ({
    id: c.id, name: c.name, nit: c.nit, erp: c.erp, sector: c.sector,
    configured: c.modules.filter((m) => m.status === "configured").map((m) => m.moduleId),
  }));
  const moduleOpts: ModuleOpt[] = modules.map((m) => ({ id: m.id, name: m.name, icon: m.icon }));
  const fieldsByModule: Record<string, StdField[]> = {};
  for (const f of fields) {
    (fieldsByModule[f.moduleId] ??= []).push({ key: f.key, label: f.label, type: f.type, required: f.required });
  }

  return (
    <div>
      <PageHeader title="Nueva conciliación" subtitle="Asistente de parametrización y ejecución de un nuevo cruce contable vs. auxiliar." />
      <NuevaClient clients={clientOpts} modules={moduleOpts} fieldsByModule={fieldsByModule} />
    </div>
  );
}
```

- [ ] **Step 2: Crear el wizard (client)**

Create `src/app/(app)/conciliacion/nueva/nueva-client.tsx`:
```tsx
"use client";

import { useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Card, Chip, EmptyState } from "@/components/ui";
import { Stepper } from "@/components/stepper";
import { confidenceClass } from "@/lib/format";
import { executeReconciliation } from "@/app/actions/reconciliation";

export type ClientOpt = { id: string; name: string; nit: string; erp: string; sector: string; configured: string[] };
export type ModuleOpt = { id: string; name: string; icon: string };
export type StdField = { key: string; label: string; type: string; required: boolean };

// IA simulada — columnas del archivo del cliente y su inferencia.
const FILE_COLUMNS = [
  { src: "COD_CTA", sample: "143505", inferred: "cuenta", confidence: 0.98, ai: "Coincide patrón de código contable PUC (6 dígitos)." },
  { src: "NOMBRE_CUENTA", sample: "Mercancías no fabricadas", inferred: "descripcion_cuenta", confidence: 0.96, ai: "Texto de longitud variable asociado al campo cuenta." },
  { src: "REF_ITEM", sample: "INV-44-A102", inferred: "codigo_item", confidence: 0.94, ai: "SKU alfanumérico. Prefijo + código." },
  { src: "DESC_PRODUCTO", sample: "Tornillo hexagonal 1/2''", inferred: "descripcion_item", confidence: 0.97, ai: "Texto descriptivo de producto." },
  { src: "UM", sample: "UND", inferred: "unidad", confidence: 0.99, ai: "Valores cortos (UND, KG, MT)." },
  { src: "EXISTENCIA", sample: "1.250,00", inferred: "cantidad", confidence: 0.93, ai: "Numérico positivo. Afín a cantidad/stock." },
  { src: "VR_UNIT", sample: "$ 14.250", inferred: "costo_unitario", confidence: 0.91, ai: "Numérico con símbolo monetario." },
  { src: "VR_TOTAL", sample: "$ 17.812.500", inferred: "valor_total", confidence: 0.95, ai: "Producto cantidad × costo en muestreo." },
  { src: "CENTRO", sample: "BOD-01 NORTE", inferred: "bodega", confidence: 0.72, ai: "Candidatos: 'bodega' o 'centro de costo'. Revisar." },
  { src: "FCH_REPORTE", sample: "31/03/2026", inferred: "fecha_corte", confidence: 0.99, ai: "Patrón de fecha DD/MM/YYYY constante." },
  { src: "USUARIO_REPORTE", sample: "siesauser01", inferred: "", confidence: 0.3, ai: "Sin coincidencia. Recomienda omitir." },
  { src: "OBSERVACIONES", sample: "—", inferred: "", confidence: 0.2, ai: "Mayoría de filas vacías. Recomienda omitir." },
];
const ACCOUNT_MAPPINGS = [
  { src: "143505", desc: "Mercancías no fabricadas por la empresa", std: "143505", confidence: 0.99, status: "auto" },
  { src: "143510", desc: "Materias primas", std: "143510", confidence: 0.99, status: "auto" },
  { src: "143515", desc: "Productos en proceso", std: "143515", confidence: 0.97, status: "auto" },
  { src: "143520", desc: "Materiales, repuestos y accesorios", std: "143520", confidence: 0.94, status: "auto" },
  { src: "INV-PT", desc: "Producto terminado (interno)", std: "143524", confidence: 0.78, status: "review", note: "Código no estándar — reasignado por similitud." },
  { src: "143530", desc: "Inv. envases y empaques", std: "143530", confidence: 0.92, status: "auto" },
  { src: "143599", desc: "Otros inventarios", std: "143599", confidence: 0.88, status: "auto" },
  { src: "INV-OBSOL", desc: "Obsoletos pendientes baja", std: "", confidence: 0.32, status: "unmapped", note: "No existe equivalencia directa." },
];
const STEPS = ["Archivo", "Campos", "Cuentas", "Confirmar"];

export default function NuevaClient({
  clients, modules, fieldsByModule,
}: {
  clients: ClientOpt[]; modules: ModuleOpt[]; fieldsByModule: Record<string, StdField[]>;
}) {
  const [phase, setPhase] = useState<"scope" | "wizard">("scope");
  const [step, setStep] = useState(0);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [moduleId, setModuleId] = useState("INV");
  const [period, setPeriod] = useState("2026-03");
  const [cutoff, setCutoff] = useState("2026-03-31");

  const client = clients.find((c) => c.id === clientId);
  const mod = modules.find((m) => m.id === moduleId);
  const fields = fieldsByModule[moduleId] ?? [];
  const isConfigured = client?.configured.includes(moduleId) ?? false;

  if (phase === "scope") {
    return (
      <ScopeStep
        clients={clients} modules={modules} clientId={clientId} setClientId={setClientId}
        moduleId={moduleId} setModuleId={setModuleId} period={period} setPeriod={setPeriod}
        cutoff={cutoff} setCutoff={setCutoff} isConfigured={isConfigured}
        onContinue={() => { setStep(0); setPhase("wizard"); }}
      />
    );
  }

  return (
    <div>
      <button onClick={() => setPhase("scope")} className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-blue-500 hover:underline">
        <Icon name="chev-l" size={13} /> Cambiar alcance
      </button>
      <Stepper steps={STEPS} current={step} />
      <div className="mb-3 text-[12.5px] text-ink-500">
        <b className="text-ink-800">{client?.name}</b> · {mod?.name} · {period} · corte {cutoff}
      </div>

      {step === 0 && <FileStep fields={fields} onNext={() => setStep(1)} />}
      {step === 1 && <FieldsStep fields={fields} onBack={() => setStep(0)} onNext={() => setStep(2)} />}
      {step === 2 && <AccountsStep onBack={() => setStep(1)} onNext={() => setStep(3)} />}
      {step === 3 && <ConfirmStep clientId={clientId} moduleId={moduleId} period={period} cutoff={cutoff} clientName={client?.name ?? ""} moduleName={mod?.name ?? ""} onBack={() => setStep(2)} />}
    </div>
  );
}

function ScopeStep({
  clients, modules, clientId, setClientId, moduleId, setModuleId, period, setPeriod, cutoff, setCutoff, isConfigured, onContinue,
}: {
  clients: ClientOpt[]; modules: ModuleOpt[]; clientId: string; setClientId: (v: string) => void;
  moduleId: string; setModuleId: (v: string) => void; period: string; setPeriod: (v: string) => void;
  cutoff: string; setCutoff: (v: string) => void; isConfigured: boolean; onContinue: () => void;
}) {
  const client = clients.find((c) => c.id === clientId);
  return (
    <Card className="p-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-ink-600">Cliente</span>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400">
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.nit} — {c.erp}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-ink-600">Período a conciliar</span>
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-ink-600">Fecha de corte</span>
          <input type="date" value={cutoff} onChange={(e) => setCutoff(e.target.value)} className="rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400" />
        </label>
      </div>

      {client && <div className="mt-2 text-[12px] text-ink-500">Sector: {client.sector} · {client.configured.length}/6 módulos parametrizados</div>}

      <div className="mt-4 text-[11.5px] font-medium text-ink-600">Módulo a conciliar</div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {modules.map((m) => {
          const on = m.id === moduleId;
          const conf = client?.configured.includes(m.id) ?? false;
          return (
            <button key={m.id} onClick={() => setModuleId(m.id)} className={`flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left ${on ? "border-blue-400 bg-blue-50" : "border-ink-150 hover:bg-ink-50"}`}>
              <Icon name={m.icon as IconName} size={18} />
              <div>
                <div className="text-[12.5px] font-semibold text-ink-800">{m.name}</div>
                <div className={`text-[11px] ${conf ? "text-ok-700" : "text-warn-700"}`}>● {conf ? "Parametrizado" : "Sin parametrizar"}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className={`mt-4 rounded-md px-3 py-2 text-[12px] ${isConfigured ? "bg-ok-100 text-ok-700" : "bg-warn-100 text-warn-700"}`}>
        {isConfigured ? "Este módulo ya está parametrizado: el asistente confirmará el mapeo antes de ejecutar." : "Este módulo no está parametrizado: el asistente te guiará para mapear campos y cuentas."}
      </div>

      <div className="mt-4 flex justify-end">
        <button onClick={onContinue} className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600">
          Continuar <Icon name="chev-r" size={14} />
        </button>
      </div>
    </Card>
  );
}

function FileStep({ fields, onNext }: { fields: StdField[]; onNext: () => void }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <Card className="p-5">
      {!loaded ? (
        <button onClick={() => setLoaded(true)} className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-ink-200 py-10 text-ink-400 hover:border-blue-400 hover:text-blue-500">
          <Icon name="upload" size={28} />
          <span className="text-[13px] font-medium">Cargar archivo de muestra (Excel/CSV)</span>
          <span className="text-[11.5px]">Click para simular la carga del archivo del ERP</span>
        </button>
      ) : (
        <div className="flex items-center gap-3 rounded-md border border-ink-150 bg-ink-50 px-4 py-3">
          <Icon name="doc" size={20} />
          <div className="flex-1">
            <div className="text-[12.5px] font-semibold text-ink-800">INV_PACIFICO_MAR2026.xlsx</div>
            <div className="text-[11.5px] text-ink-500">4.821 filas · 12 columnas · 1,4 MB</div>
          </div>
          <Chip label="Leído correctamente" tone="ok" />
        </div>
      )}

      {loaded && (
        <>
          <div className="mt-4 rounded-md bg-ai-100 px-3 py-2 text-[12px] text-ai-700"><Icon name="ai" size={13} className="mr-1 inline" /> Detectamos 10 de 10 campos requeridos. 2 columnas adicionales sin información estándar.</div>
          <div className="mt-4 text-[12px] font-semibold text-ink-700">Campos mínimos requeridos · módulo</div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500"><th className="px-3 py-1.5 font-semibold">Clave</th><th className="px-3 py-1.5 font-semibold">Etiqueta</th><th className="px-3 py-1.5 font-semibold">Tipo</th><th className="px-3 py-1.5 font-semibold">Requerido</th></tr></thead>
              <tbody>
                {fields.map((f) => (
                  <tr key={f.key} className="border-b border-ink-50 last:border-0"><td className="px-3 py-1.5 font-mono text-ink-600">{f.key}</td><td className="px-3 py-1.5 text-ink-800">{f.label}</td><td className="px-3 py-1.5"><Chip label={f.type} tone="ink" /></td><td className="px-3 py-1.5">{f.required ? <Chip label="Sí" tone="err" /> : <Chip label="No" tone="ink" />}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end"><button onClick={onNext} className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600">Continuar a mapeo de campos <Icon name="chev-r" size={14} /></button></div>
        </>
      )}
    </Card>
  );
}

function FieldsStep({ fields, onBack, onNext }: { fields: StdField[]; onBack: () => void; onNext: () => void }) {
  const [map, setMap] = useState<Record<string, string>>(() => Object.fromEntries(FILE_COLUMNS.map((c) => [c.src, c.inferred])));
  const requiredKeys = fields.filter((f) => f.required).map((f) => f.key);
  const coveredKeys = new Set(Object.values(map).filter(Boolean));
  const missing = requiredKeys.filter((k) => !coveredKeys.has(k));

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
        <h2 className="text-[13px] font-semibold text-ink-800">Mapeo de campos asistido por IA</h2>
        <Chip label="claude-haiku-4.5" tone="ai" />
        <span className="ml-auto text-[11.5px] text-ink-500">12 columnas detectadas</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500"><th className="px-3 py-2 font-semibold">Columna archivo</th><th className="px-3 py-2 font-semibold">Muestra</th><th className="px-3 py-2 font-semibold">Campo estándar</th><th className="px-3 py-2 font-semibold">Confianza</th><th className="px-3 py-2 font-semibold">Justificación IA</th></tr></thead>
          <tbody>
            {FILE_COLUMNS.map((c) => {
              const tone = confidenceClass(c.confidence);
              return (
                <tr key={c.src} className="border-b border-ink-50 last:border-0">
                  <td className="px-3 py-2 font-mono text-ink-700">{c.src}</td>
                  <td className="px-3 py-2 text-ink-500">{c.sample}</td>
                  <td className="px-3 py-2">
                    <select value={map[c.src] ?? ""} onChange={(e) => setMap((m) => ({ ...m, [c.src]: e.target.value }))} className="rounded-md border border-ink-200 px-2 py-1 text-[12px] outline-none focus:border-blue-400">
                      <option value="">— Ignorar —</option>
                      {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2"><span className={`inline-block rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${tone === "ok" ? "bg-ok-100 text-ok-700" : tone === "warn" ? "bg-warn-100 text-warn-700" : "bg-err-100 text-err-700"}`}>{Math.round(c.confidence * 100)}%</span></td>
                  <td className="px-3 py-2 text-[11.5px] text-ink-500">{c.ai}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={`mx-4 my-3 rounded-md px-3 py-2 text-[12px] ${missing.length === 0 ? "bg-ok-100 text-ok-700" : "bg-err-100 text-err-700"}`}>
        {missing.length === 0 ? "Todos los campos requeridos están cubiertos." : `Faltan ${missing.length} campo(s) requerido(s): ${missing.join(", ")}`}
      </div>
      <div className="flex justify-between border-t border-ink-100 px-4 py-3">
        <button onClick={onBack} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] text-ink-600 hover:bg-ink-50">Atrás</button>
        <button onClick={onNext} disabled={missing.length > 0} className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-50">Continuar a cuentas <Icon name="chev-r" size={14} /></button>
      </div>
    </Card>
  );
}

function AccountsStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [filter, setFilter] = useState<"all" | "auto" | "review" | "unmapped">("all");
  const counts = { all: ACCOUNT_MAPPINGS.length, auto: ACCOUNT_MAPPINGS.filter((a) => a.status === "auto").length, review: ACCOUNT_MAPPINGS.filter((a) => a.status === "review").length, unmapped: ACCOUNT_MAPPINGS.filter((a) => a.status === "unmapped").length };
  const rows = ACCOUNT_MAPPINGS.filter((a) => filter === "all" || a.status === filter);
  const statusChipTone = (s: string) => (s === "auto" ? "ok" : s === "review" ? "warn" : "err") as "ok" | "warn" | "err";
  const statusLabel = (s: string) => (s === "auto" ? "Auto" : s === "review" ? "Revisar" : "Sin mapeo");

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
        <h2 className="text-[13px] font-semibold text-ink-800">Mapeo de cuentas</h2>
        <Chip label="IA por similitud semántica" tone="ai" />
        <div className="ml-auto flex gap-1.5">
          {(["all", "auto", "review", "unmapped"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${filter === f ? "bg-navy-800 text-white" : "bg-ink-100 text-ink-600"}`}>{f === "all" ? "Todas" : f === "auto" ? "Auto" : f === "review" ? "Revisar" : "Sin mapeo"} {counts[f]}</button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500"><th className="px-3 py-2 font-semibold">Cuenta cliente</th><th className="px-3 py-2 font-semibold"></th><th className="px-3 py-2 font-semibold">Cuenta estándar</th><th className="px-3 py-2 font-semibold">Confianza</th><th className="px-3 py-2 font-semibold">Estado</th><th className="px-3 py-2 font-semibold">Nota IA</th></tr></thead>
          <tbody>
            {rows.map((a) => {
              const tone = confidenceClass(a.confidence);
              return (
                <tr key={a.src} className="border-b border-ink-50 last:border-0">
                  <td className="px-3 py-2"><div className="font-mono text-ink-700">{a.src}</div><div className="text-[11px] text-ink-500">{a.desc}</div></td>
                  <td className="px-3 py-2 text-ink-300"><Icon name="chev-r" size={14} /></td>
                  <td className="px-3 py-2 font-mono text-ink-700">{a.std || <span className="italic text-ink-400">crear auxiliar…</span>}</td>
                  <td className="px-3 py-2"><span className={`inline-block rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${tone === "ok" ? "bg-ok-100 text-ok-700" : tone === "warn" ? "bg-warn-100 text-warn-700" : "bg-err-100 text-err-700"}`}>{Math.round(a.confidence * 100)}%</span></td>
                  <td className="px-3 py-2"><Chip label={statusLabel(a.status)} tone={statusChipTone(a.status)} /></td>
                  <td className="px-3 py-2 text-[11.5px] text-ink-500">{a.note ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {counts.unmapped > 0 && <div className="mx-4 my-3 rounded-md bg-warn-100 px-3 py-2 text-[12px] text-warn-700">{counts.unmapped} cuenta(s) sin mapeo — se podrán crear como auxiliares antes de ejecutar.</div>}
      <div className="flex justify-between border-t border-ink-100 px-4 py-3">
        <button onClick={onBack} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] text-ink-600 hover:bg-ink-50">Atrás</button>
        <button onClick={onNext} className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600">Continuar a confirmación <Icon name="chev-r" size={14} /></button>
      </div>
    </Card>
  );
}

function ConfirmStep({
  clientId, moduleId, period, cutoff, clientName, moduleName, onBack,
}: {
  clientId: string; moduleId: string; period: string; cutoff: string; clientName: string; moduleName: string; onBack: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Card className="p-5 lg:col-span-2">
        <h2 className="text-[13px] font-semibold text-ink-800">Resumen de la parametrización</h2>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2.5 text-[12.5px]">
          <KV label="Cliente" value={clientName} />
          <KV label="Módulo" value={moduleName} />
          <KV label="Período" value={period} />
          <KV label="Corte" value={cutoff} />
          <KV label="Campos" value="10 de 10 requeridos" />
          <KV label="Cuentas" value="6 auto · 1 revisada · 1 sin mapeo" />
        </div>
        <div className="mt-4 rounded-md bg-ai-100 px-3 py-2 text-[12px] text-ai-700"><Icon name="ai" size={13} className="mr-1 inline" /> Al ejecutar se convertirá el archivo al estándar, se validará y se cruzará contra el balance contable.</div>
      </Card>
      <Card className="p-5">
        <h3 className="text-[12.5px] font-semibold text-ink-800">Próximo paso</h3>
        <ul className="mt-2 space-y-1.5 text-[12px] text-ink-600">
          <li className="flex items-center gap-2"><Icon name="check" size={12} className="text-ok-500" /> Conversión al plan estándar</li>
          <li className="flex items-center gap-2"><Icon name="check" size={12} className="text-ok-500" /> Validación de integridad</li>
          <li className="flex items-center gap-2"><Icon name="check" size={12} className="text-ok-500" /> Cruce contable vs. auxiliar</li>
          <li className="flex items-center gap-2"><Icon name="check" size={12} className="text-ok-500" /> Resumen de partidas</li>
        </ul>
        <form action={executeReconciliation} className="mt-4">
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="moduleId" value={moduleId} />
          <input type="hidden" name="period" value={period} />
          <input type="hidden" name="cutoff" value={cutoff} />
          <button type="submit" className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-navy-700 px-4 py-2.5 text-[12.5px] font-semibold text-white hover:bg-navy-600"><Icon name="play" size={14} /> Guardar y ejecutar cargue</button>
        </form>
        <button onClick={onBack} className="mt-2 w-full rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] text-ink-600 hover:bg-ink-50">Atrás</button>
      </Card>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10.5px] uppercase tracking-wider text-ink-400">{label}</div><div className="mt-0.5 text-ink-800">{value}</div></div>;
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/conciliacion/nueva/page.tsx" "src/app/(app)/conciliacion/nueva/nueva-client.tsx"
git commit -m "feat: asistente de nueva conciliación (5 pasos) con ejecución que persiste el cruce"
```

---

## Task 3B.4: Validación de cierre de Fase 3B

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
- `/conciliacion/nueva`: paso de alcance (selector cliente, grid de módulos con estado, período/corte, callout configurado/no). "Continuar" entra al Stepper.
- Paso Archivo: click en dropzone simula carga → ficha de archivo + callout IA + tabla de 10 campos requeridos.
- Paso Campos: 12 columnas con selects editables, barras de confianza (%), justificación IA; callout "todos cubiertos" (verde). Si se ignora un requerido → callout rojo y "Continuar" deshabilitado.
- Paso Cuentas: 8 mapeos con filtros chip (Todas 8/Auto 6/Revisar 1/Sin mapeo 1), confianza, estado, nota IA.
- Paso Confirmar: resumen + "Guardar y ejecutar cargue" → **crea una nueva conciliación**, marca el módulo configurado y **redirige al detalle del cruce** (`/conciliacion/resultados/REC-2026-xxxx`) con las 9 partidas.

- [ ] **Step 4: Commit final (si aplica)**

```bash
git add -A && git commit -m "chore: cierre y validación de Fase 3B" || echo "nada que commitear"
```

---

## Notas
- **Sin modelos nuevos:** reutiliza `Reconciliation`/`ReconciliationRow` (3A) y `ClientModule`.
- **Outcome persistido real:** la ejecución crea la conciliación + sus 9 partidas, marca `ClientModule` como `configured` y audita; redirige al detalle (3A).
- **Simulado/documentado:** carga de archivo (click simula), inferencia IA (datos demo con la forma final), datos del cruce (partidas demo de Inventarios). El mapeo editable de campos/cuentas es estado del wizard (no se persiste granularmente; el resultado sí).
- **Stepper** queda como componente compartido (lo usará Razonabilidad en Fase 4).
- Sin placeholders pendientes.
