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
/** Catálogo de formatos DIAN seleccionables por cliente (IVA F-300…). */
export type DianFormRef = { id: number; name: string; code: string };
export type PersonaRef = { id: number; name: string };
/** Candidatos a responsable, ya filtrados por rol y activos. */
export type Personas = { gerentes: PersonaRef[]; seniors: PersonaRef[]; staffs: PersonaRef[] };
/** Arista de jerarquía superior→subordinado (jerarquia_usuarios). */
export type Arista = { superiorId: number; subordinadoId: number };
export type ClientRow = {
  id: number;
  code: string;
  name: string;
  nit: string;
  erp: string;
  sector: string;
  modules: { moduleId: number; status: string }[];
  dianFormIds: number[];
  responsables: { funcion: string; userId: number; name: string }[];
};

function statusOf(c: ClientRow, moduleId: number): "configured" | "pending" | "none" {
  const m = c.modules.find((x) => x.moduleId === moduleId);
  return (m?.status as "configured" | "pending") ?? "none";
}
export default function ClientesClient({
  clients,
  modules,
  dianForms,
  erps,
  sectors,
  nextCode,
  personas,
  aristas,
}: {
  clients: ClientRow[];
  modules: ModuleRef[];
  dianForms: DianFormRef[];
  erps: string[];
  sectors: string[];
  nextCode: string;
  personas: Personas;
  aristas: Arista[];
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
              <th className="px-4 py-2 font-semibold">Responsables</th>
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
                <td className="px-4 py-2.5">
                  <ResponsablesCell responsables={c.responsables} />
                </td>
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
                <td colSpan={modules.length + 6} className="px-4 py-8 text-center text-[12.5px] text-ink-400">
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
          dianForms={dianForms}
          personas={personas}
          aristas={aristas}
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
          dianForms={dianForms}
          personas={personas}
          aristas={aristas}
        />
      )}
    </Card>
  );
}

function ResponsablesCell({ responsables }: { responsables: ClientRow["responsables"] }) {
  // Completo = las tres funciones cubiertas (con uno o varios staff).
  const funciones = new Set(responsables.map((r) => r.funcion));
  const completo =
    funciones.has("staff") && funciones.has("senior") && funciones.has("gerente");
  if (!completo) {
    return (
      <span className="inline-flex items-center rounded-full bg-warn-100 px-2 py-0.5 text-[10px] font-semibold text-warn-700">
        Sin asignar
      </span>
    );
  }
  const orden = ["staff", "senior", "gerente"];
  const etiqueta: Record<string, string> = { staff: "St", senior: "Sr", gerente: "Gr" };
  const lista = [...responsables].sort(
    (a, b) => orden.indexOf(a.funcion) - orden.indexOf(b.funcion),
  );
  return (
    <span className="text-[11.5px] text-ink-600">
      {lista.map((r, i) => (
        <span key={`${r.funcion}-${r.userId}`} title={`${r.funcion}: ${r.name}`}>
          {i > 0 && " · "}
          <span className="font-semibold text-ink-400">{etiqueta[r.funcion] ?? r.funcion}</span>{" "}
          {r.name}
        </span>
      ))}
    </span>
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
  dianForms,
  personas,
  aristas,
}: {
  onClose: () => void;
  title: string;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  client?: ClientRow | null;
  erps: string[];
  sectors: string[];
  nextCode: string;
  modules?: ModuleRef[];
  dianForms: DianFormRef[];
  personas: Personas;
  aristas: Arista[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const isEdit = client != null;
  // Los módulos nunca se preseleccionan al crear: la asignación es una decisión
  // explícita del usuario. Al editar se marcan solo los ya asignados en BD.
  const [selectedModuleIds, setSelectedModuleIds] = useState<number[]>(
    () => (isEdit ? client.modules.map((module) => module.moduleId) : []),
  );
  // DIAN vive DENTRO de "Módulos del cliente": activarlo equivale a tener al
  // menos un formato seleccionado. Al editar se precargan los formatos activos.
  const [dianActive, setDianActive] = useState<boolean>(
    () => (isEdit ? client.dianFormIds.length > 0 : false),
  );
  const [selectedDianFormIds, setSelectedDianFormIds] = useState<number[]>(
    () => (isEdit ? client.dianFormIds : []),
  );

  // Responsables en CASCADA por jerarquía: el gerente acota los seniors
  // (sus subordinados) y el senior acota los staff. Si un responsable ya
  // asignado dejó de ser válido (inactivo o arista eliminada), el select
  // queda vacío y obliga a elegir de nuevo.
  const respDe = (funcion: string): number | "" =>
    client?.responsables.find((r) => r.funcion === funcion)?.userId ?? "";
  const [gerenteId, setGerenteId] = useState<number | "">(() => respDe("gerente"));
  const [seniorId, setSeniorId] = useState<number | "">(() => respDe("senior"));
  const [staffIds, setStaffIds] = useState<number[]>(() =>
    (client?.responsables ?? [])
      .filter((r) => r.funcion === "staff")
      .map((r) => r.userId),
  );

  const esSubordinado = (superiorId: number | "", subordinadoId: number) =>
    superiorId !== "" &&
    aristas.some((a) => a.superiorId === superiorId && a.subordinadoId === subordinadoId);
  const seniorsDelGerente = useMemo(
    () =>
      gerenteId === ""
        ? []
        : personas.seniors.filter((s) =>
            aristas.some((a) => a.superiorId === gerenteId && a.subordinadoId === s.id),
          ),
    [gerenteId, personas.seniors, aristas],
  );
  const staffsDelSenior = useMemo(
    () =>
      seniorId === ""
        ? []
        : personas.staffs.filter((s) =>
            aristas.some((a) => a.superiorId === seniorId && a.subordinadoId === s.id),
          ),
    [seniorId, personas.staffs, aristas],
  );
  // Staff aún elegibles para agregar (reportan al senior y no están ya puestos).
  const staffDisponibles = staffsDelSenior.filter((s) => !staffIds.includes(s.id));
  // Nombres de los staff ya seleccionados (incluye los heredados de la edición).
  const nombreStaffPorId = useMemo(() => {
    const m = new Map<number, string>();
    personas.staffs.forEach((s) => m.set(s.id, s.name));
    (client?.responsables ?? [])
      .filter((r) => r.funcion === "staff")
      .forEach((r) => m.set(r.userId, r.name));
    return m;
  }, [personas.staffs, client]);

  function cambiarGerente(value: string) {
    const id = value ? Number(value) : "";
    setGerenteId(id);
    if (seniorId !== "" && !esSubordinado(id, seniorId)) {
      setSeniorId("");
      setStaffIds([]);
    }
  }
  function cambiarSenior(value: string) {
    const id = value ? Number(value) : "";
    setSeniorId(id);
    // Conserva solo los staff que reportan al nuevo senior.
    setStaffIds((prev) => prev.filter((sid) => esSubordinado(id, sid)));
  }
  function agregarStaff(value: string) {
    const sid = value ? Number(value) : 0;
    if (sid) setStaffIds((prev) => (prev.includes(sid) ? prev : [...prev, sid]));
  }
  function quitarStaff(sid: number) {
    setStaffIds((prev) => prev.filter((x) => x !== sid));
  }

  function toggleModule(moduleId: number) {
    setSelectedModuleIds((current) =>
      current.includes(moduleId)
        ? current.filter((id) => id !== moduleId)
        : [...current, moduleId],
    );
  }

  // ----- DIAN: activación + formatos (uno o varios) -----
  const dianFormById = useMemo(() => {
    const m = new Map<number, DianFormRef>();
    dianForms.forEach((f) => m.set(f.id, f));
    return m;
  }, [dianForms]);
  const dianDisponibles = dianForms.filter((f) => !selectedDianFormIds.includes(f.id));
  // "Activar DIAN" significa tener al menos un formato: guardar DIAN activo sin
  // formatos lo persistiría como desactivado (inconsistencia silenciosa). Se
  // bloquea el guardado hasta elegir un formato o desactivar DIAN.
  const dianInvalido = dianActive && selectedDianFormIds.length === 0;

  function toggleDian() {
    setDianActive((active) => {
      if (active) setSelectedDianFormIds([]); // al desactivar se limpian los formatos
      return !active;
    });
  }
  function agregarDianForm(value: string) {
    const id = value ? Number(value) : 0;
    if (id) setSelectedDianFormIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }
  function quitarDianForm(id: number) {
    setSelectedDianFormIds((prev) => prev.filter((x) => x !== id));
  }

  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          {isEdit && <DeleteClientButton id={client!.id} onDone={onClose} />}
          <button
            type="submit"
            form="client-form"
            disabled={pending || dianInvalido}
            title={dianInvalido ? "Selecciona al menos un formato DIAN o desactiva DIAN." : undefined}
            className="ml-auto rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <form id="client-form" action={formAction} className="flex flex-col gap-3">
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

        <div className="rounded-md border border-ink-150 bg-ink-50/60 p-3">
          <div className="mb-2 flex flex-col gap-0.5">
            <span className="text-[11.5px] font-medium text-ink-600">
              Responsables de la auditoría
            </span>
            <span className="text-[11px] text-ink-400">
              Staff ejecuta · Senior revisa · Gerente valida. El Socio se deriva de la
              jerarquía.
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <CField label="Gerente (valida)" error={state?.errors?.gerenteId}>
              <select
                name="gerenteId"
                required
                value={gerenteId}
                onChange={(e) => cambiarGerente(e.target.value)}
                className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400"
              >
                <option value="">Selecciona el gerente…</option>
                {personas.gerentes.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </CField>
            <CField label="Senior (revisa)" error={state?.errors?.seniorId}>
              <select
                name="seniorId"
                required
                value={seniorId}
                onChange={(e) => cambiarSenior(e.target.value)}
                disabled={gerenteId === ""}
                className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400"
              >
                <option value="">
                  {gerenteId === ""
                    ? "Primero selecciona el gerente"
                    : seniorsDelGerente.length === 0
                      ? "El gerente no tiene seniors a cargo"
                      : "Selecciona el senior…"}
                </option>
                {seniorsDelGerente.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </CField>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium text-ink-600">
                Staff (ejecuta) — uno o varios
              </span>
              {staffIds.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {staffIds.map((sid) => (
                    <div
                      key={sid}
                      className="flex items-center justify-between gap-2 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] text-ink-800"
                    >
                      <span className="truncate">
                        {nombreStaffPorId.get(sid) ?? `Usuario ${sid}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => quitarStaff(sid)}
                        title="Quitar staff"
                        className="rounded p-0.5 text-ink-400 transition hover:bg-ink-100 hover:text-err-600"
                      >
                        <Icon name="x" size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {/* Envío del arreglo: un input oculto por cada staff elegido. */}
              {staffIds.map((sid) => (
                <input key={sid} type="hidden" name="staffIds" value={sid} />
              ))}
              <select
                value=""
                onChange={(e) => agregarStaff(e.target.value)}
                disabled={seniorId === "" || staffDisponibles.length === 0}
                className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400"
              >
                <option value="">
                  {seniorId === ""
                    ? "Primero selecciona el senior"
                    : staffsDelSenior.length === 0
                      ? "El senior no tiene staff a cargo"
                      : staffDisponibles.length === 0
                        ? "Todos los staff ya están agregados"
                        : "Agregar staff…"}
                </option>
                {staffDisponibles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {state?.errors?.staffIds && (
                <span className="text-[11px] text-err-700">{state.errors.staffIds[0]}</span>
              )}
            </div>
          </div>
        </div>

        {((modules && modules.length > 0) || dianForms.length > 0) && (
          <div className="rounded-md border border-ink-150 bg-ink-50/60 p-3">
            <input type="hidden" name="syncModules" value="1" />
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[11.5px] font-medium text-ink-600">Módulos del cliente</span>
              {modules && modules.length > 0 && (
                <span className="text-[11px] font-medium text-ink-400">
                  {selectedModuleIds.length}/{modules.length}
                </span>
              )}
            </div>
            {modules && modules.length > 0 && (
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
            )}

            {/* DIAN · Impuestos: se activa aquí mismo y, al activarlo, se eligen
                los formatos a auditar (IVA F-300, Retención F-350, ICA F-CHIP). */}
            {dianForms.length > 0 && (
              <div className="mt-2 rounded-md border border-ink-150 bg-white p-2.5">
                <label className="flex cursor-pointer items-center gap-2 text-[12px] font-medium">
                  <input
                    type="checkbox"
                    checked={dianActive}
                    onChange={toggleDian}
                    className="sr-only"
                  />
                  <span
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                      dianActive
                        ? "border-ok-500 bg-ok-500 text-white"
                        : "border-ink-300 bg-white text-transparent"
                    }`}
                  >
                    <Icon name="check" size={11} stroke={2} />
                  </span>
                  <span className="text-ink-800">DIAN · Impuestos</span>
                  <span className="ml-auto text-[11px] font-medium text-ink-400">
                    {selectedDianFormIds.length}/{dianForms.length}
                  </span>
                </label>

                {dianActive && (
                  <div className="mt-2 flex flex-col gap-1.5 border-t border-ink-100 pt-2">
                    <span className="text-[11px] text-ink-500">
                      Formatos a auditar — uno o varios
                    </span>
                    {selectedDianFormIds.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {selectedDianFormIds.map((id) => {
                          const f = dianFormById.get(id);
                          return (
                            <div
                              key={id}
                              className="flex items-center justify-between gap-2 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] text-ink-800"
                            >
                              <span className="truncate">
                                {f ? f.name : `Formato ${id}`}
                                {f && (
                                  <span className="ml-1.5 font-mono text-[11px] text-ink-400">
                                    {f.code}
                                  </span>
                                )}
                              </span>
                              <button
                                type="button"
                                onClick={() => quitarDianForm(id)}
                                title="Quitar formato"
                                className="rounded p-0.5 text-ink-400 transition hover:bg-ink-100 hover:text-err-600"
                              >
                                <Icon name="x" size={14} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Envío del arreglo: un input oculto por formato elegido. */}
                    {selectedDianFormIds.map((id) => (
                      <input key={id} type="hidden" name="dianFormIds" value={id} />
                    ))}
                    <select
                      value=""
                      onChange={(e) => agregarDianForm(e.target.value)}
                      disabled={dianDisponibles.length === 0}
                      className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400"
                    >
                      <option value="">
                        {dianDisponibles.length === 0
                          ? "Todos los formatos ya están agregados"
                          : "Agregar formato…"}
                      </option>
                      {dianDisponibles.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} · {f.code}
                        </option>
                      ))}
                    </select>
                    {selectedDianFormIds.length === 0 && (
                      <span className="text-[11px] text-warn-700">
                        Selecciona al menos un formato o desactiva DIAN.
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {state?.message && <p className="text-[12px] text-err-700">{state.message}</p>}
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
