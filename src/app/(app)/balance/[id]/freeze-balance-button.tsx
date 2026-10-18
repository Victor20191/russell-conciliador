"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { freezeBalance } from "@/app/actions/balance";
import type { AccionResolver, BloqueoCierreBalance } from "@/lib/balance/cierre-balance";

const TEXTO_ACCION: Record<AccionResolver, string> = {
  eliminar: "Si sobra, elimínalo.",
  abrir_y_eliminar: "Está cerrado: si sobra, ábrelo y elimínalo.",
  reemplazar: "Tiene una conciliación en firme: si sobra, reemplázalo por este con «Reemplazar el balance conciliado».",
};

const enlace = "font-semibold text-navy-700 underline-offset-2 hover:underline";

/**
 * Por qué no se puede cerrar el balance y cómo resolverlo. Presentacional y puro, separado del
 * modal para poder probar el texto sin montar el portal.
 */
export function ContenidoCierreBloqueado({ bloqueo }: { bloqueo: BloqueoCierreBalance }) {
  switch (bloqueo.tipo) {
    case "no_vigente":
      return (
        <div className="flex flex-col gap-2 text-[13px] text-ink-700">
          <p>Solo se cierra la versión vigente de cada línea: esta es una versión anterior y queda como historial.</p>
          <p>
            La vigente es la <Link href={`/balance/${bloqueo.vigente.id}`} className={enlace}>{bloqueo.vigente.version}</Link>.
          </p>
        </div>
      );
    case "version_anterior_cerrada":
      return (
        <div className="flex flex-col gap-2 text-[13px] text-ink-700">
          <p>Una versión anterior de esta misma línea sigue cerrada. No debe haber versiones viejas cerradas: ábrela antes de cerrar esta.</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {bloqueo.cerradas.map((c) => (
              <li key={c.id}><Link href={`/balance/${c.id}`} className={enlace}>{c.version}</Link></li>
            ))}
          </ul>
        </div>
      );
    case "sin_comparar":
      return (
        <div className="flex flex-col gap-2 text-[13px] text-ink-700">
          <p>Falta comparar los saldos finales con estos balances del mismo corte:</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {bloqueo.pendientes.map((b) => (
              <li key={b.id}><Link href={`/balance/${b.id}`} className={enlace}>{b.nombre} {b.version}</Link></li>
            ))}
          </ul>
          <p className="text-ink-500">Usa «Revisar comparación» en <a href="#corte" className={enlace}>Balances del mismo corte</a> y vuelve a intentarlo.</p>
        </div>
      );
    case "inconsistente":
      return (
        <div className="flex flex-col gap-3 text-[13px] text-ink-700">
          <p>
            Todos los balances de un corte deben tener los mismos saldos finales, y este difiere de{" "}
            {bloqueo.balances.length === 1 ? "otro balance" : `${bloqueo.balances.length} balances`}. Hay que eliminar el que sobre —este o el otro— antes de cerrar.
          </p>
          <ul className="flex flex-col gap-2 rounded-md border border-ink-150 bg-ink-50 px-3 py-2">
            {bloqueo.balances.map((b) => (
              <li key={b.id} className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <Link href={`/balance/${b.id}`} className={enlace}>{b.nombre} {b.version}</Link>
                  <span className="text-err-700">difiere en {b.cuentas} cuenta(s)</span>
                </span>
                <span className="text-[12px] text-ink-500">{TEXTO_ACCION[b.accion]}</span>
              </li>
            ))}
          </ul>
          <p className="text-ink-500">
            Las diferencias, cuenta por cuenta, están en <a href="#corte" className={enlace}>Balances del mismo corte</a>. Si el que sobra es este, elimínalo desde «Eliminar».
          </p>
        </div>
      );
    case "prevalidador":
      return <p className="text-[13px] text-ink-700">{bloqueo.mensaje}</p>;
  }
}

const CLASE_BOTON = "inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60";

/**
 * «Cerrar balance» (18/Oct/2026): lo deja cerrado y disponible para que los módulos concilien contra
 * él. Sin `bloqueo`, un clic. Con `bloqueo` (versión anterior, diferencias con otro balance del corte
 * o prevalidador sin aprobar), el clic abre un modal que explica qué lo impide y cómo resolverlo, sin
 * formulario. La verdad la decide la acción en su transacción; esto solo anticipa.
 */
export function FreezeBalanceButton({ id, bloqueo = null }: { id: number; bloqueo?: BloqueoCierreBalance | null }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);

  if (bloqueo) {
    return (
      <>
        <button type="button" onClick={() => setAbierto(true)} className={CLASE_BOTON}>
          <Icon name="check" size={14} /> Cerrar balance
        </button>
        <Modal open={abierto} onClose={() => setAbierto(false)} title="No se puede cerrar el balance">
          <ContenidoCierreBloqueado bloqueo={bloqueo} />
        </Modal>
      </>
    );
  }

  return (
    <ActionForm
      action={freezeBalance}
      successMessage="Balance cerrado: los módulos ya pueden conciliar contra él."
      errorMessage="No se pudo cerrar el balance."
      showInlineError={false}
      onSuccess={() => router.refresh()}
    >
      {(pending) => (
        <>
          <input type="hidden" name="id" value={id} />
          <button type="submit" disabled={pending} className={CLASE_BOTON}>
            <Icon name="check" size={14} /> {pending ? <EstadoProcesando>Cerrando</EstadoProcesando> : "Cerrar balance"}
          </button>
        </>
      )}
    </ActionForm>
  );
}
