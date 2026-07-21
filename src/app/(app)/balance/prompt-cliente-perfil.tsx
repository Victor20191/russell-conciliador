"use client";

import { EstadoProcesando } from "@/components/estado-procesando";

import { useState } from "react";
import { Modal } from "@/components/modal";

/**
 * Prompt para GUARDAR el perfil del formato cuando no se detectó el cliente por NIT:
 * pide elegir el cliente y completa el guardado. Se cierra solo con la X.
 */
export function PromptClientePerfil({
  clientes,
  guardando,
  onElegir,
  onClose,
}: {
  clientes: { id: number; name: string; nit: string }[];
  guardando: boolean;
  onElegir: (clientId: number) => void;
  onClose: () => void;
}) {
  const [sel, setSel] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      title="Guardar perfil · elige el cliente"
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-600 hover:bg-ink-50">
            Cancelar
          </button>
          <button
            type="button"
            disabled={!sel || guardando}
            onClick={() => onElegir(Number(sel))}
            className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
          >
            {guardando ? <EstadoProcesando>Guardando</EstadoProcesando> : "Guardar perfil"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[12.5px]">
        <p className="text-ink-600">
          No se detectó el cliente por NIT. Elige a qué cliente asociar este perfil de formato, para que sus próximas cargas del mismo layout lo apliquen solas (sin IA).
        </p>
        <select
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400"
        >
          <option value="" disabled>Selecciona el cliente…</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.name} — {c.nit}</option>
          ))}
        </select>
      </div>
    </Modal>
  );
}
