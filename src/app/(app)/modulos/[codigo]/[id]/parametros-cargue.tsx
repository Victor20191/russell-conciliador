"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { actualizarFechaCorteModulo } from "@/app/actions/modulos-datos";

/** Fecha de corte y divisa de un cargue de Cartera o CxP. */
export type ParametrosCargueVm = {
  /** Contra esta fecha se miden los días vencidos y las edades. */
  fechaCorte: string | null;
  /** `false` = no se declaró al cargar: es el fin del período. */
  fechaCorteDeclarada: boolean;
  trmCierre: number | null;
  /** Monedas de los importes que se convirtieron a pesos. */
  monedas: string[];
};

const fechaLegible = (iso: string) => iso.split("-").reverse().join("/");

export function ParametrosCargue({
  parametros,
  encabezadoId,
  puedeEditar,
}: {
  parametros: ParametrosCargueVm;
  encabezadoId: number;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [fecha, setFecha] = useState(parametros.fechaCorte ?? "");
  const [guardando, start] = useTransition();

  const guardar = () => {
    if (!fecha || guardando) return;
    start(async () => {
      const r = await actualizarFechaCorteModulo({ encabezadoId, fechaCorte: fecha });
      if (r.ok) {
        notifySuccess(r.message ?? "Fecha de corte actualizada.");
        setEditando(false);
        router.refresh();
      } else {
        notifyError(r.message ?? "No se pudo cambiar la fecha de corte.");
      }
    });
  };

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-500">
      <span>
        Corte al <b className="text-ink-700">{parametros.fechaCorte ? fechaLegible(parametros.fechaCorte) : "—"}</b>
        {parametros.fechaCorteDeclarada ? "" : " (fin del período)"}
      </span>
      {parametros.monedas.length > 0 && (
        <span>
          · importes en <b className="text-ink-700">{parametros.monedas.join(", ")}</b> convertidos a pesos
          {parametros.trmCierre != null && (
            <> con TRM de cierre <b className="text-ink-700">{parametros.trmCierre.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</b></>
          )}
        </span>
      )}
      {parametros.monedas.length === 0 && parametros.trmCierre != null && (
        <span>· TRM de cierre {parametros.trmCierre.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
      )}
      {puedeEditar && (
        <button type="button" onClick={() => setEditando(true)} className="font-semibold text-blue-700 hover:underline">
          Cambiar fecha de corte
        </button>
      )}
      <Modal
        open={editando}
        onClose={() => setEditando(false)}
        title="Fecha de corte del cargue"
        size="md"
        footer={
          <button
            type="button"
            onClick={guardar}
            disabled={!fecha || guardando}
            className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        }
      >
        <div className="flex flex-col gap-2 text-[12.5px] text-ink-700">
          <p>Contra esta fecha se miden los días vencidos y los rangos de edad del auxiliar. No cambia ningún importe.</p>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-48 rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px]"
          />
        </div>
      </Modal>
    </p>
  );
}
