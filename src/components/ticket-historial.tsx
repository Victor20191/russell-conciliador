import AdjuntosGaleria from "@/components/adjuntos-galeria";
import { fmtDateTime } from "@/lib/format";
import type { EntradaHistorial } from "@/lib/soporte-historial";

/**
 * El hilo del ticket pintado como una conversación: lo que reportó el usuario a
 * la izquierda, lo que respondió Xentria a la derecha y los cambios de estado
 * como hitos centrados en medio.
 *
 * Es PRESENTACIÓN pura —sin `use client`, sin datos— para que lo compartan las
 * cuatro pantallas del ticket: la bandeja de Xentria y la página del usuario lo
 * renderizan en el servidor, y el modal del listado, que sí es cliente, lo
 * incrusta tal cual. El orden ya viene resuelto por `construirHistorialTicket`;
 * aquí no se reordena nada.
 */
export default function TicketHistorial({
  entradas,
  mostrarAdjuntos = true,
}: {
  entradas: EntradaHistorial[];
  /**
   * El portal público se sirve sin sesión y el endpoint de imágenes exige una,
   * así que allí las miniaturas romperían: se anuncian, pero no se pintan.
   */
  mostrarAdjuntos?: boolean;
}) {
  return (
    <ol className="flex flex-col gap-3">
      {entradas.map((entrada) =>
        entrada.tipo === "estado" ? (
          <li key={entrada.clave} className="flex items-center gap-3 py-0.5">
            <span className="h-px flex-1 bg-ink-150" />
            <p className="shrink-0 text-center text-[11.5px] text-ink-500">
              <span className="font-semibold text-ink-600">{entrada.autor}</span> marcó el ticket
              como <span className="font-semibold text-ink-700">{entrada.etiqueta}</span>
              <span className="text-ink-400"> · {fmtDateTime(entrada.fecha)}</span>
            </p>
            <span className="h-px flex-1 bg-ink-150" />
          </li>
        ) : (
          <li
            key={entrada.clave}
            className={`flex ${entrada.lado === "xentria" ? "justify-end" : "justify-start"}`}
          >
            <Burbuja entrada={entrada} mostrarAdjuntos={mostrarAdjuntos} />
          </li>
        ),
      )}
    </ol>
  );
}

type EntradaBurbuja = Extract<EntradaHistorial, { lado: string }>;

function Burbuja({
  entrada,
  mostrarAdjuntos,
}: {
  entrada: EntradaBurbuja;
  mostrarAdjuntos: boolean;
}) {
  // La respuesta oficial es la conclusión del ticket, no un mensaje más: se
  // separa por color para que no se pierda entre la conversación.
  const oficial = entrada.tipo === "respuesta";
  const deXentria = entrada.lado === "xentria";
  const caja = oficial
    ? "border-ok-700 bg-ok-700"
    : deXentria
      ? "border-navy-700 bg-navy-700"
      : "border-ink-150 bg-white";
  const texto = oficial || deXentria ? "text-white" : "text-ink-800";
  const firma = oficial || deXentria ? "text-white/70" : "text-ink-500";
  const etiqueta =
    entrada.tipo === "apertura"
      ? "Novedad reportada"
      : oficial
        ? "Respuesta de Xentria"
        : null;

  return (
    <article className={`max-w-[85%] min-w-0 rounded-lg border px-4 py-3 shadow-sm ${caja}`}>
      {etiqueta && (
        <p className={`mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider ${firma}`}>
          {etiqueta}
        </p>
      )}
      <p className={`whitespace-pre-wrap break-words text-[13px] leading-6 ${texto}`}>
        {entrada.contenido}
      </p>

      {entrada.tipo === "apertura" && entrada.adjuntos.length > 0 && (
        mostrarAdjuntos ? (
          <AdjuntosGaleria adjuntos={entrada.adjuntos} />
        ) : (
          <p className={`mt-3 text-[11.5px] ${firma}`}>
            {entrada.adjuntos.length === 1
              ? "Adjuntó 1 imagen."
              : `Adjuntó ${entrada.adjuntos.length} imágenes.`}
          </p>
        )
      )}

      <p className={`mt-2.5 text-[11.5px] ${firma}`}>
        {entrada.autor}
        {entrada.fecha ? ` · ${fmtDateTime(entrada.fecha)}` : ""}
      </p>
    </article>
  );
}
