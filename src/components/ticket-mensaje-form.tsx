"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { agregarMensajeTicket } from "@/app/actions/soporte";
import { EstadoProcesando } from "@/components/estado-procesando";
import { notifyActionState } from "@/lib/client-notifications";

/**
 * Caja para escribir en el hilo del ticket. La usan los DOS lados —Xentria desde
 * su bandeja y quien reportó desde `/reportes`— porque la Server Action ya
 * decide el lado por permiso; aquí solo cambia el texto que acompaña.
 *
 * Vive aparte del panel de gestión porque no comparte su regla: el panel se
 * congela al cerrar el ticket y el hilo no — es justamente la vía para seguir
 * hablando después del cierre.
 */
export default function TicketMensajeForm({
  ticketId,
  code,
  lado,
  onEnviado,
}: {
  ticketId: number;
  code: string;
  lado: "reportante" | "xentria";
  /** El modal no navega, así que refresca a su manera cuando el hilo cambia. */
  onEnviado?: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(agregarMensajeTicket, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    notifyActionState(state, {
      success: `Mensaje enviado en ${code}.`,
      error: "No se pudo enviar el mensaje.",
    });
    if (state?.ok) {
      formRef.current?.reset();
      router.refresh();
      onEnviado?.();
    }
  }, [state, router, code, onEnviado]);

  const deXentria = lado === "xentria";

  return (
    <form ref={formRef} action={action} className="mt-4 border-t border-ink-100 pt-4">
      <input type="hidden" name="ticketId" value={ticketId} />
      <label htmlFor={`mensaje-${ticketId}`} className="sr-only">
        Escribe un mensaje en el hilo del ticket {code}
      </label>
      <textarea
        id={`mensaje-${ticketId}`}
        name="body"
        rows={3}
        minLength={5}
        maxLength={5000}
        placeholder={
          deXentria
            ? "Responde a quien reportó la novedad, o deja constancia de algo que pasó después…"
            : "Escribe aquí si quieres agregar información o responderle a Xentria…"
        }
        className="w-full resize-y rounded-md border border-ink-200 bg-white px-3 py-2.5 text-[13px] leading-5 text-ink-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
      {state?.errors?.body?.[0] && <p className="mt-1.5 text-xs text-err-700">{state.errors.body[0]}</p>}
      {state?.message && !state.ok && <p className="mt-1.5 text-xs text-err-700">{state.message}</p>}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11.5px] text-ink-500">
          {deXentria
            ? "El mensaje queda visible para quien reportó la novedad."
            : "El mensaje queda visible para el equipo de Xentria."}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-md bg-navy-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-navy-600 disabled:opacity-60"
        >
          {pending ? <EstadoProcesando>Enviando</EstadoProcesando> : "Enviar mensaje"}
        </button>
      </div>
    </form>
  );
}
