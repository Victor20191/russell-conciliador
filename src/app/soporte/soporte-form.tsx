"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { crearTicketSoporte } from "@/app/actions/soporte";
import { EstadoProcesando } from "@/components/estado-procesando";
import { copiarTextoAlPortapapeles } from "@/lib/portapapeles";

const INPUT = "rounded-md border border-ink-200 bg-white px-3.5 py-2.5 text-[13px] text-ink-800 outline-none transition placeholder:text-ink-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

function ErrorCampo({ mensajes }: { mensajes?: string[] }) {
  return mensajes?.[0] ? <p className="text-xs text-err-700">{mensajes[0]}</p> : null;
}

export default function SoporteForm() {
  const [state, action, pending] = useActionState(crearTicketSoporte, undefined);
  const [copiado, setCopiado] = useState(false);

  if (state?.ok && state.code && state.trackingUrl) {
    const copiar = async () => {
      const enlace = new URL(state.trackingUrl!, window.location.origin).toString();
      try {
        await copiarTextoAlPortapapeles(enlace);
        setCopiado(true);
      } catch {
        setCopiado(false);
      }
    };
    return (
      <div className="rounded-lg border border-ok-100 bg-ok-100 p-5" role="status">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ok-700">Ticket creado</p>
        <h3 className="mt-2 font-mono text-lg font-semibold text-ink-900">{state.code}</h3>
        <p className="mt-3 text-sm leading-6 text-ink-700">
          Guarda este enlace: es la credencial privada para consultar el estado y la solución del ticket.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={state.trackingUrl} className="rounded-md bg-navy-700 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-navy-600">
            Ver seguimiento
          </Link>
          <button type="button" onClick={copiar} className="rounded-md border border-ok-500 bg-white px-4 py-2.5 text-xs font-semibold text-ok-700 transition hover:bg-ok-100">
            {copiado ? "Enlace copiado" : "Copiar enlace"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-500">
          Nombre *
          <input name="firstName" autoComplete="given-name" required maxLength={80} className={INPUT} placeholder="Tu nombre" />
          <ErrorCampo mensajes={state?.errors?.firstName} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-500">
          Apellido *
          <input name="lastName" autoComplete="family-name" required maxLength={80} className={INPUT} placeholder="Tu apellido" />
          <ErrorCampo mensajes={state?.errors?.lastName} />
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-500">
        Asunto *
        <input name="subject" required minLength={5} maxLength={160} className={INPUT} placeholder="Ej. No puedo cargar el balance" />
        <ErrorCampo mensajes={state?.errors?.subject} />
      </label>

      <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-500">
        Descripción *
        <textarea name="description" required minLength={10} maxLength={5000} rows={7} className={INPUT} placeholder="Describe qué estabas haciendo, qué ocurrió y qué esperabas ver." />
        <ErrorCampo mensajes={state?.errors?.description} />
      </label>

      <div className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true">
        <label>
          Sitio web
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {state?.message && (
        <div className="rounded-md border border-err-100 bg-err-100 px-3.5 py-2.5 text-xs font-medium text-err-700" role="alert">
          {state.message}
        </div>
      )}

      <button type="submit" disabled={pending} className="rounded-md bg-navy-700 px-4 py-3 text-[13px] font-semibold text-white transition hover:bg-navy-600">
        {pending ? <EstadoProcesando>Enviando</EstadoProcesando> : "Reportar ticket"}
      </button>
    </form>
  );
}
