"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import Conversacion from "@/components/conversacion";

// Botón + badge de comentarios de un RENGLÓN (ancla) que abre la conversación anclada.
// Reutilizable en el definitivo (encabezado) y en el borrador (lote), variando `tipo`/`entityId`.
export default function ComentarioAncla({
  tipo,
  entityId,
  anchor,
  titulo,
  count = 0,
}: {
  tipo: string;
  entityId: number;
  anchor: string;
  titulo: string;
  count?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Comentarios de este renglón"
        className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] hover:bg-ink-100 ${count ? "text-blue-600" : "text-ink-400 hover:text-ink-600"}`}
      >
        <Icon name="msg" size={12} />
        {count ? <span className="font-semibold">{count}</span> : null}
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title={`Comentarios · ${titulo}`} size="2xl">
          <Conversacion tipo={tipo} entityId={entityId} anchor={anchor} titulo={titulo} onPublicado={() => router.refresh()} />
        </Modal>
      )}
    </>
  );
}
