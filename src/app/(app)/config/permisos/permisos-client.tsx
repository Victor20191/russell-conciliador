"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { toggleRolePermiso } from "@/app/actions/permisos";

export type RoleCol = { id: number; code: string; name: string };
export type PermisoRow = {
  id: number;
  code: string;
  module: string;
  action: string;
  label: string;
};

const key = (roleId: number, permId: number) => `${roleId}:${permId}`;

export default function PermisosClient({
  roles,
  permisos,
  concedidos,
}: {
  roles: RoleCol[];
  permisos: PermisoRow[];
  concedidos: string[];
}) {
  const [granted, setGranted] = useState<Set<string>>(() => new Set(concedidos));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Agrupa los permisos por módulo conservando el orden recibido.
  const grupos = useMemo(() => {
    const map = new Map<string, PermisoRow[]>();
    for (const p of permisos) {
      const arr = map.get(p.module) ?? [];
      arr.push(p);
      map.set(p.module, arr);
    }
    return [...map.entries()];
  }, [permisos]);

  function toggle(roleId: number, permId: number) {
    const k = key(roleId, permId);
    const conceder = !granted.has(k);
    setError(null);
    // Optimista.
    setGranted((prev) => {
      const next = new Set(prev);
      if (conceder) next.add(k);
      else next.delete(k);
      return next;
    });
    startTransition(async () => {
      const res = await toggleRolePermiso(roleId, permId, conceder);
      if (!res.ok) {
        // Revertir si el servidor rechazó.
        setGranted((prev) => {
          const next = new Set(prev);
          if (conceder) next.delete(k);
          else next.add(k);
          return next;
        });
        setError(res.message ?? "No se pudo actualizar el permiso.");
      }
    });
  }

  return (
    <div>
      <PageHeader
        title="Permisos por rol"
        subtitle="Define qué puede hacer cada rol. Los cambios se aplican de inmediato a la autorización de la plataforma (módulo:acción)."
      />

      <div className="mb-4 flex items-start gap-2 rounded-md bg-blue-50 px-3 py-2.5 text-[12px] text-navy-700">
        <span className="mt-0.5 shrink-0"><Icon name="warn" size={14} /></span>
        <p>
          Esta matriz es la autoridad real de la app: marca o desmarca para conceder o
          revocar un permiso a un rol. {pending && <span className="font-semibold">Guardando…</span>}
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-err-100 px-3 py-2 text-[12px] font-medium text-err-700">
          {error}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50">
                <th className="sticky left-0 z-10 bg-ink-50 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                  Permiso
                </th>
                {roles.map((r) => (
                  <th
                    key={r.id}
                    className="px-3 py-2.5 text-center text-[11px] font-semibold text-ink-700"
                    title={r.code}
                  >
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map(([module, perms]) => (
                <ModuleGroup
                  key={module}
                  module={module}
                  perms={perms}
                  roles={roles}
                  granted={granted}
                  onToggle={toggle}
                  cols={roles.length + 1}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ModuleGroup({
  module,
  perms,
  roles,
  granted,
  onToggle,
  cols,
}: {
  module: string;
  perms: PermisoRow[];
  roles: RoleCol[];
  granted: Set<string>;
  onToggle: (roleId: number, permId: number) => void;
  cols: number;
}) {
  return (
    <>
      <tr className="border-b border-ink-100 bg-ink-50/60">
        <td
          colSpan={cols}
          className="sticky left-0 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500"
        >
          {module}
        </td>
      </tr>
      {perms.map((p) => (
        <tr key={p.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50/40">
          <td className="sticky left-0 z-10 bg-white px-4 py-2">
            <div className="font-medium text-ink-800">{p.label}</div>
            <div className="font-mono text-[11px] text-ink-400">{p.code}</div>
          </td>
          {roles.map((r) => {
            const checked = granted.has(key(r.id, p.id));
            return (
              <td key={r.id} className="px-3 py-2 text-center">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(r.id, p.id)}
                  aria-label={`${r.name}: ${p.code}`}
                  className="h-4 w-4 cursor-pointer rounded border-ink-300 text-navy-600 focus:ring-navy-600"
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
