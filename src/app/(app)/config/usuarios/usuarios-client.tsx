"use client";

import { useActionState, useEffect, useState } from "react";
import { Card, PageHeader } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { Modal } from "@/components/modal";
import { createUser, updateUser, resetUserPassword, unlockUser, deleteUser } from "@/app/actions/users";
import { isAccountBlocked, LOGIN_MAX_ATTEMPTS } from "@/lib/login-throttle";

export type UserRow = {
  id: number;
  email: string;
  name: string;
  role: string;
  initials: string;
  active: boolean;
  lastLoginAt: string | null;
  failedLoginAttempts: number;
  blockedUntil: string | null;
};

export type RoleOption = { code: string; name: string };

function userIsBlocked(user: UserRow): boolean {
  return isAccountBlocked(user.blockedUntil ? new Date(user.blockedUntil) : null);
}

function formatDateTime(input: string | null): string {
  if (!input) return "—";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function initialsFromFullName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? "";
  const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

export default function UsuariosClient({
  rows,
  roles,
  canManageSuperadmins,
}: {
  rows: UserRow[];
  roles: RoleOption[];
  canManageSuperadmins: boolean;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [passwordUser, setPasswordUser] = useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

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
              {rows.map((u) => {
                const blocked = userIsBlocked(u);
                return (
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
                      <div className="flex flex-col items-start gap-1">
                        {blocked ? (
                          <span className="inline-flex items-center rounded-full bg-err-100 px-2 py-0.5 text-[11px] font-semibold text-err-700">
                            Bloqueado
                          </span>
                        ) : u.active ? (
                          <span className="inline-flex items-center rounded-full bg-ok-100 px-2 py-0.5 text-[11px] font-semibold text-ok-700">
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">
                            Inactivo
                          </span>
                        )}
                        {blocked ? (
                          <span className="text-[11px] text-ink-500">
                            Hasta {formatDateTime(u.blockedUntil)}
                          </span>
                        ) : u.failedLoginAttempts > 0 ? (
                          <span className="text-[11px] text-ink-500">
                            Intentos fallidos: {u.failedLoginAttempts}/{LOGIN_MAX_ATTEMPTS}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <UserActions
                        user={u}
                        blocked={blocked}
                        canManageSuperadmins={canManageSuperadmins}
                        onEdit={() => setEditUser(u)}
                        onPassword={() => setPasswordUser(u)}
                        onDelete={() => setDeleteTarget(u)}
                      />
                    </td>
                  </tr>
                );
              })}
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
        <CreateUserForm roles={roles} onSuccess={() => setCreateOpen(false)} />
      </Modal>

      <Modal
        open={!!editUser}
        onClose={() => setEditUser(null)}
        title="Editar usuario"
      >
        {editUser && (
          <EditUserForm
            user={editUser}
            roles={roles}
            onSuccess={() => setEditUser(null)}
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
          />
        )}
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Eliminar usuario"
      >
        {deleteTarget && (
          <DeleteUserForm
            user={deleteTarget}
            onSuccess={() => setDeleteTarget(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function UserActions({
  user,
  blocked,
  canManageSuperadmins,
  onEdit,
  onPassword,
  onDelete,
}: {
  user: UserRow;
  blocked: boolean;
  canManageSuperadmins: boolean;
  onEdit: () => void;
  onPassword: () => void;
  onDelete: () => void;
}) {
  if (user.role === "Superadministrador" && !canManageSuperadmins) {
    return <div className="text-right text-[12px] text-ink-400">Reservado</div>;
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
      <button onClick={onEdit} className="text-blue-500 hover:underline">
        Editar
      </button>
      <button onClick={onPassword} className="text-blue-500 hover:underline">
        Contraseña
      </button>
      {blocked && <UnlockUserForm user={user} />}
      <button onClick={onDelete} className="text-err-700 hover:underline">
        Eliminar
      </button>
    </div>
  );
}

function UnlockUserForm({ user }: { user: UserRow }) {
  const [state, action, pending] = useActionState(unlockUser, undefined);

  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={user.id} />
      <button
        type="submit"
        disabled={pending}
        className="text-err-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Desbloqueando…" : "Desbloquear"}
      </button>
      {state?.message && <span className="text-[11px] text-err-700">{state.message}</span>}
    </form>
  );
}

function CreateUserForm({ roles, onSuccess }: { roles: RoleOption[]; onSuccess: () => void }) {
  const [state, action, pending] = useActionState(createUser, undefined);
  const [name, setName] = useState("");
  const initials = initialsFromFullName(name);

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
            value={name}
            onChange={(event) => setName(event.target.value)}
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
            value={initials}
            maxLength={3}
            readOnly
            required
            className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-[13px] text-ink-700"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-ink-700">Rol</label>
          <select
            name="role"
            required
            defaultValue=""
            className="rounded-md border border-ink-200 px-3 py-2 text-[13px]"
          >
            <option value="" disabled>
              — Selecciona un rol —
            </option>
            {roles.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="text-[12px] font-medium text-ink-700">Contraseña temporal</label>
          <PasswordInput
            name="password"
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

function EditUserForm({ user, roles, onSuccess }: { user: UserRow; roles: RoleOption[]; onSuccess: () => void }) {
  const [state, action, pending] = useActionState(updateUser, undefined);
  const hasCurrentRole = roles.some((r) => r.code === user.role);
  const defaultRole = hasCurrentRole ? user.role : "";

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
        <label className="text-[12px] font-medium text-ink-700">Correo electrónico</label>
        <input
          name="email"
          type="email"
          defaultValue={user.email}
          required
          className="rounded-md border border-ink-200 px-3 py-2 text-[13px]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-medium text-ink-700">Rol</label>
        <select
          name="role"
          required
          defaultValue={defaultRole}
          className="rounded-md border border-ink-200 px-3 py-2 text-[13px]"
        >
          {!hasCurrentRole && (
            <option value="" disabled>
              — Selecciona un rol vigente —
            </option>
          )}
          {roles.map((r) => (
            <option key={r.code} value={r.code}>
              {r.name}
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

function ResetPasswordForm({ user, onSuccess }: { user: UserRow; onSuccess: () => void }) {
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
        <PasswordInput
          name="password"
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

function DeleteUserForm({ user, onSuccess }: { user: UserRow; onSuccess: () => void }) {
  const [state, action, pending] = useActionState(deleteUser, undefined);

  useEffect(() => {
    if (state?.ok) onSuccess();
  }, [state, onSuccess]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={user.id} />

      <p className="text-[13px] text-ink-600">
        Vas a eliminar permanentemente a <strong>{user.name}</strong> ({user.email}).
        Esta acción no se puede deshacer: se retirará de sus equipos y cartera, y se
        borrarán sus comentarios y menciones.
      </p>
      <p className="text-[12px] text-ink-500">
        Si solo quieres suspender su acceso, usa <strong>Editar</strong> y desmarca
        «Usuario activo» en lugar de eliminarlo.
      </p>

      {state?.message && <p className="text-[12px] text-err-700">{state.message}</p>}
      {state?.errors && (
        <p className="text-[12px] text-err-700">
          {Object.values(state.errors).flat().filter(Boolean)[0]}
        </p>
      )}

      <div className="mt-2 flex justify-end gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-err-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-err-700/90 disabled:opacity-60"
        >
          {pending ? "Eliminando…" : "Eliminar definitivamente"}
        </button>
      </div>
    </form>
  );
}
