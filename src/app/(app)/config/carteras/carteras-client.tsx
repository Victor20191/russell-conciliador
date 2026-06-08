"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Card, PageHeader, Chip, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import {
  crearCartera,
  asignarClientes,
  editarAsignacionCartera,
  quitarAsignacionCartera,
} from "@/app/actions/carteras";

export type ClientOption = { id: number; code: string; name: string; nit: string };
export type UserOption = { id: number; name: string; email: string };

export type AsignacionRow = {
  id: number;
  clientId: number;
  clientName: string;
  clientCode: string;
  readScope: boolean;
  writeScope: boolean;
  validUntil: string | null;
  reason: string | null;
  estado: "vigente" | "futuro" | "expirado" | "inactivo";
};

export type CarteraRow = {
  id: number;
  name: string;
  description: string | null;
  leadName: string | null;
  asignaciones: AsignacionRow[];
};

const ESTADO_CHIP: Record<AsignacionRow["estado"], { label: string; tone: "ok" | "blue" | "err" | "ink" }> = {
  vigente: { label: "Vigente", tone: "ok" },
  futuro: { label: "Programado", tone: "blue" },
  expirado: { label: "Expirado", tone: "err" },
  inactivo: { label: "Inactivo", tone: "ink" },
};

const inputCls = "rounded-md border border-ink-200 px-3 py-2 text-[13px]";
const labelCls = "text-[12px] font-medium text-ink-700";

export default function CarterasClient({
  carteras,
  clients,
  users,
}: {
  carteras: CarteraRow[];
  clients: ClientOption[];
  users: UserOption[];
}) {
  const [crear, setCrear] = useState(false);
  const [asignarA, setAsignarA] = useState<CarteraRow | null>(null);
  const [editar, setEditar] = useState<{ cartera: CarteraRow; asig: AsignacionRow } | null>(null);

  return (
    <div>
      <PageHeader
        title="Carteras de clientes"
        subtitle="Agrupa varios clientes bajo un equipo. La cartera define qué clientes atiende el equipo y con qué alcance (consulta u operación) y vigencia."
        actions={
          <button
            onClick={() => setCrear(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-navy-800"
          >
            <Icon name="plus" size={14} /> Nueva cartera
          </button>
        }
      />

      {carteras.length === 0 && (
        <Card>
          <EmptyState
            icon="folder"
            title="Aún no hay carteras"
            description="Crea una cartera con “Nueva cartera” y luego asígnale los clientes que atenderá."
          />
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {carteras.map((cartera) => (
          <Card key={cartera.id} className="overflow-hidden">
            <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-4 py-3">
              <div>
                <h2 className="text-[14px] font-semibold text-ink-900">{cartera.name}</h2>
                <p className="mt-0.5 text-[12px] text-ink-500">
                  {cartera.description ? cartera.description + " · " : ""}
                  {cartera.leadName ? `Líder: ${cartera.leadName}` : "Sin líder"}
                  {" · "}
                  {cartera.asignaciones.length} cliente{cartera.asignaciones.length === 1 ? "" : "s"} en cartera
                </p>
              </div>
              <button
                onClick={() => setAsignarA(cartera)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-navy-700 hover:bg-navy-50"
              >
                <Icon name="plus" size={13} /> Asignar clientes
              </button>
            </div>

            {cartera.asignaciones.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12.5px] text-ink-400">
                Sin clientes en la cartera. Usa “Asignar clientes”.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-ink-100 bg-ink-50 text-[11px] uppercase tracking-wider text-ink-500">
                      <th className="px-4 py-2.5 font-semibold">Cliente</th>
                      <th className="px-4 py-2.5 font-semibold">Alcance</th>
                      <th className="px-4 py-2.5 font-semibold">Vigencia</th>
                      <th className="px-4 py-2.5 font-semibold">Estado</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {cartera.asignaciones.map((a) => (
                      <tr key={a.id} className="hover:bg-ink-50/50">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-ink-800">{a.clientName}</div>
                          <div className="font-mono text-[11.5px] text-ink-500">{a.clientCode}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1.5">
                            {a.readScope && <Chip label="Consulta" tone="blue" />}
                            {a.writeScope && <Chip label="Operación" tone="ok" />}
                            {!a.readScope && !a.writeScope && <Chip label="Sin alcance" tone="ink" />}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-ink-600">
                          {a.validUntil ? (
                            <span>
                              hasta <span className="font-mono text-[12px]">{a.validUntil}</span>
                              {a.reason && <span className="text-ink-400"> · {a.reason}</span>}
                            </span>
                          ) : (
                            <span className="text-ink-400">Permanente</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <Chip label={ESTADO_CHIP[a.estado].label} tone={ESTADO_CHIP[a.estado].tone} />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => setEditar({ cartera, asig: a })}
                            className="mr-4 text-blue-500 hover:underline"
                          >
                            Editar
                          </button>
                          <QuitarButton id={a.id} nombre={a.clientName} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ))}
      </div>

      <Modal open={crear} onClose={() => setCrear(false)} title="Nueva cartera">
        <CrearCarteraForm users={users} onSuccess={() => setCrear(false)} onCancel={() => setCrear(false)} />
      </Modal>

      <Modal
        open={!!asignarA}
        onClose={() => setAsignarA(null)}
        title={`Asignar clientes${asignarA ? " · " + asignarA.name : ""}`}
      >
        {asignarA && (
          <AsignarForm
            cartera={asignarA}
            clients={clients}
            onSuccess={() => setAsignarA(null)}
            onCancel={() => setAsignarA(null)}
          />
        )}
      </Modal>

      <Modal open={!!editar} onClose={() => setEditar(null)} title="Editar alcance y vigencia">
        {editar && (
          <EditarForm
            asig={editar.asig}
            onSuccess={() => setEditar(null)}
            onCancel={() => setEditar(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function FormFooter({ pending, submitLabel, pendingLabel, onCancel }: {
  pending: boolean;
  submitLabel: string;
  pendingLabel: string;
  onCancel: () => void;
}) {
  return (
    <div className="mt-2 flex justify-end gap-3">
      <button type="button" onClick={onCancel} className="rounded-md px-4 py-2 text-[13px] font-medium text-ink-600 hover:bg-ink-50">
        Cancelar
      </button>
      <button type="submit" disabled={pending} className="rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
        {pending ? pendingLabel : submitLabel}
      </button>
    </div>
  );
}

function ErrorMsg({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[12px] text-err-700">{message}</p>;
}

function ScopeFields({ readDefault, writeDefault }: { readDefault: boolean; writeDefault: boolean }) {
  return (
    <fieldset className="flex flex-col gap-2 rounded-md border border-ink-150 px-3 py-2.5">
      <legend className="px-1 text-[11.5px] font-semibold text-ink-600">Alcance sobre los clientes</legend>
      <label className="flex items-center gap-2 text-[12.5px] text-ink-700">
        <input type="checkbox" name="readScope" defaultChecked={readDefault} className="h-4 w-4 rounded border-ink-300" />
        Consulta (ver los clientes de la cartera)
      </label>
      <label className="flex items-center gap-2 text-[12.5px] text-ink-700">
        <input type="checkbox" name="writeScope" defaultChecked={writeDefault} className="h-4 w-4 rounded border-ink-300" />
        Operación (cargar/ejecutar — solo surte efecto para el Staff)
      </label>
    </fieldset>
  );
}

function CrearCarteraForm({ users, onSuccess, onCancel }: {
  users: UserOption[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(crearCartera, undefined);
  useEffect(() => {
    if (state?.ok) onSuccess();
  }, [state, onSuccess]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Nombre de la cartera</label>
        <input name="name" placeholder="Ej. Cartera Norte" required className={inputCls} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Descripción (opcional)</label>
        <input name="description" placeholder="Ej. Clientes del eje cafetero" className={inputCls} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Líder (Senior responsable, opcional)</label>
        <select name="leadUserId" defaultValue="" className={inputCls}>
          <option value="">— Sin líder —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name} · {u.email}</option>
          ))}
        </select>
      </div>
      <ErrorMsg message={state?.message} />
      <FormFooter pending={pending} submitLabel="Crear cartera" pendingLabel="Creando…" onCancel={onCancel} />
    </form>
  );
}

function AsignarForm({ cartera, clients, onSuccess, onCancel }: {
  cartera: CarteraRow;
  clients: ClientOption[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(asignarClientes, undefined);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (state?.ok) onSuccess();
  }, [state, onSuccess]);

  const yaEnCartera = useMemo(
    () => new Set(cartera.asignaciones.map((a) => a.clientId)),
    [cartera.asignaciones],
  );
  const disponibles = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return clients.filter(
      (c) =>
        !yaEnCartera.has(c.id) &&
        (!needle || c.name.toLowerCase().includes(needle) || c.nit.includes(needle) || c.code.toLowerCase().includes(needle)),
    );
  }, [clients, q, yaEnCartera]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="teamId" value={cartera.id} />

      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Clientes ({disponibles.length} disponibles)</label>
        <div className="flex items-center gap-2 rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1.5 text-ink-400">
          <Icon name="search" size={14} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, NIT o código…"
            className="w-full bg-transparent text-[12.5px] text-ink-700 outline-none placeholder:text-ink-400"
          />
        </div>
        <div className="max-h-56 overflow-y-auto rounded-md border border-ink-150">
          {disponibles.length === 0 ? (
            <p className="px-3 py-4 text-center text-[12.5px] text-ink-400">
              {yaEnCartera.size > 0 ? "Todos los clientes que coinciden ya están en la cartera." : "Sin clientes."}
            </p>
          ) : (
            disponibles.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2.5 border-b border-ink-100 px-3 py-2 last:border-0 hover:bg-ink-50">
                <input type="checkbox" name="clientIds" value={c.id} className="h-4 w-4 rounded border-ink-300" />
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-medium text-ink-800">{c.name}</span>
                  <span className="block font-mono text-[11px] text-ink-500">{c.code} · NIT {c.nit}</span>
                </span>
              </label>
            ))
          )}
        </div>
      </div>

      <ScopeFields readDefault={true} writeDefault={true} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Vigente hasta (opcional)</label>
          <input type="date" name="validUntil" className={inputCls} />
          <p className="text-[11px] text-ink-500">Vacío = permanente. Con fecha = cartera temporal: expira sola.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Motivo (opcional)</label>
          <input name="reason" placeholder="Ej. asignación de cartera 2026" className={inputCls} />
        </div>
      </div>

      <ErrorMsg message={state?.message} />
      <FormFooter pending={pending} submitLabel="Asignar a la cartera" pendingLabel="Asignando…" onCancel={onCancel} />
    </form>
  );
}

function EditarForm({ asig, onSuccess, onCancel }: {
  asig: AsignacionRow;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(editarAsignacionCartera, undefined);
  useEffect(() => {
    if (state?.ok) onSuccess();
  }, [state, onSuccess]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={asig.id} />
      <p className="text-[13px] text-ink-600">
        Cliente <strong>{asig.clientName}</strong> ({asig.clientCode}).
      </p>
      <ScopeFields readDefault={asig.readScope} writeDefault={asig.writeScope} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Vigente hasta</label>
          <input type="date" name="validUntil" defaultValue={asig.validUntil ?? ""} className={inputCls} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Motivo</label>
          <input name="reason" defaultValue={asig.reason ?? ""} placeholder="Ej. refuerzo temporal" className={inputCls} />
        </div>
      </div>
      <ErrorMsg message={state?.message} />
      <FormFooter pending={pending} submitLabel="Guardar cambios" pendingLabel="Guardando…" onCancel={onCancel} />
    </form>
  );
}

function QuitarButton({ id, nombre }: { id: number; nombre: string }) {
  return (
    <form
      action={quitarAsignacionCartera}
      className="inline"
      onSubmit={(e) => {
        if (!confirm(`¿Quitar a ${nombre} de la cartera?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-err-700 hover:underline">Quitar</button>
    </form>
  );
}
