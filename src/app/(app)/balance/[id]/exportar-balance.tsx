"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

/** Menú de exportación del balance y su prevalidador a Excel. */
export function ExportarBalance({ id }: { id: number }) {
  const [open, setOpen] = useState(false);
  const opcion = (tipo: string, titulo: string, detalle: string) => (
    <a
      href={`/balance/${id}/export?tipo=${tipo}`}
      onClick={() => setOpen(false)}
      className="block px-3 py-2 text-[12.5px] text-ink-700 hover:bg-ink-50"
    >
      <span className="font-semibold">{titulo}</span>
      <span className="mt-0.5 block text-[11px] text-ink-500">{detalle}</span>
    </a>
  );
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-md border border-ok-200 bg-ok-100/40 px-3 py-2 text-[12.5px] font-semibold text-ok-700 hover:bg-ok-100"
      >
        <Icon name="download" size={14} /> Exportar a Excel <Icon name="chev-d" size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-72 overflow-hidden rounded-md border border-ink-200 bg-white py-1 shadow-lg">
            {opcion("homologado", "Balance Homologado", "En el plan estándar Russell")}
            {opcion("comparativo", "Comparativo Homologado vs Cliente", "Russell vs las cuentas del cliente")}
            {opcion("prevalidador", "Prevalidador", "Comparación por cuenta y totales de cada módulo")}
          </div>
        </>
      )}
    </div>
  );
}
