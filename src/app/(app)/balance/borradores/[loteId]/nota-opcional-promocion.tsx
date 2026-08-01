"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { MAX_COMENTARIO_PROMOCION } from "@/lib/balance/advertencia-archivo-fuente";

/**
 * Deja una constancia no bloqueante cuando el diagnóstico del período no activa
 * la advertencia obligatoria. El input sigue asociado al formulario oficial,
 * aunque visualmente esté fuera de él.
 */
export function NotaOpcionalPromocion({
  comentario,
  onComentarioChange,
}: {
  comentario: string;
  onComentarioChange: (comentario: string) => void;
}) {
  const [comentarioAbierto, setComentarioAbierto] = useState(false);
  const [comentarioBorrador, setComentarioBorrador] = useState(comentario);
  const comentarioListo = comentario.trim().length > 0;

  const abrirComentario = () => {
    setComentarioBorrador(comentario);
    setComentarioAbierto(true);
  };

  const cerrarComentario = () => {
    setComentarioBorrador(comentario);
    setComentarioAbierto(false);
  };

  const guardarComentario = () => {
    onComentarioChange(comentarioBorrador.trim());
    setComentarioAbierto(false);
  };

  const quitarComentario = () => {
    onComentarioChange("");
    setComentarioBorrador("");
    setComentarioAbierto(false);
  };

  return (
    <section className="overflow-hidden rounded-lg border border-ink-150 bg-white shadow-sm">
      <input
        type="hidden"
        form="cargar-balance-oficial"
        name="comentarioPromocion"
        value={comentario}
      />
      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-ink-600">
          {comentarioListo
            ? <>«{comentario}»</>
            : "Nota opcional al cargar este balance (por ejemplo, si una diferencia ya se explicó en un período anterior y sigue presente)."}
        </p>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={abrirComentario}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11.5px] font-semibold shadow-sm transition ${
            comentarioListo
              ? "border-ok-200 bg-white text-ok-700 hover:bg-ok-50"
              : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
          }`}
        >
          <Icon name={comentarioListo ? "check" : "msg"} size={13} />
          {comentarioListo ? "Editar nota" : "Agregar nota (opcional)"}
        </button>
      </div>
      <Modal
        open={comentarioAbierto}
        onClose={cerrarComentario}
        title="Nota al cargar este balance"
        size="lg"
        footer={
          <>
            {comentarioListo ? (
              <button
                type="button"
                onClick={quitarComentario}
                className="mr-auto rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-600 transition hover:bg-ink-50"
              >
                Quitar nota
              </button>
            ) : null}
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
              disabled={comentarioBorrador.trim().length === 0}
              className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Guardar nota
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <label htmlFor="nota-opcional-promocion-balance" className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2 text-[11.5px] font-semibold text-ink-700">
              Nota de esta carga
              <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[9px] uppercase tracking-wide text-ink-600">
                Opcional
              </span>
            </span>
            <textarea
              id="nota-opcional-promocion-balance"
              autoFocus
              maxLength={MAX_COMENTARIO_PROMOCION}
              rows={6}
              value={comentarioBorrador}
              onChange={(event) => setComentarioBorrador(event.target.value)}
              aria-describedby="ayuda-nota-opcional-promocion contador-nota-opcional-promocion"
              placeholder="Ej.: Diferencia desde saldo inicial, ya explicada en el período anterior."
              className="w-full resize-none rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-700 outline-none transition placeholder:text-ink-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <div className="flex items-start justify-between gap-3">
            <p
              id="ayuda-nota-opcional-promocion"
              className="max-w-sm text-[10.5px] leading-relaxed text-ink-500"
            >
              Si la escribes, quedará visible como nota de la versión oficial.
            </p>
            <div
              id="contador-nota-opcional-promocion"
              className="shrink-0 text-[10px] tabular-nums text-ink-400"
            >
              {comentarioBorrador.length}/{MAX_COMENTARIO_PROMOCION}
            </div>
          </div>
        </div>
      </Modal>
    </section>
  );
}
