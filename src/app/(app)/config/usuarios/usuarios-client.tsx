"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import {
  PageSizeSelect,
  PaginationFooter,
  usePagination,
} from "@/components/pagination-controls";
import { PasswordInput } from "@/components/password-input";
import { Modal } from "@/components/modal";
import { createUser, updateUser, unlockUser, deleteUser } from "@/app/actions/users";
import { Icon } from "@/components/icons";
import { isAccountBlocked, LOGIN_MAX_ATTEMPTS } from "@/lib/login-throttle";
import { ROL_SUPERIOR } from "@/lib/rbac/jerarquia";
import { notifyActionState } from "@/lib/client-notifications";
import { ImportMaestrosButton } from "./import-maestros-modal";

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
/** Candidato a superior directo (usuario activo con rol Socio/Gerente/Senior). */
export type SuperiorRef = { id: number; name: string; role: string };
/** Arista de jerarquía superior→subordinado (jerarquia_usuarios). */
export type Arista = { superiorId: number; subordinadoId: number };

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
  superiores,
  aristas,
}: {
  rows: UserRow[];
  roles: RoleOption[];
  canManageSuperadmins: boolean;
  superiores: SuperiorRef[];
  aristas: Arista[];
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const pg = usePagination(rows, 50);

  return (
    <div>
      <PageHeader
        title="Usuarios"
        subtitle="Crea, edita y desactiva cuentas. Solo administradores."
        actions={
          <div className="flex items-center gap-2">
            <ImportMaestrosButton />
            <button
              onClick={() => setCreateOpen(true)}
              className="rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white"
            >
              Nuevo usuario
            </button>
          </div>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
          <span className="text-[12px] text-ink-500">{pg.total} usuario(s)</span>
          <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
        </div>
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
              {pg.pageItems.map((u) => {
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
        <PaginationFooter
          rangeLabel={pg.rangeLabel}
          currentPage={pg.page}
          totalPages={pg.totalPages}
          onPageChange={pg.setPage}
        />
      </Card>

      {createOpen && (
        <CreateUserForm
          roles={roles}
          superiores={superiores}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {editUser && (
        <EditUserForm
          user={editUser}
          roles={roles}
          superiores={superiores}
          aristas={aristas}
          onClose={() => setEditUser(null)}
        />
      )}

      {deleteTarget && (
        <DeleteUserForm
          user={deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function UserActions({
  user,
  blocked,
  canManageSuperadmins,
  onEdit,
  onDelete,
}: {
  user: UserRow;
  blocked: boolean;
  canManageSuperadmins: boolean;
  onEdit: () => void;
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
      {blocked && <UnlockUserForm user={user} />}
      <button onClick={onDelete} className="text-err-700 hover:underline">
        Eliminar
      </button>
    </div>
  );
}

function UnlockUserForm({ user }: { user: UserRow }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(unlockUser, undefined);

  useEffect(() => {
    notifyActionState(state, {
      success: "Usuario desbloqueado.",
      error: "No se pudo desbloquear el usuario.",
    });
    if (state?.ok) router.refresh();
  }, [state, router]);

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

/**
 * Superiores directos en la jerarquía organizacional, según el rol elegido:
 * Staff→Seniors, Senior→Gerentes, Gerente→Socios. Para roles sin superior
 * (Socio, Administrador…) no se muestra nada. Envía `superiorIds`.
 */
function SuperioresField({
  role,
  superiores,
  defaultSelected = [],
}: {
  role: string;
  superiores: SuperiorRef[];
  defaultSelected?: number[];
}) {
  const rolSuperior = ROL_SUPERIOR[role];
  const candidatos = rolSuperior ? superiores.filter((s) => s.role === rolSuperior) : [];
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>(() => {
    const idsDisponibles = new Set(candidatos.map((s) => s.id));
    return defaultSelected.filter((id) => idsDisponibles.has(id));
  });
  const dropdownId = useId();

  if (!rolSuperior) return null;

  const etiqueta = `${rolSuperior}s a los que reporta`;
  const selectedSet = new Set(selectedIds);
  const selectedNames = candidatos
    .filter((s) => selectedSet.has(s.id))
    .map((s) => s.name);
  const resumen =
    selectedNames.length === 0
      ? `Seleccionar ${rolSuperior.toLowerCase()}`
      : selectedNames.length === 1
        ? selectedNames[0]
        : `${selectedNames.length} seleccionados`;

  function toggleSuperior(id: number) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((currentId) => currentId !== id)
        : [...current, id],
    );
  }

  return (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <label className="text-[12px] font-medium text-ink-700">{etiqueta}</label>
      {candidatos.length === 0 ? (
        <p className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-[12px] text-ink-500">
          No hay usuarios {rolSuperior} activos. Créalos primero para armar la jerarquía.
        </p>
      ) : (
        <div className="relative">
          {selectedIds.map((id) => (
            <input key={id} type="hidden" name="superiorIds" value={id} />
          ))}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={dropdownId}
            onClick={() => setOpen((current) => !current)}
            className="flex w-full items-center justify-between gap-2 rounded-md border border-ink-200 bg-white px-3 py-2 text-left text-[13px] text-ink-800 transition hover:border-ink-300 focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-600/15"
          >
            <span
              className={`min-w-0 flex-1 truncate ${
                selectedNames.length === 0 ? "text-ink-500" : ""
              }`}
            >
              {resumen}
            </span>
            <Icon name={open ? "chev-d" : "chev-r"} size={16} className="shrink-0 text-ink-500" />
          </button>
          {open && (
            <div
              id={dropdownId}
              className="absolute left-0 right-0 z-20 mt-1 max-h-52 overflow-y-auto rounded-md border border-ink-200 bg-white p-1.5 shadow-lg"
            >
              {candidatos.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-[13px] text-ink-800 hover:bg-ink-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedSet.has(s.id)}
                    onChange={() => toggleSuperior(s.id)}
                    className="h-4 w-4 rounded border-ink-300 text-navy-600 focus:ring-navy-600"
                  />
                  <span className="min-w-0 flex-1 leading-snug">{s.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="text-[11px] text-ink-500">
        Define la jerarquía: en el cliente solo se podrá asignar bajo estos superiores.
      </p>
    </div>
  );
}

function CreateUserForm({
  roles,
  superiores,
  onClose,
}: {
  roles: RoleOption[];
  superiores: SuperiorRef[];
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(createUser, undefined);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const initials = initialsFromFullName(name);

  useEffect(() => {
    notifyActionState(state, {
      success: "Usuario creado.",
      error: "No se pudo crear el usuario.",
    });
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Crear nuevo usuario"
      footer={
        <button
          type="submit"
          form="create-user-form"
          disabled={pending}
          className="rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Creando…" : "Crear usuario"}
        </button>
      }
    >
      <form id="create-user-form" action={action} className="flex flex-col gap-4">
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
            value={role}
            onChange={(event) => setRole(event.target.value)}
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
        <SuperioresField key={role} role={role} superiores={superiores} />
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="text-[12px] font-medium text-ink-700">Contraseña temporal</label>
          <PasswordInput
            name="password"
            placeholder="Mínimo 10 caracteres"
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

      </form>
    </Modal>
  );
}

function EditUserForm({
  user,
  roles,
  superiores,
  aristas,
  onClose,
}: {
  user: UserRow;
  roles: RoleOption[];
  superiores: SuperiorRef[];
  aristas: Arista[];
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(updateUser, undefined);
  const [resetOpen, setResetOpen] = useState(false);
  const hasCurrentRole = roles.some((r) => r.code === user.role);
  const defaultRole = hasCurrentRole ? user.role : "";
  const [role, setRole] = useState(defaultRole);
  // Superiores actuales del usuario; solo aplican mientras conserve su rol
  // (al cambiarlo, la selección se descarta y se elige de nuevo).
  const superioresActuales = aristas
    .filter((a) => a.subordinadoId === user.id)
    .map((a) => a.superiorId);

  useEffect(() => {
    notifyActionState(state, {
      success: "Usuario actualizado.",
      error: "No se pudo actualizar el usuario.",
    });
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar usuario"
      footer={
        <button
          type="submit"
          form="edit-user-form"
          disabled={pending}
          className="rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
      }
    >
      <form id="edit-user-form" action={action} className="flex flex-col gap-4">
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
          value={role}
          onChange={(event) => setRole(event.target.value)}
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

      <SuperioresField
        key={role}
        role={role}
        superiores={superiores}
        defaultSelected={role === user.role ? superioresActuales : []}
      />

      <label className="flex items-center gap-2 text-[13px] text-ink-800">
        <input
          type="checkbox"
          name="active"
          defaultChecked={user.active}
          className="h-4 w-4 rounded border-ink-300 text-navy-600 focus:ring-navy-600"
        />
        Usuario activo
      </label>

      <div className="rounded-md border border-ink-200">
        <button
          type="button"
          onClick={() => setResetOpen((open) => !open)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-[13px] font-medium text-ink-700 hover:bg-ink-50"
        >
          Restablecer contraseña
          <Icon name={resetOpen ? "chev-d" : "chev-r"} size={16} />
        </button>
        {resetOpen && (
          <div className="flex flex-col gap-2 border-t border-ink-100 px-3 pb-3 pt-3">
            <PasswordInput
              name="password"
              placeholder="Mínimo 10 caracteres"
              className="rounded-md border border-ink-200 px-3 py-2 text-[13px]"
            />
            <p className="text-[11px] text-ink-500">
              Si la dejas vacía, la contraseña actual no cambia. Si la estableces,{" "}
              <strong>{user.name}</strong> deberá cambiarla la próxima vez que inicie sesión.
            </p>
          </div>
        )}
      </div>

      {state?.message && <p className="text-[12px] text-err-700">{state.message}</p>}
      {state?.errors && (
        <p className="text-[12px] text-err-700">
          {Object.values(state.errors).flat().filter(Boolean)[0]}
        </p>
      )}

      </form>
    </Modal>
  );
}

function DeleteUserForm({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [state, action, pending] = useActionState(deleteUser, undefined);

  useEffect(() => {
    notifyActionState(state, {
      success: "Usuario eliminado.",
      error: "No se pudo eliminar el usuario.",
    });
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Eliminar usuario"
      footer={
        <button
          type="submit"
          form="delete-user-form"
          disabled={pending}
          className="rounded-md bg-err-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-err-700/90 disabled:opacity-60"
        >
          {pending ? "Eliminando…" : "Eliminar definitivamente"}
        </button>
      }
    >
      <form id="delete-user-form" action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={user.id} />

      <p className="text-[13px] text-ink-600">
        Vas a eliminar permanentemente a <strong>{user.name}</strong> ({user.email}).
        Esta acción no se puede deshacer: se retirará de la jerarquía organizacional y
        se borrarán sus comentarios y menciones. Si es responsable de algún cliente,
        primero deberás reasignarlo.
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

      </form>
    </Modal>
  );
}
