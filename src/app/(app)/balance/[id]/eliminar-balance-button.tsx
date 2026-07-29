"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { eliminarBalance } from "@/app/actions/balance";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import {
  notifyError,
  notifySuccess,
} from "@/lib/client-notifications";
import type { AlcanceEliminacionBalance } from "@/lib/balance/alcance-eliminacion";

type Opcion = {
  value: AlcanceEliminacionBalance;
  titulo: string;
  descripcion: string;
  conteo: string;
};

export function EliminarBalanceButton({
  balanceId,
  nombreCliente,
  periodo,
  version,
  versionesPeriodo,
  balancesCliente,
  perfilesCliente,
}: {
  balanceId: number;
  nombreCliente: string;
  periodo: string;
  version: string;
  versionesPeriodo: number;
  balancesCliente: number;
  perfilesCliente: number;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [alcance, setAlcance] =
    useState<AlcanceEliminacionBalance>("version");
  const [eliminando, startEliminar] = useTransition();

  const opciones: Opcion[] = [
    {
      value: "version",
      titulo: "Solo esta versión",
      descripcion: `Elimina ${version} de ${periodo}. Las demás versiones y los perfiles se conservan.`,
      conteo: "1 balance",
    },
    {
      value: "periodo",
      titulo: "Todo este período",
      descripcion: `Elimina todas las versiones cargadas de ${periodo}. Los demás períodos y perfiles se conservan.`,
      conteo: `${versionesPeriodo} balance(s)`,
    },
    {
      value: "cliente_perfiles",
      titulo: "Todos los balances y perfiles de carga",
      descripcion:
        "Elimina todo el historial de balances cargados del cliente y las estructuras de archivo aprendidas. El cliente, los borradores, preferencias, correcciones y mapeos contables se conservan.",
      conteo: `${balancesCliente} balance(s) · ${perfilesCliente} perfil(es)`,
    },
  ];

  const confirmar = () => {
    startEliminar(async () => {
      const resultado = await eliminarBalance({ balanceId, alcance });
      if (!resultado.ok) {
        notifyError(
          resultado.message ?? "No se pudo eliminar la información.",
        );
        return;
      }
      setAbierto(false);
      notifySuccess(
        resultado.message ?? "La información seleccionada fue eliminada.",
      );
      router.push("/balance");
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-err-200 px-3 py-2 text-[12.5px] font-medium text-err-700 transition hover:bg-err-50"
      >
        <Icon name="trash" size={14} /> Eliminar
      </button>

      <Modal
        open={abierto}
        onClose={() => {
          if (!eliminando) setAbierto(false);
        }}
        title="Eliminar balance · define el alcance"
        size="2xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              disabled={eliminando}
              className="rounded-md border border-ink-200 px-3 py-2 text-[12.5px] font-medium text-ink-600 hover:bg-ink-50 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmar}
              disabled={eliminando}
              className="inline-flex items-center gap-1.5 rounded-md bg-err-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-err-700/90 disabled:opacity-60"
            >
              {eliminando ? (
                <EstadoProcesando etiqueta="Eliminando" />
              ) : (
                <>
                  <Icon name="trash" size={14} /> Eliminar lo seleccionado
                </>
              )}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-ink-150 bg-ink-50 px-4 py-3">
            <p className="text-[13px] font-semibold text-ink-800">
              {nombreCliente}
            </p>
            <p className="mt-0.5 text-[12px] text-ink-500">
              Estás ubicado en {periodo} · {version}. Elige exactamente cuánto
              deseas borrar.
            </p>
          </div>

          <div
            role="radiogroup"
            aria-label="Alcance de la eliminación"
            className="space-y-2"
          >
            {opciones.map((opcion) => {
              const seleccionada = alcance === opcion.value;
              return (
                <label
                  key={opcion.value}
                  className={`flex cursor-pointer gap-3 rounded-lg border p-3.5 transition ${
                    seleccionada
                      ? "border-err-400 bg-err-50 ring-1 ring-err-200"
                      : "border-ink-150 hover:border-ink-200 hover:bg-ink-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="alcance-eliminacion"
                    value={opcion.value}
                    checked={seleccionada}
                    onChange={() => setAlcance(opcion.value)}
                    className="mt-0.5 h-4 w-4 accent-red-600"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[12.5px] font-semibold text-ink-800">
                        {opcion.titulo}
                      </span>
                      <span className="rounded-full border border-ink-150 bg-white px-2 py-0.5 font-mono text-[10.5px] text-ink-600">
                        {opcion.conteo}
                      </span>
                    </span>
                    <span className="mt-1 block text-[11.5px] leading-relaxed text-ink-500">
                      {opcion.descripcion}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          <div className="flex gap-2 rounded-lg border border-err-200 bg-err-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-err-800">
            <span className="mt-0.5 shrink-0">
              <Icon name="warn" size={14} />
            </span>
            <p>
              Esta acción no se puede deshacer. La bitácora conservará quién
              eliminó la información y el alcance elegido.
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
