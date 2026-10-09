"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { descongelarBalance } from "@/app/actions/balance";
import { avisosDescongelar, type CierreAvisoDescongelar } from "@/lib/balance/descongelar";
import { MAX_JUSTIFICACION_DESBLOQUEO, MIN_JUSTIFICACION_DESBLOQUEO } from "@/lib/conciliacion/cuentas-bloqueo";

/**
 * Descongelar un balance para corregirlo (4/Oct/2026). El modal dice qué pasa —se podrá editar,
 * sigue siendo la oficial si lo era, hay que volver a congelarlo y, si hay conciliaciones en firme
 * del corte, que sus cuentas siguen bloqueadas— y exige una justificación, que queda en la auditoría.
 * Se cierra solo con la X (convención de los modales).
 */
export function DescongelarBalanceButton({
  id,
  titulo,
  esOficial,
  cierres,
}: {
  id: number;
  /** «Cliente · período · versión», para el título del modal. */
  titulo: string;
  esOficial: boolean;
  cierres: CierreAvisoDescongelar[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [justificacion, setJustificacion] = useState("");
  const [pending, start] = useTransition();
  const avisos = avisosDescongelar({ esOficial, cierres });
  const valida = justificacion.replace(/\s+/g, " ").trim().length >= MIN_JUSTIFICACION_DESBLOQUEO;

  const descongelar = () =>
    start(async () => {
      const r = await descongelarBalance({ id, justificacion });
      if (r.ok) {
        notifySuccess(r.message ?? "Balance descongelado.");
        setAbierto(false);
        setJustificacion("");
        router.refresh();
      } else notifyError(r.message ?? "No se pudo descongelar el balance.");
    });

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-warn-500 bg-white px-3 py-2 text-[12.5px] font-semibold text-warn-700 hover:bg-warn-100"
      >
        <Icon name="edit" size={13} /> Descongelar
      </button>
      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        title={`Descongelar balance · ${titulo}`}
        footer={
          <button
            type="button"
            onClick={descongelar}
            disabled={pending || !valida}
            className="inline-flex items-center gap-1.5 rounded-md bg-warn-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-warn-500 disabled:opacity-60"
          >
            {pending ? "Descongelando…" : "Descongelar"}
          </button>
        }
      >
        <div className="flex flex-col gap-3 text-[12.5px] text-ink-700">
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            {avisos.map((a) => (
              <li key={a} className={a.startsWith("Hay ") ? "text-warn-700" : undefined}>{a}</li>
            ))}
          </ul>
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-semibold text-ink-600">Justificación (obligatoria, mínimo {MIN_JUSTIFICACION_DESBLOQUEO} caracteres)</span>
            <textarea
              value={justificacion}
              onChange={(e) => setJustificacion(e.target.value.slice(0, MAX_JUSTIFICACION_DESBLOQUEO))}
              rows={4}
              autoFocus
              placeholder="Qué hay que corregir (p. ej. la cuenta 15922005 quedó homologada en una subcuenta equivocada)…"
              className="w-full rounded-md border border-ink-200 px-2.5 py-2 text-[12.5px] outline-none focus:border-blue-400"
            />
            <span className="text-right text-[10.5px] text-ink-400">{justificacion.length}/{MAX_JUSTIFICACION_DESBLOQUEO}</span>
          </label>
        </div>
      </Modal>
    </>
  );
}
