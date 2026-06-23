"use client";

import type { ReactNode } from "react";
import type { ActionState } from "@/lib/definitions";

// Helpers de formulario compartidos por los modales de versión y de cambio.

export const INPUT_CLS =
  "rounded-md border border-ink-200 px-3 py-2 text-[13px] focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-600/15";

export const BTN_GUARDAR =
  "rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-navy-700/90 disabled:opacity-60";

export const BTN_ELIMINAR =
  "rounded-md bg-err-700 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-err-700/90 disabled:opacity-60";

export function Campo({
  label,
  hint,
  full,
  children,
}: {
  label: string;
  hint?: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <label className="text-[12px] font-medium text-ink-700">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-ink-500">{hint}</p>}
    </div>
  );
}

/** Muestra el mensaje de error SOLO cuando la acción falló (state.ok === false). */
export function ErroresInline({ state }: { state: ActionState | undefined }) {
  if (!state || state.ok !== false) return null;
  const fieldError = state.errors
    ? Object.values(state.errors).flat().filter(Boolean)[0]
    : undefined;
  const msg = state.message ?? fieldError;
  if (!msg) return null;
  return <p className="text-[12px] text-err-700">{msg}</p>;
}
