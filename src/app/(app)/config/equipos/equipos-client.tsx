"use client";

import { useActionState, useEffect, useState } from "react";
import { Card, PageHeader, Chip, EmptyState } from "@/components/ui";
import { Modal } from "@/components/modal";
import {
  crearEquipo,
  agregarIntegrante,
  editarVigencia,
  quitarIntegrante,
} from "@/app/actions/equipos";

export type MemberRow = {
  id: number;
  userId: number;
  userName: string;
  userEmail: string | null;
  roleCode: string | null;
  roleName: string | null;
  validUntil: string | null; // YYYY-MM-DD o null (permanente)
  reason: string | null;
  estado: "vigente" | "futuro" | "expirado" | "inactivo";
};

export type TeamRow = {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  leadName: string | null;
  members: MemberRow[];
};

export type UserOption = { id: number; name: string; email: string };

const ESTADO_CHIP: Record<MemberRow["estado"], { label: string; tone: "ok" | "blue" | "err" | "ink" }> = {
  vigente: { label: "Vigente", tone: "ok" },
  futuro: { label: "Programado", tone: "blue" },
  expirado: { label: "Expirado", tone: "err" },
  inactivo: { label: "Inactivo", tone: "ink" },
};

const inputCls = "rounded-md border border-ink-200 px-3 py-2 text-[13px]";
const labelCls = "text-[12px] font-medium text-ink-700";

export default function EquiposClient({
  teams,
  users,
  leaders,
}: {
  teams: TeamRow[];
  users: UserOption[];
  leaders: UserOption[];
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [addToTeam, setAddToTeam] = useState<TeamRow | null>(null);
  const [editMember, setEditMember] = useState<MemberRow | null>(null);

  return (
    <div>
      <PageHeader
        title="Equipos de trabajo"
        subtitle="Cuadrillas de auditoría: un usuario puede pertenecer a varios equipos, y ser asignado a otro de forma temporal."
        actions={
          <button
            onClick={() => setCreateOpen(true)}
            className="rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white"
          >
            Nuevo equipo
          </button>
        }
      />

      {teams.length === 0 && (
        <Card>
          <EmptyState
            icon="users"
            title="Aún no hay equipos"
            description="Crea un equipo para agrupar usuarios y asignarles cartera de clientes."
          />
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {teams.map((team) => (
          <Card key={team.id} className="overflow-hidden">
            <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-4 py-3">
              <div>
                <h2 className="text-[14px] font-semibold text-ink-900">{team.name}</h2>
                <p className="mt-0.5 text-[12px] text-ink-500">
                  {team.description ? team.description + " · " : ""}
                  {team.leadName ? `Líder: ${team.leadName}` : "Sin líder"}
                  {" · "}
                  {team.members.length} integrante{team.members.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                onClick={() => setAddToTeam(team)}
                className="shrink-0 rounded-md border border-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-navy-700 hover:bg-navy-50"
              >
                Agregar integrante
              </button>
            </div>

            {team.members.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12.5px] text-ink-400">
                Sin integrantes. Usa “Agregar integrante”.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-ink-100 bg-ink-50 text-[11px] uppercase tracking-wider text-ink-500">
                      <th className="px-4 py-2.5 font-semibold">Integrante</th>
                      <th className="px-4 py-2.5 font-semibold">Rol</th>
                      <th className="px-4 py-2.5 font-semibold">Vigencia</th>
                      <th className="px-4 py-2.5 font-semibold">Estado</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {team.members.map((m) => (
                      <tr key={m.id} className="hover:bg-ink-50/50">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-ink-800">{m.userName}</div>
                          {m.userEmail && <div className="text-[11.5px] text-ink-500">{m.userEmail}</div>}
                        </td>
                        <td className="px-4 py-2.5 text-ink-600">{m.roleName ?? "—"}</td>
                        <td className="px-4 py-2.5 text-ink-600">
                          {m.validUntil ? (
                            <span>
                              hasta <span className="font-mono text-[12px]">{m.validUntil}</span>
                              {m.reason && <span className="text-ink-400"> · {m.reason}</span>}
                            </span>
                          ) : (
                            <span className="text-ink-400">Permanente</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <Chip label={ESTADO_CHIP[m.estado].label} tone={ESTADO_CHIP[m.estado].tone} />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => setEditMember(m)}
                            className="mr-4 text-blue-500 hover:underline"
                          >
                            Vigencia
                          </button>
                          <QuitarIntegranteButton memberId={m.id} memberName={m.userName} />
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

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Crear nuevo equipo">
        <CrearEquipoForm leaders={leaders} onSuccess={() => setCreateOpen(false)} />
      </Modal>

      <Modal open={!!addToTeam} onClose={() => setAddToTeam(null)} title={`Agregar integrante${addToTeam ? " · " + addToTeam.name : ""}`}>
        {addToTeam && (
          <AgregarIntegranteForm
            team={addToTeam}
            users={users}
            onSuccess={() => setAddToTeam(null)}
          />
        )}
      </Modal>

      <Modal open={!!editMember} onClose={() => setEditMember(null)} title="Editar vigencia del integrante">
        {editMember && (
          <EditarVigenciaForm
            member={editMember}
            onSuccess={() => setEditMember(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function FormFooter({ pending, submitLabel, pendingLabel }: {
  pending: boolean;
  submitLabel: string;
  pendingLabel: string;
}) {
  return (
    <div className="mt-2 flex justify-end gap-3">
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

function CrearEquipoForm({ leaders, onSuccess }: { leaders: UserOption[]; onSuccess: () => void }) {
  const [state, action, pending] = useActionState(crearEquipo, undefined);
  useEffect(() => {
    if (state?.ok) onSuccess();
  }, [state, onSuccess]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Nombre del equipo</label>
        <input name="name" placeholder="Ej. Cartera Pacífico" required className={inputCls} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Descripción (opcional)</label>
        <input name="description" placeholder="Ej. Auditoría de la cartera del Valle" className={inputCls} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Líder (Senior responsable, opcional)</label>
        <select name="leadUserId" defaultValue="" className={inputCls}>
          <option value="">— Sin líder —</option>
          {leaders.map((u) => (
            <option key={u.id} value={u.id}>{u.name} · {u.email}</option>
          ))}
        </select>
        {leaders.length === 0 && (
          <p className="text-[11px] text-ink-500">
            No hay usuarios con rol Senior disponibles para asignar como líder.
          </p>
        )}
      </div>
      <ErrorMsg message={state?.message} />
      <FormFooter pending={pending} submitLabel="Crear equipo" pendingLabel="Creando…" />
    </form>
  );
}

function AgregarIntegranteForm({ team, users, onSuccess }: {
  team: TeamRow;
  users: UserOption[];
  onSuccess: () => void;
}) {
  const [state, action, pending] = useActionState(agregarIntegrante, undefined);
  useEffect(() => {
    if (state?.ok) onSuccess();
  }, [state, onSuccess]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="teamId" value={team.id} />
      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Usuario</label>
        <select name="userId" required defaultValue="" className={inputCls}>
          <option value="" disabled>— Selecciona un usuario —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name} · {u.email}</option>
          ))}
        </select>
        {users.length === 0 && (
          <p className="text-[11px] text-ink-500">
            No hay usuarios con rol Staff disponibles para agregar.
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Vigente hasta (opcional)</label>
          <input type="date" name="validUntil" className={inputCls} />
          <p className="text-[11px] text-ink-500">Vacío = permanente. Con fecha = temporal: expira sola.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Motivo (opcional)</label>
          <input name="reason" placeholder="Ej. cubrimiento vacaciones" className={inputCls} />
        </div>
      </div>
      <ErrorMsg message={state?.message} />
      <FormFooter pending={pending} submitLabel="Agregar integrante" pendingLabel="Agregando…" />
    </form>
  );
}

function EditarVigenciaForm({ member, onSuccess }: { member: MemberRow; onSuccess: () => void }) {
  const [state, action, pending] = useActionState(editarVigencia, undefined);
  useEffect(() => {
    if (state?.ok) onSuccess();
  }, [state, onSuccess]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={member.id} />
      <p className="text-[13px] text-ink-600">
        Integrante <strong>{member.userName}</strong>. Deja la fecha vacía para hacer la membresía permanente.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Vigente hasta</label>
          <input type="date" name="validUntil" defaultValue={member.validUntil ?? ""} className={inputCls} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Motivo</label>
          <input name="reason" defaultValue={member.reason ?? ""} placeholder="Ej. refuerzo temporal" className={inputCls} />
        </div>
      </div>
      <ErrorMsg message={state?.message} />
      <FormFooter pending={pending} submitLabel="Guardar vigencia" pendingLabel="Guardando…" />
    </form>
  );
}

function QuitarIntegranteButton({ memberId, memberName }: { memberId: number; memberName: string }) {
  return (
    <form
      action={quitarIntegrante}
      className="inline"
      onSubmit={(e) => {
        if (!confirm(`¿Quitar a ${memberName} del equipo?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={memberId} />
      <button type="submit" className="text-err-700 hover:underline">Quitar</button>
    </form>
  );
}
