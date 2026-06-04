# Fase 6A · Requerimientos — Plantillas, Historial y Generación — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans para implementar tarea por tarea. Steps usan checkbox (`- [ ]`).

**Goal:** Reemplazar el stub de `/requerimientos` por el sub-módulo de plantillas: índice con tabs Plantillas/Historial, detalle de plantilla (encabezado de carta, familias y documentos, versiones) y un asistente de **generación** que arma la carta (con sustitución de variables y destinatarios) y al enviar **persiste un requerimiento** en el historial.

**Architecture:** Server Components leen Prisma; tabs/selección/generación en componentes `"use client"`; generar es una Server Action de argumentos directos que crea un `ReqSubmission` y revalida. El editor de plantilla es de **solo lectura** (el del prototipo es no funcional); el PDF se difiere (vista previa en pantalla).

**Modelo de datos:** `ReqTemplate`, `ReqTemplateHeader` (1:1), `ReqFamily`, `ReqItem`, `ReqSubmission`, y `ClientContact` (diferido de Fase 1).

**Tech Stack:** Next.js 16, Prisma 7, PostgreSQL, Tailwind v4, TS.

**Restricción Next 16:** `params` es `Promise`. Server Actions con `"use server"`.

**Rama:** `finalizacion-lfm`. Reutiliza `PageHeader, Card, Chip, BackLink, EmptyState` (`@/components/ui`), `Modal` (`@/components/modal`), `Icon`+`BrandMark` (`@/components/icons`).

**Fuera de alcance (6B/6C/diferido):** repositorios (6B), presentaciones (6C), export PDF/Word (diferido), edición persistente de plantillas (solo lectura por ahora).

---

## Mapa de archivos

**Crear:**
- `src/app/actions/requerimientos.ts` — `generateRequirement`.
- `src/app/(app)/requerimientos/requerimientos-client.tsx` — tabs índice (client).
- `src/app/(app)/requerimientos/plantillas/[id]/page.tsx` — detalle de plantilla (server).
- `src/app/(app)/requerimientos/plantillas/[id]/plantilla-client.tsx` — secciones (client).
- `src/app/(app)/requerimientos/generar/[id]/page.tsx` — generación (server).
- `src/app/(app)/requerimientos/generar/[id]/generar-client.tsx` — asistente (client).

**Modificar:**
- `prisma/schema.prisma` — modelos nuevos.
- `prisma/seed.ts` — plantillas, header+familias+ítems de CIERRE, historial, contactos.
- `src/app/(app)/requerimientos/page.tsx` — reescribir (server).
- `src/lib/nav.ts` — el ítem Requerimientos seguirá apuntando a `/requerimientos` (sin cambios necesarios).

---

## Task 6A.1: Esquema Requerimientos

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: Añadir los modelos**

Al final de `prisma/schema.prisma`, añadir:
```prisma
// ===== Requerimientos de información =====
model ClientContact {
  id         String  @id @default(cuid())
  clientName String
  name       String
  role       String
  email      String
  primary    Boolean @default(false)
  order      Int     @default(0)
}

model ReqTemplate {
  id            String           @id // TPL-CIERRE
  code          String // RFA-CIERRE
  name          String
  description   String
  activeVersion String
  families      Int              @default(0)
  items         Int              @default(0)
  timesUsed     Int              @default(0)
  lastUpdated   String
  lastUpdatedBy String
  header        ReqTemplateHeader?
  familyList    ReqFamily[]
}

model ReqTemplateHeader {
  id                String      @id @default(cuid())
  template          ReqTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  templateId        String      @unique
  firmName          String
  city              String
  asunto            String
  intro             String
  noteGeneric       String
  closing           String
  signatoryName     String
  signatoryRole     String
  signatoryFooter   String
  consecutivePrefix String
  contactEmails     String[]
}

model ReqFamily {
  id         String      @id @default(cuid())
  template   ReqTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  templateId String
  name       String
  order      Int         @default(0)
  itemList   ReqItem[]
}

model ReqItem {
  id       String    @id @default(cuid())
  family   ReqFamily @relation(fields: [familyId], references: [id], onDelete: Cascade)
  familyId String
  text     String
  order    Int       @default(0)
}

model ReqSubmission {
  id              String   @id // REQ-2026-014
  consec          String
  templateCode    String
  templateVersion String
  clientName      String
  period          String
  recipients      Int      @default(0)
  status          String // Enviado | Borrador
  date            String
  sentBy          String
  createdAt       DateTime @default(now())
}
```

- [ ] **Step 2: Migración**

Run:
```bash
npx prisma migrate dev --name requerimientos_plantillas && npx prisma generate
```
Expected: aplicada; migrate status up to date.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): modelos de Requerimientos (plantillas, familias, ítems, envíos, contactos)"
```

---

## Task 6A.2: Seed Requerimientos

**Files:** Modify `prisma/seed.ts`

- [ ] **Step 1: Limpieza idempotente**

En el bloque de limpieza, al inicio, añadir:
```ts
  await prisma.reqItem.deleteMany();
  await prisma.reqFamily.deleteMany();
  await prisma.reqTemplateHeader.deleteMany();
  await prisma.reqTemplate.deleteMany();
  await prisma.reqSubmission.deleteMany();
  await prisma.clientContact.deleteMany();
```

- [ ] **Step 2: Sembrar contactos, plantillas, familias/ítems e historial**

Antes de `console.log("✅ Seed completo.")`, añadir:
```ts
  // ---- Contactos por cliente ----
  const contacts: [string, string, string, string, boolean][] = [
    ["El Zarzal S.A", "Santiago Jaramillo", "Gerente General", "sjaramillo@elzarzal.com.co", true],
    ["El Zarzal S.A", "Sandra J. Carrillo Agudelo", "Gerente Administrativa y Financiera", "scarrillo@elzarzal.com.co", false],
    ["El Zarzal S.A", "Sandra Liliana Paniagua Rios", "Contadora", "spaniagua@elzarzal.com.co", false],
    ["El Zarzal S.A", "Alejandra Henao", "Jefe de Gestión Humana", "ahenao@elzarzal.com.co", false],
    ["Inversiones del Pacífico S.A.S", "Roberto Mejía", "Gerente General", "rmejia@invpacifico.co", true],
    ["Inversiones del Pacífico S.A.S", "Laura Restrepo", "CFO", "lrestrepo@invpacifico.co", false],
    ["Comercializadora Andina Ltda", "Felipe Vargas", "Gerente", "fvargas@andina.co", true],
  ];
  await prisma.clientContact.createMany({ data: contacts.map(([clientName, name, role, email, primary], i) => ({ clientName, name, role, email, primary, order: i })) });

  // ---- Plantillas ----
  await prisma.reqTemplate.createMany({
    data: [
      { id: "TPL-CIERRE", code: "RFA-CIERRE", name: "Auditoría financiera — Cierre", description: "Solicitud de información para auditoría de estados financieros con corte al cierre del año.", activeVersion: "v3.2", families: 13, items: 78, timesUsed: 47, lastUpdated: "06/Nov/2026", lastUpdatedBy: "Manuela Gutiérrez" },
      { id: "TPL-LEGALES", code: "RFA-LEGALES", name: "Aspectos legales, laborales y tributarios", description: "Solicitud para evaluación general de control — auditoría de revisoría fiscal.", activeVersion: "v2.1", families: 4, items: 38, timesUsed: 32, lastUpdated: "22/Abr/2026", lastUpdatedBy: "Manuela Gutiérrez" },
      { id: "TPL-INTERIM", code: "RFA-INTERIM", name: "Auditoría intermedia", description: "Solicitud para revisión intermedia trimestral o semestral.", activeVersion: "v1.4", families: 8, items: 42, timesUsed: 18, lastUpdated: "15/Jul/2026", lastUpdatedBy: "Andrea Gómez" },
      { id: "TPL-PRECIERRE", code: "RFA-PRECIERRE", name: "Pre-cierre — Octubre", description: "Solicitud de información para preparación del cierre anual (corte octubre).", activeVersion: "v1.1", families: 10, items: 54, timesUsed: 12, lastUpdated: "20/Sep/2026", lastUpdatedBy: "Manuela Gutiérrez" },
    ],
  });

  // ---- Header de CIERRE ----
  await prisma.reqTemplateHeader.create({
    data: {
      templateId: "TPL-CIERRE", firmName: "Russell Bedford GCT S.A.S.", city: "Medellín",
      asunto: "Requerimiento de Información, Auditoría financiera Cierre con corte a {{fecha_corte}}.",
      intro: "El propósito de una auditoría es incrementar el grado de confianza de los usuarios en los estados financieros. Esto se logra con la expresión de una opinión por el auditor sobre si los estados financieros están elaborados, y están presentados, razonablemente, respecto de todo lo importante, de acuerdo con el marco de referencia de información financiera aplicable.\n\nNuestra auditoría es conducida de acuerdo con las Normas Internacionales de Auditoría (NIA) y los requisitos éticos relevantes.",
      noteGeneric: "De acuerdo con la importancia de este análisis es indispensable que se suministre la información requerida que a continuación se detalla (si no se maneja algún rubro citado, omitir el ítem).",
      closing: "El éxito de nuestra auditoría dependerá de la información suministrada y la calidad de ella; agradecemos nos informen si tienen alguna inquietud con lo solicitado.",
      signatoryName: "Manuela Gutiérrez Ossa", signatoryRole: "Senior de Auditoría y Revisoría Fiscal", signatoryFooter: "En representación de Russell Bedford GCT S.A.S",
      consecutivePrefix: "RFA", contactEmails: ["manuelagutierrez@rbcol.co", "andreagomez@rbcol.co"],
    },
  });

  // ---- Familias e ítems de CIERRE (representativos) ----
  const famData: { name: string; items: string[] }[] = [
    { name: "Información General", items: ["Políticas contables NIIF actualizadas.", "Balance de comprobación en Excel por cuenta y por terceros (oct., nov. y dic. de {{año_corte}}).", "RUT actualizado.", "Actas de Junta directiva y de asamblea desde 30.Sep.{{año_corte}} a la fecha."] },
    { name: "Efectivo y Equivalentes de Efectivo", items: ["Extractos bancarios al corte (octubre a diciembre {{año_corte}}).", "Conciliaciones bancarias (octubre a diciembre {{año_corte}}).", "Último reembolso de caja menor de diciembre {{año_corte}}.", "Políticas de manejo y custodia del fondo de cajas."] },
    { name: "Cuentas Comerciales por Cobrar", items: ["Estado de cartera por clientes y por edades (0-90, 91-180, 181-360, 361+).", "Detalle de la cartera castigada durante la vigencia {{año_corte}}.", "Detalle del deterioro de la cartera al corte auditado."] },
    { name: "Inventarios", items: ["Estado de existencias al corte auditado, por costo y unidades.", "VNR al corte auditado.", "Reporte de todos los ajustes de inventario realizados en el año."] },
    { name: "Propiedad, Planta y Equipo", items: ["Conciliación del módulo con contabilidad (Excel) — diciembre {{año_corte}}.", "Reporte de compras y retiros realizados durante el año (Excel).", "Reporte de la depreciación generada durante el año por activo (Excel)."] },
    { name: "Intangibles y Diferidos", items: ["Amortización de licencias al 31.dic.{{año_corte}}.", "Conciliación de intangibles al 31.dic.{{año_corte}}.", "Cálculo del impuesto diferido."] },
    { name: "Pasivos Financieros y Cuentas por Pagar", items: ["Extracto con el saldo de la deuda a la fecha de corte (a diciembre {{año_corte}}).", "Relación de pasivos con particulares.", "Cuentas por pagar por edades (0-90, 91-180, 181-360, 361+)."] },
    { name: "Nómina", items: ["Conciliación del módulo con contabilidad de enero a diciembre del {{año_corte}} (Excel).", "Reporte de empleados activos y retirados al corte auditado.", "Cálculo por empleado de las prestaciones sociales (Excel)."] },
    { name: "Patrimonio y Otros Pasivos", items: ["Soporte de las provisiones reconocidas.", "Explicación del movimiento del patrimonio por concepto y tercero.", "Si hubo capitalización, soporte del origen de la transacción."] },
    { name: "Ingresos, Gastos y Costo", items: ["Conciliación de ingresos con el módulo de facturación — enero a diciembre {{año_corte}} (Excel).", "Reporte de facturación y notas crédito a la DIAN (Excel) de enero a diciembre de {{año_corte}}.", "Conciliación del costo entre el módulo y la contabilidad."] },
    { name: "Asientos Diarios (JE)", items: ["Archivo en Excel de los registros contables (Journal Entries) del 1 de enero al 31 de diciembre de {{año_corte}}, con campos: Código, Nombre, Descripción, Fechas, ID Journal, Usuario, Valor, Naturaleza (D/C), Forma de ingreso."] },
    { name: "Otros Conceptos Tributarios", items: ["Impuesto diferido al 31 de diciembre del {{año_corte}}.", "Retención de Industria y Comercio.", "Cálculo del impuesto diferido al corte auditado (Excel)."] },
    { name: "Provisión de Renta", items: ["Declaración de renta presentada y recibo de pago — año gravable {{año_anterior}}.", "Balance de enero a diciembre {{año_corte}}, por terceros NIIF y Fiscal.", "Anexo de activos fijos fiscal y NIIF.", "Papel de trabajo de provisión de renta de la compañía."] },
  ];
  for (let fi = 0; fi < famData.length; fi++) {
    const f = famData[fi];
    await prisma.reqFamily.create({
      data: { templateId: "TPL-CIERRE", name: f.name, order: fi, itemList: { create: f.items.map((text, i) => ({ text, order: i })) } },
    });
  }

  // ---- Historial de envíos ----
  await prisma.reqSubmission.createMany({
    data: [
      { id: "REQ-2026-014", consec: "RFA 001 – 2026 ZZ", templateCode: "RFA-CIERRE", templateVersion: "v3.2", clientName: "El Zarzal S.A", period: "Cierre 2025", recipients: 3, status: "Enviado", date: "06/Ene/2026", sentBy: "Manuela Gutiérrez" },
      { id: "REQ-2026-013", consec: "RFA 006 – 2026 ZZ", templateCode: "RFA-LEGALES", templateVersion: "v2.1", clientName: "El Zarzal S.A", period: "Abril 2026", recipients: 3, status: "Enviado", date: "22/Abr/2026", sentBy: "Manuela Gutiérrez" },
      { id: "REQ-2026-012", consec: "RFA 002 – 2026 IP", templateCode: "RFA-CIERRE", templateVersion: "v3.2", clientName: "Inversiones del Pacífico S.A.S", period: "Cierre 2025", recipients: 4, status: "Enviado", date: "08/Ene/2026", sentBy: "Carlos Aristizábal" },
      { id: "REQ-2026-011", consec: "RFA 022 – 2026 CA", templateCode: "RFA-INTERIM", templateVersion: "v1.4", clientName: "Comercializadora Andina Ltda", period: "Q3 2026", recipients: 2, status: "Borrador", date: "15/Oct/2026", sentBy: "Andrea Gómez" },
      { id: "REQ-2026-010", consec: "RFA 028 – 2026 MS", templateCode: "RFA-PRECIERRE", templateVersion: "v1.1", clientName: "Manufacturas del Sur S.A", period: "Pre-cierre Oct 2026", recipients: 5, status: "Enviado", date: "05/Nov/2026", sentBy: "Manuela Gutiérrez" },
    ],
  });
```

- [ ] **Step 3: Re-sembrar y verificar**

Run: `npm run db:seed`
Expected: sin error. 4 plantillas, CIERRE con header + 13 familias, ~40 ítems, 5 envíos, 7 contactos.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(db): sembrar plantillas, familias/ítems de CIERRE, historial y contactos"
```

---

## Task 6A.3: Server Action `generateRequirement`

**Files:** Create `src/app/actions/requerimientos.ts`

- [ ] **Step 1: Crear la acción (argumentos directos)**

Create `src/app/actions/requerimientos.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { verifySession, getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";

export async function generateRequirement(input: {
  templateCode: string; templateVersion: string; clientName: string; clientCode: string; period: string; recipients: number;
}): Promise<{ id: string; consec: string }> {
  await verifySession();
  const count = await prisma.reqSubmission.count();
  const id = `REQ-2026-${100 + count}`;
  const consec = `RFA ${String(count + 1).padStart(3, "0")} – 2026 ${input.clientCode || "XX"}`;
  const user = await getCurrentUser();
  await prisma.reqSubmission.create({
    data: { id, consec, templateCode: input.templateCode, templateVersion: input.templateVersion, clientName: input.clientName, period: input.period, recipients: input.recipients, status: "Enviado", date: "hoy", sentBy: user?.name ?? "Auditor" },
  });
  await logAudit({ user: user?.name ?? "Sistema", action: "ENVIÓ REQUERIMIENTO", entity: consec, detail: `${input.clientName} · ${input.recipients} destinatario(s)` });
  revalidatePath("/requerimientos");
  return { id, consec };
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
```bash
git add src/app/actions/requerimientos.ts
git commit -m "feat: Server Action generateRequirement"
```

---

## Task 6A.4: UI — índice, detalle de plantilla y generación

**Files:** Modify `src/app/(app)/requerimientos/page.tsx`; Create `requerimientos-client.tsx`, `plantillas/[id]/page.tsx`, `plantillas/[id]/plantilla-client.tsx`, `generar/[id]/page.tsx`, `generar/[id]/generar-client.tsx`.

- [ ] **Step 1: Índice (server)**

Reemplazar **todo** `src/app/(app)/requerimientos/page.tsx` por:
```tsx
import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import RequerimientosClient, { type Template, type Submission } from "./requerimientos-client";

export default async function RequerimientosPage() {
  const [templates, history] = await Promise.all([
    prisma.reqTemplate.findMany({ orderBy: { timesUsed: "desc" } }),
    prisma.reqSubmission.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  const tpl: Template[] = templates.map((t) => ({ id: t.id, code: t.code, name: t.name, description: t.description, activeVersion: t.activeVersion, families: t.families, items: t.items, timesUsed: t.timesUsed, lastUpdated: t.lastUpdated, lastUpdatedBy: t.lastUpdatedBy }));
  const hist: Submission[] = history.map((h) => ({ id: h.id, consec: h.consec, templateCode: h.templateCode, templateVersion: h.templateVersion, clientName: h.clientName, period: h.period, recipients: h.recipients, status: h.status, date: h.date }));

  return (
    <div>
      <PageHeader title="Requerimientos de información" subtitle="Plantillas parametrizadas con versionamiento, encabezado de carta y documentos por familia. Genera y envía a los contactos del cliente." />
      <RequerimientosClient templates={tpl} history={hist} />
    </div>
  );
}
```

- [ ] **Step 2: Índice (client, tabs)**

Create `src/app/(app)/requerimientos/requerimientos-client.tsx`:
```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Card, Chip } from "@/components/ui";

export type Template = { id: string; code: string; name: string; description: string; activeVersion: string; families: number; items: number; timesUsed: number; lastUpdated: string; lastUpdatedBy: string };
export type Submission = { id: string; consec: string; templateCode: string; templateVersion: string; clientName: string; period: string; recipients: number; status: string; date: string };

export default function RequerimientosClient({ templates, history }: { templates: Template[]; history: Submission[] }) {
  const [tab, setTab] = useState<"templates" | "history">("templates");
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <button onClick={() => setTab("templates")} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium ${tab === "templates" ? "bg-navy-800 text-white" : "text-ink-600 hover:bg-ink-100"}`}>Plantillas <span className={`rounded-full px-1.5 text-[10px] font-semibold ${tab === "templates" ? "bg-white/20" : "bg-ink-100 text-ink-500"}`}>{templates.length}</span></button>
        <button onClick={() => setTab("history")} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium ${tab === "history" ? "bg-navy-800 text-white" : "text-ink-600 hover:bg-ink-100"}`}>Historial de envíos <span className={`rounded-full px-1.5 text-[10px] font-semibold ${tab === "history" ? "bg-white/20" : "bg-ink-100 text-ink-500"}`}>{history.length}</span></button>
      </div>

      {tab === "templates" ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500"><th className="px-4 py-2 font-semibold">Código</th><th className="px-4 py-2 font-semibold">Nombre</th><th className="px-4 py-2 font-semibold">Versión</th><th className="px-4 py-2 text-right font-semibold">Familias</th><th className="px-4 py-2 text-right font-semibold">Ítems</th><th className="px-4 py-2 text-right font-semibold">Usos</th><th className="px-4 py-2 font-semibold">Última actualización</th><th className="px-4 py-2"></th></tr></thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                    <td className="px-4 py-2.5 font-mono text-[11.5px] text-ink-600">{t.code}</td>
                    <td className="px-4 py-2.5"><div className="font-medium text-ink-800">{t.name}</div><div className="text-[11px] text-ink-400">{t.description}</div></td>
                    <td className="px-4 py-2.5"><Chip label={`${t.activeVersion} activa`} tone="ok" /></td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-600">{t.families}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-600">{t.items}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-600">{t.timesUsed}</td>
                    <td className="px-4 py-2.5 text-ink-600">{t.lastUpdated}<div className="text-[11px] text-ink-400">{t.lastUpdatedBy}</div></td>
                    <td className="px-4 py-2.5 text-right"><Link href={`/requerimientos/plantillas/${t.id}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-500 hover:underline">Abrir <Icon name="chev-r" size={12} /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500"><th className="px-4 py-2 font-semibold">ID</th><th className="px-4 py-2 font-semibold">Consecutivo</th><th className="px-4 py-2 font-semibold">Plantilla</th><th className="px-4 py-2 font-semibold">Cliente</th><th className="px-4 py-2 font-semibold">Período</th><th className="px-4 py-2 text-right font-semibold">Destinatarios</th><th className="px-4 py-2 font-semibold">Estado</th><th className="px-4 py-2 font-semibold">Fecha</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                    <td className="px-4 py-2.5 font-mono text-[11.5px] text-ink-500">{h.id}</td>
                    <td className="px-4 py-2.5 font-mono text-ink-600">{h.consec}</td>
                    <td className="px-4 py-2.5 text-ink-700">{h.templateCode} {h.templateVersion}</td>
                    <td className="px-4 py-2.5 text-ink-800">{h.clientName}</td>
                    <td className="px-4 py-2.5 text-ink-600">{h.period}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-600">{h.recipients}</td>
                    <td className="px-4 py-2.5"><Chip label={h.status} tone={h.status === "Enviado" ? "ok" : "warn"} /></td>
                    <td className="px-4 py-2.5 text-ink-500">{h.date}</td>
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
```

- [ ] **Step 3: Detalle de plantilla (server + client)**

Create `src/app/(app)/requerimientos/plantillas/[id]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { PageHeader, BackLink, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import PlantillaClient, { type Family, type Header } from "./plantilla-client";

export default async function PlantillaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await prisma.reqTemplate.findUnique({
    where: { id },
    include: { header: true, familyList: { orderBy: { order: "asc" }, include: { itemList: { orderBy: { order: "asc" } } } } },
  });
  if (!t) notFound();

  const families: Family[] = t.familyList.map((f) => ({ id: f.id, name: f.name, items: f.itemList.map((it) => it.text) }));
  const header: Header | null = t.header ? {
    firmName: t.header.firmName, city: t.header.city, asunto: t.header.asunto, intro: t.header.intro, noteGeneric: t.header.noteGeneric, closing: t.header.closing,
    signatoryName: t.header.signatoryName, signatoryRole: t.header.signatoryRole, signatoryFooter: t.header.signatoryFooter, consecutivePrefix: t.header.consecutivePrefix, contactEmails: t.header.contactEmails,
  } : null;

  return (
    <div>
      <div className="mb-3"><BackLink href="/requerimientos" label="Requerimientos" /></div>
      <PageHeader
        title={t.name}
        subtitle={`Plantilla ${t.code} · ${t.families} familias · ${t.items} ítems · ${t.timesUsed} usos`}
        actions={
          <div className="flex items-center gap-2">
            <Chip label={`${t.activeVersion} activa`} tone="ok" />
            {t.header && <Link href={`/requerimientos/generar/${t.id}`} className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600"><Icon name="send" size={14} /> Generar requerimiento</Link>}
          </div>
        }
      />
      <PlantillaClient families={families} header={header} />
    </div>
  );
}
```

Create `src/app/(app)/requerimientos/plantillas/[id]/plantilla-client.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Card, Chip, EmptyState } from "@/components/ui";

export type Family = { id: string; name: string; items: string[] };
export type Header = { firmName: string; city: string; asunto: string; intro: string; noteGeneric: string; closing: string; signatoryName: string; signatoryRole: string; signatoryFooter: string; consecutivePrefix: string; contactEmails: string[] };

export default function PlantillaClient({ families, header }: { families: Family[]; header: Header | null }) {
  const [section, setSection] = useState<"families" | "header">("families");
  const [activeFam, setActiveFam] = useState(families[0]?.id ?? "");
  const fam = families.find((f) => f.id === activeFam) ?? families[0];

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <SecBtn on={section === "families"} onClick={() => setSection("families")} label="Familias y documentos" />
        <SecBtn on={section === "header"} onClick={() => setSection("header")} label="Encabezado de carta" />
      </div>

      {section === "families" && (
        families.length === 0 ? <EmptyState icon="folder" title="Sin familias" description="Esta plantilla usa la estructura estándar; el detalle editable está disponible en la plantilla de Cierre." /> : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <Card className="self-start">
              <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-2.5"><span className="text-[12px] font-semibold text-ink-700">Familias</span><Chip label={String(families.length)} tone="ink" /></div>
              <div className="flex flex-col p-1.5">
                {families.map((f) => (
                  <button key={f.id} onClick={() => setActiveFam(f.id)} className={`flex items-center justify-between rounded px-2.5 py-2 text-left text-[12px] ${f.id === activeFam ? "bg-blue-50 font-semibold text-navy-700" : "text-ink-600 hover:bg-ink-50"}`}>{f.name}<span className="font-mono text-[11px] text-ink-400">{f.items.length}</span></button>
                ))}
              </div>
            </Card>
            <Card className="self-start">
              <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3"><h2 className="text-[13px] font-semibold text-ink-800">{fam?.name}</h2><Chip label={`${fam?.items.length} ítems`} tone="ink" /></div>
              <ol className="list-decimal space-y-1.5 px-7 py-3 text-[12.5px] text-ink-700 marker:text-ink-400">
                {fam?.items.map((it, i) => <li key={i} className="pl-1">{it}</li>)}
              </ol>
            </Card>
          </div>
        )
      )}

      {section === "header" && (
        header == null ? <EmptyState icon="doc" title="Sin encabezado" description="El encabezado de carta editable está disponible en la plantilla de Cierre." /> : (
          <Card className="max-w-3xl p-5 text-[12.5px]">
            <Field label="Razón social" value={header.firmName} />
            <Field label="Ciudad" value={header.city} />
            <Field label="Asunto" value={header.asunto} />
            <Field label="Introducción" value={header.intro} multiline />
            <Field label="Nota genérica" value={header.noteGeneric} multiline />
            <Field label="Cierre" value={header.closing} multiline />
            <Field label="Firma" value={`${header.signatoryName} · ${header.signatoryRole} · ${header.signatoryFooter}`} />
            <Field label="Correos de contacto" value={header.contactEmails.join(", ")} />
          </Card>
        )
      )}
    </div>
  );
}

function Field({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="mb-3">
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">{label}</div>
      <div className={`mt-0.5 text-ink-800 ${multiline ? "whitespace-pre-line leading-relaxed" : ""}`}>{value}</div>
    </div>
  );
}

function SecBtn({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return <button onClick={onClick} className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${on ? "bg-navy-800 text-white" : "text-ink-600 hover:bg-ink-100"}`}>{label}</button>;
}
```

- [ ] **Step 4: Generación (server + client)**

Create `src/app/(app)/requerimientos/generar/[id]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { PageHeader, BackLink } from "@/components/ui";
import GenerarClient, { type GenFamily, type GenHeader, type Contact } from "./generar-client";

const CLIENTS: { name: string; nit: string; code: string }[] = [
  { name: "El Zarzal S.A", nit: "890.345.872-1", code: "ZZ" },
  { name: "Inversiones del Pacífico S.A.S", nit: "900.451.227-3", code: "IP" },
  { name: "Comercializadora Andina Ltda", nit: "800.234.115-7", code: "CA" },
];

export default async function GenerarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await prisma.reqTemplate.findUnique({
    where: { id },
    include: { header: true, familyList: { orderBy: { order: "asc" }, include: { itemList: { orderBy: { order: "asc" } } } } },
  });
  if (!t || !t.header) notFound();

  const families: GenFamily[] = t.familyList.map((f) => ({ name: f.name, items: f.itemList.map((it) => it.text) }));
  const header: GenHeader = { firmName: t.header.firmName, city: t.header.city, asunto: t.header.asunto, intro: t.header.intro, noteGeneric: t.header.noteGeneric, closing: t.header.closing, signatoryName: t.header.signatoryName, signatoryRole: t.header.signatoryRole, signatoryFooter: t.header.signatoryFooter, contactEmails: t.header.contactEmails };

  const allContacts = await prisma.clientContact.findMany({ orderBy: { order: "asc" } });
  const contactsByClient: Record<string, Contact[]> = {};
  for (const c of allContacts) (contactsByClient[c.clientName] ??= []).push({ name: c.name, role: c.role, email: c.email, primary: c.primary });

  return (
    <div>
      <div className="mb-3"><BackLink href={`/requerimientos/plantillas/${t.id}`} label="Volver a la plantilla" /></div>
      <PageHeader title={`Generar · ${t.name}`} subtitle={`${t.code} ${t.activeVersion}`} />
      <GenerarClient templateCode={t.code} templateVersion={t.activeVersion} header={header} families={families} clients={CLIENTS} contactsByClient={contactsByClient} />
    </div>
  );
}
```

Create `src/app/(app)/requerimientos/generar/[id]/generar-client.tsx`:
```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, BrandMark } from "@/components/icons";
import { Card } from "@/components/ui";
import { Modal } from "@/components/modal";
import { generateRequirement } from "@/app/actions/requerimientos";

export type GenFamily = { name: string; items: string[] };
export type GenHeader = { firmName: string; city: string; asunto: string; intro: string; noteGeneric: string; closing: string; signatoryName: string; signatoryRole: string; signatoryFooter: string; contactEmails: string[] };
export type Contact = { name: string; role: string; email: string; primary: boolean };
type Client = { name: string; nit: string; code: string };

export default function GenerarClient({
  templateCode, templateVersion, header, families, clients, contactsByClient,
}: {
  templateCode: string; templateVersion: string; header: GenHeader; families: GenFamily[]; clients: Client[]; contactsByClient: Record<string, Contact[]>;
}) {
  const router = useRouter();
  const [clientIdx, setClientIdx] = useState(0);
  const client = clients[clientIdx];
  const contacts = contactsByClient[client.name] ?? [];
  const [period, setPeriod] = useState("Cierre 2025");
  const [yearC, setYearC] = useState("2025");
  const [cutoff, setCutoff] = useState("31 de diciembre de 2025");
  const [recipients, setRecipients] = useState<string[]>(() => contacts.map((c) => c.email));
  const [sent, setSent] = useState<{ consec: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const yearP = String(Number(yearC) - 1);
  const consec = `RFA 014 – 2026 ${client.code}`;
  const replaceVars = (s: string) => s.replaceAll("{{fecha_corte}}", cutoff).replaceAll("{{cliente}}", client.name).replaceAll("{{año_corte}}", yearC).replaceAll("{{año_anterior}}", yearP);

  const onClientChange = (i: number) => { setClientIdx(i); setRecipients((contactsByClient[clients[i].name] ?? []).map((c) => c.email)); };
  const toggle = (email: string) => setRecipients((r) => (r.includes(email) ? r.filter((e) => e !== email) : [...r, email]));

  const send = async () => {
    setSaving(true);
    const res = await generateRequirement({ templateCode, templateVersion, clientName: client.name, clientCode: client.code, period, recipients: recipients.length });
    setSaving(false);
    setSent({ consec: res.consec });
  };

  const primary = useMemo(() => contacts.filter((c) => c.primary), [contacts]);
  const copyTo = useMemo(() => contacts.filter((c) => !c.primary), [contacts]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
      {/* Configuración */}
      <Card className="self-start p-4">
        <h2 className="mb-3 text-[13px] font-semibold text-ink-800">Configuración del envío</h2>
        <label className="mb-3 block"><span className="text-[11.5px] font-medium text-ink-600">Cliente</span>
          <select value={clientIdx} onChange={(e) => onClientChange(Number(e.target.value))} className="mt-1 w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400">
            {clients.map((c, i) => <option key={c.code} value={i}>{c.name}</option>)}
          </select>
          <span className="mt-1 block text-[11px] text-ink-400">NIT {client.nit} · sufijo {client.code}</span>
        </label>
        <div className="mb-3 flex gap-2">
          <label className="flex-1"><span className="text-[11.5px] font-medium text-ink-600">Período</span><input value={period} onChange={(e) => setPeriod(e.target.value)} className="mt-1 w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400" /></label>
          <label className="w-24"><span className="text-[11.5px] font-medium text-ink-600">Año corte</span><input value={yearC} onChange={(e) => setYearC(e.target.value)} className="mt-1 w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400" /></label>
        </div>
        <label className="mb-3 block"><span className="text-[11.5px] font-medium text-ink-600">Fecha de corte</span><input value={cutoff} onChange={(e) => setCutoff(e.target.value)} className="mt-1 w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400" /></label>
        <div className="mb-3"><span className="text-[11.5px] font-medium text-ink-600">Consecutivo</span><div className="mt-1 rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1.5 font-mono text-[12px] text-ink-600">{consec}</div></div>

        <div className="text-[11.5px] font-medium text-ink-600">Destinatarios</div>
        <div className="mt-1.5 flex flex-col gap-1.5">
          {contacts.map((c) => {
            const on = recipients.includes(c.email);
            return (
              <label key={c.email} className={`flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 ${on ? "border-blue-300 bg-blue-50" : "border-ink-150"}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(c.email)} className="mt-0.5" />
                <div className="text-[12px]"><div className="flex items-center gap-1.5"><b className="text-ink-800">{c.name}</b>{c.primary && <span className="rounded-full bg-blue-100 px-1.5 text-[10px] font-semibold text-navy-700">principal</span>}</div><div className="text-ink-500">{c.role}</div><div className="font-mono text-[11px] text-ink-400">{c.email}</div></div>
              </label>
            );
          })}
        </div>

        <div className="mt-3 flex gap-2">
          <button disabled title="Exportación — fase posterior" className="flex-1 cursor-not-allowed rounded-md bg-ink-100 px-2.5 py-2 text-[12px] font-semibold text-ink-400">PDF</button>
          <button disabled title="Exportación — fase posterior" className="flex-1 cursor-not-allowed rounded-md bg-ink-100 px-2.5 py-2 text-[12px] font-semibold text-ink-400">Word</button>
        </div>
        <button onClick={send} disabled={saving || recipients.length === 0} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-navy-700 px-3 py-2.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"><Icon name="send" size={14} /> {saving ? "Enviando…" : `Enviar por email (${recipients.length})`}</button>
      </Card>

      {/* Vista previa */}
      <Card className="self-start p-0">
        <div className="border-b border-ink-100 px-4 py-2.5 text-[11px] text-ink-400">Vista previa de la carta · A4 · {families.length + 1} secciones</div>
        <div className="overflow-y-auto p-8" style={{ fontFamily: "Georgia, serif", maxHeight: 720 }}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2"><BrandMark size={32} /><div><div className="text-[13px] font-semibold">Russell Bedford</div><div className="text-[10px] uppercase tracking-wider text-ink-500">{header.firmName.toUpperCase()}</div></div></div>
            <div className="text-right text-[11px] text-ink-500">{header.city}, 6 de enero de 2026<div className="font-mono">{consec}</div></div>
          </div>
          <div className="mt-6 text-[12.5px] leading-relaxed text-ink-800">
            <p>Señores</p><p className="font-semibold uppercase">{client.name}</p><p>NIT {client.nit}</p><p>Ciudad.</p>
            {primary.map((c) => <div key={c.email} className="mt-3"><p>Doctor:</p><p className="font-semibold">{c.name}</p><p>{c.role}.</p></div>)}
            {copyTo.length > 0 && <div className="mt-3"><p className="font-semibold">Copia a:</p>{copyTo.map((c) => <p key={c.email}>{c.name} — {c.role}.</p>)}</div>}
            <p className="mt-4"><b>ASUNTO:</b> {replaceVars(header.asunto)}</p>
            <p className="mt-3 whitespace-pre-line">{header.intro}</p>
            <p className="mt-3">{header.noteGeneric}</p>
            <div className="my-4 border-t border-dashed border-ink-300 pt-1 text-center text-[10px] text-ink-300">— documentos solicitados —</div>
            {families.map((f) => (
              <div key={f.name} className="mt-3"><p className="font-semibold">{f.name}</p><ul className="ml-5 list-disc">{f.items.map((it, i) => <li key={i}>{replaceVars(it)}</li>)}</ul></div>
            ))}
            <p className="mt-4">{header.closing}</p>
            <p className="mt-2">A continuación, las direcciones de correo del equipo:</p>
            <ul className="ml-5 list-disc font-mono text-[11px]">{header.contactEmails.map((e) => <li key={e}>{e}</li>)}</ul>
            <div className="mt-6"><p>Cordialmente,</p><div className="mt-6"><p className="font-semibold">{header.signatoryName}</p><p>{header.signatoryRole}</p><p className="text-ink-500">{header.signatoryFooter}</p></div></div>
          </div>
        </div>
      </Card>

      {sent && (
        <Modal open onClose={() => setSent(null)} title="Requerimiento enviado">
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ok-100 text-ok-700"><Icon name="check" size={24} /></div>
            <p className="text-[13px] text-ink-700">Se envió <b>{sent.consec}</b> a <b>{recipients.length} destinatario(s)</b>. Quedó registrado en el historial.</p>
            <div className="mt-1 flex gap-2">
              <button onClick={() => setSent(null)} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] text-ink-600 hover:bg-ink-50">Cerrar</button>
              <button onClick={() => router.push("/requerimientos")} className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600">Ver historial</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores; rutas `/requerimientos/plantillas/[id]` y `/requerimientos/generar/[id]` en el output.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/requerimientos"
git commit -m "feat: requerimientos — índice, detalle de plantilla y generación de carta con envío"
```

---

## Task 6A.5: Validación de cierre de Fase 6A

- [ ] **Step 1: Suite**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build && npx prisma migrate status`
Expected: todo verde.

- [ ] **Step 2: Re-seed**

Run: `npm run db:seed`

- [ ] **Step 3: Criterios de aceptación (smoke — lo ejecuta el controlador)**

Con `npm run dev` + sesión:
- `/requerimientos`: tab Plantillas (4, con código/versión/familias/ítems/usos) y tab Historial (5 envíos, estado Enviado/Borrador). "Abrir" → detalle.
- `/requerimientos/plantillas/TPL-CIERRE`: secciones Familias (13 familias en lista lateral, ítems de la activa) y Encabezado de carta (campos). "Generar requerimiento" → generación.
- `/requerimientos/generar/TPL-CIERRE`: selector de cliente (recarga destinatarios), período/año/corte, consecutivo, checklist de destinatarios, **vista previa de la carta** con variables sustituidas ({{año_corte}}→2025) y familias/ítems. "Enviar por email" **crea un requerimiento** (modal de confirmación con consecutivo) y aparece en el Historial al volver.

- [ ] **Step 4: Commit final (si aplica)**

```bash
git add -A && git commit -m "chore: cierre y validación de Fase 6A" || echo "nada"
```

---

## Notas
- Editor de plantilla en **solo lectura** (el del prototipo es no funcional / `defaultValue`); la edición persistente puede añadirse luego.
- Ítems **representativos** por familia (el prototipo no expone los 78 literales); el conteo del listado usa la metadata de la plantilla.
- Generación **persiste** un `ReqSubmission` real; el PDF/Word se difiere (vista previa en pantalla con sustitución de variables).
- `ClientContact` (diferido de Fase 1) se crea aquí.
- 6B (repositorios) y 6C (presentaciones) son sub-planes hermanos.
- Sin placeholders pendientes.
