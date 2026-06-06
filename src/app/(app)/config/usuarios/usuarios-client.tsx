"use client";

import { useActionState, useEffect, useState } from "react";
import { Card, PageHeader } from "@/components/ui";
import { Modal } from "@/components/modal";
import { createUser, updateUser, resetUserPassword } from "@/app/actions/users";

export type UserRow = {
  id: number;
  email: string;
  name: string;
  role: string;
  initials: string;
  active: boolean;
  lastLoginAt: string | null;
};

const ROLES = ["Consulta", "Auditor", "Líder", "Administrador"];

export default function UsuariosClient({ rows }: { rows: UserRow[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [passwordUser, setPasswordUser] = useState<UserRow | null>(null);

  return (
    <div>
      <PageHeader
        title="Usuarios"
        subtitle="Crea, edita y desactiva cuentas. Solo administradores."
        actions={
          <button
            onClick={() => setCreateOpen(true)}
            className="rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white"
          >
            Nuevo usuario
          </button>
        }
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50 text-ink-500">
                <th className="px-4 py-3 font-medium">Usuario</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((u) => (
                <tr key={u.id} className="hover:bg-ink-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy-700 text-[11px] font-semibold text-white">
                        {u.initials}
                      </span>
                      <div>
                        <div className="font-medium text-ink-800">{u.name}</div>
                        <div className="text-[11.5px] text-ink-500">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-600">{u.role}</td>
                  <td className="px-4 py-3">
                    {u.active ? (
                      <span className="inline-flex items-center rounded-full bg-ok-100 px-2 py-0.5 text-[11px] font-semibold text-ok-700">
                        Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setEditUser(u)}
                      className="mr-4 text-blue-500 hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => setPasswordUser(u)}
                      className="text-blue-500 hover:underline"
                    >
                      Contraseña
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-ink-500">
                    No hay usuarios registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Crear nuevo usuario"
      >
        <CreateUserForm onSuccess={() => setCreateOpen(false)} onCancel={() => setCreateOpen(false)} />
      </Modal>

      <Modal
        open={!!editUser}
        onClose={() => setEditUser(null)}
        title="Editar usuario"
      >
        {editUser && (
          <EditUserForm
            user={editUser}
            onSuccess={() => setEditUser(null)}
            onCancel={() => setEditUser(null)}
          />
        )}
      </Modal>

      <Modal
        open={!!passwordUser}
        onClose={() => setPasswordUser(null)}
        title="Cambiar contraseña"
      >
        {passwordUser && (
          <ResetPasswordForm
            user={passwordUser}
            onSuccess={() => setPasswordUser(null)}
            onCancel={() => setPasswordUser(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function CreateUserForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [state, action, pending] = useActionState(createUser, undefined);

  useEffect(() => {
    if (state?.ok) onSuccess();
  }, [state, onSuccess]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-ink-700">Nombre completo</label>
          <input
            name="name"
            placeholder="Ej. Juan Pérez"
            required
            className="rounded-md border border-ink-200 px-3 py-2 text-[13px]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-ink-700">Correo electrónico</label>
          <input
            name="email"
            type="email"
            placeholder="correo@russellbedford.co"
            required
            className="rounded-md border border-ink-200 px-3 py-2 text-[13px]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-ink-700">Iniciales</label>
          <input
            name="initials"
            placeholder="JP"
            maxLength={3}
            required
            className="rounded-md border border-ink-200 px-3 py-2 text-[13px]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-ink-700">Rol</label>
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
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="text-[12px] font-medium text-ink-700">Contraseña temporal</label>
          <input
            name="password"
            type="password"
            placeholder="Mínimo 8 caracteres"
            required
            className="rounded-md border border-ink-200 px-3 py-2 text-[13px]"
          />
          <p className="text-[11px] text-ink-500">
            El usuario deberá cambiar esta contraseña al iniciar sesión por primera vez.
          </p>
        </div>
      </div>

      {state?.message && <p className="text-[12px] text-err-700">{state.message}</p>}
      {state?.errors && (
        <p className="text-[12px] text-err-700">
          {Object.values(state.errors).flat().filter(Boolean)[0]}
        </p>
      )}

      <div className="mt-2 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-4 py-2 text-[13px] font-medium text-ink-600 hover:bg-ink-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Creando…" : "Crear usuario"}
        </button>
      </div>
    </form>
  );
}

function EditUserForm({ user, onSuccess, onCancel }: { user: UserRow; onSuccess: () => void; onCancel: () => void }) {
  const [state, action, pending] = useActionState(updateUser, undefined);

  useEffect(() => {
    if (state?.ok) onSuccess();
  }, [state, onSuccess]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={user.id} />

      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-medium text-ink-700">Nombre completo</label>
        <input
          name="name"
          defaultValue={user.name}
          required
          className="rounded-md border border-ink-200 px-3 py-2 text-[13px]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-medium text-ink-700">Rol</label>
        <select
          name="role"
          defaultValue={user.role}
          className="rounded-md border border-ink-200 px-3 py-2 text-[13px]"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <label className="mt-2 flex items-center gap-2 text-[13px] text-ink-800">
        <input
          type="checkbox"
          name="active"
          defaultChecked={user.active}
          className="h-4 w-4 rounded border-ink-300 text-navy-600 focus:ring-navy-600"
        />
        Usuario activo
      </label>

      {state?.message && <p className="text-[12px] text-err-700">{state.message}</p>}
      {state?.errors && (
        <p className="text-[12px] text-err-700">
          {Object.values(state.errors).flat().filter(Boolean)[0]}
        </p>
      )}

      <div className="mt-2 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-4 py-2 text-[13px] font-medium text-ink-600 hover:bg-ink-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

function ResetPasswordForm({ user, onSuccess, onCancel }: { user: UserRow; onSuccess: () => void; onCancel: () => void }) {
  const [state, action, pending] = useActionState(resetUserPassword, undefined);

  useEffect(() => {
    if (state?.ok) onSuccess();
  }, [state, onSuccess]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={user.id} />

      <p className="text-[13px] text-ink-600">
        Establece una nueva contraseña para <strong>{user.name}</strong>. El usuario deberá cambiarla la próxima vez que inicie sesión.
      </p>

      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-medium text-ink-700">Nueva contraseña</label>
        <input
          name="password"
          type="password"
          placeholder="Mínimo 8 caracteres"
          required
          className="rounded-md border border-ink-200 px-3 py-2 text-[13px]"
        />
      </div>

      {state?.message && <p className="text-[12px] text-err-700">{state.message}</p>}
      {state?.errors && (
        <p className="text-[12px] text-err-700">
          {Object.values(state.errors).flat().filter(Boolean)[0]}
        </p>
      )}

      <div className="mt-2 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-4 py-2 text-[13px] font-medium text-ink-600 hover:bg-ink-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Actualizando…" : "Actualizar contraseña"}
        </button>
      </div>
    </form>
  );
}
