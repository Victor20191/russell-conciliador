"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { Icon } from "@/components/icons";

function srcAdjunto(id: number, download = false) {
  return `/api/soporte/adjuntos/${id}${download ? "?download=1" : ""}`;
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
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          Imágenes adjuntas ({adjuntos.length})
        </p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {adjuntos.map((adjunto) => (
          <div
            key={adjunto.id}
            className="group relative flex flex-col overflow-hidden rounded-md border border-ink-150 bg-white transition hover:border-ink-300 hover:shadow-sm"
          >
            <button
              type="button"
              onClick={() => setAbierto(adjunto)}
              className="relative block h-32 w-full bg-navy-800 p-3 text-left focus:outline-none"
              title={`Ver ${adjunto.fileName}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- endpoint autenticado */}
              {/* navy-800: los SVG de marca suelen ir en blanco y desaparecen sobre fondo blanco. */}
              <img
                src={srcAdjunto(adjunto.id)}
                alt={adjunto.fileName}
                className="h-full w-full object-contain transition group-hover:scale-[1.02]"
              />
              <span className="sr-only">Ver imagen {adjunto.fileName}</span>
            </button>
            <div className="flex items-center justify-between gap-1.5 border-t border-ink-100 bg-white px-2.5 py-1.5">
              <p
                className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink-600"
                title={adjunto.fileName}
              >
                {adjunto.fileName}
              </p>
              <a
                href={srcAdjunto(adjunto.id, true)}
                download={adjunto.fileName}
                title={`Descargar ${adjunto.fileName}`}
                aria-label={`Descargar ${adjunto.fileName}`}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-400 transition hover:bg-ink-100 hover:text-ink-800"
              >
                <Icon name="download" size={13} />
              </a>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={abierto !== null}
        onClose={() => setAbierto(null)}
        title={abierto?.fileName ?? "Imagen adjunta"}
        size="4xl"
        footer={
          abierto ? (
            <div className="flex w-full items-center justify-between gap-3">
              <span className="truncate text-xs text-ink-500">{abierto.fileName}</span>
              <a
                href={srcAdjunto(abierto.id, true)}
                download={abierto.fileName}
                className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-navy-600"
              >
                <Icon name="download" size={14} />
                Descargar imagen
              </a>
            </div>
          ) : undefined
        }
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
