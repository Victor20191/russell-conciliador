"use client";

import { EstadoProcesando } from "@/components/estado-procesando";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import {
  PageSizeSelect,
  PaginationFooter,
  usePagination,
} from "@/components/pagination-controls";
import { Card } from "@/components/ui";
import { Modal } from "@/components/modal";
import { SelectBuscable } from "@/components/select-buscable";
import { ActionForm } from "@/components/action-form";
import {
  createClient,
  updateClient,
  deleteClient,
} from "@/app/actions/clients";
import type { ActionState } from "@/lib/definitions";
import { notifyActionState } from "@/lib/client-notifications";
import { ImportClientesButton } from "./import-clientes-modal";
import {
  CODIGOS_ERP_BASE,
  campoErpProceso,
  esCodigoProcesoErp,
  esProcesoErpBase,
  type CodigoProcesoErp,
} from "@/lib/erp-procesos";

export type ModuleRef = { id: number; name: string };
/** Catálogo de formatos DIAN seleccionables por cliente (IVA F-300…). */
export type DianFormRef = { id: number; name: string; code: string };
/** Catálogos maestros ERP y Sector seleccionables por cliente. */
export type ErpRef = { id: number; name: string; active: boolean };
export type ErpProcessRef = { code: CodigoProcesoErp; name: string };
export type SectorRef = { id: number; name: string };
export type PersonaRef = { id: number; name: string };
/** Candidatos por rol, ya filtrados por activos. El socio es informativo. */
export type Personas = {
  socios: PersonaRef[];
  gerentes: PersonaRef[];
  seniors: PersonaRef[];
  staffs: PersonaRef[];
};
/** Arista de jerarquía superior→subordinado (jerarquia_usuarios). */
export type Arista = { superiorId: number; subordinadoId: number };
export type ClientRow = {
  id: number;
  code: string;
  name: string;
  nit: string;
  tipo: string;
  erpId: number | null;
  erpName: string | null;
  erpsPorProceso: {
    processCode: string;
    erpId: number | null;
    erpName: string | null;
    status: string;
  }[];
  sectorId: number | null;
  sectorName: string | null;
  socioId: number | null;
  socioName: string | null;
  modules: { moduleId: number; status: string }[];
  dianFormIds: number[];
  responsables: { funcion: string; userId: number; name: string }[];
};

function statusOf(c: ClientRow, moduleId: number): "configured" | "pending" | "none" {
  const m = c.modules.find((x) => x.moduleId === moduleId);
  return (m?.status as "configured" | "pending") ?? "none";
}

/** Estado de "DIAN · Impuestos" como un módulo más de la tabla. ClientDianForm no
 *  tiene 'status' propio, así que se deriva de la presencia de formatos: con al
 *  menos un formato ⇒ "pending" (activo, igual que un módulo recién asignado);
 *  sin formatos ⇒ "none" (N/A). */
function dianStatusOf(c: ClientRow): "configured" | "pending" | "none" {
  return c.dianFormIds.length > 0 ? "pending" : "none";
}

export default function ClientesClient({
  clients,
  modules,
  dianForms,
  erps,
  erpProcesses,
  sectors,
  nextCode,
  personas,
  aristas,
}: {
  clients: ClientRow[];
  modules: ModuleRef[];
  dianForms: DianFormRef[];
  erps: ErpRef[];
  erpProcesses: ErpProcessRef[];
  sectors: SectorRef[];
  nextCode: string;
  personas: Personas;
  aristas: Arista[];
}) {
  const [q, setQ] = useState("");
  const [erp, setErp] = useState("");
  const [sector, setSector] = useState("");
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [creating, setCreating] = useState(false);
  // La personalización de la carga de balances (perfiles, correcciones y
  // preferencias) se administra en Configuración › Perfiles de carga.

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return clients.filter(
      (c) =>
        (!needle || c.name.toLowerCase().includes(needle) || c.nit.includes(needle)) &&
        (!erp || (erp === "__sin__" ? c.erpId == null : String(c.erpId) === erp)) &&
        (!sector || String(c.sectorId ?? "") === sector),
    );
  }, [clients, q, erp, sector]);

  const pg = usePagination(filtered, 50);
  // "DIAN · Impuestos" se muestra como una columna-módulo más cuando el catálogo
  // tiene formatos (siempre, en la práctica: IVA/Retención/ICA vienen del seed).
  const showDian = dianForms.length > 0;

  return (
    <Card>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
        <div className="flex items-center gap-2 rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1.5 text-ink-400">
          <Icon name="search" size={14} />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              pg.resetToFirstPage();
            }}
            placeholder="Buscar cliente o NIT…"
            className="w-56 bg-transparent text-[12.5px] text-ink-700 outline-none placeholder:text-ink-400"
          />
        </div>
        <SelectBuscable
          opciones={[
            { value: "", label: "Todos los ERP contables" },
            { value: "__sin__", label: "Sin ERP contable" },
            ...erps.filter((e) => e.active).map((e) => ({ value: String(e.id), label: e.name })),
          ]}
          value={erp}
          onChange={(v) => {
            setErp(v);
            pg.resetToFirstPage();
          }}
          placeholder="Buscar ERP contable…"
          className="w-56"
        />
        <SelectBuscable
          opciones={[
            { value: "", label: "Todos los sectores" },
            ...sectors.map((s) => ({ value: String(s.id), label: s.name })),
          ]}
          value={sector}
          onChange={(v) => {
            setSector(v);
            pg.resetToFirstPage();
          }}
          placeholder="Buscar sector…"
          className="w-56"
        />
        <div className="ml-auto flex items-center gap-2">
          <a
            href="/config/clientes/exportar"
            download
            title="Descargar un Excel con todos los clientes (según tu cartera)."
            className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 transition hover:bg-ink-50"
          >
            <Icon name="download" size={13} /> Exportar a Excel
          </a>
          <ImportClientesButton />
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-navy-600"
          >
            <Icon name="plus" size={13} /> Nuevo cliente
          </button>
          <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2 font-semibold">Cliente</th>
              <th className="px-4 py-2 font-semibold">NIT</th>
              <th className="px-2 py-2 text-center font-semibold">Tipo</th>
              <th className="px-4 py-2 font-semibold">ERP contable</th>
              {modules.map((m) => (
                <th key={m.id} className="px-2 py-2 text-center font-semibold">{m.name}</th>
              ))}
              {showDian && (
                <th className="px-2 py-2 text-center font-semibold">DIAN · Impuestos</th>
              )}
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {pg.pageItems.map((c) => (
              <tr key={c.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                <td className="p-0">
                  <button
                    type="button"
                    onClick={() => setEditing(c)}
                    title="Ver información del cliente"
                    className="block w-full px-4 py-2.5 text-left font-medium text-ink-800 transition hover:text-navy-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  >
                    {c.name}
                  </button>
                </td>
                <td className="p-0">
                  <button
                    type="button"
                    onClick={() => setEditing(c)}
                    title="Ver información del cliente"
                    className="block w-full px-4 py-2.5 text-left font-mono text-ink-500 transition hover:text-navy-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  >
                    {c.nit}
                  </button>
                </td>
                <td className="px-2 py-2.5 text-center">
                  <TipoBadge tipo={c.tipo} />
                </td>
                <td className="px-4 py-2.5 text-ink-600">
                  {c.erpName ?? (
                    <span
                      title="Sin ERP contable asignado: se exige antes de iniciar una conciliación o cargar el balance."
                      className="inline-flex items-center rounded-full bg-warn-100 px-2 py-0.5 text-[10px] font-semibold text-warn-700"
                    >
                      Sin ERP contable
                    </span>
                  )}
                </td>
                {modules.map((m) => (
                  <td key={m.id} className="px-2 py-2 text-center">
                    <ModuleCell status={statusOf(c, m.id)} />
                  </td>
                ))}
                {showDian && (
                  <td className="px-2 py-2 text-center">
                    <ModuleCell status={dianStatusOf(c)} />
                  </td>
                )}
                <td className="whitespace-nowrap px-2 py-2 text-right">
                  <button
                    onClick={() => setEditing(c)}
                    title="Ver información del cliente"
                    className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                  >
                    <Icon name="chev-r" size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={modules.length + 5 + (showDian ? 1 : 0)} className="px-4 py-8 text-center text-[12.5px] text-ink-400">
                  Sin clientes que coincidan con el filtro.
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

      {creating && (
        <ClientModal
          key="create"
          onClose={() => setCreating(false)}
          title="Nuevo cliente"
          action={createClient}
          erps={erps}
          erpProcesses={erpProcesses}
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
          erpProcesses={erpProcesses}
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

/** Clasificación del cliente: A (azul), B (ámbar), C (gris). */
function TipoBadge({ tipo }: { tipo: string }) {
  const estilo: Record<string, string> =
    {
      A: "bg-navy-700 text-white",
      B: "bg-warn-100 text-warn-700",
      C: "bg-ink-100 text-ink-500",
    };
  return (
    <span
      title={`Tipo de cliente: ${tipo}`}
      className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${estilo[tipo] ?? "bg-ink-100 text-ink-500"}`}
    >
      {tipo}
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
  erpProcesses,
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
  erps: ErpRef[];
  erpProcesses: ErpProcessRef[];
  sectors: SectorRef[];
  nextCode: string;
  modules?: ModuleRef[];
  dianForms: DianFormRef[];
  personas: Personas;
  aristas: Arista[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const isEdit = client != null;
  // Por defecto, un cliente nuevo trae TODOS los módulos activos (se pueden
  // deseleccionar). Al editar se marcan solo los ya asignados en BD.
  const [selectedModuleIds, setSelectedModuleIds] = useState<number[]>(
    () => (isEdit ? client.modules.map((module) => module.moduleId) : (modules ?? []).map((m) => m.id)),
  );
  // DIAN vive DENTRO de "Módulos del cliente". Por defecto, un cliente nuevo
  // trae DIAN activo con todos sus formatos. Al editar se precargan los activos.
  const [dianActive, setDianActive] = useState<boolean>(
    () => (isEdit ? client.dianFormIds.length > 0 : dianForms.length > 0),
  );
  const [selectedDianFormIds, setSelectedDianFormIds] = useState<number[]>(
    () => (isEdit ? client.dianFormIds : dianForms.map((f) => f.id)),
  );
  const [erpsAdicionales, setErpsAdicionales] = useState<
    { code: CodigoProcesoErp; erpId: string }[]
  >(() => {
    if (!client) return [];
    return client.erpsPorProceso.flatMap((asignacion) => {
      if (
        asignacion.erpId == null
        || !esCodigoProcesoErp(asignacion.processCode)
        || esProcesoErpBase(asignacion.processCode)
      ) return [];
      return [{ code: asignacion.processCode, erpId: String(asignacion.erpId) }];
    });
  });
  const [agregandoErp, setAgregandoErp] = useState(false);
  const [procesosRetirados, setProcesosRetirados] = useState<CodigoProcesoErp[]>([]);
  const [nuevoProceso, setNuevoProceso] = useState<CodigoProcesoErp | "">("");
  const [nuevoErpId, setNuevoErpId] = useState("");
  const [errorNuevoErp, setErrorNuevoErp] = useState("");

  const procesosBase = useMemo(
    () => CODIGOS_ERP_BASE.flatMap((codigo) => {
      const proceso = erpProcesses.find((item) => item.code === codigo);
      return proceso ? [proceso] : [];
    }),
    [erpProcesses],
  );
  const procesosAdicionalesDisponibles = useMemo(() => {
    const seleccionados = new Set(erpsAdicionales.map((item) => item.code));
    return erpProcesses.filter(
      (proceso) => !esProcesoErpBase(proceso.code) && !seleccionados.has(proceso.code),
    );
  }, [erpProcesses, erpsAdicionales]);

  // Responsables en CASCADA por jerarquía: el gerente acota los seniors
  // (sus subordinados) y el senior acota los staff. Si un responsable ya
  // asignado dejó de ser válido (inactivo o arista eliminada), el select
  // queda vacío y obliga a elegir de nuevo.
  const respDe = (funcion: string): number | "" =>
    client?.responsables.find((r) => r.funcion === funcion)?.userId ?? "";
  // Socio responsable (informativo): selector independiente de la cascada.
  const [socioId, setSocioId] = useState<number | "">(() => client?.socioId ?? "");
  // Conserva el socio ya asignado aunque hoy esté inactivo (no vendría en la lista).
  const socioOpciones = useMemo(() => {
    const opts = [...personas.socios];
    if (
      client?.socioId != null &&
      !opts.some((s) => s.id === client.socioId)
    ) {
      opts.unshift({ id: client.socioId, name: client.socioName ?? `Usuario ${client.socioId}` });
    }
    return opts;
  }, [personas.socios, client]);
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

  function agregarSistemaAdicional() {
    if (!nuevoProceso || !nuevoErpId) {
      setErrorNuevoErp("Selecciona el módulo y su ERP antes de agregarlo.");
      return;
    }
    setErpsAdicionales((current) => [
      ...current,
      { code: nuevoProceso, erpId: nuevoErpId },
    ]);
    setProcesosRetirados((current) => current.filter((codigo) => codigo !== nuevoProceso));
    setNuevoProceso("");
    setNuevoErpId("");
    setErrorNuevoErp("");
    setAgregandoErp(false);
  }

  function actualizarErpAdicional(codigo: CodigoProcesoErp, erpId: string) {
    setErpsAdicionales((current) =>
      current.map((item) => item.code === codigo ? { ...item, erpId } : item),
    );
  }

  function retirarSistemaAdicional(codigo: CodigoProcesoErp) {
    setErpsAdicionales((current) => current.filter((item) => item.code !== codigo));
    setProcesosRetirados((current) => current.includes(codigo) ? current : [...current, codigo]);
  }

  // ----- DIAN: módulo padre + un checkbox por formato (sub-ítem) -----
  // "Activar DIAN" significa tener al menos un formato: guardar DIAN activo sin
  // formatos lo persistiría como desactivado (inconsistencia silenciosa). Se
  // bloquea el guardado hasta marcar un formato o desactivar DIAN.
  const dianInvalido = dianActive && selectedDianFormIds.length === 0;

  function toggleDian() {
    setDianActive((active) => {
      const next = !active;
      // Al activar se marcan todos los formatos por defecto; al desactivar se limpian.
      setSelectedDianFormIds(next ? dianForms.map((f) => f.id) : []);
      return next;
    });
  }
  function toggleDianForm(id: number) {
    setSelectedDianFormIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  useEffect(() => {
    notifyActionState(state, {
      success: isEdit ? "Cliente actualizado." : "Cliente creado.",
      error: "No se pudo guardar el cliente.",
    });
    if (state?.ok) onClose();
  }, [state, onClose, isEdit]);

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="3xl"
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
            {pending ? <EstadoProcesando>Guardando</EstadoProcesando> : "Guardar"}
          </button>
        </>
      }
    >
      <form id="client-form" action={formAction} className="flex flex-col gap-3">
        {isEdit && <input type="hidden" name="id" value={client.id} />}
        <input type="hidden" name="syncErpsPorProceso" value="1" />
        {procesosRetirados.map((codigo) => (
          <input key={codigo} type="hidden" name="erpProcesoRetirados" value={codigo} />
        ))}
        {/* Dos columnas (en ≥sm): Datos del cliente | Responsables. Aprovecha el
            ancho del modal y reduce el alto para que todo quepa sin scroll. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2.5 rounded-md border border-ink-150 bg-ink-50/60 p-3">
        <span className="text-[11.5px] font-medium text-ink-600">Datos del cliente</span>
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
        <div className="flex gap-3">
          <CField label="NIT" error={state?.errors?.nit}>
            <input
              name="nit"
              defaultValue={client?.nit ?? ""}
              className="w-full rounded-md border border-ink-200 px-2.5 py-1.5 font-mono text-[12.5px] outline-none focus:border-blue-400"
            />
          </CField>
          <CField label="Tipo de cliente" error={state?.errors?.tipo}>
            <select
              name="tipo"
              required
              defaultValue={client?.tipo ?? ""}
              className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400"
            >
              <option value="">Selecciona…</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </CField>
        </div>
        <div className="flex gap-3">
          <CField label="Sector" error={state?.errors?.sectorId}>
            <select
              name="sectorId"
              defaultValue={client?.sectorId ?? ""}
              className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400"
            >
              <option value="">Sin sector</option>
              {sectors.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </CField>
        </div>
        </div>

        <div className="rounded-md border border-ink-150 bg-ink-50/60 p-3">
          <div className="mb-2 flex flex-col gap-0.5">
            <span className="text-[11.5px] font-medium text-ink-600">
              Responsables de la auditoría
            </span>
            <span className="text-[11px] text-ink-400">
              Gerente valida · Senior revisa · Staff ejecuta. El Socio (firma) se
              registra como dato; su acceso se deriva de la jerarquía.
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <CField label="Socio (firma)" error={state?.errors?.socioId}>
              <select
                name="socioId"
                required
                value={socioId}
                onChange={(e) => setSocioId(e.target.value ? Number(e.target.value) : "")}
                className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400"
              >
                <option value="">Selecciona el socio…</option>
                {socioOpciones.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </CField>
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

        <div className="rounded-md border border-ink-150 bg-ink-50/60 p-3 sm:col-span-2">
          <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-[11.5px] font-medium text-ink-700">Sistemas por proceso</div>
              <p className="mt-0.5 text-[11px] text-ink-400">
                CONT, NOM e INV son la base. Agrega otros procesos solo cuando el cliente los necesite.
              </p>
            </div>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
              3 base{erpsAdicionales.length > 0 ? ` + ${erpsAdicionales.length} adicional${erpsAdicionales.length === 1 ? "" : "es"}` : ""}
            </span>
          </div>
          {state?.errors?.erpProcesoCodigos?.map((error) => (
            <div key={error} className="mb-2 rounded-md border border-err-100 bg-err-50 px-2.5 py-2 text-[11px] text-err-700">
              {error}
            </div>
          ))}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {procesosBase.map((proceso) => {
              const asignacion = client?.erpsPorProceso.find(
                (item) => item.processCode === proceso.code,
              );
              // El único dato legado confiable es CONT. Inferir los demás desde
              // el ERP contable registraría información no confirmada como cierta.
              const erpInicial = asignacion
                ? asignacion.erpId
                : proceso.code === "CONT"
                  ? (client?.erpId ?? "")
                  : "";
              const fieldName = campoErpProceso(proceso.code);
              return (
                <label
                  key={proceso.code}
                  className="rounded-md border border-ink-150 bg-white p-2.5 transition focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-100"
                >
                  <span className="mb-1.5 flex items-center gap-1.5">
                    <span className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-navy-700">
                      {proceso.code}
                    </span>
                    <span className="truncate text-[11.5px] font-medium text-ink-700">
                      {proceso.name}
                    </span>
                  </span>
                  <select
                    name={fieldName}
                    defaultValue={erpInicial ?? ""}
                    aria-label={`ERP de ${proceso.name}`}
                    className="w-full rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px] text-ink-700 outline-none focus:border-blue-400"
                  >
                    <option value="">Pendiente / sin definir</option>
                    {erps.filter((erp) => erp.active || erp.id === erpInicial).map((erp) => (
                      <option key={erp.id} value={erp.id}>
                        {erp.name}{erp.active ? "" : " (inactivo)"}
                      </option>
                    ))}
                  </select>
                  {state?.errors?.[fieldName]?.map((error) => (
                    <span key={error} className="mt-1 block text-[10.5px] text-err-600">{error}</span>
                  ))}
                  <input type="hidden" name="erpProcesoCodigos" value={proceso.code} />
                </label>
              );
            })}
          </div>

          <div className="mt-3 border-t border-ink-150 pt-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11.5px] font-medium text-ink-700">Procesos adicionales</div>
                <p className="mt-0.5 text-[10.5px] text-ink-400">
                  Cada proceso adicional debe tener un ERP definido.
                </p>
              </div>
              {!agregandoErp && (
                <button
                  type="button"
                  onClick={() => {
                    setAgregandoErp(true);
                    setErrorNuevoErp("");
                  }}
                  disabled={procesosAdicionalesDisponibles.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-navy-700 transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Icon name="plus" size={12} /> Agregar módulo y ERP
                </button>
              )}
            </div>

            {erpsAdicionales.length > 0 && (
              <div className="mb-2 flex flex-col gap-2">
                {erpsAdicionales.map((asignacion) => {
                  const proceso = erpProcesses.find((item) => item.code === asignacion.code);
                  if (!proceso) return null;
                  const fieldName = campoErpProceso(asignacion.code);
                  return (
                    <div
                      key={asignacion.code}
                      className="grid grid-cols-1 items-end gap-2 rounded-md border border-ink-150 bg-white p-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]"
                    >
                      <div>
                        <span className="mb-1 block text-[10.5px] font-medium text-ink-500">Módulo / proceso</span>
                        <div className="flex min-h-8 items-center gap-2 rounded-md border border-ink-150 bg-ink-50 px-2.5 text-[12px] text-ink-700">
                          <span className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-navy-700">
                            {proceso.code}
                          </span>
                          <span className="truncate font-medium">{proceso.name}</span>
                        </div>
                      </div>
                      <label>
                        <span className="mb-1 block text-[10.5px] font-medium text-ink-500">ERP asignado</span>
                        <select
                          name={fieldName}
                          required
                          value={asignacion.erpId}
                          onChange={(event) => actualizarErpAdicional(asignacion.code, event.target.value)}
                          className="w-full rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px] text-ink-700 outline-none focus:border-blue-400"
                        >
                          <option value="">Selecciona un ERP…</option>
                          {erps.filter((erp) => erp.active || String(erp.id) === asignacion.erpId).map((erp) => (
                            <option key={erp.id} value={erp.id}>
                              {erp.name}{erp.active ? "" : " (inactivo)"}
                            </option>
                          ))}
                        </select>
                        {state?.errors?.[fieldName]?.map((error) => (
                          <span key={error} className="mt-1 block text-[10.5px] text-err-600">{error}</span>
                        ))}
                      </label>
                      <button
                        type="button"
                        onClick={() => retirarSistemaAdicional(asignacion.code)}
                        title={`Retirar ${proceso.name}`}
                        className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-err-100 px-2.5 text-[11px] font-semibold text-err-700 transition hover:bg-err-50"
                      >
                        <Icon name="x" size={12} /> Retirar
                      </button>
                      <input type="hidden" name="erpProcesoCodigos" value={asignacion.code} />
                    </div>
                  );
                })}
              </div>
            )}

            {agregandoErp && (
              <div className="rounded-md border border-blue-200 bg-blue-50/50 p-2.5">
                <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
                  <label>
                    <span className="mb-1 block text-[10.5px] font-medium text-ink-600">Módulo / proceso</span>
                    <select
                      value={nuevoProceso}
                      onChange={(event) => {
                        const code = event.target.value;
                        setNuevoProceso(esCodigoProcesoErp(code) ? code : "");
                        setErrorNuevoErp("");
                      }}
                      className="w-full rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px] text-ink-700 outline-none focus:border-blue-400"
                    >
                      <option value="">Selecciona el módulo…</option>
                      {procesosAdicionalesDisponibles.map((proceso) => (
                        <option key={proceso.code} value={proceso.code}>
                          {proceso.code} · {proceso.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-[10.5px] font-medium text-ink-600">ERP</span>
                    <select
                      value={nuevoErpId}
                      onChange={(event) => {
                        setNuevoErpId(event.target.value);
                        setErrorNuevoErp("");
                      }}
                      className="w-full rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px] text-ink-700 outline-none focus:border-blue-400"
                    >
                      <option value="">Selecciona el ERP…</option>
                      {erps.filter((erp) => erp.active).map((erp) => (
                        <option key={erp.id} value={erp.id}>{erp.name}</option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={agregarSistemaAdicional}
                      className="h-8 rounded-md bg-navy-700 px-3 text-[11px] font-semibold text-white transition hover:bg-navy-600"
                    >
                      Agregar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAgregandoErp(false);
                        setNuevoProceso("");
                        setNuevoErpId("");
                        setErrorNuevoErp("");
                      }}
                      className="h-8 rounded-md border border-ink-200 bg-white px-2.5 text-[11px] font-semibold text-ink-600 hover:bg-ink-50"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
                {errorNuevoErp && (
                  <p className="mt-1.5 text-[10.5px] text-err-700">{errorNuevoErp}</p>
                )}
              </div>
            )}

            {erpsAdicionales.length === 0 && !agregandoErp && (
              <div className="rounded-md border border-dashed border-ink-200 bg-white/70 px-3 py-2 text-[11px] text-ink-400">
                Este cliente todavía no tiene procesos adicionales.
              </div>
            )}
          </div>
        </div>
        </div>

        {((modules && modules.length > 0) || dianForms.length > 0) && (
          <div className="rounded-md border border-ink-150 bg-ink-50/60 p-3">
            <input type="hidden" name="syncModules" value="1" />
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11.5px] font-medium text-ink-600">Módulos del cliente</span>
                {!isEdit && (
                  <span
                    title="Por defecto se cargan y habilitan todos los módulos y formatos DIAN. Desmarca los que no apliquen."
                    className="inline-flex items-center gap-1 rounded-full border border-warn-100 bg-warn-100 px-2 py-0.5 text-[10.5px] font-semibold text-warn-700"
                  >
                    <Icon name="check" size={10} stroke={2.5} />
                    Por defecto, todos cargados y habilitados
                  </span>
                )}
              </div>
              {modules && modules.length > 0 && (
                <span className="shrink-0 text-[11px] font-medium text-ink-400">
                  {selectedModuleIds.length}/{modules.length}
                </span>
              )}
            </div>
            {modules && modules.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                  <div className="mt-2 flex flex-col gap-1.5 border-t border-ink-100 pt-2 pl-6">
                    <span className="text-[11px] text-ink-500">
                      Formatos a auditar — uno o varios
                    </span>
                    {/* Un checkbox por formato (sub-ítem de DIAN · Impuestos).
                        Como son checkboxes nativos con name="dianFormIds", solo
                        los marcados llegan al FormData; no hacen falta inputs ocultos. */}
                    {dianForms.map((f) => {
                      const checked = selectedDianFormIds.includes(f.id);
                      return (
                        <label
                          key={f.id}
                          className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-[12px] font-medium transition ${
                            checked
                              ? "border-ok-100 bg-white text-ink-800"
                              : "border-ink-150 bg-ink-100 text-ink-500"
                          }`}
                        >
                          <input
                            type="checkbox"
                            name="dianFormIds"
                            value={f.id}
                            checked={checked}
                            onChange={() => toggleDianForm(f.id)}
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
                          <span className="truncate">
                            {f.name}
                            <span className="ml-1.5 font-mono text-[11px] text-ink-400">
                              {f.code}
                            </span>
                          </span>
                        </label>
                      );
                    })}
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
  const router = useRouter();

  return (
    <ActionForm
      action={deleteClient}
      successMessage="Cliente eliminado."
      errorMessage="No se pudo eliminar el cliente."
      showInlineError={false}
      onSuccess={() => {
        router.refresh();
        onDone();
      }}
    >
      {(pending) => (
        <>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            disabled={pending}
            onClick={(event) => {
              if (!confirm("¿Eliminar este cliente y sus parametrizaciones?")) {
                event.preventDefault();
              }
            }}
            className="rounded-md border border-err-100 bg-err-100 px-3 py-1.5 text-[12.5px] font-semibold text-err-700 hover:bg-err-100/70 disabled:opacity-60"
          >
            {pending ? <EstadoProcesando>Eliminando</EstadoProcesando> : "Eliminar"}
          </button>
        </>
      )}
    </ActionForm>
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
