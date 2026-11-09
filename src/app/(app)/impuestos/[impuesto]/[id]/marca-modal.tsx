"use client";

import { useActionState, useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { Icon } from "@/components/icons";
import { EstadoProcesando } from "@/components/estado-procesando";
import { fmtContable } from "@/lib/format";
import { notifyActionState } from "@/lib/client-notifications";
import { guardarMarcaImpuesto, quitarMarcaImpuesto } from "@/app/actions/impuestos-revisiones";
import type { ActionState } from "@/lib/definitions";
import type { MarcaCruceRetencion } from "@/lib/impuestos/retencion/cruce";

// Panel de una marca de la revisión (fila del cruce, mes de pagos o mes de oportunidad): explicación,
// referencia del anexo, guardar y quitar.

const BOTON_PRIMARIO = "rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60";
const MAX_NOTA = 2000;
const MAX_REFERENCIA = 120;

export type MarcaVm = (MarcaCruceRetencion & { vigente: boolean }) | null;

export function MarcaModal({
  revisionId,
  clave,
  titulo,
  resumen,
  marca,
  conCifra = true,
  diferencia,
  placeholder,
  onClose,
}: {
  revisionId: number;
  clave: string;
  titulo: string;
  resumen: React.ReactNode;
  marca: MarcaVm;
  /** La marca guarda una diferencia (cruce y pagos); la de oportunidad no. */
  conCifra?: boolean;
  diferencia: number;
  placeholder: string;
  onClose: () => void;
}) {
  const [state, action, guardando] = useActionState<ActionState, FormData>(guardarMarcaImpuesto, {});
  const [stateQuitar, actionQuitar, quitando] = useActionState<ActionState, FormData>(quitarMarcaImpuesto, {});
  const [nota, setNota] = useState(marca?.nota ?? "");
  const [referencia, setReferencia] = useState(marca?.referenciaAnexo ?? "");
  // Cerrar cambia el estado de la pantalla que abrió el panel: en un efecto, no al dibujar.
  useEffect(() => {
    if (state.ok || stateQuitar.ok) onClose();
  }, [state, stateQuitar, onClose]);
  useEffect(() => {
    notifyActionState(state, { success: state.message ?? "Marca guardada.", error: "No se pudo guardar la marca." });
  }, [state]);
  useEffect(() => {
    notifyActionState(stateQuitar, { success: "Marca quitada.", error: "No se pudo quitar la marca." });
  }, [stateQuitar]);
  const ocupado = guardando || quitando;
  return (
    <Modal
      open
      onClose={onClose}
      title={marca ? `Marca ${marca.numero} · ${titulo}` : `Marcar · ${titulo}`}
      size="lg"
      footer={
        <div className="flex w-full items-center gap-2">
          {marca && (
            <button type="submit" form="quitar-marca-retencion" disabled={ocupado} className="rounded-md border border-err-100 px-2.5 py-1 text-[12px] font-semibold text-err-700 hover:bg-err-100 disabled:opacity-60">
              {quitando ? <EstadoProcesando>Quitando</EstadoProcesando> : "Quitar marca"}
            </button>
          )}
          <button type="submit" form="marca-retencion" disabled={ocupado || nota.trim().length < 10} className={`ml-auto ${BOTON_PRIMARIO}`}>
            {guardando ? <EstadoProcesando>Guardando</EstadoProcesando> : "Guardar marca"}
          </button>
        </div>
      }
    >
      <form id="marca-retencion" action={action} className="flex flex-col gap-2 text-[12.5px]">
        <input type="hidden" name="revisionId" value={revisionId} />
        <input type="hidden" name="clave" value={clave} />
        <div className="text-ink-600">{resumen}</div>
        {conCifra && <p className="text-[11.5px] text-ink-500">La marca guarda esta cifra: si la diferencia cambia, queda desactualizada.</p>}
        {marca && !marca.vigente && conCifra && (
          <p className="text-warn-700">Se escribió con una diferencia de {fmtContable(marca.diferencia)} y hoy es {fmtContable(diferencia)}. Al guardar queda con la de hoy.</p>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold text-ink-500">Explicación</span>
          <textarea
            name="nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={4}
            maxLength={MAX_NOTA}
            placeholder={placeholder}
            className="rounded-md border border-ink-200 bg-white px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold text-ink-500">Referencia del anexo (opcional)</span>
          <input
            name="referenciaAnexo"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            maxLength={MAX_REFERENCIA}
            placeholder="Ej.: PT-RET-02"
            className="rounded-md border border-ink-200 bg-white px-2 py-1.5"
          />
        </label>
      </form>
      {marca && (
        <form id="quitar-marca-retencion" action={actionQuitar} className="hidden">
          <input type="hidden" name="revisionId" value={revisionId} />
          <input type="hidden" name="clave" value={clave} />
        </form>
      )}
    </Modal>
  );
}

/** El número de una marca en la tabla (enlace a su observación al pie) o el botón para crearla. */
export function CeldaMarca({
  marca,
  requiereMarca,
  admiteMarca,
  puedeEditar,
  ancla,
  tituloDesactualizada,
  onMarcar,
}: {
  marca: MarcaVm;
  requiereMarca: boolean;
  /** Hay algo que marcar (una diferencia, o falta el original). */
  admiteMarca: boolean;
  puedeEditar: boolean;
  ancla: string;
  tituloDesactualizada?: string;
  onMarcar: () => void;
}) {
  if (marca) {
    return (
      <a
        href={`#${ancla}`}
        title={marca.vigente ? `Marca ${marca.numero} · ver la observación al pie` : (tituloDesactualizada ?? `Marca ${marca.numero} · desactualizada`)}
        className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border px-1 text-[11.5px] font-bold tabular-nums ${marca.vigente ? "border-navy-700 bg-white text-navy-700" : "border-warn-500 bg-warn-100 text-warn-700"}`}
      >
        {marca.numero}
      </a>
    );
  }
  if (!admiteMarca) return null;
  if (!puedeEditar) {
    return (
      <span className={`text-[11.5px] font-semibold ${requiereMarca ? "text-warn-700" : "text-ink-400"}`} title={requiereMarca ? "Sin marca" : "La marca es opcional"}>
        —
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onMarcar}
      title={requiereMarca ? "Poner una marca" : "La marca es opcional"}
      className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border border-dashed px-1 transition hover:border-navy-700 hover:text-navy-700 ${requiereMarca ? "border-warn-500 text-warn-700" : "border-ink-300 text-ink-400"}`}
    >
      <Icon name="plus" size={12} />
    </button>
  );
}
