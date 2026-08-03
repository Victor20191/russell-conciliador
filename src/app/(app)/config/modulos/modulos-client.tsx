"use client";

import { EstadoProcesando } from "@/components/estado-procesando";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { Card, Chip, EmptyState } from "@/components/ui";
import { Modal } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import {
  createModuleField,
  updateModuleField,
  deleteModuleField,
  moveModuleField,
  sincronizarCamposDesdeDescriptores,
} from "@/app/actions/module-fields";
import type { ActionState } from "@/lib/definitions";
import { notifyActionState } from "@/lib/client-notifications";

export type ModuleField = {
  id: number;
  key: string;
  label: string;
  type: string;
  required: boolean;
  hint: string | null;
  order: number;
};
export type DescriptorColumn = { nombre: string; etiqueta: string; tipo: string; requerido: boolean; sinonimos: string[] };
export type ModuleWithFields = {
  id: number;
  code: string;
  name: string;
  icon: string;
  fields: ModuleField[];
  // Columnas reales que espera el motor de importación (fuente de verdad = código).
  descriptorColumns: DescriptorColumn[] | null;
};

const tipoLabel = (t: string) => (t === "moneda" ? "moneda" : t === "numero" ? "número" : t === "fecha" ? "fecha" : "texto");

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

export default function ModulosClient({ modules, puedeConfigurar }: { modules: ModuleWithFields[]; puedeConfigurar: boolean }) {
  const router = useRouter();
  const [activeId, setActiveId] = useState(modules[0]?.id ?? 0);
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
                <span className="ml-auto text-[11px] text-ink-400">{m.descriptorColumns?.length ?? m.fields.length}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Detail */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {active.descriptorColumns ? (
          <ColumnasMotor active={active} puedeConfigurar={puedeConfigurar} onSynced={() => router.refresh()} />
        ) : (
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
                          <ActionForm
                            action={moveModuleField}
                            successMessage="Campo reordenado."
                            errorMessage="No se pudo reordenar el campo."
                            showInlineError={false}
                            onSuccess={() => router.refresh()}
                          >
                            {(pending) => (
                              <>
                            <input type="hidden" name="id" value={f.id} />
                            <input type="hidden" name="dir" value="up" />
                            <button
                              type="submit"
                              disabled={i === 0 || pending}
                              title="Subir"
                              aria-busy={pending}
                              className="rounded p-1 text-ink-400 hover:bg-ink-100 disabled:opacity-30"
                            >
                              {pending ? (
                                <EstadoProcesando etiqueta="Subiendo campo" />
                              ) : (
                                <Icon name="chev-d" size={13} className="rotate-180" />
                              )}
                            </button>
                              </>
                            )}
                          </ActionForm>
                          <ActionForm
                            action={moveModuleField}
                            successMessage="Campo reordenado."
                            errorMessage="No se pudo reordenar el campo."
                            showInlineError={false}
                            onSuccess={() => router.refresh()}
                          >
                            {(pending) => (
                              <>
                            <input type="hidden" name="id" value={f.id} />
                            <input type="hidden" name="dir" value="down" />
                            <button
                              type="submit"
                              disabled={i === active.fields.length - 1 || pending}
                              title="Bajar"
                              aria-busy={pending}
                              className="rounded p-1 text-ink-400 hover:bg-ink-100 disabled:opacity-30"
                            >
                              {pending ? (
                                <EstadoProcesando etiqueta="Bajando campo" />
                              ) : (
                                <Icon name="chev-d" size={13} />
                              )}
                            </button>
                              </>
                            )}
                          </ActionForm>
                          <button
                            onClick={() => setEditing(f)}
                            title="Editar"
                            className="rounded p-1 text-ink-500 hover:bg-ink-100"
                          >
                            <Icon name="settings" size={13} />
                          </button>
                          <ActionForm
                            action={deleteModuleField}
                            successMessage="Campo eliminado."
                            errorMessage="No se pudo eliminar el campo."
                            showInlineError={false}
                            onSuccess={() => router.refresh()}
                          >
                            {(pending) => (
                              <>
                            <input type="hidden" name="id" value={f.id} />
                            <button
                              type="submit"
                              disabled={pending}
                              title="Eliminar"
                              aria-busy={pending}
                              className="rounded p-1 text-err-500 hover:bg-err-100"
                            >
                              {pending ? (
                                <EstadoProcesando etiqueta="Eliminando campo" />
                              ) : (
                                <Icon name="x" size={13} />
                              )}
                            </button>
                              </>
                            )}
                          </ActionForm>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        )}

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

// Vista READ-ONLY de las columnas del motor de importación (fuente de verdad = código).
function ColumnasMotor({ active, puedeConfigurar, onSynced }: { active: ModuleWithFields; puedeConfigurar: boolean; onSynced: () => void }) {
  const cols = active.descriptorColumns ?? [];
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
        <h2 className="text-[13px] font-semibold text-ink-800">{active.name} · columnas del motor</h2>
        <Chip label={`${cols.length} columna(s)`} tone="ink" />
        {puedeConfigurar && (
          <div className="ml-auto">
            <ActionForm
              action={sincronizarCamposDesdeDescriptores}
              successMessage="Campos sincronizados desde el motor."
              errorMessage="No se pudo sincronizar."
              showInlineError={false}
              onSuccess={onSynced}
            >
              {(pending) => (
                <button type="submit" disabled={pending} aria-busy={pending} className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-ink-700 transition hover:bg-ink-50 disabled:opacity-60">
                  {pending ? <EstadoProcesando etiqueta="Sincronizando" /> : <><Icon name="settings" size={13} /> Sincronizar a BD</>}
                </button>
              )}
            </ActionForm>
          </div>
        )}
      </div>

      <div className="mx-4 mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[11.5px] leading-relaxed text-blue-800">
        Estas columnas las define el <b>motor de importación</b> en código (los descriptores del módulo). Esta pantalla las refleja; no se editan aquí.
        {puedeConfigurar ? " «Sincronizar a BD» actualiza la copia que usan otras pantallas (p. ej. Conciliaciones)." : ""}
      </div>

      <div className="overflow-x-auto p-4 pt-3">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-3 py-2 font-semibold">Campo</th>
              <th className="px-3 py-2 font-semibold">Etiqueta</th>
              <th className="px-3 py-2 font-semibold">Tipo</th>
              <th className="px-3 py-2 font-semibold">Requerido</th>
              <th className="px-3 py-2 font-semibold">Sinónimos (auto-mapeo)</th>
            </tr>
          </thead>
          <tbody>
            {cols.map((c) => (
              <tr key={c.nombre} className="border-b border-ink-50 last:border-0">
                <td className="px-3 py-2.5 font-mono text-navy-700">{c.nombre}</td>
                <td className="px-3 py-2.5 text-ink-800">{c.etiqueta}</td>
                <td className="px-3 py-2.5"><Chip label={tipoLabel(c.tipo)} tone="ink" /></td>
                <td className="px-3 py-2.5">{c.requerido ? <Chip label="Sí" tone="err" /> : <Chip label="No" tone="ink" />}</td>
                <td className="px-3 py-2.5 text-[11.5px] text-ink-500">{c.sinonimos.length ? c.sinonimos.join(", ") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
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
  moduleId: number;
  title: string;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  field?: ModuleField | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const successMessage = field ? "Campo actualizado." : "Campo creado.";

  useEffect(() => {
    notifyActionState(state, {
      success: successMessage,
      error: "No se pudo guardar el campo.",
    });
    if (state?.ok) onClose();
  }, [state, onClose, successMessage]);

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <button
          type="submit"
          form="field-form"
          disabled={pending}
          className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
        >
          {pending ? <EstadoProcesando>Guardando</EstadoProcesando> : "Guardar"}
        </button>
      }
    >
      <form id="field-form" action={formAction} className="flex flex-col gap-3">
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
