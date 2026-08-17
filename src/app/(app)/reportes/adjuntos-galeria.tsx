import { urlAdjuntoTicket } from "@/lib/soporte";

export type AdjuntoVista = {
  id: number;
  fileName: string;
};

export default function AdjuntosGaleria({ adjuntos }: { adjuntos: AdjuntoVista[] }) {
  if (adjuntos.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
        Imágenes adjuntas
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {adjuntos.map((adjunto) => (
          <a
            key={adjunto.id}
            href={urlAdjuntoTicket(adjunto.id)}
            target="_blank"
            rel="noreferrer"
            className="overflow-hidden rounded-md border border-ink-150 bg-ink-50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={urlAdjuntoTicket(adjunto.id)}
              alt={adjunto.fileName}
              className="h-32 w-full object-cover"
            />
            <p className="truncate px-2 py-1.5 text-[11px] text-ink-500">{adjunto.fileName}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
