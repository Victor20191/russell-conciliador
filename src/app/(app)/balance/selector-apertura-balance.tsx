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
  const grupo = name ?? "aperturaBalance";
  return (
    <>
      {APERTURAS_BALANCE.map((opcion) => (
        <label
          key={opcion.valor}
          title={opcion.descripcion}
          className={`inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] text-ink-800 ${
            disabled ? "cursor-not-allowed opacity-60" : ""
          }`}
        >
          <input
            type="radio"
            name={grupo}
            value={opcion.valor}
            checked={value === opcion.valor}
            disabled={disabled}
            required
            aria-describedby={describedBy}
            onChange={() => onChange(opcion.valor)}
            className="h-3.5 w-3.5 accent-ink-800"
          />
          {opcion.etiqueta}
        </label>
      ))}
    </>
  );
}
