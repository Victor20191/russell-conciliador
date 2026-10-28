"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { eliminarBalance, reemplazarBalanceConciliado } from "@/app/actions/balance";
import { notifyError, notifySuccess } from "@/lib/client-notifications";

const BOTON_ROJO = "inline-flex items-center gap-1 rounded border border-err-500 bg-white px-2 py-1 text-[11.5px] font-semibold text-err-700 hover:bg-err-50 disabled:opacity-60";
const BOTON_NAVY = "inline-flex items-center gap-1 rounded border border-navy-700 bg-white px-2 py-1 text-[11.5px] font-semibold text-navy-700 hover:bg-navy-50 disabled:opacity-60";

/**
 * Eliminar OTRO balance del corte (solo esa versión) desde el panel «Balances del mismo corte»:
 * es como se resuelve una diferencia cuando el que sobra está abierto y sin conciliación en firme.
 * La acción vuelve a comprobarlo todo (abierto, sin cierres, alcance).
 */
export function EliminarBalanceCorteButton({ balanceId, nombre }: { balanceId: number; nombre: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pending, start] = useTransition();
  const eliminar = () =>
    start(async () => {
      const r = await eliminarBalance({ balanceId, alcance: "version" });
      if (r.ok) {
        notifySuccess(r.message ?? "Balance eliminado.");
        setAbierto(false);
        router.refresh();
      } else notifyError(r.message ?? "No se pudo eliminar el balance.");
    });
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className={BOTON_ROJO}>Eliminar</button>
      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        title={`Eliminar ${nombre}`}
        footer={
          <button type="button" onClick={eliminar} disabled={pending} className="rounded-md bg-err-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-err-400 disabled:opacity-60">
            {pending ? "Eliminando…" : "Eliminar esta versión"}
          </button>
        }
      >
        <p className="text-[13px] text-ink-700">
          Se elimina solo la versión {nombre}, con su detalle, sus alertas validadas y su conversación. Si su línea tiene una versión anterior, esa pasa a ser la vigente y entra a la comparación del corte. No se puede deshacer.
        </p>
      </Modal>
    </>
  );
}

/** Lo que el modal del reemplazo le dice al usuario antes de confirmar. */
export type ReemplazoVm = {
  viejo: { id: number; nombre: string; version: string };
  /** Esta versión, la que queda. */
  nuevo: { id: number; version: string };
  cierres: { modulo: string; periodo: string; cargue: number }[];
  cuentasEnFirme: number;
  /** Por qué no se puede (null = se puede intentar; la acción decide). */
  motivo: string | null;
};

/** Cuerpo del modal del reemplazo, puro para poder probarlo sin el portal. */
export function ContenidoReemplazo({ reemplazo }: { reemplazo: ReemplazoVm }) {
  const { viejo, nuevo, cierres, cuentasEnFirme } = reemplazo;
  return (
    <div className="flex flex-col gap-3 text-[13px] text-ink-700">
      <p>En un solo paso:</p>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5">
        <li>
          La conciliación en firme de{" "}
          <b>{cierres.map((c) => `${c.modulo} · ${c.periodo} (cargue #${c.cargue})`).join(", ")}</b> pasa a esta versión ({nuevo.version}). Sus {cuentasEnFirme} cuenta(s) en firme son idénticas en saldo final y homologación: la conciliación no cambia.
        </li>
        <li>Se elimina {viejo.nombre} {viejo.version} (#{viejo.id}).</li>
        <li>Esta versión ({nuevo.version}) queda cerrada.</li>
      </ol>
      <p className="text-ink-500">Queda en la bitácora. No se puede deshacer.</p>
    </div>
  );
}

/**
 * «Reemplazar el balance conciliado» (18/Oct/2026): el balance con una conciliación en firme no se
 * elimina; si debe quedar este en su lugar, se reemplaza. Deshabilitado con el motivo cuando la
 * pantalla ya sabe que no se puede (cuentas en firme distintas, prevalidador sin aprobar); la acción
 * vuelve a evaluarlo todo en su transacción.
 */
export function ReemplazarBalanceButton({ reemplazo }: { reemplazo: ReemplazoVm }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pending, start] = useTransition();
  const reemplazar = () =>
    start(async () => {
      const r = await reemplazarBalanceConciliado({ balanceNuevoId: reemplazo.nuevo.id, balanceViejoId: reemplazo.viejo.id });
      if (r.ok) {
        notifySuccess(r.message ?? "Balance reemplazado.");
        setAbierto(false);
        router.refresh();
      } else notifyError(r.message ?? "No se pudo reemplazar el balance.");
    });
  if (reemplazo.motivo) {
    return (
      <span className="flex max-w-md flex-col items-end gap-0.5">
        <button type="button" disabled title={reemplazo.motivo} className={BOTON_NAVY}>Reemplazar el balance conciliado</button>
        <span className="text-right text-[11px] text-err-700">{reemplazo.motivo}</span>
      </span>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className={BOTON_NAVY}>Reemplazar el balance conciliado</button>
      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        title={`Reemplazar ${reemplazo.viejo.nombre} ${reemplazo.viejo.version} por la ${reemplazo.nuevo.version}`}
        footer={
          <button type="button" onClick={reemplazar} disabled={pending} className="rounded-md bg-navy-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60">
            {pending ? "Reemplazando…" : "Reemplazar y cerrar"}
          </button>
        }
      >
        <ContenidoReemplazo reemplazo={reemplazo} />
      </Modal>
    </>
  );
}
