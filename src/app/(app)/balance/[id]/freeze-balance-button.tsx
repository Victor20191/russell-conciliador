"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { freezeBalance } from "@/app/actions/balance";

/** Lo que el botón necesita saber cuando congelar traslada el cierre de una conciliación en firme. */
export type TrasladoCierreVm = {
  mensaje: string;
  cierres: { modulo: string; periodo: string; cargue: number; cerradoPor: string }[];
  cuentasEnFirme: number;
};

/**
 * Cuerpo del modal de confirmación del traslado. Presentacional y puro, separado del
 * modal para poder probar el texto sin montar el portal.
 */
export function ContenidoTrasladoCierre({ traslado }: { traslado: TrasladoCierreVm }) {
  return (
    <div className="flex flex-col gap-3 text-[13px] text-ink-700">
      <p>{traslado.mensaje}</p>
      <ul className="flex flex-col gap-1.5 rounded-md border border-ink-150 bg-ink-50 px-3 py-2">
        {traslado.cierres.map((c) => (
          <li key={`${c.modulo}-${c.periodo}`} className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold text-ink-800">{c.modulo} · {c.periodo}</span>
            <span className="text-ink-500">cargue #{c.cargue} · cerró {c.cerradoPor}</span>
          </li>
        ))}
      </ul>
      <p className="text-ink-500">
        {traslado.cuentasEnFirme} cuenta(s) en firme conservan sus importes y su homologación. El cierre no se desbloquea ni se vuelve a cerrar: solo pasa a apuntar a esta versión, y queda registrado en la bitácora.
      </p>
    </div>
  );
}

const CLASE_BOTON = "inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60";

/**
 * Congelar como oficial. Tres formas según el período:
 *  - sin conciliación en firme (o el cierre ya apunta a este balance): un clic, como siempre;
 *  - con cierre ajeno y cuentas en firme idénticas (`traslado`): el clic abre un modal que
 *    explica el traslado y confirma con `confirmarTraslado=1` — la acción lo exige;
 *  - con cierre ajeno y cuentas en firme alteradas (`bloqueo`): deshabilitado con la razón.
 * La verdad la decide la acción en su transacción; esto solo anticipa.
 */
export function FreezeBalanceButton({
  id,
  traslado = null,
  bloqueo = null,
}: {
  id: number;
  traslado?: TrasladoCierreVm | null;
  bloqueo?: string | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);

  if (bloqueo) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button type="button" disabled title={bloqueo} className={CLASE_BOTON}>
          <Icon name="check" size={14} /> Congelar como oficial
        </button>
        <span className="max-w-xs text-right text-[11px] text-err-700">
          Esta versión altera cuentas en firme; no se puede congelar sin desbloquear la conciliación.
        </span>
      </div>
    );
  }

  const formulario = (confirmarTraslado: boolean, etiqueta: string) => (
    <ActionForm
      action={freezeBalance}
      successMessage="Balance congelado como oficial."
      errorMessage="No se pudo congelar el balance."
      showInlineError={false}
      onSuccess={() => {
        setAbierto(false);
        router.refresh();
      }}
    >
      {(pending) => (
        <>
          <input type="hidden" name="id" value={id} />
          {confirmarTraslado && <input type="hidden" name="confirmarTraslado" value="1" />}
          <button type="submit" disabled={pending} className={CLASE_BOTON}>
            <Icon name="check" size={14} /> {pending ? <EstadoProcesando>Congelando</EstadoProcesando> : etiqueta}
          </button>
        </>
      )}
    </ActionForm>
  );

  if (!traslado) return formulario(false, "Congelar como oficial");

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className={CLASE_BOTON}>
        <Icon name="check" size={14} /> Congelar como oficial
      </button>
      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        title="Congelar como oficial · conciliación en firme"
        footer={formulario(true, "Congelar y trasladar el cierre")}
      >
        <ContenidoTrasladoCierre traslado={traslado} />
      </Modal>
    </>
  );
}
