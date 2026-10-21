"use client";

// «Cliente de la muestra» (21/Oct/2026): de qué cliente salió el archivo de la muestra de un
// patrón. Solo de consulta —no limita el patrón a ese cliente—, pero obligatorio al subir una
// muestra a mano. Lo comparten el editor del patrón y los modales de la lista.
import { useMemo } from "react";
import { SelectBuscable } from "@/components/select-buscable";

export type ClienteMuestra = { id: number; nombre: string };

export function CampoClienteMuestra({
  clientes,
  value,
  onChange,
  obligatorio = true,
}: {
  clientes: readonly ClienteMuestra[];
  value: number | null;
  onChange: (clienteId: number | null) => void;
  obligatorio?: boolean;
}) {
  const opciones = useMemo(() => clientes.map((c) => ({ value: String(c.id), label: c.nombre })), [clientes]);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium text-ink-600">
        Cliente de la muestra {obligatorio && <span className="text-err-600">*</span>}
      </span>
      <SelectBuscable
        opciones={opciones}
        value={value == null ? "" : String(value)}
        onChange={(v) => onChange(Number(v) > 0 ? Number(v) : null)}
        placeholder="Buscar cliente…"
        sinResultados="No se encontraron clientes."
        ariaLabel="Cliente de la muestra"
        className="min-w-0"
      />
      <span className="text-[11px] leading-snug text-ink-400">
        De qué cliente es el archivo. Es solo de consulta: el patrón no queda limitado a ese cliente.
      </span>
    </div>
  );
}
