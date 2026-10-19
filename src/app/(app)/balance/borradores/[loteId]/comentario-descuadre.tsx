"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { MAX_COMENTARIO_PROMOCION } from "@/lib/balance/advertencia-archivo-fuente";
import type { MotivoDescuadre } from "@/lib/balance/cuadre-borrador";
import { textoMotivoDescuadre } from "@/lib/balance/cuadre-borrador-texto";

/**
 * Borrador «Descuadrado» por las cuatro condiciones de la lista (ecuación, partida doble,
 * clases vs archivo, agrupadoras) cuando la diferencia NO es del archivo fuente: dice qué
 * condiciones fallan y exige el comentario de aprobación para cargarlo. La advertencia del
 * archivo fuente sigue siendo la de siempre; este recuadro cubre los demás descuadres.
 */
export function ComentarioDescuadre({
  motivos,
  comentario,
  onComentarioChange,
}: {
  motivos: MotivoDescuadre[];
  comentario: string;
  onComentarioChange: (comentario: string) => void;
}) {
  const [comentarioAbierto, setComentarioAbierto] = useState(false);
  const [comentarioBorrador, setComentarioBorrador] = useState(comentario);
  const comentarioListo = comentario.trim().length > 0;
  const comentarioBorradorListo = comentarioBorrador.trim().length > 0;
  const lineas = motivos.map((m) => ({ tipo: m.tipo, ...textoMotivoDescuadre(m) }));

  const abrirComentario = () => {
    setComentarioBorrador(comentario);
    setComentarioAbierto(true);
  };

  const cerrarComentario = () => {
    setComentarioBorrador(comentario);
    setComentarioAbierto(false);
  };

  const guardarComentario = () => {
    const comentarioLimpio = comentarioBorrador.trim();
    if (!comentarioLimpio) return;
    onComentarioChange(comentarioLimpio);
    setComentarioAbierto(false);
  };

  return (
    <section
      aria-labelledby="borrador-descuadrado"
      className="overflow-hidden rounded-lg border border-warn-100 border-l-4 border-l-warn-500 bg-[#fffaf0] shadow-sm"
    >
      <input type="hidden" form="cargar-balance-oficial" name="comentarioPromocion" value={comentario} />
      <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-warn-500 text-white shadow-sm">
          <Icon name="warn" size={18} stroke={2} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="borrador-descuadrado" className="text-[11px] font-semibold uppercase tracking-wider text-warn-700">
            Borrador descuadrado
          </h2>
          <p className="mt-1 text-[12px] text-ink-600">
            {lineas.length === 1 ? "No cumple esta condición:" : `No cumple ${lineas.length} condiciones:`}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {lineas.map((l) => (
              <span
                key={l.tipo}
                title={l.titulo}
                className="rounded border border-warn-200 bg-white px-2 py-0.5 text-[10.5px] font-medium text-warn-700"
              >
                ✕ {l.texto}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={abrirComentario}
          className={`inline-flex w-full shrink-0 items-center justify-between gap-2 rounded-md border px-3 py-2 text-[11px] font-semibold shadow-sm transition sm:ml-auto sm:w-auto ${
            comentarioListo
              ? "border-ok-200 bg-white text-ok-700 hover:bg-ok-50"
              : "border-warn-200 bg-white text-warn-700 hover:bg-warn-50"
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <Icon name={comentarioListo ? "check" : "msg"} size={14} />
            {comentarioListo ? "Comentario agregado" : "Comentario de aprobación"}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wide ${
              comentarioListo ? "bg-ok-100 text-ok-700" : "bg-err-100 text-err-700"
            }`}
          >
            {comentarioListo ? "Listo" : "Obligatorio"}
          </span>
          <Icon name="chev-r" size={12} />
        </button>
      </div>
      <Modal
        open={comentarioAbierto}
        onClose={cerrarComentario}
        title="Comentario de aprobación"
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={cerrarComentario}
              className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-600 transition hover:bg-ink-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardarComentario}
              disabled={!comentarioBorradorListo}
              className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Guardar comentario
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-lg border border-warn-100 bg-[#fffaf0] px-3 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-warn-500 text-white">
              <Icon name="warn" size={17} stroke={2} />
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-warn-700">
                Justificación obligatoria
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-600">
                El borrador no cuadra. Corrígelo si la diferencia viene de la lectura, o deja
                constancia de la revisión antes de cargarlo como balance oficial.
              </p>
              <ul className="mt-2 flex flex-col gap-0.5 text-[11.5px] text-ink-600">
                {lineas.map((l) => <li key={l.tipo}>· {l.titulo}</li>)}
              </ul>
            </div>
          </div>

          <label htmlFor="comentario-descuadre-balance" className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2 text-[11.5px] font-semibold text-ink-700">
              Argumento de aprobación
              <span className="rounded-full bg-err-100 px-2 py-0.5 text-[9px] uppercase tracking-wide text-err-700">
                Obligatorio
              </span>
            </span>
            <textarea
              id="comentario-descuadre-balance"
              autoFocus
              required
              maxLength={MAX_COMENTARIO_PROMOCION}
              rows={6}
              value={comentarioBorrador}
              onChange={(event) => setComentarioBorrador(event.target.value)}
              aria-describedby="contador-comentario-descuadre"
              placeholder="Ej.: Diferencia revisada con el cliente; el ERP no exporta la cuenta de cierre del período."
              className="w-full resize-none rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-700 outline-none transition placeholder:text-ink-400 focus:border-warn-500 focus:ring-2 focus:ring-warn-100"
            />
          </label>

          <div className="flex items-start justify-between gap-3">
            <p className="max-w-sm text-[10.5px] leading-relaxed text-ink-500">
              El comentario quedará visible como nota de la versión oficial.
            </p>
            <div id="contador-comentario-descuadre" className="shrink-0 text-[10px] tabular-nums text-ink-400">
              {comentarioBorrador.length}/{MAX_COMENTARIO_PROMOCION}
            </div>
          </div>
        </div>
      </Modal>
    </section>
  );
}
