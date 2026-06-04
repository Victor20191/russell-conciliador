# Fase 6C · Requerimientos — Presentaciones a cliente (visor de slides) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans. Steps usan checkbox (`- [ ]`).

**Goal:** Construir las presentaciones a cliente: `/requerimientos/presentaciones` (bandeja con 4 KPIs + histórico + "Nueva presentación") y `/requerimientos/presentaciones/[id]` (**visor de slides** que genera portada, índice de aspectos evaluados, aspectos positivos paginados, lista y detalle de aspectos observados y cierre, con navegación por teclado/dots y auto-escala). "Nueva presentación" **persiste** un borrador.

**Architecture:** Server Components leen Prisma; el visor es un componente `"use client"` que construye los slides desde los datos y los navega (teclado, dots, auto-escala a 1280×720). Crear presentación es una Server Action que clona el contenido estándar y redirige al visor.

**Modelo de datos:** `ReqPresentation` (header plano + `positives String[]`, `observed Json`, `evaluated Json`).

**Tech Stack:** Next.js 16, Prisma 7, PostgreSQL, Tailwind v4, TS.

**Restricción Next 16:** `params` es `Promise`. Server Actions con `"use server"`; `redirect` de `next/navigation`.

**Rama:** `finalizacion-lfm`. Reutiliza `PageHeader, Card, Chip, StatCard` (`@/components/ui`), `Icon`+`BrandMark` (`@/components/icons`).

**Fuera de alcance (diferido):** asistente-editor de 4 pasos (el contenido se clona del estándar; editable luego), export PDF (botón deshabilitado).

---

## Mapa de archivos

**Crear:**
- `src/app/actions/presentaciones.ts` — `createPresentation`.
- `src/app/(app)/requerimientos/presentaciones/page.tsx` — bandeja (server).
- `src/app/(app)/requerimientos/presentaciones/[id]/page.tsx` — visor (server).
- `src/app/(app)/requerimientos/presentaciones/[id]/visor-client.tsx` — visor (client).

**Modificar:**
- `prisma/schema.prisma` — modelo `ReqPresentation`.
- `prisma/seed.ts` — 4 presentaciones con contenido.
- `src/lib/nav.ts` — añadir hijo Presentaciones a Requerimientos.

---

## Task 6C.1: Esquema Presentaciones

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: Añadir el modelo**

Al final de `prisma/schema.prisma`, añadir:
```prisma
model ReqPresentation {
  id         String   @id // PRES-2025-009
  clientName String
  nit        String
  title      String
  year       String
  presented  String
  preparedBy String
  slides     Int      @default(0)
  author     String
  date       String
  status     String // Enviada | Borrador
  positives  String[]
  observed   Json? // [{title, shortTitle, summary, riesgos[], oportunidades[]}]
  evaluated  Json? // {mercantil[], tributario[], otros[]}
  createdAt  DateTime @default(now())
}
```

- [ ] **Step 2: Migración**

Run:
```bash
npx prisma migrate dev --name requerimientos_presentaciones && npx prisma generate
```
Expected: aplicada; migrate status up to date.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): modelo ReqPresentation"
```

---

## Task 6C.2: Seed Presentaciones

**Files:** Modify `prisma/seed.ts`

- [ ] **Step 1: Limpieza idempotente**

En el bloque de limpieza, añadir:
```ts
  await prisma.reqPresentation.deleteMany();
```

- [ ] **Step 2: Sembrar el contenido y las 4 presentaciones**

Antes de `console.log("✅ Seed completo.")`, añadir:
```ts
  // ---- Contenido estándar de la presentación (Aspectos legales y tributarios) ----
  const presEvaluated = {
    mercantil: ["RUT vs CERL", "Estatutos vs CERL", "Actas de asamblea", "Libros oficiales", "Reporte Supersociedades", "Marca", "Contratos con terceros"],
    tributario: ["Perfil tributario", "Resolución de facturación y documento soporte", "Requisitos de factura electrónica", "Consecutivo numérico y cronológico de facturas", "Transmisión de nómina electrónica", "Periodicidad de declaraciones de IVA", "Ingresos brutos en Renta vs IVA e ICA", "Oportunidad de pago y presentación", "Certificados de retención", "Medios magnéticos", "Estado de cuenta DIAN", "Contenedor DIAN"],
    otros: ["Cumplimiento sector alimentos", "SAGRILAFT", "Terceros ficticios e insolventes", "Política de protección de datos y RNBD", "Rama judicial y BDME", "SENA y cuota de aprendices", "SGSST", "RIT"],
  };
  const presPositives = [
    "Se observa integridad entre la información reportada en cámara de comercio frente al RUT.",
    "La compañía cuenta con una resolución de facturación electrónica de contingencia vigente.",
    "Cuenta con la marca registrada en la Superintendencia de Industria y Comercio.",
    "La nómina electrónica se presentó de manera oportuna.",
    "El Impuesto a las Ventas se presenta con periodicidad bimestral, adecuada para la compañía.",
    "De acuerdo con el perfil tributario y obligaciones fiscales, se da cumplimiento al 100% de éstas.",
    "No se tienen registradas transacciones con clientes y proveedores calificados como ficticios.",
    "La compañía cumple con los requisitos de formato de la factura electrónica de venta.",
    "Los EE.FF. fueron reportados dentro de los plazos establecidos por la Superintendencia de Sociedades.",
    "Se evidencia adecuada conciliación de ingresos entre contabilidad vs. DIAN.",
    "Los ingresos declarados en IVA son consistentes con los declarados en Renta e ICA.",
    "La compañía realiza el pago oportuno de la seguridad social de sus empleados.",
    "La política de tratamiento de datos personales se encuentra publicada y registrada en el RNBD.",
    "Las retenciones en la fuente y de IVA se practican y certifican conforme a la normativa.",
    "El Sistema de Gestión de Seguridad y Salud en el Trabajo (SGSST) se encuentra implementado.",
    "La compañía no figura en el boletín de deudores morosos del Estado (BDME).",
  ];
  const presObserved = [
    { title: "Consecutivos de facturación", shortTitle: "CONSECUTIVOS DE FACTURACIÓN", summary: "Se presentan saltos en el orden cronológico de la facturación emitida por la compañía. La administración indicó que obedece a errores en la transmisión de algunas facturas a la DIAN, las cuales son reprocesadas y validadas dentro del mismo periodo contable.", riesgos: ["Riesgo de cumplimiento tributario formal: la pérdida de secuencia puede ser considerada una irregularidad formal ante la DIAN (art. 617 E.T. y reglamentación de facturación electrónica).", "Riesgo operativo y de control interno: la falla en la transmisión automática evidencia debilidades en los controles tecnológicos y de supervisión (NIA 315)."], oportunidades: ["Reforzar la conectividad y confiabilidad del sistema de facturación.", "Implementar alertas/tableros de facturas no procesadas.", "Conservar evidencia del reproceso en el archivo tributario.", "Validar diariamente la correlatividad al cierre."] },
    { title: "Medios magnéticos", shortTitle: "MEDIOS MAGNÉTICOS", summary: "En los medios magnéticos correspondientes al año 2024 se presentaron formatos con error.", riesgos: ["Sanciones por errores/omisiones/extemporaneidad de la exógena (art. 651 E.T.).", "Sanción de 0,5 UVT por dato incorrecto sin exceder 7.500 UVT.", "Inconsistencias cruzadas en los sistemas de la DIAN que deriven en requerimientos o auditorías.", "Afectación de la percepción de cumplimiento ante terceros."], oportunidades: ["Establecer controles de revisión y validación interna con conciliación cruzada.", "Usar herramientas de prevalidación de la DIAN o software especializado."] },
    { title: "Provisión de renta", shortTitle: "PROVISIÓN DE RENTA", summary: "Se evidencia que la compañía no realiza la provisión del impuesto de renta de manera mensual al corte de la revisión, incumpliendo el principio de acumulación (devengo) del marco técnico normativo contable.", riesgos: ["Posible error material en el estado de situación financiera.", "Debilidad en el cierre contable mensual y en el cumplimiento tributario."], oportunidades: ["Reconocer mensualmente la provisión dentro del cronograma de cierres.", "Documentar el cálculo estimado mes a mes.", "Formalizar una política contable de provisiones tributarias periódicas."] },
  ];

  const presHistory: [string, string, string, string, string, number, string][] = [
    ["PRES-2025-009", "El Zarzal S.A", "Aspectos legales y tributarios 2025", "15/Jul/2025", "Carlos Aristizábal", 18, "Enviada"],
    ["PRES-2025-008", "Inversiones del Pacífico S.A.S", "Aspectos legales y tributarios 2025", "02/Jul/2025", "María Posada", 16, "Enviada"],
    ["PRES-2025-007", "Comercializadora Andina Ltda", "Cierre fiscal 2024", "28/Jun/2025", "Juliana Rincón", 22, "Borrador"],
    ["PRES-2025-006", "Distribuciones del Valle S.A.S", "Aspectos legales y tributarios 2025", "20/Jun/2025", "Andrés Patiño", 15, "Enviada"],
  ];
  for (const [id, clientName, title, date, author, slides, status] of presHistory) {
    await prisma.reqPresentation.create({
      data: { id, clientName, nit: "900.451.227-3", title, year: "2025", presented: "Julio de 2025", preparedBy: "Russell Bedford Colombia", slides, author, date, status, positives: presPositives, observed: presObserved, evaluated: presEvaluated },
    });
  }
```

- [ ] **Step 3: Re-sembrar y verificar**

Run: `npm run db:seed`
Expected: sin error. 4 presentaciones, cada una con positives (16), observed (3), evaluated.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(db): sembrar presentaciones con contenido estándar"
```

---

## Task 6C.3: Server Action `createPresentation`

**Files:** Create `src/app/actions/presentaciones.ts`

- [ ] **Step 1: Crear la acción**

Create `src/app/actions/presentaciones.ts`:
```ts
"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import { verifySession, getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";

export async function createPresentation(): Promise<void> {
  await verifySession();
  const base = await prisma.reqPresentation.findUnique({ where: { id: "PRES-2025-009" } });
  if (!base) return;
  const count = await prisma.reqPresentation.count();
  const id = `PRES-2025-${100 + count}`;
  const user = await getCurrentUser();
  await prisma.reqPresentation.create({
    data: {
      id, clientName: base.clientName, nit: base.nit, title: base.title, year: base.year, presented: base.presented, preparedBy: base.preparedBy,
      slides: base.slides, author: user?.name ?? "Auditor", date: "hoy", status: "Borrador", positives: base.positives,
      observed: (base.observed ?? Prisma.JsonNull) as Prisma.InputJsonValue, evaluated: (base.evaluated ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
  });
  await logAudit({ user: user?.name ?? "Sistema", action: "CREÓ PRESENTACIÓN", entity: id, detail: base.title });
  redirect(`/requerimientos/presentaciones/${id}`);
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
```bash
git add src/app/actions/presentaciones.ts
git commit -m "feat: Server Action createPresentation"
```

---

## Task 6C.4: UI — bandeja, visor y sub-nav

**Files:** Modify `src/lib/nav.ts`; Create `presentaciones/page.tsx`, `presentaciones/[id]/page.tsx`, `presentaciones/[id]/visor-client.tsx`.

- [ ] **Step 1: Sub-nav**

En `src/lib/nav.ts`, en los `children` del ítem Requerimientos, añadir un tercer hijo:
```ts
      { label: "Presentaciones", href: "/requerimientos/presentaciones" },
```
(Queda: Plantillas, Repositorios, Presentaciones.)

- [ ] **Step 2: Bandeja (server)**

Create `src/app/(app)/requerimientos/presentaciones/page.tsx`:
```tsx
import Link from "next/link";
import prisma from "@/lib/prisma";
import { PageHeader, Card, Chip, StatCard } from "@/components/ui";
import { Icon } from "@/components/icons";
import { createPresentation } from "@/app/actions/presentaciones";

export default async function PresentacionesPage() {
  const list = await prisma.reqPresentation.findMany({ orderBy: { id: "desc" } });
  const enviadas = list.filter((p) => p.status === "Enviada").length;
  const borradores = list.filter((p) => p.status === "Borrador").length;

  return (
    <div>
      <PageHeader
        title="Presentaciones a cliente"
        subtitle="Genera el informe ejecutivo en formato presentación a partir de los aspectos evaluados. Salida navegable y exportable."
        actions={<form action={createPresentation}><button type="submit" className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600"><Icon name="plus" size={14} /> Nueva presentación</button></form>}
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Generadas (2025)" value={String(list.length)} hint="Aspectos legales y tributarios" tone="blue" />
        <StatCard label="Enviadas a cliente" value={String(enviadas)} hint="Vía repositorio o correo" tone="ok" />
        <StatCard label="En borrador" value={String(borradores)} hint="Pendientes de revisión interna" tone="warn" />
        <StatCard label="Tiempo medio" value="22 min" hint="Del asistente al informe" tone="ink" />
      </div>
      <Card className="mt-5">
        <div className="border-b border-ink-100 px-4 py-3 text-[13px] font-semibold text-ink-800">Histórico</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500"><th className="px-4 py-2 font-semibold">Consec.</th><th className="px-4 py-2 font-semibold">Cliente</th><th className="px-4 py-2 font-semibold">Título</th><th className="px-4 py-2 text-right font-semibold">Slides</th><th className="px-4 py-2 font-semibold">Autor</th><th className="px-4 py-2 font-semibold">Fecha</th><th className="px-4 py-2 font-semibold">Estado</th><th className="px-4 py-2"></th></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                  <td className="px-4 py-2.5 font-mono text-[11.5px] text-ink-500">{p.id}</td>
                  <td className="px-4 py-2.5 text-ink-800">{p.clientName}</td>
                  <td className="px-4 py-2.5 text-ink-700">{p.title}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-ink-600">{p.slides}</td>
                  <td className="px-4 py-2.5 text-ink-600">{p.author}</td>
                  <td className="px-4 py-2.5 text-ink-500">{p.date}</td>
                  <td className="px-4 py-2.5"><Chip label={p.status} tone={p.status === "Enviada" ? "ok" : "warn"} /></td>
                  <td className="px-4 py-2.5 text-right"><Link href={`/requerimientos/presentaciones/${p.id}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-500 hover:underline">Ver <Icon name="chev-r" size={12} /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Visor (server)**

Create `src/app/(app)/requerimientos/presentaciones/[id]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import VisorClient, { type PresData, type Observed, type Evaluated } from "./visor-client";

export default async function VisorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.reqPresentation.findUnique({ where: { id } });
  if (!p) notFound();

  const data: PresData = {
    id: p.id, clientName: p.clientName, nit: p.nit, title: p.title, year: p.year, presented: p.presented, preparedBy: p.preparedBy,
    positives: p.positives,
    observed: (p.observed as Observed[] | null) ?? [],
    evaluated: (p.evaluated as Evaluated | null) ?? { mercantil: [], tributario: [], otros: [] },
  };
  return <VisorClient data={data} />;
}
```

- [ ] **Step 4: Visor (client)**

Create `src/app/(app)/requerimientos/presentaciones/[id]/visor-client.tsx`:
```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, BrandMark } from "@/components/icons";

export type Observed = { title: string; shortTitle: string; summary: string; riesgos: string[]; oportunidades: string[] };
export type Evaluated = { mercantil: string[]; tributario: string[]; otros: string[] };
export type PresData = { id: string; clientName: string; nit: string; title: string; year: string; presented: string; preparedBy: string; positives: string[]; observed: Observed[]; evaluated: Evaluated };

type Slide =
  | { type: "cover" }
  | { type: "index" }
  | { type: "positives"; items: string[]; page: number; total: number }
  | { type: "observed-list"; items: Observed[] }
  | { type: "observed-detail"; obs: Observed; num: number }
  | { type: "closing" };

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function buildSlides(d: PresData): Slide[] {
  const slides: Slide[] = [{ type: "cover" }, { type: "index" }];
  const pos = chunk(d.positives, 10);
  pos.forEach((items, i) => slides.push({ type: "positives", items, page: i + 1, total: pos.length }));
  slides.push({ type: "observed-list", items: d.observed });
  d.observed.forEach((obs, i) => slides.push({ type: "observed-detail", obs, num: i + 1 }));
  slides.push({ type: "closing" });
  return slides;
}

export default function VisorClient({ data }: { data: PresData }) {
  const router = useRouter();
  const slides = useMemo(() => buildSlides(data), [data]);
  const [i, setI] = useState(0);
  const [scale, setScale] = useState(1);
  const stageRef = useRef<HTMLDivElement>(null);

  const go = (n: number) => setI(Math.max(0, Math.min(slides.length - 1, n)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") setI((x) => Math.min(slides.length - 1, x + 1));
      else if (e.key === "ArrowLeft" || e.key === "PageUp") setI((x) => Math.max(0, x - 1));
      else if (e.key === "Escape") router.push("/requerimientos/presentaciones");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length, router]);

  useEffect(() => {
    const fit = () => {
      const el = stageRef.current;
      if (!el) return;
      const s = Math.min((el.clientWidth - 32) / 1280, (el.clientHeight - 32) / 720, 1);
      setScale(s > 0 ? s : 0.1);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="-m-6 flex h-[calc(100vh-49px)] flex-col bg-navy-900">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2 text-[#C9D4E2]">
        <button onClick={() => router.push("/requerimientos/presentaciones")} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] hover:bg-white/10"><Icon name="chev-l" size={14} /> Salir</button>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-white">{data.title} · {data.year}</div>
          <div className="truncate text-[11px] text-[#7C8DA3]">{data.clientName} · NIT {data.nit} · {slides.length} slides</div>
        </div>
        <button disabled title="Exportación — fase posterior" className="ml-auto inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-white/5 px-2.5 py-1.5 text-[12px] font-semibold text-[#5E7290]"><Icon name="download" size={13} /> Descargar PDF</button>
      </div>

      {/* Stage */}
      <div ref={stageRef} className="flex flex-1 items-center justify-center overflow-hidden p-4">
        <div className="origin-center shadow-lg" style={{ width: 1280, height: 720, transform: `scale(${scale})` }}>
          <SlideView slide={slides[i]} data={data} idx={i + 1} total={slides.length} />
        </div>
      </div>

      {/* Nav */}
      <div className="flex items-center justify-center gap-3 border-t border-white/10 px-4 py-2.5">
        <button onClick={() => go(0)} disabled={i === 0} className="rounded p-1.5 text-[#A9B6C8] hover:bg-white/10 disabled:opacity-30"><Icon name="chev-l" size={15} className="-mr-2" /><Icon name="chev-l" size={15} /></button>
        <button onClick={() => go(i - 1)} disabled={i === 0} className="rounded p-1.5 text-[#A9B6C8] hover:bg-white/10 disabled:opacity-30"><Icon name="chev-l" size={16} /></button>
        <span className="font-mono text-[12px] text-[#C9D4E2]">{pad(i + 1)} / {pad(slides.length)}</span>
        <div className="flex items-center gap-1.5">
          {slides.map((_, n) => <button key={n} onClick={() => go(n)} className={`h-2 w-2 rounded-full ${n === i ? "bg-blue-400" : "bg-white/25 hover:bg-white/50"}`} />)}
        </div>
        <button onClick={() => go(i + 1)} disabled={i === slides.length - 1} className="rounded p-1.5 text-[#A9B6C8] hover:bg-white/10 disabled:opacity-30"><Icon name="chev-r" size={16} /></button>
        <button onClick={() => go(slides.length - 1)} disabled={i === slides.length - 1} className="rounded p-1.5 text-[#A9B6C8] hover:bg-white/10 disabled:opacity-30"><Icon name="chev-r" size={15} className="-mr-2" /><Icon name="chev-r" size={15} /></button>
      </div>
    </div>
  );
}

function SlideView({ slide, data, idx, total }: { slide: Slide; data: PresData; idx: number; total: number }) {
  const pageno = `${String(idx).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  const base = "relative flex h-full w-full flex-col bg-white";
  const tag = (t: string) => <div className="text-[15px] font-semibold uppercase tracking-[0.15em] text-blue-500">{t}</div>;
  const footer = <div className="absolute bottom-7 right-12 font-mono text-[13px] text-ink-300">{pageno}</div>;

  if (slide.type === "cover") {
    return (
      <div className="relative flex h-full w-full flex-col justify-center bg-navy-900 px-20 text-white">
        <div className="absolute right-12 top-10 font-serif text-[80px] font-light text-white/10">{data.year}</div>
        <div className="mb-6"><BrandMark size={48} /></div>
        <div className="text-[16px] uppercase tracking-[0.2em] text-blue-400">Informe ejecutivo · Auditoría {data.year}</div>
        <h1 className="mt-4 max-w-3xl font-serif text-[52px] leading-tight">{data.title}</h1>
        <div className="mt-8 text-[20px] font-semibold">{data.clientName}</div>
        <div className="text-[15px] text-[#9099a7]">NIT {data.nit}</div>
        <div className="mt-2 text-[14px] text-[#7C8DA3]">{data.presented} · {data.preparedBy}</div>
      </div>
    );
  }
  if (slide.type === "index") {
    const col = (title: string, items: string[]) => (
      <div className="flex-1"><div className="mb-2 text-[15px] font-semibold text-navy-700">{title}</div><ul className="space-y-1 text-[13px] text-ink-600">{items.map((x, k) => <li key={k} className="flex gap-1.5"><span className="text-blue-400">·</span>{x}</li>)}</ul></div>
    );
    return (
      <div className={`${base} px-16 py-12`}>
        <div className="mb-1 flex items-center gap-2"><BrandMark size={22} /><span className="text-[13px] text-ink-500">{data.clientName}</span></div>
        {tag("01 · Aspectos evaluados")}
        <h2 className="mt-1 font-serif text-[34px] text-ink-900">Alcance de la revisión {data.year}</h2>
        <div className="mt-6 flex gap-10">{col("Mercantil", data.evaluated.mercantil)}{col("Tributario", data.evaluated.tributario)}{col("Otros aspectos", data.evaluated.otros)}</div>
        {footer}
      </div>
    );
  }
  if (slide.type === "positives") {
    return (
      <div className={`${base} px-16 py-12`}>
        {tag(`02 · Aspectos positivos · ${slide.page}/${slide.total}`)}
        <h2 className="mt-1 font-serif text-[34px] text-ink-900">Aspectos positivos</h2>
        <div className="mt-6 grid flex-1 grid-cols-2 gap-x-10 gap-y-3 text-[14px] text-ink-700">
          {slide.items.map((x, k) => <div key={k} className="flex gap-2.5"><span className="mt-0.5 text-ok-500"><Icon name="check" size={16} /></span><span>{x}</span></div>)}
        </div>
        {footer}
      </div>
    );
  }
  if (slide.type === "observed-list") {
    return (
      <div className={`${base} px-16 py-12`}>
        {tag("03 · Aspectos observados")}
        <h2 className="mt-1 font-serif text-[34px] text-ink-900">Aspectos observados</h2>
        <div className="mt-6 flex flex-1 flex-col gap-3 text-ink-700">
          {slide.items.map((o, k) => (
            <div key={k} className="flex gap-3 border-b border-ink-100 pb-2.5"><span className="font-mono text-[20px] font-semibold text-warn-500">{String(k + 1).padStart(2, "0")}</span><div><div className="text-[15px] font-semibold text-ink-800">{o.title}</div><div className="text-[12.5px] text-ink-500">{o.summary.length > 180 ? o.summary.slice(0, 180) + "…" : o.summary}</div></div></div>
          ))}
        </div>
        {footer}
      </div>
    );
  }
  if (slide.type === "observed-detail") {
    const o = slide.obs;
    return (
      <div className={`${base} px-16 py-12`}>
        <div className="absolute right-12 top-10 font-serif text-[72px] font-light text-ink-100">{String(slide.num).padStart(2, "0")}</div>
        {tag(`Aspecto observado · ${String(slide.num).padStart(2, "0")}`)}
        <h2 className="mt-1 max-w-2xl font-serif text-[30px] text-ink-900">{o.shortTitle || o.title.toUpperCase()}</h2>
        <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-ink-700">{o.summary}</p>
        <div className="mt-5 grid flex-1 grid-cols-2 gap-6">
          <div className="rounded-lg border border-warn-100 bg-warn-100/40 p-4"><div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-warn-700"><Icon name="warn" size={14} /> Riesgos asociados</div><ul className="space-y-1.5 text-[12.5px] text-ink-700">{o.riesgos.filter(Boolean).map((r, k) => <li key={k} className="flex gap-1.5"><span className="text-warn-500">·</span>{r}</li>)}</ul></div>
          <div className="rounded-lg border border-ok-100 bg-ok-100/40 p-4"><div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ok-700"><Icon name="check" size={14} /> Oportunidades de mejora</div><ul className="space-y-1.5 text-[12.5px] text-ink-700">{o.oportunidades.filter(Boolean).map((r, k) => <li key={k} className="flex gap-1.5"><span className="text-ok-500">·</span>{r}</li>)}</ul></div>
        </div>
        {footer}
      </div>
    );
  }
  // closing
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center bg-navy-900 text-center text-white">
      <BrandMark size={48} />
      <div className="mt-4 text-[14px] uppercase tracking-[0.2em] text-[#7C8DA3]">{data.preparedBy}</div>
      <h1 className="mt-4 font-serif text-[64px]">Gracias.</h1>
      <div className="mt-4 text-[13px] text-[#9099a7]">contacto@russellbedford.co · Calle 100 · Bogotá D.C. · Colombia</div>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores; rutas `/requerimientos/presentaciones` y `/requerimientos/presentaciones/[id]` en el output.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nav.ts "src/app/(app)/requerimientos/presentaciones"
git commit -m "feat: presentaciones a cliente — bandeja + visor de slides con navegación"
```

---

## Task 6C.5: Validación de cierre de Fase 6C (y de la Fase 6)

- [ ] **Step 1: Suite**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build && npx prisma migrate status`
Expected: todo verde.

- [ ] **Step 2: Re-seed**

Run: `npm run db:seed`

- [ ] **Step 3: Criterios de aceptación (smoke — lo ejecuta el controlador)**

Con `npm run dev` + sesión:
- Sidebar: Requerimientos → Plantillas / Repositorios / Presentaciones.
- `/requerimientos/presentaciones`: 4 KPIs (Generadas 4 / Enviadas 3 / Borrador 1 / Tiempo medio), histórico de 4 con estado. "Ver" → visor.
- `/requerimientos/presentaciones/PRES-2025-009`: **visor de slides** — portada (navy con marca y título), índice (3 columnas Mercantil/Tributario/Otros), aspectos positivos (paginados, ~2 slides con checks), lista de observados, detalle por observado (riesgos/oportunidades), cierre "Gracias.". Navegación: flechas del teclado, dots, prev/next/primera/última; contador "NN / NN".
- "Nueva presentación" crea un borrador y abre su visor.

- [ ] **Step 4: Commit final (si aplica)**

```bash
git add -A && git commit -m "chore: cierre y validación de Fase 6C" || echo "nada"
```

---

## Notas
- **Visor** = pieza central: `buildSlides` (cover → index → positivos×N → observed-list → observed-detail×N → closing), auto-escala a 1280×720, navegación teclado/dots.
- Asistente-editor de 4 pasos **diferido** (el contenido se clona del estándar; "Nueva presentación" crea un borrador). Export PDF diferido.
- Contenido: positivos representativos (16) y 3 observados completos (de 7); `evaluated` completo.
- Cierra la **Fase 6 (Requerimientos)** completa (6A + 6B + 6C).
- Sin placeholders pendientes.
