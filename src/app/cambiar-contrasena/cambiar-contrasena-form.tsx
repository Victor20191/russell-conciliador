"use client";

import { useActionState } from "react";
import { changePassword } from "@/app/actions/auth";

export default function CambiarContrasenaForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="current" className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          Contraseña actual
        </label>
        <input id="current" name="current" type="password" autoComplete="current-password"
          className="rounded-md border border-ink-200 bg-white px-3.5 py-2.5 text-[13px] text-ink-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        {state?.errors?.current && <p className="text-xs text-err-700">{state.errors.current[0]}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="next" className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          Nueva contraseña
        </label>
        <input id="next" name="next" type="password" autoComplete="new-password"
          className="rounded-md border border-ink-200 bg-white px-3.5 py-2.5 text-[13px] text-ink-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        {state?.errors?.next && <p className="text-xs text-err-700">{state.errors.next[0]}</p>}
      </div>

      {state?.message && (
        <div className="rounded-md border border-err-100 bg-err-100 px-3.5 py-2.5 text-xs font-medium text-err-700">
          {state.message}
        </div>
      )}

      <button type="submit" disabled={pending}
        className="mt-1 rounded-md bg-navy-700 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-navy-600 disabled:opacity-60">
        {pending ? "Guardando…" : "Cambiar contraseña"}
      </button>
    </form>
  );
}
