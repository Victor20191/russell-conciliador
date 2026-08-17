"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";

function srcAdjunto(id: number) {
  return `/api/soporte/adjuntos/${id}`;
}

export type AdjuntoVista = {
  id: number;
  fileName: string;
};

export default function AdjuntosGaleria({ adjuntos }: { adjuntos: AdjuntoVista[] }) {
  const [abierto, setAbierto] = useState<AdjuntoVista | null>(null);
  if (adjuntos.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
        Imágenes adjuntas
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {adjuntos.map((adjunto) => (
          <button
            key={adjunto.id}
            type="button"
            onClick={() => setAbierto(adjunto)}
            className="overflow-hidden rounded-md border border-ink-150 bg-white text-left transition hover:border-ink-300"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- endpoint autenticado */}
            {/* navy-800: los SVG de marca suelen ir en blanco y desaparecen sobre fondo blanco. */}
            <img
              src={srcAdjunto(adjunto.id)}
              alt={adjunto.fileName}
              className="h-32 w-full bg-navy-800 object-contain p-3"
            />
            <p className="truncate px-2 py-1.5 text-[11px] text-ink-500">{adjunto.fileName}</p>
          </button>
        ))}
      </div>

      <Modal
        open={abierto !== null}
        onClose={() => setAbierto(null)}
        title={abierto?.fileName ?? "Imagen adjunta"}
        size="4xl"
      >
        {abierto && (
          <div className="flex min-h-[240px] items-center justify-center rounded-md bg-navy-800 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- endpoint autenticado */}
            <img
              src={srcAdjunto(abierto.id)}
              alt={abierto.fileName}
              className="max-h-[70vh] w-full object-contain"
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
