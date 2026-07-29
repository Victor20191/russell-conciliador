"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Icon } from "@/components/icons";

const AjustesCargaModal = dynamic(
  () => import("@/app/(app)/config/clientes/ajustes-carga-modal").then((modulo) => modulo.AjustesCargaModal),
);

export type ClientePerfilesEnMemoria = {
  id: number;
  name: string;
  nit: string;
  perfilesEnMemoria: number;
};

export function PerfilesEnMemoriaButton({
  cantidad,
  onClick,
  className = "",
}: {
  cantidad: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Ver y editar los formatos, correcciones y preferencias memorizadas para este cliente"
      className={`inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[12px] font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 ${className}`}
    >
      <Icon name="ai" size={13} />
      Perfiles en memoria
      <span className="rounded-full bg-white/80 px-1.5 py-px text-[10.5px] tabular-nums text-blue-700">
        {cantidad}
      </span>
    </button>
  );
}

export function PerfilesEnMemoriaModal({
  cliente,
  onClose,
}: {
  cliente: ClientePerfilesEnMemoria | null;
  onClose: () => void;
}) {
  if (!cliente) return null;
  return (
    <AjustesCargaModal
      key={`perfiles-memoria-${cliente.id}`}
      cliente={{ id: cliente.id, name: cliente.name, nit: cliente.nit }}
      onClose={onClose}
    />
  );
}

/** Control autocontenido para detalles que tienen un único cliente visible. */
export function PerfilesEnMemoriaControl({
  cliente,
}: {
  cliente: ClientePerfilesEnMemoria;
}) {
  const [clientePerfiles, setClientePerfiles] = useState<ClientePerfilesEnMemoria | null>(null);
  return (
    <>
      <PerfilesEnMemoriaButton
        cantidad={cliente.perfilesEnMemoria}
        onClick={() => setClientePerfiles(cliente)}
      />
      <PerfilesEnMemoriaModal
        cliente={clientePerfiles}
        onClose={() => setClientePerfiles(null)}
      />
    </>
  );
}
