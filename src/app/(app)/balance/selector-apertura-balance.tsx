"use client";

import {
  APERTURAS_BALANCE,
  type AperturaBalance,
} from "@/lib/balance/apertura-balance";

export function SelectorAperturaBalance({
  value,
  onChange,
  name,
  disabled = false,
  describedBy,
}: {
  value: AperturaBalance | null;
  onChange: (valor: AperturaBalance) => void;
  name?: string;
  disabled?: boolean;
  describedBy?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Tipo de balance"
      aria-describedby={describedBy}
      className="inline-flex flex-wrap gap-1.5"
    >
      {name ? <input type="hidden" name={name} value={value ?? ""} required /> : null}
      {APERTURAS_BALANCE.map((opcion) => {
        const activo = value === opcion.valor;
        return (
          <button
            key={opcion.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            disabled={disabled}
            title={opcion.descripcion}
            onClick={() => onChange(opcion.valor)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
              activo
                ? "border-navy-700 bg-navy-700 text-white"
                : "border-ink-200 bg-white text-ink-700 hover:border-navy-400 hover:bg-ink-50"
            }`}
          >
            <span
              aria-hidden
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                activo ? "border-white" : "border-ink-400"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${activo ? "bg-white" : "bg-transparent"}`} />
            </span>
            {opcion.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
