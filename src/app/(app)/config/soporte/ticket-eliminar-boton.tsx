"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import TicketEliminarModal, { type TicketEliminable } from "./ticket-eliminar-modal";

/**
 * Botón de borrado definitivo en el detalle del ticket. Solo lo monta la página
 * cuando la sesión tiene `soporte:eliminar`; al confirmar vuelve a la bandeja
 * porque el detalle deja de existir.
 */
export default function TicketEliminarBoton({ ticket }: { ticket: TicketEliminable }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-err-500/40 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-err-700 transition hover:bg-err-100"
      >
        <Icon name="trash" size={14} /> Eliminar
      </button>
      {abierto && (
        <TicketEliminarModal
          ticket={ticket}
          onClose={() => setAbierto(false)}
          onEliminado={() => {
            setAbierto(false);
            router.replace("/config/soporte");
            router.refresh();
          }}
        />
      )}
    </>
  );
}
