import { Chip } from "@/components/ui";
import { fmtContable, fmtDateTime } from "@/lib/format";
import {
  nombreClaseContable,
  type RevisionReubicacionBalance,
} from "@/lib/balance/revisiones-reubicacion-balance";

/**
 * Ficha de las reubicaciones entre clases contables que se revisaron y aprobaron.
 * La comparten el BORRADOR (donde se aprueban) y el BALANCE oficial (donde quedan
 * como constancia): la misma información en los dos lados, sin copias divergentes.
 */
export function ReubicacionesAprobadasPanel({
  revisiones,
  etiqueta = "Se conservarán en el balance oficial",
  abiertoPorDefecto = false,
}: {
  revisiones: RevisionReubicacionBalance[];
  /** Píldora de la derecha: en el borrador anuncia, en el balance constata. */
  etiqueta?: string;
  abiertoPorDefecto?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-ok-100 border-l-4 border-l-ok-500 bg-ok-100/30 shadow-sm">
      <details open={abiertoPorDefecto}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 marker:content-none">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ok-700">
              Reubicaciones contables aprobadas
            </div>
            <p className="mt-0.5 text-[12.5px] font-semibold text-ink-800">
              {revisiones.length} {revisiones.length === 1 ? "justificación guardada" : "justificaciones guardadas"} · ver detalle
            </p>
          </div>
          <span className="rounded-full border border-ok-100 bg-white px-2 py-1 text-[10px] font-semibold text-ok-700">
            {etiqueta}
          </span>
        </summary>
        <div className="border-t border-ok-100 bg-white/80">
          {revisiones.map((revision) => (
            <article key={revision.filaNum} className="border-b border-ink-100 px-4 py-3 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-ink-800">
                <span className="font-mono text-ink-500">{revision.codigo}</span>
                <span>{revision.nombre}</span>
                <Chip
                  label={`${nombreClaseContable(revision.claseOrigen)} → ${nombreClaseContable(revision.claseDestino)}`}
                  tone="blue"
                />
              </div>
              <p className="mt-1 text-[11px] text-ink-500">
                Saldo {fmtContable(revision.monto)} · destino {revision.destinoCodigo} {revision.destinoNombre}
              </p>
              <blockquote className="mt-2 whitespace-pre-wrap rounded-md border border-ok-100 bg-ok-100/25 px-3 py-2 text-[12px] leading-relaxed text-ink-700">
                “{revision.justificacion}”
              </blockquote>
              <p className="mt-1.5 text-[10.5px] text-ink-500">
                Aprobada por {revision.revisadaPor ?? "—"} · {fmtDateTime(revision.revisadaEn)}
              </p>
            </article>
          ))}
        </div>
      </details>
    </section>
  );
}
