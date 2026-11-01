"use client";

import { useActionState, useEffect } from "react";
import { Modal } from "@/components/modal";
import { EstadoProcesando } from "@/components/estado-procesando";
import { fmtContable } from "@/lib/format";
import { notifyActionState } from "@/lib/client-notifications";
import { cambiarRestaSaldoInicial } from "@/app/actions/impuestos-retencion";
import type { ActionState } from "@/lib/definitions";
import { alcanceSaldoInicial, totalAlCambiarResta, type ResumenSaldoInicial, type SubtotalCruce } from "@/lib/impuestos/retencion/cruce";

// Confirma «Restar terceros con saldo inicial» o «Dejar de restar» con las cifras de antes y de después.

const BOTON_PRIMARIO = "rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60";
const CELDA = "px-2 py-1 text-right tabular-nums whitespace-nowrap";

export function RestaSaldoInicialModal({
  revisionId,
  activa,
  saldoInicial,
  total,
  onClose,
}: {
  revisionId: number;
  /** La revisión ya tiene pedida la resta: el modal la quita. */
  activa: boolean;
  /** Null: la resta está pedida pero no aplica con el balance de hoy. */
  saldoInicial: ResumenSaldoInicial | null;
  total: SubtotalCruce;
  onClose: () => void;
}) {
  const [state, action, guardando] = useActionState<ActionState, FormData>(cambiarRestaSaldoInicial, {});
  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);
  useEffect(() => {
    notifyActionState(state, { success: state.message ?? "Listo.", error: "No se pudo cambiar la resta del saldo inicial." });
  }, [state]);
  const despues = saldoInicial ? totalAlCambiarResta(total, saldoInicial) : null;
  const titulo = activa ? "Dejar de restar el saldo inicial" : "Restar terceros con saldo inicial";

  return (
    <Modal
      open
      onClose={onClose}
      title={titulo}
      size="lg"
      footer={
        <div className="flex w-full justify-end">
          <button type="submit" form="resta-saldo-inicial" disabled={guardando} className={BOTON_PRIMARIO}>
            {guardando ? <EstadoProcesando>Guardando</EstadoProcesando> : activa ? "Dejar de restar" : "Restar"}
          </button>
        </div>
      }
    >
      <form id="resta-saldo-inicial" action={action} className="flex flex-col gap-2 text-[12.5px] text-ink-700">
        <input type="hidden" name="revisionId" value={revisionId} />
        <input type="hidden" name="restar" value={activa ? "no" : "si"} />
        {saldoInicial ? (
          <>
            {activa ? (
              <p>El cruce vuelve a sumar el saldo final completo de {alcanceSaldoInicial(saldoInicial)}, que traen {fmtContable(saldoInicial.monto)} de saldo inicial.</p>
            ) : (
              <p>
                Se resta el saldo inicial de {alcanceSaldoInicial(saldoInicial)}, por {fmtContable(saldoInicial.monto)}. Un tercero sin movimiento queda tachado; uno con movimiento sigue sumando lo del año. La DIAN no cambia.
              </p>
            )}
            {despues && (
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-ink-150 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                    <th className="px-2 py-1 text-left">Total del cruce</th>
                    <th className="px-2 py-1 text-right">Hoy</th>
                    <th className="px-2 py-1 text-right">{activa ? "Sin restar" : "Al restar"}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-ink-100">
                    <td className="px-2 py-1">Contabilidad</td>
                    <td className={CELDA}>{fmtContable(total.contable)}</td>
                    <td className={CELDA}>{fmtContable(despues.contable)}</td>
                  </tr>
                  <tr>
                    <td className="px-2 py-1 font-semibold">Diferencia</td>
                    <td className={`${CELDA} font-semibold`}>{fmtContable(total.diferencia)}</td>
                    <td className={`${CELDA} font-semibold`}>{fmtContable(despues.diferencia)}</td>
                  </tr>
                </tbody>
              </table>
            )}
            <p className="text-[11.5px] text-ink-500">
              {activa ? "" : "Aplica porque el balance del corte empieza el 1 de enero. "}Las marcas cuya diferencia cambie quedan desactualizadas y la fila vuelve a pedirlas.
            </p>
          </>
        ) : (
          <p>La resta está guardada, pero con el balance de hoy no cambia ninguna cifra. Si la quitas, tampoco se aplicará cuando vuelva un balance desde enero.</p>
        )}
      </form>
    </Modal>
  );
}
