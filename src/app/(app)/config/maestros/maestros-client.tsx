"use client";

import { EstadoProcesando } from "@/components/estado-procesando";

import { useActionState, useEffect, useId, useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { PasswordInput } from "@/components/password-input";
import {
  PageSizeSelect,
  PaginationFooter,
  usePagination,
} from "@/components/pagination-controls";
import {
  createMaestroCatalogo,
  createMaestroPersona,
  deleteMaestroCatalogo,
  deleteMaestroPersona,
  updateMaestroCatalogo,
  updateMaestroPersona,
} from "@/app/actions/maestros";
import type { ActionState } from "@/lib/definitions";
import { ROL_SUPERIOR } from "@/lib/rbac/jerarquia";
import {
  notifyActionState,
  notifySuccess,
} from "@/lib/client-notifications";

const ROLES_MAESTRO = ["Socio", "Gerente", "Senior", "Staff"] as const;
type RolMaestro = (typeof ROLES_MAESTRO)[number];
type CatalogoTipo = "erp" | "sector";
type TabKey = RolMaestro | CatalogoTipo;

const ROLE_META: Record<RolMaestro, { plural: string; singular: string }> = {
  Socio: { plural: "Socios", singular: "Socio" },
  Gerente: { plural: "Gerentes", singular: "Gerente" },
  Senior: { plural: "Seniors", singular: "Senior" },
  Staff: { plural: "Staff", singular: "Staff" },
};

const CATALOG_META: Record<CatalogoTipo, { plural: string; singular: string; code: string }> = {
  erp: { plural: "ERPs", singular: "ERP", code: "ERP" },
  sector: { plural: "Sectores", singular: "Sector", code: "Código" },
};

export type MaestroPersonaRow = {
  id: number;
  email: string;
  name: string;
  cedula: string | null;
  cargo: string | null;
  role: string;
  initials: string;
  active: boolean;
  asignacionesActivas: number;
  clientesComoSocio: number;
};

export type SuperiorRef = { id: number; name: string; role: string };
export type Arista = { superiorId: number; subordinadoId: number };

export type CatalogRow = {
  id: number;
  code: string;
  name: string;
  active: boolean;
  order: number;
  clients: number;
};

export default function MaestrosClient({
  personas,
  superiores,
  aristas,
  erps,
  sectors,
}: {
  personas: MaestroPersonaRow[];
  superiores: SuperiorRef[];
  aristas: Arista[];
  erps: CatalogRow[];
  sectors: CatalogRow[];
}) {
  const [active, setActive] = useState<TabKey>("Socio");
  const [q, setQ] = useState("");
  const [personModal, setPersonModal] = useState<{
    mode: "create" | "edit";
    role: RolMaestro;
    row?: MaestroPersonaRow;
  } | null>(null);
  const [catalogModal, setCatalogModal] = useState<{
    mode: "create" | "edit";
    tipo: CatalogoTipo;
    row?: CatalogRow;
  } | null>(null);
  const [deletePerson, setDeletePerson] = useState<MaestroPersonaRow | null>(null);
  const [deleteCatalog, setDeleteCatalog] = useState<{
    tipo: CatalogoTipo;
    row: CatalogRow;
  } | null>(null);

  const isCatalog = active === "erp" || active === "sector";
  const title = isCatalog
    ? CATALOG_META[active].plural
    : ROLE_META[active].plural;

  const filteredPersonas = useMemo(() => {
    if (isCatalog) return [];
    const needle = q.trim().toLowerCase();
    return personas.filter((p) => {
      if (p.role !== active) return false;
      if (!needle) return true;
      return (
        p.name.toLowerCase().includes(needle) ||
        p.email.toLowerCase().includes(needle) ||
        (p.cedula ?? "").toLowerCase().includes(needle) ||
        (p.cargo ?? "").toLowerCase().includes(needle)
      );
    });
  }, [personas, active, q, isCatalog]);

  const filteredCatalog = useMemo(() => {
    if (!isCatalog) return [];
    const needle = q.trim().toLowerCase();
    const rows = active === "erp" ? erps : sectors;
    return rows.filter(
      (row) =>
        !needle ||
        row.name.toLowerCase().includes(needle) ||
        row.code.toLowerCase().includes(needle),
    );
  }, [active, erps, isCatalog, q, sectors]);

  const personPg = usePagination(filteredPersonas, 50);
  const catalogPg = usePagination(filteredCatalog, 50);
  const total = isCatalog ? catalogPg.total : personPg.total;

  function changeTab(next: TabKey) {
    setActive(next);
    setQ("");
    personPg.resetToFirstPage();
    catalogPg.resetToFirstPage();
  }

  function openCreate() {
    if (active === "erp" || active === "sector") {
      setCatalogModal({ mode: "create", tipo: active });
    } else {
      setPersonModal({ mode: "create", role: active });
    }
  }

  return (
    <>
      <Card>
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr]">
          <div className="border-b border-ink-100 p-3 lg:border-b-0 lg:border-r">
            <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
              Personas
            </div>
            <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
              {ROLES_MAESTRO.map((role) => (
                <MasterTab
                  key={role}
                  active={active === role}
                  label={ROLE_META[role].plural}
                  count={personas.filter((p) => p.role === role).length}
                  onClick={() => changeTab(role)}
                />
              ))}
            </div>

            <div className="mb-2 mt-4 px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
              Catálogos
            </div>
            <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
              <MasterTab
                active={active === "erp"}
                label="ERPs"
                count={erps.length}
                onClick={() => changeTab("erp")}
              />
              <MasterTab
                active={active === "sector"}
                label="Sectores"
                count={sectors.length}
                onClick={() => changeTab("sector")}
              />
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
              <div>
                <h2 className="text-[13.5px] font-semibold text-ink-800">{title}</h2>
                <p className="mt-0.5 text-[11.5px] text-ink-500">
                  {total} registro(s)
                </p>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1.5 text-ink-400">
                  <Icon name="search" size={14} />
                  <input
                    value={q}
                    onChange={(event) => {
                      setQ(event.target.value);
                      personPg.resetToFirstPage();
                      catalogPg.resetToFirstPage();
                    }}
                    placeholder="Buscar…"
                    className="w-48 bg-transparent text-[12.5px] text-ink-700 outline-none placeholder:text-ink-400"
                  />
                </div>
                <button
                  type="button"
                  onClick={openCreate}
                  className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-navy-600"
                >
                  <Icon name="plus" size={13} /> Nuevo
                </button>
                <PageSizeSelect
                  value={isCatalog ? catalogPg.pageSize : personPg.pageSize}
                  onChange={isCatalog ? catalogPg.setPageSize : personPg.setPageSize}
                />
              </div>
            </div>

            {isCatalog ? (
              <CatalogTable
                rows={catalogPg.pageItems}
                tipo={active}
                onEdit={(row) => setCatalogModal({ mode: "edit", tipo: active, row })}
                onDelete={(row) => setDeleteCatalog({ tipo: active, row })}
              />
            ) : (
              <PersonasTable
                rows={personPg.pageItems}
                personas={personas}
                aristas={aristas}
                onEdit={(row) =>
                  setPersonModal({ mode: "edit", role: row.role as RolMaestro, row })
                }
                onDelete={setDeletePerson}
              />
            )}

            <PaginationFooter
              rangeLabel={isCatalog ? catalogPg.rangeLabel : personPg.rangeLabel}
              currentPage={isCatalog ? catalogPg.page : personPg.page}
              totalPages={isCatalog ? catalogPg.totalPages : personPg.totalPages}
              onPageChange={isCatalog ? catalogPg.setPage : personPg.setPage}
            />
          </div>
        </div>
      </Card>

      {personModal && (
        <PersonaModal
          key={`${personModal.mode}-${personModal.row?.id ?? personModal.role}`}
          mode={personModal.mode}
          role={personModal.role}
          row={personModal.row}
          superiores={superiores}
          aristas={aristas}
          onClose={() => setPersonModal(null)}
        />
      )}
      {catalogModal && (
        <CatalogModal
          key={`${catalogModal.mode}-${catalogModal.tipo}-${catalogModal.row?.id ?? "new"}`}
          mode={catalogModal.mode}
          tipo={catalogModal.tipo}
          row={catalogModal.row}
          onClose={() => setCatalogModal(null)}
        />
      )}
      {deletePerson && (
        <DeletePersonaModal
          row={deletePerson}
          onClose={() => setDeletePerson(null)}
        />
      )}
      {deleteCatalog && (
        <DeleteCatalogModal
          tipo={deleteCatalog.tipo}
          row={deleteCatalog.row}
          onClose={() => setDeleteCatalog(null)}
        />
      )}
    </>
  );
}

function MasterTab({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-9 items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-[12.5px] transition ${
        active
          ? "bg-navy-700 text-white shadow-sm"
          : "text-ink-600 hover:bg-ink-50 hover:text-ink-900"
      }`}
    >
      <span className="truncate font-medium">{label}</span>
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
          active ? "bg-white/15 text-white" : "bg-ink-100 text-ink-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function EstadoBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center rounded-full bg-ok-100 px-2 py-0.5 text-[11px] font-semibold text-ok-700">
      Activo
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">
      Inactivo
    </span>
  );
}

function PersonasTable({
  rows,
  personas,
  aristas,
  onEdit,
  onDelete,
}: {
  rows: MaestroPersonaRow[];
  personas: MaestroPersonaRow[];
  aristas: Arista[];
  onEdit: (row: MaestroPersonaRow) => void;
  onDelete: (row: MaestroPersonaRow) => void;
}) {
  const nombrePorId = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of personas) map.set(p.id, p.name);
    return map;
  }, [personas]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-ink-100 bg-ink-50 text-[11px] uppercase tracking-wider text-ink-500">
            <th className="px-4 py-3 font-semibold">Persona</th>
            <th className="px-4 py-3 font-semibold">Cédula</th>
            <th className="px-4 py-3 font-semibold">Cargo</th>
            <th className="px-4 py-3 font-semibold">Reporta a</th>
            <th className="px-4 py-3 font-semibold">Estado</th>
            <th className="px-4 py-3 text-right font-semibold">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((row) => {
            const superiores = aristas
              .filter((a) => a.subordinadoId === row.id)
              .map((a) => nombrePorId.get(a.superiorId) ?? `Usuario ${a.superiorId}`);
            return (
              <tr key={row.id} className="hover:bg-ink-50/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy-700 text-[11px] font-semibold text-white">
                      {row.initials}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink-800">{row.name}</div>
                      <div className="truncate text-[11.5px] text-ink-500">{row.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-[12px] text-ink-600">
                  {row.cedula ?? "—"}
                </td>
                <td className="px-4 py-3 text-ink-600">{row.cargo ?? "—"}</td>
                <td className="max-w-xs px-4 py-3 text-ink-600">
                  <span className="line-clamp-2">
                    {superiores.length > 0 ? superiores.join(", ") : "—"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <EstadoBadge active={row.active} />
                    {(row.asignacionesActivas > 0 || row.clientesComoSocio > 0) && (
                      <span className="text-[11px] text-ink-500">
                        {row.asignacionesActivas + row.clientesComoSocio} cliente(s)
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => onEdit(row)}
                      className="text-blue-500 hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(row)}
                      className="text-err-700 hover:underline"
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-ink-500">
                Sin registros.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CatalogTable({
  rows,
  tipo,
  onEdit,
  onDelete,
}: {
  rows: CatalogRow[];
  tipo: CatalogoTipo;
  onEdit: (row: CatalogRow) => void;
  onDelete: (row: CatalogRow) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-ink-100 bg-ink-50 text-[11px] uppercase tracking-wider text-ink-500">
            <th className="px-4 py-3 font-semibold">{CATALOG_META[tipo].code}</th>
            <th className="px-4 py-3 font-semibold">Nombre</th>
            <th className="px-4 py-3 font-semibold">Orden</th>
            <th className="px-4 py-3 font-semibold">Uso</th>
            <th className="px-4 py-3 font-semibold">Estado</th>
            <th className="px-4 py-3 text-right font-semibold">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-ink-50/50">
              <td className="px-4 py-3 font-mono text-[12px] text-ink-700">{row.code}</td>
              <td className="px-4 py-3 font-medium text-ink-800">{row.name}</td>
              <td className="px-4 py-3 font-mono text-[12px] text-ink-600">{row.order}</td>
              <td className="px-4 py-3 text-ink-600">{row.clients} cliente(s)</td>
              <td className="px-4 py-3"><EstadoBadge active={row.active} /></td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => onEdit(row)}
                    className="text-blue-500 hover:underline"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(row)}
                    className="text-err-700 hover:underline"
                  >
                    Eliminar
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-ink-500">
                Sin registros.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

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
      <label className="text-[12px] font-medium text-ink-700">
        {rolSuperior}s a los que reporta
      </label>
      {candidatos.length === 0 ? (
        <p className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-[12px] text-ink-500">
          No hay usuarios {rolSuperior} activos.
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
    </div>
  );
}

function firstError(state: ActionState | undefined): string | undefined {
  if (state?.message) return state.message;
  if (!state?.errors) return undefined;
  return Object.values(state.errors).flat().filter(Boolean)[0];
}

function PersonaModal({
  mode,
  role,
  row,
  superiores,
  aristas,
  onClose,
}: {
  mode: "create" | "edit";
  role: RolMaestro;
  row?: MaestroPersonaRow;
  superiores: SuperiorRef[];
  aristas: Arista[];
  onClose: () => void;
}) {
  const action = mode === "create" ? createMaestroPersona : updateMaestroPersona;
  const [state, formAction, pending] = useActionState(action, undefined);
  const [selectedRole, setSelectedRole] = useState<RolMaestro>((row?.role as RolMaestro) ?? role);
  const [resetOpen, setResetOpen] = useState(false);
  const formId = mode === "create" ? "create-maestro-persona" : `edit-maestro-persona-${row!.id}`;
  const superioresActuales =
    row == null
      ? []
      : aristas.filter((a) => a.subordinadoId === row.id).map((a) => a.superiorId);

  useEffect(() => {
    notifyActionState(state, {
      success: mode === "create" ? "Maestro creado." : "Maestro actualizado.",
      error: "No se pudo guardar el maestro.",
    });
    if (state?.ok) onClose();
  }, [state, onClose, mode]);

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "create" ? "Nuevo maestro" : "Editar maestro"}
      size="2xl"
      footer={
        <button
          type="submit"
          form={formId}
          disabled={pending}
          className="rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
        >
          {pending ? <EstadoProcesando>Guardando</EstadoProcesando> : "Guardar"}
        </button>
      }
    >
      <form id={formId} action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {row && <input type="hidden" name="id" value={row.id} />}
        <FormField label="Nombre completo" error={state?.errors?.name}>
          <input
            name="name"
            defaultValue={row?.name ?? ""}
            required
            className="rounded-md border border-ink-200 px-3 py-2 text-[13px]"
          />
        </FormField>
        <FormField label="Correo electrónico" error={state?.errors?.email}>
          <input
            name="email"
            type="email"
            defaultValue={row?.email ?? ""}
            required
            className="rounded-md border border-ink-200 px-3 py-2 text-[13px]"
          />
        </FormField>
        <FormField label="Cédula" error={state?.errors?.cedula}>
          <input
            name="cedula"
            defaultValue={row?.cedula ?? ""}
            className="rounded-md border border-ink-200 px-3 py-2 font-mono text-[13px]"
          />
        </FormField>
        <FormField label="Cargo" error={state?.errors?.cargo}>
          <input
            name="cargo"
            defaultValue={row?.cargo ?? ""}
            className="rounded-md border border-ink-200 px-3 py-2 text-[13px]"
          />
        </FormField>
        <FormField label="Rol maestro" error={state?.errors?.role}>
          <select
            name="role"
            value={selectedRole}
            onChange={(event) => setSelectedRole(event.target.value as RolMaestro)}
            className="rounded-md border border-ink-200 bg-white px-3 py-2 text-[13px]"
          >
            {ROLES_MAESTRO.map((r) => (
              <option key={r} value={r}>
                {ROLE_META[r].singular}
              </option>
            ))}
          </select>
        </FormField>
        <label className="mt-6 flex items-center gap-2 text-[13px] text-ink-800">
          <input
            type="checkbox"
            name="active"
            defaultChecked={row?.active ?? true}
            className="h-4 w-4 rounded border-ink-300 text-navy-600 focus:ring-navy-600"
          />
          Activo
        </label>

        <SuperioresField
          key={selectedRole}
          role={selectedRole}
          superiores={superiores}
          defaultSelected={row && selectedRole === row.role ? superioresActuales : []}
        />

        {mode === "create" ? (
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-[12px] font-medium text-ink-700">Contraseña temporal</label>
            <PasswordInput
              name="password"
              required
              placeholder="Mínimo 10 caracteres"
              className="rounded-md border border-ink-200 px-3 py-2 text-[13px]"
            />
          </div>
        ) : (
          <div className="rounded-md border border-ink-200 sm:col-span-2">
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
              </div>
            )}
          </div>
        )}

        {firstError(state) && (
          <p className="text-[12px] text-err-700 sm:col-span-2">{firstError(state)}</p>
        )}
      </form>
    </Modal>
  );
}

function CatalogModal({
  mode,
  tipo,
  row,
  onClose,
}: {
  mode: "create" | "edit";
  tipo: CatalogoTipo;
  row?: CatalogRow;
  onClose: () => void;
}) {
  const action = mode === "create" ? createMaestroCatalogo : updateMaestroCatalogo;
  const [state, formAction, pending] = useActionState(action, undefined);
  const meta = CATALOG_META[tipo];
  const formId = `${mode}-${tipo}-maestro`;

  useEffect(() => {
    notifyActionState(state, {
      success: mode === "create" ? `${meta.singular} creado.` : `${meta.singular} actualizado.`,
      error: `No se pudo guardar el ${meta.singular.toLowerCase()}.`,
    });
    if (state?.ok) onClose();
  }, [state, onClose, mode, meta]);

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "create" ? `Nuevo ${meta.singular}` : `Editar ${meta.singular}`}
      footer={
        <button
          type="submit"
          form={formId}
          disabled={pending}
          className="rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
        >
          {pending ? <EstadoProcesando>Guardando</EstadoProcesando> : "Guardar"}
        </button>
      }
    >
      <form id={formId} action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="tipo" value={tipo} />
        {row && <input type="hidden" name="id" value={row.id} />}
        <FormField label={meta.code} error={state?.errors?.code}>
          <input
            name="code"
            defaultValue={row?.code ?? ""}
            required
            className="rounded-md border border-ink-200 px-3 py-2 font-mono text-[13px]"
          />
        </FormField>
        <FormField label="Nombre" error={state?.errors?.name}>
          <input
            name="name"
            defaultValue={row?.name ?? ""}
            required
            className="rounded-md border border-ink-200 px-3 py-2 text-[13px]"
          />
        </FormField>
        <FormField label="Orden" error={state?.errors?.order}>
          <input
            name="order"
            type="number"
            min={0}
            defaultValue={row?.order ?? 0}
            className="rounded-md border border-ink-200 px-3 py-2 font-mono text-[13px]"
          />
        </FormField>
        <label className="flex items-center gap-2 text-[13px] text-ink-800">
          <input
            type="checkbox"
            name="active"
            defaultChecked={row?.active ?? true}
            className="h-4 w-4 rounded border-ink-300 text-navy-600 focus:ring-navy-600"
          />
          Activo
        </label>
        {firstError(state) && (
          <p className="text-[12px] text-err-700">{firstError(state)}</p>
        )}
      </form>
    </Modal>
  );
}

function DeletePersonaModal({
  row,
  onClose,
}: {
  row: MaestroPersonaRow;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(deleteMaestroPersona, undefined);

  useEffect(() => {
    notifyActionState(state, {
      success: "Maestro eliminado.",
      error: "No se pudo eliminar el maestro.",
    });
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Eliminar maestro"
      footer={
        <button
          type="submit"
          form="delete-maestro-persona"
          disabled={pending}
          className="rounded-md bg-err-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-err-700/90 disabled:opacity-60"
        >
          {pending ? <EstadoProcesando>Eliminando</EstadoProcesando> : "Eliminar definitivamente"}
        </button>
      }
    >
      <form id="delete-maestro-persona" action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={row.id} />
        <p className="text-[13px] leading-relaxed text-ink-600">
          Vas a eliminar permanentemente a <strong>{row.name}</strong> ({row.email}).
          Si tiene clientes asociados, la operación se bloqueará hasta reasignarlos.
        </p>
        {firstError(state) && (
          <p className="text-[12px] text-err-700">{firstError(state)}</p>
        )}
      </form>
    </Modal>
  );
}

function DeleteCatalogModal({
  tipo,
  row,
  onClose,
}: {
  tipo: CatalogoTipo;
  row: CatalogRow;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(deleteMaestroCatalogo, undefined);
  const meta = CATALOG_META[tipo];

  useEffect(() => {
    if (state?.ok) {
      notifySuccess(`${meta.singular} eliminado.`);
      onClose();
      return;
    }
    notifyActionState(state, {
      success: `${meta.singular} eliminado.`,
      error: `No se pudo eliminar el ${meta.singular.toLowerCase()}.`,
    });
  }, [state, onClose, meta]);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Eliminar ${meta.singular}`}
      footer={
        <button
          type="submit"
          form="delete-maestro-catalogo"
          disabled={pending}
          className="rounded-md bg-err-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-err-700/90 disabled:opacity-60"
        >
          {pending ? <EstadoProcesando>Eliminando</EstadoProcesando> : "Eliminar definitivamente"}
        </button>
      }
    >
      <form id="delete-maestro-catalogo" action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="tipo" value={tipo} />
        <input type="hidden" name="id" value={row.id} />
        <p className="text-[13px] leading-relaxed text-ink-600">
          Vas a eliminar <strong>{row.name}</strong>. Si está asignado a clientes,
          la operación se bloqueará.
        </p>
        {firstError(state) && (
          <p className="text-[12px] text-err-700">{firstError(state)}</p>
        )}
      </form>
    </Modal>
  );
}

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string[];
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-ink-700">{label}</span>
      {children}
      {error?.[0] && <span className="text-[11px] text-err-700">{error[0]}</span>}
    </label>
  );
}
