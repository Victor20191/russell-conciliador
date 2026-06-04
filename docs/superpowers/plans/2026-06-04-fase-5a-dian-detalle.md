# Fase 5A · Impuestos · DIAN — detalle del cruce — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax para tracking.

**Goal:** Convertir `/dian` (hoy una grilla mínima de formatos) en el módulo real: índice de formatos con períodos clickeables y un **detalle del cruce** (`/dian/[periodId]`) con banner objetivo/conclusión, 4 KPIs, índice de secciones, tabla de renglones (declarado/contabilidad/diferencia/estado), panel del renglón con cuentas mapeadas + comentarios (persistentes) + análisis IA simulado, y un toggle Período/Consolidado anual.

**Architecture:** Server Components leen Prisma; el detalle delega su interactividad (sección activa, renglón seleccionado, tab anual) a un componente `"use client"`; comentar y pedir análisis IA son Server Actions. El consolidado anual usa valores sintéticos deterministas (igual que el prototipo).

**Modelo de datos (refinamiento sobre el spec maestro):** `DianSection`, `DianLine` (con `decl/cont/diff` como **Float** — los montos superan el INTEGER de Postgres), `DianMapping`, `DianComment`, y se extiende `DianForm` con `objective`/`conclusion`. **No se crea `DianLineValue`**: los valores reales son por renglón del período de referencia; el consolidado anual es sintético.

**Tech Stack:** Next.js 16, Prisma 7, PostgreSQL, Tailwind v4, TS.

**Restricción Next 16:** `params` es `Promise`. Server Actions con `"use server"`.

**Rama:** `finalizacion-lfm`. Reutiliza `PageHeader, Card, Chip, BackLink, EmptyState` (`@/components/ui`), `Icon` (`@/components/icons`), `fmt`, `fmtCompact`, `logAudit`.

**Fuera de alcance (5B / diferido):** `/config/dian` y el modal `MappingEditor` (Fase 5B); carga real de archivos DIAN (diferida); el panel muestra cuentas mapeadas en solo lectura.

---

## Mapa de archivos

**Crear:**
- `src/app/actions/dian.ts` — `addDianComment`, `requestDianAiAnalysis`.
- `src/app/(app)/dian/[periodId]/page.tsx` — server del detalle.
- `src/app/(app)/dian/[periodId]/dian-detail-client.tsx` — UI client del detalle.

**Modificar:**
- `prisma/schema.prisma` — `DianSection`, `DianLine`, `DianMapping`, `DianComment`; extender `DianForm`.
- `prisma/seed.ts` — secciones/renglones IVA + Retefuente + mapeos + comentarios + conclusiones.
- `src/app/(app)/dian/page.tsx` — índice con períodos clickeables.

---

## Task 5A.1: Esquema DIAN

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: Extender `DianForm`**

En `model DianForm`, añadir (junto a los campos existentes y la relación `periods`):
```prisma
  objective String?
  conclusion String?
  sections  DianSection[]
  mappings  DianMapping[]
  comments  DianComment[]
```

- [ ] **Step 2: Añadir los modelos nuevos**

Después de `model DianPeriod`, añadir:
```prisma
model DianSection {
  id     String     @id @default(cuid())
  form   DianForm   @relation(fields: [formId], references: [id], onDelete: Cascade)
  formId String
  title  String
  side   String     @default("L") // L | R (lado visual)
  note   String?
  order  Int        @default(0)
  lines  DianLine[]
}

model DianLine {
  id        String      @id @default(cuid())
  section   DianSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  sectionId String
  k         String // casilla: GEN-19, DES-CBG...
  label     String
  decl      Float       @default(0)
  cont      Float       @default(0)
  diff      Float       @default(0)
  order     Int         @default(0)
}

model DianMapping {
  id      String   @id @default(cuid())
  form    DianForm @relation(fields: [formId], references: [id], onDelete: Cascade)
  formId  String
  lineKey String // k del renglón
  account String
  desc    String
  sign    String // + | -
  order   Int      @default(0)
}

model DianComment {
  id        String   @id @default(cuid())
  form      DianForm @relation(fields: [formId], references: [id], onDelete: Cascade)
  formId    String
  lineKey   String
  who       String
  initials  String
  text      String
  time      String
  isAI      Boolean  @default(false)
  createdAt DateTime @default(now())
}
```

- [ ] **Step 3: Migración**

Run:
```bash
npx prisma migrate dev --name dian_sections_lines && npx prisma generate
```
Expected: aplicada; migrate status up to date.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): modelos DianSection/Line/Mapping/Comment + conclusión en DianForm"
```

---

## Task 5A.2: Seed DIAN (IVA + Retefuente)

**Files:** Modify `prisma/seed.ts`

- [ ] **Step 1: Limpieza idempotente**

En el bloque de limpieza, **antes** de `await prisma.dianPeriod.deleteMany();`, añadir:
```ts
  await prisma.dianComment.deleteMany();
  await prisma.dianMapping.deleteMany();
  await prisma.dianLine.deleteMany();
  await prisma.dianSection.deleteMany();
```

- [ ] **Step 2: Añadir objetivo/conclusión a los formatos**

En el bucle que crea los formatos DIAN (`for (const f of forms) { await prisma.dianForm.create(...) }`), el objeto `forms` no tiene objetivo/conclusión. Tras ese bucle, añadir las conclusiones a IVA y Retefuente:
```ts
  const dianObjective = "Validar que las declaraciones del año fueron presentadas y pagadas oportunamente, y que las cifras declaradas crucen con las cifras contables al cierre.";
  await prisma.dianForm.update({ where: { id: "IVA" }, data: { objective: dianObjective, conclusion: "Se evidencian diferencias en el IVA descontable de $795.709 y diferencias menores no materiales en otros renglones. Las diferencias en ingresos están explicadas por devoluciones y refacturación de septiembre." } });
  await prisma.dianForm.update({ where: { id: "RETEFUENTE" }, data: { objective: dianObjective, conclusion: "No se evidencian diferencias materiales entre los valores declarados en retención en la fuente vs. contabilidad. Diferencias menores explicadas por redondeo." } });
```

- [ ] **Step 3: Sembrar secciones, renglones, mapeos y comentarios**

Antes de `console.log("✅ Seed completo.")`, añadir:
```ts
  // ---- Secciones y renglones IVA (Bimestre 5) ----
  type LineT = [string, string, number, number, number]; // k, label, decl, cont, diff
  const ivaSections: { id: string; title: string; side: string; note?: string; lines: LineT[] }[] = [
    { id: "GEN", title: "Impuesto generado", side: "L", lines: [
      ["GEN-5", "A la tarifa del 5%", 1050000, 1050000, 0],
      ["GEN-19", "A la tarifa general", 20469000, 20468700, 300],
      ["GEN-AIU", "Sobre A.I.U. en operaciones gravadas", 0, 0, 0],
      ["GEN-JUE", "En juegos de suerte y azar", 0, 0, 0],
      ["GEN-CER", "En venta de cerveza nacional o importada", 0, 0, 0],
      ["GEN-LIC", "En venta de licores, aperitivos, vinos y similares", 0, 0, 0],
      ["GEN-RIN", "En retiro de inventario para activos fijos, consumo o donaciones", 0, 0, 0],
      ["GEN-DEV", "IVA recuperado en devoluciones en compras anuladas o resueltas", 16138000, 16138543.9, -543.9],
    ] },
    { id: "DESC", title: "Impuesto descontable", side: "R", note: "Prorrateo de la DIAN que no registra en el mismo NIT", lines: [
      ["DES-IM5", "Por importaciones gravadas a la tarifa del 5%", 1520000, 1606737, -86737],
      ["DES-IMG", "Por importaciones gravadas a la tarifa general", 12783000, 13135915, -352915],
      ["DES-ZF", "De bienes y servicios gravados provenientes de Zomac", 0, 0, 0],
      ["DES-CB5", "Por compra de bienes gravados a la tarifa del 5%", 1244900000, 1245056428, -156428],
      ["DES-CBG", "Por compra de bienes gravados a la tarifa general", 1314520000, 1314669595, -149595],
      ["DES-CS5", "Por servicios gravados a la tarifa del 5%", 0, 0, 0],
      ["DES-CSG", "Por servicios gravados a la tarifa general", 185532000, 185582283, -50283],
      ["DES-EXP", "Descuento IVA explotación hidrocarburos Art 485-2 ET", 0, 0, 0],
      ["DES-NRE", "IVA retenido por servicios de no domiciliados ni residentes", 0, 0, 0],
      ["DES-DEV", "IVA resultante por devoluciones en ventas anuladas", 1183000, 1182750, 250],
      ["DES-AJU", "Menor: Ajuste impuestos descontables (pérdidas, hurto, castigo)", 0, 0, 0],
    ] },
    { id: "RET", title: "Retención de IVA", side: "R", lines: [
      ["RET-PRA", "Retenciones por IVA que le practicaron", 2892000, 2892893, -893],
    ] },
    { id: "ING", title: "Ingresos", side: "L", lines: [
      ["ING-G5", "Por operaciones gravadas al 5%", 21000000, 34500000, -13500000],
      ["ING-GG", "Por operaciones gravadas a la tarifa general", 107730000, 107730000, 0],
      ["ING-AIU", "A.I.U. por operaciones gravadas", 0, 0, 0],
      ["ING-EXB", "Por exportación de bienes", 0, 0, 0],
      ["ING-EXS", "Por exportación de servicios", 0, 0, 0],
      ["ING-COM", "Por venta a sociedades de comercialización internacional", 0, 0, 0],
      ["ING-ZF", "Por venta a zona franca", 0, 0, 0],
      ["ING-JUE", "Por juegos de suerte y azar", 0, 0, 0],
      ["ING-EXC", "Por venta exenta (Arts. 477, 478 y 481 del E.T.)", 89520619000, 89520618327, 673],
      ["ING-CER", "Por venta de cerveza nacional o importada", 0, 0, 0],
      ["ING-LIC", "Por venta de licores, aperitivos, vinos y similares", 1755162000, 1741662027, 13499973],
      ["ING-EXC2", "Por operaciones excluidas", 2753163000, 2753155544, 7456],
      ["ING-BRU", "Total ingresos brutos", 94257194000, 94257665898, -3949],
      ["ING-NET", "Total ingresos netos recibidos durante el período", 74085031000, 74085502236, -3711],
    ] },
  ];

  const reteSections: { id: string; title: string; side: string; lines: LineT[] }[] = [
    { id: "RTA", title: "A título de renta y complementarios", side: "L", lines: [
      ["R-TRAB", "Rentas de trabajo", 28003000, 28002944, 56],
      ["R-HON", "Honorarios", 32850000, 32843821, 6179],
      ["R-SER", "Servicios", 42147000, 42145796, 1204],
      ["R-RFI", "Rendimientos financieros", 5443000, 5445160, -3160],
      ["R-ARR", "Arrendamientos (muebles e inmuebles)", 1235000, 1236726, -1726],
      ["R-COMP", "Compras", 177533000, 177533438.83, -438.83],
      ["R-EXO", "Contribuyentes exonerados de aportes (art 114-1 E.T.)", 678684000, 678681954.83, 2045.17],
    ] },
    { id: "IVAV", title: "Ventas I.V.A.", side: "R", lines: [
      ["V-RES", "A responsables del impuesto sobre las ventas", 2380000, 2380251, -251],
      ["V-NRE", "Practicadas por servicios a no residentes o no domiciliados", 0, 0, 0],
      ["V-EXC", "Menos: Retenciones practicadas en exceso o indebidas", 0, 0, 0],
    ] },
  ];

  async function seedDianForm(formId: string, secs: { id: string; title: string; side: string; note?: string; lines: LineT[] }[]) {
    for (let si = 0; si < secs.length; si++) {
      const s = secs[si];
      await prisma.dianSection.create({
        data: {
          id: `${formId}-${s.id}`, formId, title: s.title, side: s.side, note: s.note ?? null, order: si,
          lines: { create: s.lines.map(([k, label, decl, cont, diff], i) => ({ k, label, decl, cont, diff, order: i })) },
        },
      });
    }
  }
  await seedDianForm("IVA", ivaSections);
  await seedDianForm("RETEFUENTE", reteSections);

  // ---- Mapeos de renglón → cuentas (IVA) ----
  await prisma.dianMapping.createMany({
    data: [
      { formId: "IVA", lineKey: "GEN-19", account: "240801", desc: "IVA generado tarifa general", sign: "+", order: 0 },
      { formId: "IVA", lineKey: "GEN-19", account: "240802", desc: "IVA generado en devoluciones", sign: "-", order: 1 },
      { formId: "IVA", lineKey: "DES-CBG", account: "240810", desc: "IVA descontable bienes tarifa general", sign: "+", order: 0 },
      { formId: "IVA", lineKey: "DES-CBG", account: "240811", desc: "IVA descontable importaciones", sign: "+", order: 1 },
      { formId: "IVA", lineKey: "ING-GG", account: "413505", desc: "Comercio al por mayor — gravados general", sign: "+", order: 0 },
      { formId: "IVA", lineKey: "ING-GG", account: "417500", desc: "Devoluciones en ventas", sign: "-", order: 1 },
      { formId: "IVA", lineKey: "ING-EXC", account: "413515", desc: "Ventas exentas Arts. 477-481 E.T.", sign: "+", order: 0 },
    ],
  });

  // ---- Comentarios por renglón (IVA) ----
  await prisma.dianComment.createMany({
    data: [
      { formId: "IVA", lineKey: "DES-IMG", who: "IA", initials: "IA", isAI: true, time: "sugerencia automática", text: "La diferencia de $352.915 representa el 0,03% del valor declarado. Posibles causas: IVA descontable de importaciones del cierre de octubre con DIAN del primer día hábil de noviembre, o reclasificación de tarifa entre 5% y general. Verificar la planilla de importaciones del último decadario." },
      { formId: "IVA", lineKey: "DES-CB5", who: "IA", initials: "IA", isAI: true, time: "sugerencia automática", text: "Diferencia material ($156.428). Patrón típico: facturas de proveedores recibidas después del corte pero registradas dentro del bimestre. Validar con el reporte de causación posterior." },
      { formId: "IVA", lineKey: "ING-G5", who: "Carlos Aristizábal", initials: "CA", time: "hace 1 día", text: "Esta diferencia corresponde a facturación de septiembre que ya causó IVA; se realizó devolución y se refacturó." },
      { formId: "IVA", lineKey: "ING-G5", who: "Juliana Rincón", initials: "JR", time: "hace 6 h", text: "Confirmado con comercial. La devolución NC-2026-1842 explica los $13.500.000. Se reclasifica como diferencia de oportunidad — no implica ajuste a la declaración." },
      { formId: "IVA", lineKey: "ING-LIC", who: "IA", initials: "IA", isAI: true, time: "sugerencia automática", text: "Diferencia de $13.499.973. Mismo patrón que el renglón al 5% — probablemente comparten origen (devolución y refacturación de septiembre). Validar trazabilidad." },
    ],
  });
```

- [ ] **Step 4: Re-sembrar y verificar**

Run: `npm run db:seed`
Expected: sin error. IVA con 4 secciones / 34 renglones; Retefuente con 2 secciones / 10 renglones; 7 mapeos; 5 comentarios.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(db): sembrar secciones/renglones/mapeos/comentarios DIAN (IVA+Retefuente)"
```

---

## Task 5A.3: Server Actions DIAN

**Files:** Create `src/app/actions/dian.ts`

- [ ] **Step 1: Crear las acciones**

Create `src/app/actions/dian.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { verifySession, getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";

export async function addDianComment(formData: FormData): Promise<void> {
  await verifySession();
  const formId = formData.get("formId") as string;
  const lineKey = formData.get("lineKey") as string;
  const periodId = formData.get("periodId") as string;
  const text = ((formData.get("text") as string) ?? "").trim();
  if (!formId || !lineKey || !text) return;

  const user = await getCurrentUser();
  await prisma.dianComment.create({
    data: { formId, lineKey, who: user?.name ?? "Usuario", initials: user?.initials ?? "··", text, time: "ahora" },
  });
  await logAudit({ user: user?.name ?? "Sistema", action: "COMENTÓ", entity: `Renglón ${lineKey}`, detail: `DIAN ${formId}` });
  if (periodId) revalidatePath(`/dian/${periodId}`);
}

// IA simulada: genera una observación heurística sobre la diferencia del renglón.
export async function requestDianAiAnalysis(formData: FormData): Promise<void> {
  await verifySession();
  const formId = formData.get("formId") as string;
  const lineKey = formData.get("lineKey") as string;
  const periodId = formData.get("periodId") as string;
  const diff = Number(formData.get("diff") ?? 0);
  if (!formId || !lineKey) return;

  const abs = Math.abs(diff);
  const text = abs === 0
    ? "Sin diferencia entre declaración y contabilidad. El renglón concilia; no requiere acción."
    : abs > 1000000
      ? `Diferencia material de $${abs.toLocaleString("es-CO")}. Patrón típico: documentos registrados fuera del corte o reclasificación de tarifa. Recomiendo validar la causación posterior y confirmar inclusión en la próxima declaración.`
      : `Diferencia menor de $${abs.toLocaleString("es-CO")} (no material). Probable redondeo o ajuste de oportunidad. Documentar y monitorear en el siguiente período.`;

  await prisma.dianComment.create({
    data: { formId, lineKey, who: "IA", initials: "IA", isAI: true, time: "sugerencia automática", text },
  });
  const user = await getCurrentUser();
  await logAudit({ user: user?.name ?? "Sistema", action: "PIDIÓ ANÁLISIS IA", entity: `Renglón ${lineKey}`, detail: `DIAN ${formId}` });
  if (periodId) revalidatePath(`/dian/${periodId}`);
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
```bash
git add src/app/actions/dian.ts
git commit -m "feat: Server Actions addDianComment y requestDianAiAnalysis"
```

---

## Task 5A.4: `/dian` índice + detalle

**Files:** Modify `src/app/(app)/dian/page.tsx`; Create `src/app/(app)/dian/[periodId]/page.tsx`; Create `src/app/(app)/dian/[periodId]/dian-detail-client.tsx`

- [ ] **Step 1: Índice clickeable**

Reemplazar **todo** `src/app/(app)/dian/page.tsx` por:
```tsx
import Link from "next/link";
import prisma from "@/lib/prisma";
import { PageHeader, Card, Chip } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";

export default async function DianPage() {
  const forms = await prisma.dianForm.findMany({ include: { periods: { orderBy: { periodKey: "desc" } } } });
  const tone = (s: string) => (s === "OK" ? "ok" : s === "DIFF" ? "err" : "warn");
  const label = (s: string) => (s === "OK" ? "Conciliado" : s === "DIFF" ? "Diferencia" : "Pendiente");

  return (
    <div>
      <PageHeader title="Impuestos · DIAN" subtitle="Carga los formatos presentados a la DIAN y crúzalos contra la contabilidad del cliente." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {forms.map((f) => (
          <Card key={f.id}>
            <div className="flex items-center gap-3 border-b border-ink-100 px-4 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-100 text-blue-500"><Icon name={f.icon as IconName} size={17} /></div>
              <div className="flex-1"><h2 className="text-[13px] font-semibold text-ink-800">{f.name}</h2><div className="text-[11.5px] text-ink-500"><span className="font-mono">{f.code}</span> · {f.periodicity}</div></div>
            </div>
            <div className="divide-y divide-ink-50">
              {f.periods.map((p) => (
                <Link key={p.id} href={`/dian/${p.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-ink-50">
                  <div>
                    <div className="text-[12.5px] text-ink-800">{p.label}</div>
                    {p.filed && <div className="text-[11px] text-ink-400">Presentado: {p.filed}</div>}
                  </div>
                  <div className="flex items-center gap-2"><Chip label={label(p.status)} tone={tone(p.status)} /><Icon name="chev-r" size={13} className="text-ink-300" /></div>
                </Link>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Página del detalle (server)**

Create `src/app/(app)/dian/[periodId]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { PageHeader, StatCard, BackLink, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtCompact, fmtPct } from "@/lib/format";
import DianDetailClient, { type Section, type Mapping, type Comment } from "./dian-detail-client";

export default async function DianDetailPage({ params }: { params: Promise<{ periodId: string }> }) {
  const { periodId } = await params;
  const period = await prisma.dianPeriod.findUnique({ where: { id: periodId } });
  if (!period) notFound();

  const form = await prisma.dianForm.findUnique({
    where: { id: period.formId },
    include: { sections: { orderBy: { order: "asc" }, include: { lines: { orderBy: { order: "asc" } } } }, mappings: true, comments: { orderBy: { createdAt: "asc" } } },
  });
  if (!form) notFound();

  const sections: Section[] = form.sections.map((s) => ({
    id: s.id, title: s.title, side: s.side, note: s.note,
    lines: s.lines.map((l) => ({ k: l.k, label: l.label, decl: l.decl, cont: l.cont, diff: l.diff })),
  }));
  const mappings: Mapping[] = form.mappings.map((m) => ({ lineKey: m.lineKey, account: m.account, desc: m.desc, sign: m.sign }));
  const comments: Comment[] = form.comments.map((c) => ({ id: c.id, lineKey: c.lineKey, who: c.who, initials: c.initials, text: c.text, time: c.time, isAI: c.isAI }));

  // KPIs: totales excluyendo la sección de Ingresos (ID terminada en "-ING"), igual que el prototipo.
  const totalsSecs = sections.filter((s) => !s.id.endsWith("-ING") && s.id !== "ING");
  const totalDecl = totalsSecs.reduce((t, s) => t + s.lines.reduce((a, l) => a + l.decl, 0), 0);
  const totalCont = totalsSecs.reduce((t, s) => t + s.lines.reduce((a, l) => a + l.cont, 0), 0);
  const totalDiff = totalDecl - totalCont;
  const allLines = sections.flatMap((s) => s.lines);
  const linesWithDiff = allLines.filter((l) => l.diff !== 0).length;

  return (
    <div>
      <div className="mb-3"><BackLink href="/dian" label="Impuestos · DIAN" /></div>
      <PageHeader
        title={`${form.name} · ${period.label}`}
        subtitle={`Inversiones del Pacífico S.A.S · NIT 900.451.227-3${period.filed ? ` · Declaración presentada ${period.filed}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <button disabled title="Exportación — fase posterior" className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-ink-100 px-2.5 py-2 text-[12px] font-semibold text-ink-400"><Icon name="download" size={13} /> Excel</button>
            <button disabled title="Exportación — fase posterior" className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-ink-100 px-2.5 py-2 text-[12px] font-semibold text-ink-400"><Icon name="download" size={13} /> PDF</button>
          </div>
        }
      />

      {form.objective && (
        <div className="mb-4 rounded-lg bg-navy-800 px-4 py-3 text-[12.5px] text-[#C9D4E2]">
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#7C8DA3]">Objetivo</div>
          <p className="mt-0.5">{form.objective}</p>
          <div className="mt-2 text-[10.5px] font-semibold uppercase tracking-wider text-[#7C8DA3]">Conclusión</div>
          <p className="mt-0.5 text-white">{form.conclusion}</p>
        </div>
      )}

      {allLines.length === 0 ? (
        <EmptyState icon="doc" title="Sin renglones" description="Este formato no tiene la estructura de renglones cargada." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Total declarado" value={fmtCompact(totalDecl)} tone="blue" />
            <StatCard label="Total contabilidad" value={fmtCompact(totalCont)} tone="ink" />
            <StatCard label="Diferencia neta" value={fmtCompact(totalDiff)} hint={fmtPct(totalDecl !== 0 ? (totalDiff / totalDecl) * 100 : 0)} tone={Math.abs(totalDiff) > 1 ? "err" : "ok"} />
            <StatCard label="Renglones con diferencia" value={`${linesWithDiff} / ${allLines.length}`} hint={`${comments.length} observación(es)`} tone="warn" />
          </div>
          <DianDetailClient formId={form.id} formName={form.name} periodId={periodId} sections={sections} mappings={mappings} comments={comments} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Componente client del detalle**

Create `src/app/(app)/dian/[periodId]/dian-detail-client.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Card, Chip } from "@/components/ui";
import { fmt } from "@/lib/format";
import { addDianComment, requestDianAiAnalysis } from "@/app/actions/dian";

export type Line = { k: string; label: string; decl: number; cont: number; diff: number };
export type Section = { id: string; title: string; side: string; note: string | null; lines: Line[] };
export type Mapping = { lineKey: string; account: string; desc: string; sign: string };
export type Comment = { id: string; lineKey: string; who: string; initials: string; text: string; time: string; isAI: boolean };

function lineStatus(l: Line, hasMapping: boolean): { label: string; tone: "ok" | "warn" | "err" } {
  if (!hasMapping) return { label: "Sin mapeo", tone: "warn" };
  if (l.diff === 0 || Math.abs(l.diff) < 1000) return { label: "OK", tone: "ok" };
  return { label: "Diferencia", tone: "err" };
}

export default function DianDetailClient({
  formId, formName, periodId, sections, mappings, comments,
}: {
  formId: string; formName: string; periodId: string; sections: Section[]; mappings: Mapping[]; comments: Comment[];
}) {
  const [activeSection, setActiveSection] = useState(sections[0]?.id ?? "");
  const allLines = sections.flatMap((s) => s.lines);
  const [selectedKey, setSelectedKey] = useState(allLines.find((l) => l.diff !== 0)?.k ?? allLines[0]?.k ?? "");

  const mappingFor = (k: string) => mappings.filter((m) => m.lineKey === k);
  const commentsFor = (k: string) => comments.filter((c) => c.lineKey === k);
  const sec = sections.find((s) => s.id === activeSection) ?? sections[0];
  const sel = allLines.find((l) => l.k === selectedKey) ?? allLines[0];

  const secTotal = (s: Section) => s.lines.reduce((a, l) => ({ decl: a.decl + l.decl, cont: a.cont + l.cont, diff: a.diff + l.diff }), { decl: 0, cont: 0, diff: 0 });

  return (
    <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[200px_minmax(0,1fr)_320px]">
      {/* Índice de secciones */}
      <Card className="self-start">
        <div className="border-b border-ink-100 px-4 py-2.5 text-[12px] font-semibold text-ink-700">Índice de {formName}</div>
        <div className="flex flex-col p-1.5">
          {sections.map((s) => {
            const dif = s.lines.filter((l) => l.diff !== 0).length;
            return (
              <button key={s.id} onClick={() => setActiveSection(s.id)} className={`rounded px-2.5 py-2 text-left text-[12px] ${s.id === activeSection ? "bg-blue-50 font-semibold text-navy-700" : "text-ink-600 hover:bg-ink-50"}`}>
                <div>{s.title}</div>
                <div className={`text-[10.5px] ${dif > 0 ? "text-err-700" : "text-ok-700"}`}>{s.lines.length} renglones · {dif > 0 ? `${dif} dif.` : "OK"}</div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Tabla de renglones */}
      <Card className="self-start">
        <div className="border-b border-ink-100 px-4 py-3 text-[13px] font-semibold text-ink-800">{sec?.title}{sec?.note && <span className="ml-2 text-[11px] font-normal text-ink-400">{sec.note}</span>}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500"><th className="px-3 py-2 font-semibold">Casilla</th><th className="px-3 py-2 font-semibold">Concepto</th><th className="px-3 py-2 text-right font-semibold">DIAN</th><th className="px-3 py-2 text-right font-semibold">Contab.</th><th className="px-3 py-2 text-right font-semibold">Diferencia</th><th className="px-3 py-2 font-semibold">Estado</th></tr></thead>
            <tbody>
              {sec?.lines.map((l) => {
                const hasMap = mappingFor(l.k).length > 0;
                const st = lineStatus(l, hasMap);
                const nc = commentsFor(l.k).length;
                return (
                  <tr key={l.k} onClick={() => setSelectedKey(l.k)} className={`cursor-pointer border-b border-ink-50 ${selectedKey === l.k ? "bg-blue-50" : "hover:bg-ink-50"}`}>
                    <td className="px-3 py-2 font-mono text-[11px] text-ink-500">{l.k}</td>
                    <td className="px-3 py-2 text-ink-800">{l.label}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-700">{l.decl === 0 ? "—" : fmt(l.decl)}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-700">{l.cont === 0 ? "—" : fmt(l.cont)}</td>
                    <td className={`px-3 py-2 text-right font-mono ${l.diff === 0 ? "text-ink-400" : l.diff > 0 ? "text-ok-700" : "text-err-700"}`}>{l.diff === 0 ? "$ 0" : fmt(l.diff)}</td>
                    <td className="px-3 py-2"><span className="inline-flex items-center gap-1"><Chip label={st.label} tone={st.tone} />{nc > 0 && <span className="inline-flex items-center gap-0.5 rounded-full bg-ai-100 px-1.5 text-[10px] font-semibold text-ai-700"><Icon name="msg" size={9} />{nc}</span>}</span></td>
                  </tr>
                );
              })}
              {sec && (() => { const t = secTotal(sec); return (
                <tr className="bg-navy-800 text-white"><td className="px-3 py-2.5 font-semibold" colSpan={2}>TOTAL {sec.title}</td><td className="px-3 py-2.5 text-right font-mono">{fmt(t.decl)}</td><td className="px-3 py-2.5 text-right font-mono">{fmt(t.cont)}</td><td className="px-3 py-2.5 text-right font-mono text-[#FF9991]">{fmt(t.diff)}</td><td></td></tr>
              ); })()}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Panel del renglón */}
      {sel && (
        <Card className="self-start">
          <div className="border-b border-ink-100 px-4 py-3">
            <div className="font-mono text-[11px] text-ink-500">{sel.k}</div>
            <h3 className="mt-0.5 text-[12.5px] font-semibold text-ink-800">{sel.label}</h3>
          </div>
          <div className="grid grid-cols-1 gap-1.5 border-b border-ink-100 px-4 py-3 text-[12px]">
            <KV label="Declaración DIAN" value={fmt(sel.decl)} />
            <KV label="Contabilidad" value={fmt(sel.cont)} />
            <KV label="Diferencia" value={fmt(sel.diff)} />
          </div>
          <div className="border-b border-ink-100 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Cuentas mapeadas</div>
            <div className="mt-2 flex flex-col gap-1.5">
              {mappingFor(sel.k).length === 0 ? <span className="text-[12px] italic text-ink-400">Sin mapeo configurado</span> : mappingFor(sel.k).map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px]"><Chip label={m.sign === "+" ? "+" : "−"} tone={m.sign === "+" ? "ok" : "err"} /><span className="font-mono text-ink-700">{m.account}</span><span className="text-ink-500">{m.desc}</span></div>
              ))}
            </div>
          </div>
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Observaciones {commentsFor(sel.k).length > 0 && <Chip label={String(commentsFor(sel.k).length)} tone="ai" />}</div>
            <div className="mt-2 flex flex-col gap-2.5">
              {commentsFor(sel.k).length === 0 && <span className="text-[12px] text-ink-400">Sin observaciones.</span>}
              {commentsFor(sel.k).map((c) => (
                <div key={c.id} className={`rounded-md px-2.5 py-2 ${c.isAI ? "bg-ai-100" : ""}`}>
                  <div className="flex items-center gap-1.5 text-[11.5px]"><b>{c.who}</b>{c.isAI && <Chip label="IA" tone="ai" />}<span className="text-ink-400">· {c.time}</span></div>
                  <div className="mt-0.5 text-[12px] leading-snug text-ink-700">{c.text}</div>
                </div>
              ))}
            </div>
            <form action={addDianComment} className="mt-3">
              <input type="hidden" name="formId" value={formId} /><input type="hidden" name="lineKey" value={sel.k} /><input type="hidden" name="periodId" value={periodId} />
              <textarea name="text" rows={2} placeholder="Agregar observación, asignar con @…" className="w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-blue-400" />
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <FormButton action={requestDianAiAnalysis} formId={formId} lineKey={sel.k} periodId={periodId} diff={sel.diff} />
                <button type="submit" className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600"><Icon name="send" size={13} /> Comentar</button>
              </div>
            </form>
          </div>
        </Card>
      )}
    </div>
  );
}

function FormButton({ action, formId, lineKey, periodId, diff }: { action: (fd: FormData) => Promise<void>; formId: string; lineKey: string; periodId: string; diff: number }) {
  return (
    <form action={action}>
      <input type="hidden" name="formId" value={formId} /><input type="hidden" name="lineKey" value={lineKey} /><input type="hidden" name="periodId" value={periodId} /><input type="hidden" name="diff" value={diff} />
      <button type="submit" className="inline-flex items-center gap-1.5 rounded-md border border-ai-100 bg-ai-100 px-2.5 py-1.5 text-[12px] font-semibold text-ai-700 hover:opacity-80"><Icon name="ai" size={13} /> Pedir análisis IA</button>
    </form>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between"><span className="text-ink-500">{label}</span><span className="font-mono text-ink-800">{value}</span></div>;
}
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores; `/dian/[periodId]` en el output.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/dian/page.tsx" "src/app/(app)/dian/[periodId]"
git commit -m "feat: /dian índice clickeable + detalle del cruce (secciones, renglones, panel, comentarios)"
```

---

## Task 5A.5: Validación de cierre de Fase 5A

- [ ] **Step 1: Suite**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build && npx prisma migrate status`
Expected: todo verde.

- [ ] **Step 2: Re-seed**

Run: `npm run db:seed`

- [ ] **Step 3: Criterios de aceptación (smoke — lo ejecuta el controlador)**

Con `npm run dev` + sesión:
- `/dian`: 4 formatos con períodos clickeables (estado legible). Click en un período de IVA → detalle.
- `/dian/[periodId IVA]`: banner Objetivo/Conclusión, 4 KPIs (Total declarado/contabilidad/Diferencia neta/Renglones con diferencia), índice de 4 secciones (GEN/DESC/RET/ING con conteo de diferencias), tabla de renglones de la sección activa con DIAN/Contab/Diferencia/Estado (Sin mapeo/OK/Diferencia) + badge de comentarios (DES-IMG, DES-CB5, ING-G5, ING-LIC), fila TOTAL.
- Panel del renglón: KV de valores, cuentas mapeadas (GEN-19/DES-CBG/ING-GG/ING-EXC con signos), observaciones. **Comentar persiste** (recargar → aparece). **"Pedir análisis IA"** agrega una observación IA y persiste.

- [ ] **Step 4: Commit final (si aplica)**

```bash
git add -A && git commit -m "chore: cierre y validación de Fase 5A" || echo "nada"
```

---

## Notas
- `decl/cont/diff` como `Float` (montos > 2.100 M no caben en INTEGER; < 2^53 → exactos). KPIs derivados de las líneas, excluyendo la sección Ingresos (fiel al prototipo).
- **Sin `DianLineValue`:** valores reales por renglón; el consolidado anual sintético del prototipo se omite en 5A (puede añadirse luego). El toggle Período/Anual del prototipo no se incluye en 5A para mantener foco; el detalle muestra el cruce del período.
- IA simulada (`requestDianAiAnalysis`) determinista por magnitud de la diferencia; persistida y auditada.
- `/config/dian` + `MappingEditor` (edición de mapeos) → Fase 5B.
- Sin placeholders pendientes.
