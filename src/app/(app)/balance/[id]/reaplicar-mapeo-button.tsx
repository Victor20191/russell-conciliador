"use client";

// Re-homologa el detalle de un balance YA cargado con la cascada determinista
// vigente. El mapeo se persiste por fila al promover el borrador, así que
// corregir la homologación en /config/mapeo no alcanza a los balances existentes:
// sin este botón, la única salida era volver a cargar el archivo.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reaplicarMapeoBalance } from "@/app/actions/balance";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { fmt } from "@/lib/format";

export function ReaplicarMapeoButton({
  id,
  fueraDeClase,
  montoFueraDeClase,
}: {
  id: number;
  /** Cuentas cuyo estándar actual pertenece a otra clase contable (validación V6). */
  fueraDeClase: number;
  /** Saldos (en magnitud) que esas cuentas están reubicando. */
  montoFueraDeClase: number;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [aplicando, startAplicar] = useTransition();

  const confirmar = () => {
    startAplicar(async () => {
      const fd = new FormData();
      fd.set("id", String(id));
      const resultado = await reaplicarMapeoBalance(fd);
      if (!resultado.ok) {
        notifyError(resultado.message ?? "No se pudo re-homologar el balance.");
        return;
      }
      setAbierto(false);
      notifySuccess(resultado.message ?? "Homologación actualizada.");
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-[12.5px] font-medium transition ${
          fueraDeClase > 0
            ? "border-warn-300 bg-warn-50 text-warn-700 hover:bg-warn-100"
            : "border-ink-200 text-ink-700 hover:bg-ink-50"
        }`}
      >
        <Icon name="check" size={14} /> Re-homologar
        {fueraDeClase > 0 && (
          <span className="rounded-full bg-warn-200 px-1.5 text-[10.5px] font-semibold text-warn-800">{fueraDeClase}</span>
        )}
      </button>

      <Modal
        open={abierto}
        onClose={() => {
          if (!aplicando) setAbierto(false);
        }}
        title="Re-aplicar la homologación al estándar"
        size="2xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              disabled={aplicando}
              className="rounded-md border border-ink-200 px-3 py-2 text-[12.5px] font-medium text-ink-600 hover:bg-ink-50 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmar}
              disabled={aplicando}
              className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
            >
              {aplicando ? <EstadoProcesando etiqueta="Re-homologando" /> : <><Icon name="check" size={14} /> Re-homologar el balance</>}
            </button>
          </>
        }
      >
        <div className="space-y-4 text-[12.5px] leading-relaxed text-ink-700">
          <p>
            Vuelve a mapear las cuentas de este balance contra el plan estándar usando la
            homologación vigente del cliente. No vuelve a leer el archivo, no llama a la IA
            y no modifica ningún saldo: solo la cuenta estándar de cada línea.
          </p>

          <ol className="space-y-1.5 rounded-lg border border-ink-150 bg-ink-50 px-4 py-3 text-[12px] text-ink-600">
            <li>
              <b className="text-ink-800">1.</b> Manda lo que esté guardado en{" "}
              <span className="font-medium">Configuración › Mapeo plan estándar</span>, incluido lo
              confirmado a mano.
            </li>
            <li>
              <b className="text-ink-800">2.</b> Si una cuenta no está en esa memoria, decide la
              cascada determinista (código exacto y descripción), que respeta la clase contable.
            </li>
            <li>
              <b className="text-ink-800">3.</b> Si tampoco resuelve, conserva el mapeo actual —salvo
              que apunte a otra clase contable, en cuyo caso lo retira para que quede visible como
              cuenta por homologar.
            </li>
          </ol>

          {fueraDeClase > 0 && (
            <div className="flex gap-2 rounded-lg border border-warn-200 bg-warn-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-warn-800">
              <span className="mt-0.5 shrink-0"><Icon name="warn" size={14} /></span>
              <p>
                Hoy este balance tiene <b>{fueraDeClase} cuenta(s)</b> homologadas a una clase
                contable distinta, que reubican <b>{fmt(montoFueraDeClase)}</b> en saldos. Son las
                que esta acción corrige o deja marcadas como pendientes.
              </p>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
