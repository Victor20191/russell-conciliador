"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui";
import { createUser, updateUser, resetUserPassword } from "@/app/actions/users";

export type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  initials: string;
  active: boolean;
  lastLoginAt: string | null;
};

const ROLES = ["Consulta", "Auditor", "Líder", "Administrador"];

export default function UsuariosClient({ rows }: { rows: UserRow[] }) {
  const [createState, createAction, creating] = useActionState(
    createUser,
    undefined,
  );

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink-800">
          Nuevo usuario
        </h3>
        <form
          action={createAction}
          className="grid grid-cols-2 gap-3 md:grid-cols-3"
        >
          <input
            name="name"
            placeholder="Nombre"
            className="rounded-md border border-ink-200 px-3 py-2 text-[13px]"
          />
          <input
            name="email"
            type="email"
            placeholder="correo@russellbedford.co"
            className="rounded-md border border-ink-200 px-3 py-2 text-[13px]"
          />
          <input
            name="initials"
            placeholder="Iniciales"
            maxLength={3}
            className="rounded-md border border-ink-200 px-3 py-2 text-[13px]"
          />
          <select
            name="role"
            defaultValue="Consulta"
            className="rounded-md border border-ink-200 px-3 py-2 text-[13px]"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <input
            name="password"
            type="password"
            placeholder="Contraseña temporal"
            className="rounded-md border border-ink-200 px-3 py-2 text-[13px]"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {creating ? "Creando…" : "Crear"}
          </button>
        </form>
        {createState?.message && (
          <p className="mt-2 text-xs text-err-700">{createState.message}</p>
        )}
        {createState?.errors && (
          <p className="mt-2 text-xs text-err-700">
            {Object.values(createState.errors).flat().filter(Boolean)[0]}
          </p>
        )}
        {createState?.ok && (
          <p className="mt-2 text-xs text-ok-700">
            Usuario creado. Deberá cambiar la contraseña al ingresar.
          </p>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink-800">
          Usuarios ({rows.length})
        </h3>
        <div className="flex flex-col divide-y divide-ink-100">
          {rows.map((u) => (
            <UserRowForm key={u.id} u={u} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function UserRowForm({ u }: { u: UserRow }) {
  const [editState, editAction, saving] = useActionState(updateUser, undefined);
  const [resetState, resetAction, resetting] = useActionState(
    resetUserPassword,
    undefined,
  );

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-navy-700 text-[11px] font-semibold text-white">
          {u.initials}
        </span>
        <div className="min-w-[160px]">
          <div className="text-[13px] font-medium text-ink-800">{u.name}</div>
          <div className="text-[11px] text-ink-500">{u.email}</div>
        </div>
        <form action={editAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={u.id} />
          <input
            name="name"
            defaultValue={u.name}
            className="w-36 rounded-md border border-ink-200 px-2 py-1.5 text-[12px]"
          />
          <select
            name="role"
            defaultValue={u.role}
            className="rounded-md border border-ink-200 px-2 py-1.5 text-[12px]"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[12px] text-ink-600">
            <input
              type="checkbox"
              name="active"
              defaultChecked={u.active}
            />{" "}
            Activo
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md border border-ink-200 px-3 py-1.5 text-[12px] font-medium text-ink-700 disabled:opacity-60"
          >
            {saving ? "…" : "Guardar"}
          </button>
        </form>
        <form action={resetAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={u.id} />
          <input
            name="password"
            type="password"
            placeholder="Nueva contraseña"
            className="w-40 rounded-md border border-ink-200 px-2 py-1.5 text-[12px]"
          />
          <button
            type="submit"
            disabled={resetting}
            className="rounded-md border border-ink-200 px-3 py-1.5 text-[12px] font-medium text-ink-700 disabled:opacity-60"
          >
            {resetting ? "…" : "Resetear"}
          </button>
        </form>
      </div>
      {(editState?.message || resetState?.message) && (
        <p className="mt-1 text-[11px] text-err-700">{editState?.message ?? resetState?.message}</p>
      )}
      {(editState?.errors || resetState?.errors) && (
        <p className="mt-1 text-[11px] text-err-700">
          {Object.values({ ...editState?.errors, ...resetState?.errors }).flat().filter(Boolean)[0]}
        </p>
      )}
      {(editState?.ok || resetState?.ok) && (
        <p className="mt-1 text-[11px] text-ok-700">
          {editState?.ok ? "Cambios guardados." : "Contraseña reseteada."}
        </p>
      )}
    </div>
  );
}
