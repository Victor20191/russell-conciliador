# Fase 0 (Fundaciones) + Fase 1 (Configuración) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir los cimientos compartidos mínimos (Fase 0) y dejar los módulos de Configuración — `/config/modulos` y `/config/clientes` — completamente funcionales y persistentes según el prototipo (Fase 1).

**Architecture:** App Next.js 16 (App Router) + Prisma 7 + Postgres. Las páginas son React Server Components que leen de Prisma; la interactividad vive en componentes `"use client"` aislados; las mutaciones son Server Actions que validan con zod, escriben en Prisma, registran auditoría y llaman `revalidatePath`. Se introduce **Vitest** para TDD de la lógica pura (helpers, esquemas zod); los componentes/páginas se validan con `tsc` + `next build` + smoke render manual (no se hace render-testing de RSC por su costo).

**Decisión de alcance (refinamiento YAGNI sobre el spec maestro):** La Fase 0 construye **solo** los primitivos con consumidor real dentro de este plan (Modal, EmptyState, helpers de formato, `logAudit`) más el pulido autocontenido del shell (topbar "Marcar todo leído" + Ayuda, sidebar auto-expandir). Los demás primitivos del spec maestro (Dropzone, SidePanel, Tabs, FilterChips, ConfidenceBar, ListEditor, CommentThread, `ai-sim`, storage, cliente-activo, `StatCard` con delta, iconos `copy`/`edit`) se construirán en la **fase que primero los consume**, cuando su interfaz real sea conocida — así se evita abstracción especulativa.

**Tech Stack:** Next.js 16.2.7, React 19, Prisma 7 (+ adapter-pg), PostgreSQL 17, zod 4, Tailwind v4, TypeScript 5, Vitest (nuevo).

**Restricción obligatoria:** `AGENTS.md` advierte que esta versión de Next.js tiene breaking changes. Antes de tocar Server Actions / params / cookies, consultar `node_modules/next/dist/docs/01-app/`. Puntos ya verificados para este plan: `cookies()` es **async** (`await cookies()`); `searchParams` de una página es un **Promise** (`const sp = await searchParams`); las Server Actions usan la directiva `"use server"` y se invocan desde formularios (`action={...}`/`formAction`).

**Rama de trabajo:** `finalizacion-lfm` (ya creada). Todos los commits van ahí.

---

## Mapa de archivos

**Fase 0 — crear:**
- `russell-lfm/vitest.config.ts` — configuración del runner de tests.
- `russell-lfm/src/lib/format.test.ts` — tests de helpers de formato.
- `russell-lfm/src/lib/audit.ts` — helper `logAudit`.
- `russell-lfm/src/components/modal.tsx` — componente `Modal` (client).
- `russell-lfm/src/app/actions/notifications.ts` — acción `markAllNotificationsRead`.

**Fase 0 — modificar:**
- `russell-lfm/package.json` — scripts `test`/`test:watch` + devDep vitest.
- `russell-lfm/src/lib/format.ts` — añadir `fmtDate`, `timeAgo`.
- `russell-lfm/src/components/ui.tsx` — añadir `EmptyState`.
- `russell-lfm/src/components/topbar.tsx` — "Marcar todo leído" + botón Ayuda.
- `russell-lfm/src/components/sidebar.tsx` — auto-expandir grupo activo al navegar.

**Fase 1 — crear:**
- `russell-lfm/src/lib/definitions.test.ts` — tests de esquemas zod.
- `russell-lfm/src/app/actions/module-fields.ts` — CRUD de campos estándar.
- `russell-lfm/src/app/actions/clients.ts` — CRUD de clientes + estado de módulos.
- `russell-lfm/src/app/(app)/config/modulos/modulos-client.tsx` — UI master-detail (client).
- `russell-lfm/src/app/(app)/config/clientes/clientes-client.tsx` — UI matriz + filtros + modal (client).

**Fase 1 — modificar:**
- `russell-lfm/prisma/schema.prisma` — modelo `ModuleField` + relación en `Module`.
- `russell-lfm/prisma/seed.ts` — sembrar campos de Inventarios (idempotente).
- `russell-lfm/src/lib/definitions.ts` — `ActionState`, `ModuleFieldSchema`, `ClientSchema`.
- `russell-lfm/src/app/(app)/config/modulos/page.tsx` — reescribir como server component master-detail.
- `russell-lfm/src/app/(app)/config/clientes/page.tsx` — reescribir como server component con filtros.

> **Nota de rutas:** todos los comandos asumen el directorio de trabajo `russell-lfm/` (donde vive `package.json` y el repo git).

---

# FASE 0 · Fundaciones

## Task 0.1: Configurar Vitest (infraestructura de tests)

**Files:**
- Create: `russell-lfm/vitest.config.ts`
- Create: `russell-lfm/src/lib/format.test.ts`
- Modify: `russell-lfm/package.json`

- [ ] **Step 1: Instalar Vitest**

Run:
```bash
npm install -D vitest
```
Expected: instala `vitest` en `devDependencies` sin errores.

- [ ] **Step 2: Crear `vitest.config.ts`**

Create `russell-lfm/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Añadir scripts a `package.json`**

En `russell-lfm/package.json`, dentro de `"scripts"`, añadir (tras `"lint": "eslint"`):
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 4: Escribir un test inicial sobre un helper existente**

Create `russell-lfm/src/lib/format.test.ts`:
```ts
import { test, expect } from "vitest";
import { pct } from "./format";

test("pct redondea a porcentaje entero", () => {
  expect(pct(0.5)).toBe("50%");
  expect(pct(0.823)).toBe("82%");
});
```

- [ ] **Step 5: Ejecutar los tests**

Run:
```bash
npx vitest run
```
Expected: PASS, 1 archivo, 1 test verde.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/format.test.ts
git commit -m "test: configurar Vitest para TDD de lógica pura"
```

---

## Task 0.2: Helpers de formato `fmtDate` y `timeAgo` (TDD)

**Files:**
- Modify: `russell-lfm/src/lib/format.ts`
- Test: `russell-lfm/src/lib/format.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `russell-lfm/src/lib/format.test.ts`:
```ts
import { fmtDate, timeAgo } from "./format";

test("fmtDate formatea como DD/MMM/AAAA en español", () => {
  expect(fmtDate(new Date(2026, 4, 3))).toBe("03/May/2026");
  expect(fmtDate(new Date(2026, 0, 31))).toBe("31/Ene/2026");
});

test("fmtDate devuelve guion para entradas nulas o inválidas", () => {
  expect(fmtDate(null)).toBe("—");
  expect(fmtDate("no-es-fecha")).toBe("—");
});

test("timeAgo expresa la diferencia relativa con un ahora fijo", () => {
  const now = new Date(2026, 0, 1, 12, 30, 0);
  expect(timeAgo(new Date(2026, 0, 1, 12, 0, 0), now)).toBe("hace 30 min");
  expect(timeAgo(new Date(2026, 0, 1, 10, 30, 0), now)).toBe("hace 2 h");
  expect(timeAgo(new Date(2025, 11, 30, 12, 30, 0), now)).toBe("hace 2 días");
  expect(timeAgo(new Date(2026, 0, 1, 12, 29, 30), now)).toBe("hace un momento");
});
```

- [ ] **Step 2: Ejecutar para verificar el fallo**

Run:
```bash
npx vitest run src/lib/format.test.ts
```
Expected: FAIL — `fmtDate`/`timeAgo` no exportadas.

- [ ] **Step 3: Implementar los helpers**

Añadir al final de `russell-lfm/src/lib/format.ts`:
```ts
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export const fmtDate = (input: Date | string | null | undefined): string => {
  if (input == null) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  return `${dd}/${MESES[d.getMonth()]}/${d.getFullYear()}`;
};

export const timeAgo = (input: Date | string, now: Date = new Date()): string => {
  const d = typeof input === "string" ? new Date(input) : input;
  const diff = Math.max(0, now.getTime() - d.getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.floor(h / 24);
  return `hace ${days} día${days === 1 ? "" : "s"}`;
};
```

- [ ] **Step 4: Ejecutar para verificar el éxito**

Run:
```bash
npx vitest run src/lib/format.test.ts
```
Expected: PASS — todos los tests verdes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "feat: añadir fmtDate y timeAgo a lib/format"
```

---

## Task 0.3: Helper de auditoría `logAudit`

**Files:**
- Create: `russell-lfm/src/lib/audit.ts`

- [ ] **Step 1: Crear el helper**

Create `russell-lfm/src/lib/audit.ts`:
```ts
import "server-only";
import prisma from "@/lib/prisma";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Sello "DD/MMM/AAAA HH:MM:SS" consistente con el seed (AuditEntry.ts es String).
function stamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${MESES[d.getMonth()]}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export type AuditInput = {
  user: string;
  action: string;
  entity: string;
  detail: string;
};

// Registro inmutable en la bitácora del sistema. Lo invocan las Server Actions de negocio.
export async function logAudit({ user, action, entity, detail }: AuditInput): Promise<void> {
  await prisma.auditEntry.create({
    data: { ts: stamp(), user, action, entity, detail },
  });
}
```

- [ ] **Step 2: Verificar tipos**

Run:
```bash
npx tsc --noEmit
```
Expected: sin errores nuevos (`AuditEntry` ya existe en el cliente Prisma generado).

- [ ] **Step 3: Commit**

```bash
git add src/lib/audit.ts
git commit -m "feat: añadir helper logAudit para la bitácora del sistema"
```

---

## Task 0.4: Componente `Modal` (client)

**Files:**
- Create: `russell-lfm/src/components/modal.tsx`

- [ ] **Step 1: Crear el componente**

Create `russell-lfm/src/components/modal.tsx`:
```tsx
"use client";

import { useEffect } from "react";
import { Icon } from "@/components/icons";

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-navy-900/40 p-4 pt-[8vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border border-ink-150 bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
          <h2 className="text-[13.5px] font-semibold text-ink-800">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded p-1 text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-ink-100 px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run:
```bash
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/modal.tsx
git commit -m "feat: añadir componente Modal reutilizable"
```

> El render real del Modal se valida en la Fase 1 (formulario de cliente). No requiere página de prueba propia.

---

## Task 0.5: Componente `EmptyState`

**Files:**
- Modify: `russell-lfm/src/components/ui.tsx`

- [ ] **Step 1: Añadir el componente**

Añadir al final de `russell-lfm/src/components/ui.tsx`:
```tsx
export function EmptyState({
  icon = "doc",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-100 text-ink-400">
        <Icon name={icon} size={20} />
      </div>
      <div className="text-[13.5px] font-semibold text-ink-800">{title}</div>
      {description && (
        <p className="max-w-sm text-[12.5px] text-ink-500">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
```

(`Icon` e `IconName` ya están importados al inicio de `ui.tsx`.)

- [ ] **Step 2: Verificar tipos**

Run:
```bash
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui.tsx
git commit -m "feat: añadir componente EmptyState"
```

---

## Task 0.6: Topbar — "Marcar todo leído" + botón Ayuda

**Files:**
- Create: `russell-lfm/src/app/actions/notifications.ts`
- Modify: `russell-lfm/src/components/topbar.tsx`

- [ ] **Step 1: Crear la Server Action**

Create `russell-lfm/src/app/actions/notifications.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { verifySession } from "@/lib/dal";

export async function markAllNotificationsRead(): Promise<void> {
  await verifySession();
  await prisma.notification.updateMany({
    where: { unread: true },
    data: { unread: false },
  });
  revalidatePath("/", "layout");
}
```

> `revalidatePath("/", "layout")` revalida el layout que carga las notificaciones, de modo que el popover se actualiza tras la acción.

- [ ] **Step 2: Cablear el botón en la topbar**

En `russell-lfm/src/components/topbar.tsx`:

(a) Añadir el import tras la línea `import { Icon } from "@/components/icons";`:
```tsx
import { markAllNotificationsRead } from "@/app/actions/notifications";
```

(b) Reemplazar el encabezado del popover (el bloque que hoy dice "Notificaciones" + badge "{unread} sin leer") por una versión con la acción. Buscar:
```tsx
              <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-2.5">
                <b className="text-[13px] text-ink-800">Notificaciones</b>
                <span className="rounded-full bg-ai-100 px-1.5 py-0.5 text-[10px] font-semibold text-ai-700">
                  {unread} sin leer
                </span>
              </div>
```
y reemplazarlo por:
```tsx
              <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-2.5">
                <b className="text-[13px] text-ink-800">Notificaciones</b>
                <span className="rounded-full bg-ai-100 px-1.5 py-0.5 text-[10px] font-semibold text-ai-700">
                  {unread} sin leer
                </span>
                {unread > 0 && (
                  <form action={markAllNotificationsRead} className="ml-auto">
                    <button
                      type="submit"
                      className="text-[11px] font-medium text-blue-500 hover:underline"
                    >
                      Marcar todo leído
                    </button>
                  </form>
                )}
              </div>
```

(c) Añadir el botón de Ayuda junto a la campana. Buscar el cierre del bloque `<div className="relative">` que contiene la campana y su popover (la línea `</div>` que cierra ese `div.relative`, justo antes de `</div>` que cierra `ml-auto`). Inmediatamente **después** de ese `</div>` de `relative`, insertar:
```tsx
        <button
          type="button"
          aria-label="Ayuda"
          title="Ayuda"
          className="rounded-md border border-ink-200 bg-white p-2 text-ink-600 transition hover:bg-ink-50"
        >
          <Icon name="doc" size={16} />
        </button>
```

- [ ] **Step 3: Verificar tipos y build**

Run:
```bash
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 4: Smoke render manual**

Run (en una terminal):
```bash
npm run dev
```
Navegar a `http://localhost:3000/login`, entrar con `admin@russellbedford.co` / `Russell2026*`, ir a `/dashboard`, abrir la campana: debe verse "Marcar todo leído" y el botón de Ayuda. Click en "Marcar todo leído" → el punto rojo y el contador desaparecen. Detener con Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/notifications.ts src/components/topbar.tsx
git commit -m "feat: marcar todas las notificaciones leídas + botón de ayuda en topbar"
```

---

## Task 0.7: Sidebar — auto-expandir el grupo activo al navegar

**Files:**
- Modify: `russell-lfm/src/components/sidebar.tsx`

- [ ] **Step 1: Añadir el efecto de auto-expansión**

En `russell-lfm/src/components/sidebar.tsx`:

(a) Cambiar el import de React (línea 3) de:
```tsx
import { useState } from "react";
```
a:
```tsx
import { useEffect, useState } from "react";
```

(b) Justo después de la declaración de `toggle` (la función `const toggle = ...`), añadir:
```tsx
  // Auto-expandir el grupo activo cuando cambia la ruta (sin colapsar lo que el usuario abrió).
  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      workNav.forEach((it) => {
        if (it.children && isGroupActive(pathname, it)) next[it.href] = true;
      });
      return next;
    });
  }, [pathname]);
```

- [ ] **Step 2: Verificar tipos**

Run:
```bash
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3: Smoke render manual**

`npm run dev`, entrar y navegar directo a `/razonabilidad` (vía URL): el grupo "Balance de comprobación" debe quedar expandido mostrando el hijo activo. Ctrl-C al terminar.

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat: auto-expandir el grupo activo del sidebar al navegar"
```

---

## Task 0.8: Validación de cierre de Fase 0

- [ ] **Step 1: Tests**

Run:
```bash
npx vitest run
```
Expected: PASS — todos los tests (`format.test.ts`).

- [ ] **Step 2: Typecheck + lint + build**

Run:
```bash
npx tsc --noEmit && npm run lint && npm run build
```
Expected: sin errores; `next build` completa.

- [ ] **Step 3: Confirmar criterios de aceptación Fase 0**

Verificar manualmente:
- `Modal`, `EmptyState`, `logAudit`, `fmtDate`, `timeAgo` existen y compilan.
- "Marcar todo leído" pone `unread=false` y el badge desaparece.
- El grupo activo del sidebar se auto-expande al navegar.

No requiere commit adicional si no hubo cambios.

---

# FASE 1 · Configuración

## Task 1.1: Modelo Prisma `ModuleField` + migración

**Files:**
- Modify: `russell-lfm/prisma/schema.prisma`

- [ ] **Step 1: Añadir la relación en `Module`**

En `russell-lfm/prisma/schema.prisma`, en el modelo `Module`, añadir la línea de relación `fields`:
```prisma
model Module {
  id      String         @id // INV, CAR, NOM...
  name    String
  icon    String
  clients ClientModule[]
  fields  ModuleField[]
}
```

- [ ] **Step 2: Añadir el modelo `ModuleField`**

Inmediatamente después del modelo `Module`, añadir:
```prisma
// ===== Campos estándar por módulo (Config · Módulos y campos) =====
model ModuleField {
  id       String  @id @default(cuid())
  module   Module  @relation(fields: [moduleId], references: [id], onDelete: Cascade)
  moduleId String
  key      String // clave técnica: cuenta, codigo_item...
  label    String
  type     String // string | number | date
  required Boolean @default(false)
  hint     String?
  order    Int     @default(0)

  @@unique([moduleId, key])
}
```

- [ ] **Step 3: Crear y aplicar la migración**

Run:
```bash
npx prisma migrate dev --name add_module_field
```
Expected: crea `prisma/migrations/<ts>_add_module_field/migration.sql`, aplica a la BD y regenera el cliente. `npx prisma migrate status` → "up to date".

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): modelo ModuleField (campos estándar por módulo)"
```

---

## Task 1.2: Sembrar los campos estándar de Inventarios

**Files:**
- Modify: `russell-lfm/prisma/seed.ts`

- [ ] **Step 1: Añadir la limpieza idempotente**

En `russell-lfm/prisma/seed.ts`, en el bloque "Limpieza idempotente", añadir `moduleField.deleteMany()` **antes** de `module.deleteMany()` (para respetar la FK):
```ts
  await prisma.moduleField.deleteMany();
  await prisma.module.deleteMany();
```

- [ ] **Step 2: Sembrar los 10 campos de Inventarios**

En `seed.ts`, justo después del bloque que crea los módulos (`await prisma.module.createMany({ data: modules });`) y antes de la definición de `nameToModuleId`, añadir:
```ts
  // ---- Campos estándar (solo Inventarios en el prototipo) ----
  const invFields: { key: string; label: string; type: string; required: boolean; hint: string | null }[] = [
    { key: "cuenta", label: "Cuenta contable", type: "string", required: true, hint: "Código PUC del cliente" },
    { key: "descripcion_cuenta", label: "Descripción cuenta", type: "string", required: true, hint: null },
    { key: "codigo_item", label: "Código del ítem", type: "string", required: true, hint: null },
    { key: "descripcion_item", label: "Descripción del ítem", type: "string", required: true, hint: null },
    { key: "unidad", label: "Unidad de medida", type: "string", required: false, hint: null },
    { key: "cantidad", label: "Cantidad en existencia", type: "number", required: true, hint: null },
    { key: "costo_unitario", label: "Costo unitario", type: "number", required: true, hint: null },
    { key: "valor_total", label: "Valor total", type: "number", required: true, hint: null },
    { key: "bodega", label: "Bodega", type: "string", required: false, hint: null },
    { key: "fecha_corte", label: "Fecha de corte", type: "date", required: true, hint: null },
  ];
  await prisma.moduleField.createMany({
    data: invFields.map((f, i) => ({
      moduleId: "INV",
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      hint: f.hint,
      order: i,
    })),
  });
```

> Los otros 5 módulos no tienen campos en el prototipo: quedan vacíos a propósito (la UI mostrará un `EmptyState` con "Agregar campo").

- [ ] **Step 3: Re-sembrar y verificar**

Run:
```bash
npm run db:seed
```
Expected: corre sin error. Verificar:
```bash
npx prisma studio
```
(o consulta SQL) → la tabla `ModuleField` tiene 10 filas con `moduleId = "INV"`. Cerrar Studio con Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(db): sembrar campos estándar de Inventarios"
```

---

## Task 1.3: Esquemas zod de configuración (TDD)

**Files:**
- Modify: `russell-lfm/src/lib/definitions.ts`
- Test: `russell-lfm/src/lib/definitions.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Create `russell-lfm/src/lib/definitions.test.ts`:
```ts
import { test, expect } from "vitest";
import { ModuleFieldSchema, ClientSchema } from "./definitions";

test("ModuleFieldSchema acepta un campo válido", () => {
  const r = ModuleFieldSchema.safeParse({
    moduleId: "INV",
    key: "codigo_item",
    label: "Código del ítem",
    type: "string",
    required: true,
    hint: "",
  });
  expect(r.success).toBe(true);
});

test("ModuleFieldSchema rechaza clave con mayúsculas o espacios", () => {
  const r = ModuleFieldSchema.safeParse({
    moduleId: "INV",
    key: "Codigo Item",
    label: "X",
    type: "string",
    required: false,
  });
  expect(r.success).toBe(false);
});

test("ModuleFieldSchema rechaza un tipo no permitido", () => {
  const r = ModuleFieldSchema.safeParse({
    moduleId: "INV",
    key: "x",
    label: "X",
    type: "boolean",
    required: false,
  });
  expect(r.success).toBe(false);
});

test("ClientSchema exige código, nombre, nit, erp y sector", () => {
  expect(
    ClientSchema.safeParse({
      id: "C-9001",
      name: "Demo S.A.S",
      nit: "900.000.000-1",
      erp: "SIESA",
      sector: "Comercio",
    }).success,
  ).toBe(true);
  expect(
    ClientSchema.safeParse({ id: "", name: "", nit: "", erp: "", sector: "" }).success,
  ).toBe(false);
});
```

- [ ] **Step 2: Ejecutar para verificar el fallo**

Run:
```bash
npx vitest run src/lib/definitions.test.ts
```
Expected: FAIL — `ModuleFieldSchema`/`ClientSchema` no exportadas.

- [ ] **Step 3: Implementar los esquemas y tipos**

Añadir al final de `russell-lfm/src/lib/definitions.ts`:
```ts
// Estado genérico de las Server Actions usadas con useActionState.
export type ActionState = {
  ok?: boolean;
  errors?: Record<string, string[]>;
  message?: string;
};

export const ModuleFieldSchema = z.object({
  moduleId: z.string().min(1),
  key: z
    .string()
    .min(1, { error: "La clave es obligatoria." })
    .regex(/^[a-z0-9_]+$/, { error: "Solo minúsculas, números y guion bajo." }),
  label: z.string().min(1, { error: "La etiqueta es obligatoria." }),
  type: z.enum(["string", "number", "date"]),
  required: z.boolean(),
  hint: z.string().optional(),
});

export const ClientSchema = z.object({
  id: z.string().min(1, { error: "El código es obligatorio." }).trim(),
  name: z.string().min(1, { error: "El nombre es obligatorio." }).trim(),
  nit: z.string().min(1, { error: "El NIT es obligatorio." }).trim(),
  erp: z.string().min(1, { error: "El ERP es obligatorio." }).trim(),
  sector: z.string().min(1, { error: "El sector es obligatorio." }).trim(),
});
```

(`import * as z from "zod";` ya está al inicio del archivo.)

- [ ] **Step 4: Ejecutar para verificar el éxito**

Run:
```bash
npx vitest run src/lib/definitions.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/definitions.ts src/lib/definitions.test.ts
git commit -m "feat: esquemas zod ModuleFieldSchema y ClientSchema + ActionState"
```

---

## Task 1.4: Server Actions de campos de módulo

**Files:**
- Create: `russell-lfm/src/app/actions/module-fields.ts`

- [ ] **Step 1: Crear las acciones**

Create `russell-lfm/src/app/actions/module-fields.ts`:
```ts
"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { verifySession, getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { ModuleFieldSchema, type ActionState } from "@/lib/definitions";

const PATH = "/config/modulos";

export async function createModuleField(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await verifySession();
  const parsed = ModuleFieldSchema.safeParse({
    moduleId: formData.get("moduleId"),
    key: formData.get("key"),
    label: formData.get("label"),
    type: formData.get("type"),
    required: formData.get("required") === "on",
    hint: (formData.get("hint") as string) ?? "",
  });
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }
  const { moduleId, key, label, type, required, hint } = parsed.data;

  const dup = await prisma.moduleField.findUnique({
    where: { moduleId_key: { moduleId, key } },
  });
  if (dup) return { ok: false, message: "Ya existe un campo con esa clave en el módulo." };

  const order = await prisma.moduleField.count({ where: { moduleId } });
  await prisma.moduleField.create({
    data: { moduleId, key, label, type, required, hint: hint?.trim() || null, order },
  });

  const user = await getCurrentUser();
  await logAudit({
    user: user?.name ?? "Sistema",
    action: "AGREGÓ CAMPO",
    entity: `Módulo ${moduleId}`,
    detail: `${key} · ${label}`,
  });
  revalidatePath(PATH);
  return { ok: true };
}

export async function updateModuleField(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await verifySession();
  const id = formData.get("id") as string;
  if (!id) return { ok: false, message: "Campo inexistente." };

  const parsed = ModuleFieldSchema.safeParse({
    moduleId: formData.get("moduleId"),
    key: formData.get("key"),
    label: formData.get("label"),
    type: formData.get("type"),
    required: formData.get("required") === "on",
    hint: (formData.get("hint") as string) ?? "",
  });
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }
  const { key, label, type, required, hint } = parsed.data;

  await prisma.moduleField.update({
    where: { id },
    data: { key, label, type, required, hint: hint?.trim() || null },
  });
  revalidatePath(PATH);
  return { ok: true };
}

export async function deleteModuleField(formData: FormData): Promise<void> {
  await verifySession();
  const id = formData.get("id") as string;
  if (id) {
    await prisma.moduleField.delete({ where: { id } });
    revalidatePath(PATH);
  }
}

export async function moveModuleField(formData: FormData): Promise<void> {
  await verifySession();
  const id = formData.get("id") as string;
  const dir = formData.get("dir") as string; // "up" | "down"
  const field = await prisma.moduleField.findUnique({ where: { id } });
  if (!field) return;

  const neighbor = await prisma.moduleField.findFirst({
    where: {
      moduleId: field.moduleId,
      order: dir === "up" ? { lt: field.order } : { gt: field.order },
    },
    orderBy: { order: dir === "up" ? "desc" : "asc" },
  });
  if (!neighbor) return;

  await prisma.$transaction([
    prisma.moduleField.update({ where: { id: field.id }, data: { order: neighbor.order } }),
    prisma.moduleField.update({ where: { id: neighbor.id }, data: { order: field.order } }),
  ]);
  revalidatePath(PATH);
}
```

- [ ] **Step 2: Verificar tipos**

Run:
```bash
npx tsc --noEmit
```
Expected: sin errores (el cliente Prisma ya conoce `moduleField` tras la migración de la Task 1.1).

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/module-fields.ts
git commit -m "feat: Server Actions CRUD de campos de módulo"
```

---

## Task 1.5: Reescribir `/config/modulos` (master-detail)

**Files:**
- Modify: `russell-lfm/src/app/(app)/config/modulos/page.tsx`
- Create: `russell-lfm/src/app/(app)/config/modulos/modulos-client.tsx`

- [ ] **Step 1: Reescribir la página (server component)**

Reemplazar **todo** el contenido de `russell-lfm/src/app/(app)/config/modulos/page.tsx` por:
```tsx
import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import ModulosClient, { type ModuleWithFields } from "./modulos-client";

export default async function ModulosPage() {
  const modules = await prisma.module.findMany({
    orderBy: { name: "asc" },
    include: { fields: { orderBy: { order: "asc" } } },
  });

  return (
    <div>
      <PageHeader
        title="Módulos y campos"
        subtitle="Define los campos mínimos que deben venir en cada archivo. Aplican a todos los clientes."
      />
      <ModulosClient modules={modules as ModuleWithFields[]} />
    </div>
  );
}
```

- [ ] **Step 2: Crear el componente client master-detail**

Create `russell-lfm/src/app/(app)/config/modulos/modulos-client.tsx`:
```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Card, Chip, EmptyState } from "@/components/ui";
import { Modal } from "@/components/modal";
import {
  createModuleField,
  updateModuleField,
  deleteModuleField,
  moveModuleField,
} from "@/app/actions/module-fields";
import type { ActionState } from "@/lib/definitions";

export type ModuleField = {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  hint: string | null;
  order: number;
};
export type ModuleWithFields = {
  id: string;
  name: string;
  icon: string;
  fields: ModuleField[];
};

const EQUIV = [
  { name: "PUC Inventarios", count: 42, version: "v3" },
  { name: "Centros de costo", count: 118, version: "v2" },
  { name: "Bodegas", count: 57, version: "v4" },
];

function validationFor(type: string): string {
  if (type === "number") return "≥ 0";
  if (type === "date") return "DD/MM/YYYY";
  return "texto libre";
}

export default function ModulosClient({ modules }: { modules: ModuleWithFields[] }) {
  const [activeId, setActiveId] = useState(modules[0]?.id ?? "");
  const [editing, setEditing] = useState<ModuleField | null>(null);
  const [creating, setCreating] = useState(false);

  const active = modules.find((m) => m.id === activeId) ?? modules[0];
  if (!active) return null;

  return (
    <div className="flex items-start gap-4">
      {/* Master */}
      <Card className="w-60 shrink-0">
        <div className="border-b border-ink-100 px-4 py-2.5 text-[12px] font-semibold text-ink-700">
          Módulos
        </div>
        <div className="flex flex-col p-1.5">
          {modules.map((m) => {
            const on = m.id === active.id;
            return (
              <button
                key={m.id}
                onClick={() => setActiveId(m.id)}
                className={`flex items-center gap-2.5 rounded px-2.5 py-2 text-left text-[12.5px] transition ${
                  on ? "bg-blue-50 font-semibold text-navy-700" : "text-ink-600 hover:bg-ink-50"
                }`}
              >
                <Icon name={m.icon as IconName} size={15} />
                <span className="truncate">{m.name}</span>
                <span className="ml-auto text-[11px] text-ink-400">{m.fields.length}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Detail */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <Card>
          <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
            <h2 className="text-[13px] font-semibold text-ink-800">
              {active.name} · campos estándar
            </h2>
            <Chip label={`${active.fields.length} campo(s)`} tone="ink" />
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setCreating(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-2.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-navy-600"
              >
                <Icon name="plus" size={13} /> Agregar campo
              </button>
            </div>
          </div>

          {active.fields.length === 0 ? (
            <EmptyState
              icon="doc"
              title="Sin campos definidos"
              description="Este módulo aún no tiene campos estándar. Agrega el primero para empezar a parametrizar."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                    <th className="px-4 py-2 font-semibold">Clave</th>
                    <th className="px-4 py-2 font-semibold">Etiqueta</th>
                    <th className="px-4 py-2 font-semibold">Tipo</th>
                    <th className="px-4 py-2 font-semibold">Requerido</th>
                    <th className="px-4 py-2 font-semibold">Validación</th>
                    <th className="px-4 py-2 font-semibold">Descripción</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {active.fields.map((f, i) => (
                    <tr key={f.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                      <td className="px-4 py-2.5 font-mono text-navy-700">{f.key}</td>
                      <td className="px-4 py-2.5 text-ink-800">{f.label}</td>
                      <td className="px-4 py-2.5"><Chip label={f.type} tone="ink" /></td>
                      <td className="px-4 py-2.5">
                        {f.required ? <Chip label="Sí" tone="err" /> : <Chip label="No" tone="ink" />}
                      </td>
                      <td className="px-4 py-2.5 text-ink-500">{validationFor(f.type)}</td>
                      <td className="px-4 py-2.5 text-ink-500">{f.hint || "—"}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <form action={moveModuleField}>
                            <input type="hidden" name="id" value={f.id} />
                            <input type="hidden" name="dir" value="up" />
                            <button
                              type="submit"
                              disabled={i === 0}
                              title="Subir"
                              className="rounded p-1 text-ink-400 hover:bg-ink-100 disabled:opacity-30"
                            >
                              <Icon name="chev-d" size={13} className="rotate-180" />
                            </button>
                          </form>
                          <form action={moveModuleField}>
                            <input type="hidden" name="id" value={f.id} />
                            <input type="hidden" name="dir" value="down" />
                            <button
                              type="submit"
                              disabled={i === active.fields.length - 1}
                              title="Bajar"
                              className="rounded p-1 text-ink-400 hover:bg-ink-100 disabled:opacity-30"
                            >
                              <Icon name="chev-d" size={13} />
                            </button>
                          </form>
                          <button
                            onClick={() => setEditing(f)}
                            title="Editar"
                            className="rounded p-1 text-ink-500 hover:bg-ink-100"
                          >
                            <Icon name="settings" size={13} />
                          </button>
                          <form action={deleteModuleField}>
                            <input type="hidden" name="id" value={f.id} />
                            <button
                              type="submit"
                              title="Eliminar"
                              className="rounded p-1 text-err-500 hover:bg-err-100"
                            >
                              <Icon name="x" size={13} />
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Equivalencias (informativo, fiel al prototipo) */}
        <Card>
          <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
            <h2 className="text-[13px] font-semibold text-ink-800">Tablas de equivalencias estándar</h2>
            <Chip label="Plan único de cuentas (PUC)" tone="blue" />
          </div>
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
            {EQUIV.map((e) => (
              <div key={e.name} className="rounded-md border border-ink-150 px-3 py-2.5">
                <div className="text-[12.5px] font-semibold text-ink-800">{e.name}</div>
                <div className="mt-0.5 text-[11.5px] text-ink-500">{e.count} entradas · {e.version}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Modales: montados condicionalmente y con `key` para remontar
          (evita valores defaultValue obsoletos y resetea useActionState). */}
      {creating && (
        <FieldModal
          key="create"
          onClose={() => setCreating(false)}
          moduleId={active.id}
          title={`Nuevo campo · ${active.name}`}
          action={createModuleField}
        />
      )}
      {editing && (
        <FieldModal
          key={editing.id}
          onClose={() => setEditing(null)}
          moduleId={active.id}
          title="Editar campo"
          action={updateModuleField}
          field={editing}
        />
      )}
    </div>
  );
}

function FieldModal({
  onClose,
  moduleId,
  title,
  action,
  field,
}: {
  onClose: () => void;
  moduleId: string;
  title: string;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  field?: ModuleField | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal open onClose={onClose} title={title}>
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="moduleId" value={moduleId} />
        {field && <input type="hidden" name="id" value={field.id} />}

        <Field label="Clave técnica" error={state?.errors?.key}>
          <input
            name="key"
            defaultValue={field?.key ?? ""}
            placeholder="codigo_item"
            className="w-full rounded-md border border-ink-200 px-2.5 py-1.5 font-mono text-[12.5px] outline-none focus:border-blue-400"
          />
        </Field>
        <Field label="Etiqueta" error={state?.errors?.label}>
          <input
            name="label"
            defaultValue={field?.label ?? ""}
            placeholder="Código del ítem"
            className="w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400"
          />
        </Field>
        <div className="flex gap-3">
          <Field label="Tipo" error={state?.errors?.type}>
            <select
              name="type"
              defaultValue={field?.type ?? "string"}
              className="w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400"
            >
              <option value="string">Texto</option>
              <option value="number">Número</option>
              <option value="date">Fecha</option>
            </select>
          </Field>
          <label className="flex items-end gap-2 pb-1.5 text-[12.5px] text-ink-700">
            <input type="checkbox" name="required" defaultChecked={field?.required ?? false} />
            Requerido
          </label>
        </div>
        <Field label="Descripción (opcional)">
          <input
            name="hint"
            defaultValue={field?.hint ?? ""}
            className="w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400"
          />
        </Field>

        {state?.message && <p className="text-[12px] text-err-700">{state.message}</p>}

        <div className="mt-1 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] text-ink-600 hover:bg-ink-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string[];
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="text-[11.5px] font-medium text-ink-600">{label}</span>
      {children}
      {error && error.length > 0 && (
        <span className="text-[11px] text-err-700">{error[0]}</span>
      )}
    </label>
  );
}
```

- [ ] **Step 3: Verificar tipos y build**

Run:
```bash
npx tsc --noEmit && npm run build
```
Expected: sin errores; build completa.

- [ ] **Step 4: Smoke render manual**

`npm run dev` → entrar → `/config/modulos`:
- Lista lateral con los 6 módulos; "Inventarios" muestra 10 campos.
- Otros módulos muestran el `EmptyState`.
- "Agregar campo" abre el modal; crear un campo en "Cartera" lo persiste (recargar y sigue ahí).
- Editar, subir/bajar y eliminar un campo funcionan y persisten.
- Crear un campo con clave duplicada muestra el mensaje de error.
Ctrl-C al terminar.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/config/modulos/page.tsx" "src/app/(app)/config/modulos/modulos-client.tsx"
git commit -m "feat: /config/modulos master-detail con CRUD de campos estándar"
```

---

## Task 1.6: Server Actions de clientes

**Files:**
- Create: `russell-lfm/src/app/actions/clients.ts`

- [ ] **Step 1: Crear las acciones**

Create `russell-lfm/src/app/actions/clients.ts`:
```ts
"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { verifySession, getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { ClientSchema, type ActionState } from "@/lib/definitions";

const PATH = "/config/clientes";

export async function createClient(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await verifySession();
  const parsed = ClientSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    nit: formData.get("nit"),
    erp: formData.get("erp"),
    sector: formData.get("sector"),
  });
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }
  const data = parsed.data;

  const dup = await prisma.client.findUnique({ where: { id: data.id } });
  if (dup) return { ok: false, message: "Ya existe un cliente con ese código." };

  await prisma.client.create({ data });

  const user = await getCurrentUser();
  await logAudit({
    user: user?.name ?? "Sistema",
    action: "CREÓ CLIENTE",
    entity: data.id,
    detail: `${data.name} · ${data.nit}`,
  });
  revalidatePath(PATH);
  return { ok: true };
}

export async function updateClient(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await verifySession();
  const parsed = ClientSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    nit: formData.get("nit"),
    erp: formData.get("erp"),
    sector: formData.get("sector"),
  });
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }
  const { id, name, nit, erp, sector } = parsed.data;
  await prisma.client.update({ where: { id }, data: { name, nit, erp, sector } });
  revalidatePath(PATH);
  return { ok: true };
}

export async function deleteClient(formData: FormData): Promise<void> {
  await verifySession();
  const id = formData.get("id") as string;
  if (!id) return;
  await prisma.client.delete({ where: { id } });
  const user = await getCurrentUser();
  await logAudit({
    user: user?.name ?? "Sistema",
    action: "ELIMINÓ CLIENTE",
    entity: id,
    detail: "Cliente y sus parametrizaciones",
  });
  revalidatePath(PATH);
}

export async function setClientModuleStatus(formData: FormData): Promise<void> {
  await verifySession();
  const clientId = formData.get("clientId") as string;
  const moduleId = formData.get("moduleId") as string;
  const next = formData.get("next") as string; // configured | pending | none
  if (!clientId || !moduleId) return;

  if (next === "none") {
    await prisma.clientModule.deleteMany({ where: { clientId, moduleId } });
  } else {
    await prisma.clientModule.upsert({
      where: { clientId_moduleId: { clientId, moduleId } },
      create: { clientId, moduleId, status: next },
      update: { status: next },
    });
  }
  revalidatePath(PATH);
}
```

- [ ] **Step 2: Verificar tipos**

Run:
```bash
npx tsc --noEmit
```
Expected: sin errores. (El índice único `@@unique([clientId, moduleId])` genera la llave compuesta `clientId_moduleId`.)

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/clients.ts
git commit -m "feat: Server Actions CRUD de clientes + estado de módulos"
```

---

## Task 1.7: Reescribir `/config/clientes` (matriz + filtros + modal)

**Files:**
- Modify: `russell-lfm/src/app/(app)/config/clientes/page.tsx`
- Create: `russell-lfm/src/app/(app)/config/clientes/clientes-client.tsx`

- [ ] **Step 1: Reescribir la página (server component)**

Reemplazar **todo** el contenido de `russell-lfm/src/app/(app)/config/clientes/page.tsx` por:
```tsx
import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import ClientesClient, { type ClientRow, type ModuleRef } from "./clientes-client";

export default async function ClientesPage() {
  const [clients, modules] = await Promise.all([
    prisma.client.findMany({
      orderBy: { name: "asc" },
      include: { modules: true },
    }),
    prisma.module.findMany({ orderBy: { name: "asc" } }),
  ]);

  const rows: ClientRow[] = clients.map((c) => ({
    id: c.id,
    name: c.name,
    nit: c.nit,
    erp: c.erp,
    sector: c.sector,
    modules: c.modules.map((m) => ({ moduleId: m.moduleId, status: m.status })),
  }));
  const mods: ModuleRef[] = modules.map((m) => ({ id: m.id, name: m.name }));
  const erps = [...new Set(clients.map((c) => c.erp))].sort();
  const sectors = [...new Set(clients.map((c) => c.sector))].sort();

  return (
    <div>
      <PageHeader
        title="Clientes y parametrizaciones"
        subtitle="Estado de parametrización por cliente y módulo. Los módulos en gris requieren configuración."
      />
      <ClientesClient clients={rows} modules={mods} erps={erps} sectors={sectors} />
    </div>
  );
}
```

- [ ] **Step 2: Crear el componente client**

Create `russell-lfm/src/app/(app)/config/clientes/clientes-client.tsx`:
```tsx
"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { Card } from "@/components/ui";
import { Modal } from "@/components/modal";
import {
  createClient,
  updateClient,
  deleteClient,
  setClientModuleStatus,
} from "@/app/actions/clients";
import type { ActionState } from "@/lib/definitions";

export type ModuleRef = { id: string; name: string };
export type ClientRow = {
  id: string;
  name: string;
  nit: string;
  erp: string;
  sector: string;
  modules: { moduleId: string; status: string }[];
};

function statusOf(c: ClientRow, moduleId: string): "configured" | "pending" | "none" {
  const m = c.modules.find((x) => x.moduleId === moduleId);
  return (m?.status as "configured" | "pending") ?? "none";
}
function cycle(s: string): string {
  return s === "none" ? "pending" : s === "pending" ? "configured" : "none";
}

export default function ClientesClient({
  clients,
  modules,
  erps,
  sectors,
}: {
  clients: ClientRow[];
  modules: ModuleRef[];
  erps: string[];
  sectors: string[];
}) {
  const [q, setQ] = useState("");
  const [erp, setErp] = useState("");
  const [sector, setSector] = useState("");
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return clients.filter(
      (c) =>
        (!needle || c.name.toLowerCase().includes(needle) || c.nit.includes(needle)) &&
        (!erp || c.erp === erp) &&
        (!sector || c.sector === sector),
    );
  }, [clients, q, erp, sector]);

  return (
    <Card>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
        <div className="flex items-center gap-2 rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1.5 text-ink-400">
          <Icon name="search" size={14} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar cliente o NIT…"
            className="w-56 bg-transparent text-[12.5px] text-ink-700 outline-none placeholder:text-ink-400"
          />
        </div>
        <select
          value={erp}
          onChange={(e) => setErp(e.target.value)}
          className="rounded-md border border-ink-200 px-2 py-1.5 text-[12.5px] text-ink-700 outline-none"
        >
          <option value="">Todos los ERPs</option>
          {erps.map((x) => (
            <option key={x} value={x}>{x}</option>
          ))}
        </select>
        <select
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          className="rounded-md border border-ink-200 px-2 py-1.5 text-[12.5px] text-ink-700 outline-none"
        >
          <option value="">Todos los sectores</option>
          {sectors.map((x) => (
            <option key={x} value={x}>{x}</option>
          ))}
        </select>
        <button
          onClick={() => setCreating(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-navy-600"
        >
          <Icon name="plus" size={13} /> Nuevo cliente
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2 font-semibold">Cliente</th>
              <th className="px-4 py-2 font-semibold">NIT</th>
              <th className="px-4 py-2 font-semibold">ERP</th>
              <th className="px-4 py-2 font-semibold">Sector</th>
              {modules.map((m) => (
                <th key={m.id} className="px-2 py-2 text-center font-semibold">{m.name}</th>
              ))}
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                <td className="px-4 py-2.5 font-medium text-ink-800">{c.name}</td>
                <td className="px-4 py-2.5 font-mono text-ink-500">{c.nit}</td>
                <td className="px-4 py-2.5 text-ink-600">{c.erp}</td>
                <td className="px-4 py-2.5 text-ink-600">{c.sector}</td>
                {modules.map((m) => (
                  <td key={m.id} className="px-2 py-2 text-center">
                    <ModuleCell clientId={c.id} moduleId={m.id} status={statusOf(c, m.id)} />
                  </td>
                ))}
                <td className="px-2 py-2 text-right">
                  <button
                    onClick={() => setEditing(c)}
                    title="Editar cliente"
                    className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                  >
                    <Icon name="chev-r" size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={modules.length + 5} className="px-4 py-8 text-center text-[12.5px] text-ink-400">
                  Sin clientes que coincidan con el filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <ClientModal
          key="create"
          onClose={() => setCreating(false)}
          title="Nuevo cliente"
          action={createClient}
          erps={erps}
          sectors={sectors}
        />
      )}
      {editing && (
        <ClientModal
          key={editing.id}
          onClose={() => setEditing(null)}
          title="Editar cliente"
          action={updateClient}
          client={editing}
          erps={erps}
          sectors={sectors}
        />
      )}
    </Card>
  );
}

function ModuleCell({
  clientId,
  moduleId,
  status,
}: {
  clientId: string;
  moduleId: string;
  status: "configured" | "pending" | "none";
}) {
  const visual =
    status === "configured" ? (
      <span className="inline-flex items-center rounded-full bg-ok-100 px-1.5 py-0.5 text-ok-700">
        <Icon name="check" size={11} />
      </span>
    ) : status === "pending" ? (
      <span className="rounded-full bg-warn-100 px-2 py-0.5 text-[10px] font-semibold text-warn-700">
        Pendiente
      </span>
    ) : (
      <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-400">
        N/A
      </span>
    );
  return (
    <form action={setClientModuleStatus} className="inline">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="moduleId" value={moduleId} />
      <input type="hidden" name="next" value={cycle(status)} />
      <button type="submit" title="Cambiar estado">
        {visual}
      </button>
    </form>
  );
}

function ClientModal({
  onClose,
  title,
  action,
  client,
  erps,
  sectors,
}: {
  onClose: () => void;
  title: string;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  client?: ClientRow | null;
  erps: string[];
  sectors: string[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const isEdit = client != null;

  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal open onClose={onClose} title={title}>
      <form action={formAction} className="flex flex-col gap-3">
        <CField label="Código" error={state?.errors?.id}>
          <input
            name="id"
            defaultValue={client?.id ?? ""}
            readOnly={isEdit}
            placeholder="C-1042"
            className={`w-full rounded-md border border-ink-200 px-2.5 py-1.5 font-mono text-[12.5px] outline-none focus:border-blue-400 ${
              isEdit ? "bg-ink-50 text-ink-400" : ""
            }`}
          />
        </CField>
        <CField label="Razón social" error={state?.errors?.name}>
          <input
            name="name"
            defaultValue={client?.name ?? ""}
            className="w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400"
          />
        </CField>
        <CField label="NIT" error={state?.errors?.nit}>
          <input
            name="nit"
            defaultValue={client?.nit ?? ""}
            className="w-full rounded-md border border-ink-200 px-2.5 py-1.5 font-mono text-[12.5px] outline-none focus:border-blue-400"
          />
        </CField>
        <div className="flex gap-3">
          <CField label="ERP" error={state?.errors?.erp}>
            <input
              name="erp"
              list="erp-list"
              defaultValue={client?.erp ?? ""}
              className="w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400"
            />
            <datalist id="erp-list">
              {erps.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </CField>
          <CField label="Sector" error={state?.errors?.sector}>
            <input
              name="sector"
              list="sector-list"
              defaultValue={client?.sector ?? ""}
              className="w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400"
            />
            <datalist id="sector-list">
              {sectors.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </CField>
        </div>

        {state?.message && <p className="text-[12px] text-err-700">{state.message}</p>}

        <div className="mt-1 flex items-center gap-2">
          {isEdit && (
            <DeleteClientButton id={client!.id} onDone={onClose} />
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] text-ink-600 hover:bg-ink-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteClientButton({ id, onDone }: { id: string; onDone: () => void }) {
  return (
    <form
      action={deleteClient}
      onSubmit={(e) => {
        if (!confirm("¿Eliminar este cliente y sus parametrizaciones?")) e.preventDefault();
        else setTimeout(onDone, 0);
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="rounded-md border border-err-100 bg-err-100 px-3 py-1.5 text-[12.5px] font-semibold text-err-700 hover:bg-err-100/70"
      >
        Eliminar
      </button>
    </form>
  );
}

function CField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string[];
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="text-[11.5px] font-medium text-ink-600">{label}</span>
      {children}
      {error && error.length > 0 && (
        <span className="text-[11px] text-err-700">{error[0]}</span>
      )}
    </label>
  );
}
```

- [ ] **Step 3: Verificar tipos y build**

Run:
```bash
npx tsc --noEmit && npm run build
```
Expected: sin errores; build completa.

- [ ] **Step 4: Smoke render manual**

`npm run dev` → entrar → `/config/clientes`:
- Tabla matriz: 6 clientes × 6 módulos; celdas OK (check) / Pendiente / N/A según seed.
- Filtros: buscar por nombre/NIT y filtrar por ERP/sector reduce filas.
- Click en una celda de módulo cicla N/A → Pendiente → OK → N/A y persiste (recargar y se mantiene).
- "Nuevo cliente" crea uno (aparece en la tabla y en `/dashboard`); código duplicado muestra error.
- Editar (chevron) abre el modal con datos; guardar persiste; "Eliminar" lo quita (con confirmación).
Ctrl-C al terminar.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/config/clientes/page.tsx" "src/app/(app)/config/clientes/clientes-client.tsx"
git commit -m "feat: /config/clientes con matriz editable, filtros y CRUD"
```

---

## Task 1.8: Validación de cierre de Fase 1

- [ ] **Step 1: Suite completa de verificación**

Run:
```bash
npx vitest run && npx tsc --noEmit && npm run lint && npm run build && npx prisma migrate status
```
Expected: tests verdes; sin errores de tipos/lint; build completa; "Database schema is up to date".

- [ ] **Step 2: Re-seed limpio**

Run:
```bash
npm run db:seed
```
Expected: corre idempotente sin error; `ModuleField` queda con 10 filas de Inventarios.

- [ ] **Step 3: Confirmar criterios de aceptación Fase 1**

Con `npm run dev`, verificar:
- Crear/editar/eliminar cliente persiste y se refleja en la tabla y en `/dashboard` ("Parametrización pendiente").
- Cambiar el estado de un módulo (celda) se refleja en la matriz y en el conteo de `/config/modulos` y dashboard.
- Agregar/editar/mover/eliminar un campo estándar de un módulo persiste y se ve en el detalle.
- Ninguna de las dos rutas usa `ModulePlaceholder`.
- `/config/modulos` y `/config/clientes` renderizan sin error contra la BD sembrada.

- [ ] **Step 4: Commit final de fase (si hubo ajustes)**

```bash
git add -A
git commit -m "chore: cierre y validación de Fase 0 + Fase 1" || echo "nada que commitear"
```

---

## Notas para el implementador

- **Orden estricto:** Fase 0 antes de Fase 1 (la Fase 1 usa `Modal`, `EmptyState`, `logAudit`).
- **Next.js 16:** `useActionState` viene de `react` (no de `react-dom`). Las acciones con `useActionState` reciben `(prevState, formData)`. Las acciones de un `<form action={fn}>` sin `useActionState` reciben solo `(formData)`.
- **Revalidación:** tras cada mutación se llama `revalidatePath`, lo que re-renderiza el Server Component padre y pasa props frescas a los componentes client (las celdas y tablas se actualizan solas).
- **Diferimientos conscientes respecto al spec maestro (YAGNI):**
  - `ClientContact` (modelo + datos) se difiere a la **Fase 6 · Requerimientos**, su único consumidor real (la config de clientes del prototipo no gestiona contactos).
  - La **importación/exportación de tablas de equivalencias** y el modelo `EquivalenceTable` se difieren a la fase que las consuma; en Fase 1 las equivalencias se muestran como tarjetas informativas (fieles al prototipo, que también las presenta como display).
  - Los campos estándar de los **otros 5 módulos** no existen en el prototipo: se dejan vacíos a propósito (UI con `EmptyState` + "Agregar campo").
- **Sin placeholders pendientes:** todo el código está completo arriba; no quedan TODOs.
