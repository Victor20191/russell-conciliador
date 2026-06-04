# Fase 5B · Config · Mapeos DIAN (`/config/dian` + MappingEditor) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax para tracking.

**Goal:** Reemplazar el stub de `/config/dian` por la configuración real: por formato (IVA/Retefuente/…), sus secciones y renglones con las **cuentas mapeadas** (chips con signo +/−), y un **modal MappingEditor** para editar el mapeo de un renglón (filas signo/cuenta/descripción, agregar/eliminar) con **persistencia real**.

**Architecture:** Server Component lee Prisma (formatos con secciones/renglones/mapeos); un componente `"use client"` maneja el selector de formato y el modal; guardar el mapeo es una Server Action de argumentos directos (`saveDianMapping`). Reutiliza el modelo `DianMapping` (Fase 5A) y el componente `Modal` (Fase 0) — **sin modelos nuevos**.

**Tech Stack:** Next.js 16, Prisma 7, PostgreSQL, Tailwind v4, TS.

**Rama:** `finalizacion-lfm`. Reutiliza `PageHeader, Card, Chip, EmptyState` (`@/components/ui`), `Modal` (`@/components/modal`), `Icon` (`@/components/icons`).

---

## Mapa de archivos

**Crear:**
- `src/app/(app)/config/dian/config-dian-client.tsx` — UI client (selector, mapeos, MappingEditor).

**Modificar:**
- `src/app/actions/dian.ts` — añadir `saveDianMapping`.
- `src/app/(app)/config/dian/page.tsx` — reescribir (server).

---

## Task 5B.1: Server Action `saveDianMapping`

**Files:** Modify `src/app/actions/dian.ts`

- [ ] **Step 1: Añadir la acción (argumentos directos)**

Al final de `src/app/actions/dian.ts`, añadir:
```ts
export async function saveDianMapping(
  formId: string,
  lineKey: string,
  rows: { account: string; desc: string; sign: string }[],
): Promise<void> {
  await verifySession();
  if (!formId || !lineKey) return;
  const clean = rows.filter((r) => r.account.trim());
  await prisma.dianMapping.deleteMany({ where: { formId, lineKey } });
  if (clean.length) {
    await prisma.dianMapping.createMany({
      data: clean.map((r, i) => ({ formId, lineKey, account: r.account.trim(), desc: r.desc.trim(), sign: r.sign === "-" ? "-" : "+", order: i })),
    });
  }
  const user = await getCurrentUser();
  await logAudit({ user: user?.name ?? "Sistema", action: "GUARDÓ MAPEO DIAN", entity: `Renglón ${lineKey}`, detail: `${clean.length} cuenta(s) · ${formId}` });
  revalidatePath("/config/dian");
  revalidatePath("/dian/[periodId]", "page");
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
```bash
git add src/app/actions/dian.ts
git commit -m "feat: Server Action saveDianMapping"
```

---

## Task 5B.2: `/config/dian` — mapeos + MappingEditor

**Files:** Modify `src/app/(app)/config/dian/page.tsx`; Create `src/app/(app)/config/dian/config-dian-client.tsx`

- [ ] **Step 1: Reescribir la página (server)**

Reemplazar **todo** `src/app/(app)/config/dian/page.tsx` por:
```tsx
import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import ConfigDianClient, { type DianFormData } from "./config-dian-client";

export default async function ConfigDianPage() {
  const forms = await prisma.dianForm.findMany({
    include: { sections: { orderBy: { order: "asc" }, include: { lines: { orderBy: { order: "asc" } } } }, mappings: true },
    orderBy: { code: "asc" },
  });

  const data: DianFormData[] = forms.map((f) => ({
    id: f.id, name: f.name, code: f.code,
    sections: f.sections.map((s) => ({ id: s.id, title: s.title, lines: s.lines.map((l) => ({ k: l.k, label: l.label })) })),
    mappings: f.mappings.map((m) => ({ lineKey: m.lineKey, account: m.account, desc: m.desc, sign: m.sign })),
  }));

  return (
    <div>
      <PageHeader title="Mapeos DIAN" subtitle="Configura qué cuentas contables suman o restan al saldo de cada renglón de los formatos DIAN. Plantilla estándar reutilizable por cliente." />
      <ConfigDianClient forms={data} />
    </div>
  );
}
```

- [ ] **Step 2: Crear el componente client**

Create `src/app/(app)/config/dian/config-dian-client.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Card, Chip, EmptyState } from "@/components/ui";
import { Modal } from "@/components/modal";
import { saveDianMapping } from "@/app/actions/dian";

export type DianFormData = {
  id: string; name: string; code: string;
  sections: { id: string; title: string; lines: { k: string; label: string }[] }[];
  mappings: { lineKey: string; account: string; desc: string; sign: string }[];
};
type Row = { account: string; desc: string; sign: string };

export default function ConfigDianClient({ forms }: { forms: DianFormData[] }) {
  const [activeId, setActiveId] = useState(forms[0]?.id ?? "");
  const [editing, setEditing] = useState<{ lineKey: string; label: string; rows: Row[] } | null>(null);
  const active = forms.find((f) => f.id === activeId) ?? forms[0];
  if (!active) return <EmptyState icon="doc" title="Sin formatos DIAN" description="No hay formatos cargados." />;

  const mapFor = (k: string) => active.mappings.filter((m) => m.lineKey === k);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {forms.map((f) => (
          <button key={f.id} onClick={() => setActiveId(f.id)} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${f.id === active.id ? "bg-navy-800 text-white" : "text-ink-600 hover:bg-ink-100"}`}>
            {f.name} <span className="font-mono text-[11px] opacity-70">{f.code}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {active.sections.map((s) => (
          <Card key={s.id}>
            <div className="border-b border-ink-100 px-4 py-3 text-[13px] font-semibold text-ink-800">{s.title}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500"><th className="px-4 py-2 font-semibold">Casilla</th><th className="px-4 py-2 font-semibold">Renglón</th><th className="px-4 py-2 font-semibold">Cuentas mapeadas</th><th className="px-4 py-2"></th></tr></thead>
                <tbody>
                  {s.lines.map((l) => {
                    const rows = mapFor(l.k);
                    return (
                      <tr key={l.k} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                        <td className="px-4 py-2 font-mono text-[11px] text-ink-500">{l.k}</td>
                        <td className="px-4 py-2 text-ink-800">{l.label}</td>
                        <td className="px-4 py-2">
                          {rows.length === 0 ? <span className="text-[11.5px] italic text-ink-400">Sin mapeo</span> : (
                            <div className="flex flex-wrap gap-1.5">
                              {rows.map((m, i) => (
                                <span key={i} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${m.sign === "+" ? "bg-ok-100 text-ok-700" : "bg-err-100 text-err-700"}`}>{m.sign === "+" ? "+" : "−"} <span className="font-mono">{m.account}</span></span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button onClick={() => setEditing({ lineKey: l.k, label: l.label, rows: rows.map((m) => ({ account: m.account, desc: m.desc, sign: m.sign })) })} className="inline-flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-[11.5px] font-medium text-ink-600 hover:bg-ink-50"><Icon name="settings" size={12} /> Editar</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>

      {editing && (
        <MappingEditor
          formId={active.id}
          lineKey={editing.lineKey}
          label={editing.label}
          initialRows={editing.rows}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function MappingEditor({
  formId, lineKey, label, initialRows, onClose,
}: {
  formId: string; lineKey: string; label: string; initialRows: Row[]; onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(initialRows.length ? initialRows : [{ account: "", desc: "", sign: "+" }]);
  const [saving, setSaving] = useState(false);

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => setRows((rs) => [...rs, { account: "", desc: "", sign: "+" }]);
  const remove = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));

  const save = async () => {
    setSaving(true);
    await saveDianMapping(formId, lineKey, rows);
    setSaving(false);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`${lineKey} · Editar mapeo`}>
      <p className="mb-3 text-[12px] text-ink-500">{label}. Las cuentas con signo <b>+</b> suman al saldo contable del renglón; las de signo <b>−</b> restan.</p>
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <select value={r.sign} onChange={(e) => setRow(i, { sign: e.target.value })} className="rounded-md border border-ink-200 px-2 py-1.5 text-[12px] outline-none">
              <option value="+">+ Suma</option>
              <option value="-">− Resta</option>
            </select>
            <input value={r.account} onChange={(e) => setRow(i, { account: e.target.value })} placeholder="240801" className="w-28 rounded-md border border-ink-200 px-2 py-1.5 font-mono text-[12px] outline-none focus:border-blue-400" />
            <input value={r.desc} onChange={(e) => setRow(i, { desc: e.target.value })} placeholder="Descripción de la cuenta" className="flex-1 rounded-md border border-ink-200 px-2 py-1.5 text-[12px] outline-none focus:border-blue-400" />
            <button onClick={() => remove(i)} title="Eliminar" className="rounded p-1 text-err-500 hover:bg-err-100"><Icon name="x" size={14} /></button>
          </div>
        ))}
      </div>
      <button onClick={add} className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-500 hover:underline"><Icon name="plus" size={13} /> Agregar cuenta</button>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button onClick={onClose} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] text-ink-600 hover:bg-ink-50">Cancelar</button>
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"><Icon name="check" size={13} /> {saving ? "Guardando…" : "Guardar mapeo"}</button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/config/dian/page.tsx" "src/app/(app)/config/dian/config-dian-client.tsx"
git commit -m "feat: /config/dian con mapeos por formato y editor de mapeo persistente"
```

---

## Task 5B.3: Validación de cierre de Fase 5B (y de la Fase 5)

- [ ] **Step 1: Suite**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build && npx prisma migrate status`
Expected: todo verde.

- [ ] **Step 2: Re-seed**

Run: `npm run db:seed`

- [ ] **Step 3: Criterios de aceptación (smoke — lo ejecuta el controlador)**

Con `npm run dev` + sesión:
- `/config/dian`: selector de formatos (IVA por defecto), secciones con sus renglones y cuentas mapeadas como chips +/− (GEN-19 muestra +240801 −240802; ING-EXC +413515; el resto "Sin mapeo").
- "Editar" en un renglón abre el modal con las filas actuales; agregar/quitar/editar una fila y "Guardar mapeo" **persiste** (recargar → los chips reflejan el cambio).
- El cambio también se refleja en `/dian/[periodId]` (panel del renglón "Cuentas mapeadas").

- [ ] **Step 4: Commit final (si aplica)**

```bash
git add -A && git commit -m "chore: cierre y validación de Fase 5B" || echo "nada"
```

---

## Notas
- **Sin modelos nuevos:** reutiliza `DianMapping` (5A) y `Modal` (Fase 0).
- `saveDianMapping` es una Server Action de **argumentos directos** (no DianFormData) por la lista dinámica de filas; reemplaza el mapeo del renglón (delete + createMany) y revalida `/config/dian` y `/dian/[periodId]`.
- Cierra la **Fase 5 (DIAN)** completa (5A + 5B).
- Sin placeholders pendientes.
