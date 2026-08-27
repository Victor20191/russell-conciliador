"use client";

import { EstadoProcesando } from "@/components/estado-procesando";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { PasswordInput } from "@/components/password-input";

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          Correo corporativo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="nombre@russellbedford.com.co"
          className="rounded-md border border-ink-200 bg-white px-3.5 py-2.5 text-[13px] text-ink-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        {state?.errors?.email && (
          <p className="text-xs text-err-700">{state.errors.email[0]}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          Contraseña
        </label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          placeholder="••••••••"
          className="rounded-md border border-ink-200 bg-white px-3.5 py-2.5 text-[13px] text-ink-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        {state?.errors?.password && (
          <p className="text-xs text-err-700">{state.errors.password[0]}</p>
        )}
      </div>

      {state?.message && (
        <div className="rounded-md border border-err-100 bg-err-100 px-3.5 py-2.5 text-xs font-medium text-err-700">
          {state.message}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-md bg-navy-700 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-navy-600 disabled:opacity-60"
      >
        {pending ? <EstadoProcesando>Verificando</EstadoProcesando> : "Iniciar sesión"}
      </button>
    </form>
  );
}
