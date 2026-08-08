"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { guardarSolucionTicket } from "@/app/actions/soporte";
import { EstadoProcesando } from "@/components/estado-procesando";
import { notifyActionState } from "@/lib/client-notifications";

export default function TicketSolucionForm({
  ticket,
}: {
  ticket: { id: number; code: string; solution: string | null; updatedAt: string };
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(guardarSolucionTicket, undefined);

  useEffect(() => {
    notifyActionState(state, {
      success: `Solución guardada para ${ticket.code}.`,
      error: "No se pudo guardar la solución.",
    });
    if (state?.ok) router.refresh();
  }, [state, router, ticket.code]);

  return (
    <form action={action} className="flex min-w-0 flex-col rounded-md border border-ink-150 bg-ink-50 p-4">
      <input type="hidden" name="ticketId" value={ticket.id} />
      <input type="hidden" name="updatedAt" value={ticket.updatedAt} />
      <label htmlFor={`solution-${ticket.id}`} className="text-xs font-semibold uppercase tracking-wider text-ink-500">
        Cómo se solucionó
      </label>
      <textarea
        id={`solution-${ticket.id}`}
        name="solution"
        defaultValue={ticket.solution ?? ""}
        required
        minLength={10}
        maxLength={5000}
        rows={7}
        placeholder="Describe las acciones realizadas y el resultado para que el reportante pueda consultarlo."
        className="mt-2 min-h-36 resize-y rounded-md border border-ink-200 bg-white px-3 py-2.5 text-[13px] leading-5 text-ink-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
      {state?.errors?.solution?.[0] && <p className="mt-1.5 text-xs text-err-700">{state.errors.solution[0]}</p>}
      {state?.message && !state.ok && <p className="mt-2 text-xs text-err-700">{state.message}</p>}
      <button type="submit" disabled={pending} className="mt-3 rounded-md bg-navy-700 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-navy-600">
        {pending ? <EstadoProcesando>Guardando</EstadoProcesando> : ticket.solution ? "Actualizar solución" : "Guardar y marcar resuelto"}
      </button>
    </form>
  );
}
