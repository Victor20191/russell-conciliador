"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { Card } from "@/components/ui";
import { Modal } from "@/components/modal";
import {
  createClient,
  updateClient,
  deleteClient,
} from "@/app/actions/clients";
import type { ActionState } from "@/lib/definitions";

export type ModuleRef = { id: number; name: string };
export type ClientRow = {
  id: number;
  code: string;
  name: string;
  nit: string;
  erp: string;
  sector: string;
  modules: { moduleId: number; status: string }[];
};

function statusOf(c: ClientRow, moduleId: number): "configured" | "pending" | "none" {
  const m = c.modules.find((x) => x.moduleId === moduleId);
  return (m?.status as "configured" | "pending") ?? "none";
}
export default function ClientesClient({
  clients,
  modules,
  erps,
  sectors,
  nextCode,
}: {
  clients: ClientRow[];
  modules: ModuleRef[];
  erps: string[];
  sectors: string[];
  nextCode: string;
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
                    <ModuleCell status={statusOf(c, m.id)} />
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
          nextCode={nextCode}
          modules={modules}
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
          nextCode={nextCode}
          modules={modules}
        />
      )}
    </Card>
  );
}

function ModuleCell({
  status,
}: {
  status: "configured" | "pending" | "none";
}) {
  return (
    status === "configured" ? (
      <span className="inline-flex min-w-[72px] items-center justify-center gap-1 rounded-full bg-ok-100 px-2 py-0.5 text-[10px] font-semibold text-ok-700">
        <Icon name="check" size={11} />
        Param.
      </span>
    ) : status === "pending" ? (
      <span className="inline-flex min-w-[72px] items-center justify-center rounded-full bg-warn-100 px-2 py-0.5 text-[10px] font-semibold text-warn-700">
        Pendiente
      </span>
    ) : (
      <span className="inline-flex min-w-[72px] items-center justify-center rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-400">
        N/A
      </span>
    )
  );
}

function ClientModal({
  onClose,
  title,
  action,
  client,
  erps,
  sectors,
  nextCode,
  modules,
}: {
  onClose: () => void;
  title: string;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  client?: ClientRow | null;
  erps: string[];
  sectors: string[];
  nextCode: string;
  modules?: ModuleRef[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const isEdit = client != null;
  // Los módulos nunca se preseleccionan al crear: la asignación es una decisión
  // explícita del usuario. Al editar se marcan solo los ya asignados en BD.
  const [selectedModuleIds, setSelectedModuleIds] = useState<number[]>(
    () => (isEdit ? client.modules.map((module) => module.moduleId) : []),
  );

  function toggleModule(moduleId: number) {
    setSelectedModuleIds((current) =>
      current.includes(moduleId)
        ? current.filter((id) => id !== moduleId)
        : [...current, moduleId],
    );
  }

  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal open onClose={onClose} title={title}>
      <form action={formAction} className="flex flex-col gap-3">
        {isEdit && <input type="hidden" name="id" value={client.id} />}
        <CField label="Código" error={state?.errors?.code}>
          <input
            name="code"
            defaultValue={client?.code ?? nextCode}
            disabled
            placeholder="C-1042"
            title="El código se asigna automáticamente."
            className="w-full cursor-not-allowed rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1.5 font-mono text-[12.5px] text-ink-400 outline-none"
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

        {modules && modules.length > 0 && (
          <div className="rounded-md border border-ink-150 bg-ink-50/60 p-3">
            <input type="hidden" name="syncModules" value="1" />
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[11.5px] font-medium text-ink-600">Módulos del cliente</span>
              <span className="text-[11px] font-medium text-ink-400">
                {selectedModuleIds.length}/{modules.length}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {modules.map((module) => {
                const checked = selectedModuleIds.includes(module.id);
                return (
                  <label
                    key={module.id}
                    className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-[12px] font-medium transition ${
                      checked
                        ? "border-ok-100 bg-white text-ink-800"
                        : "border-ink-150 bg-ink-100 text-ink-500"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="moduleIds"
                      value={module.id}
                      checked={checked}
                      onChange={() => toggleModule(module.id)}
                      className="sr-only"
                    />
                    <span
                      className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                        checked
                          ? "border-ok-500 bg-ok-500 text-white"
                          : "border-ink-300 bg-white text-transparent"
                      }`}
                    >
                      <Icon name="check" size={11} stroke={2} />
                    </span>
                    <span className="truncate">{module.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {state?.message && <p className="text-[12px] text-err-700">{state.message}</p>}

        <div className="mt-1 flex items-center gap-2">
          {isEdit && (
            <DeleteClientButton id={client!.id} onDone={onClose} />
          )}
          <button
            type="submit"
            disabled={pending}
            className="ml-auto rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteClientButton({ id, onDone }: { id: number; onDone: () => void }) {
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
