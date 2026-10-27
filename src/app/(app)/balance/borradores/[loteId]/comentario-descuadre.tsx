"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { MAX_COMENTARIO_PROMOCION } from "@/lib/balance/advertencia-archivo-fuente";
import {
  campoComentario,
  ETIQUETA_CONDICION,
  type ComentariosDescuadre,
} from "@/lib/balance/comentarios-descuadre";
import type { MotivoDescuadre } from "@/lib/balance/cuadre-borrador";
import { textoMotivoDescuadre } from "@/lib/balance/cuadre-borrador-texto";

/**
 * Borrador «Descuadrado» por las cuatro condiciones (ecuación, partida doble, clases vs archivo,
 * agrupadoras) cuando la diferencia NO es del archivo fuente: dice qué condiciones fallan y exige
 * UN comentario por cada una para cargarlo (20/Oct/2026). Todos se escriben en el mismo modal; la
 * advertencia del archivo fuente lleva aparte el de la ecuación.
 */
export function ComentarioDescuadre({
  motivos,
  comentarios,
  onComentariosChange,
}: {
  motivos: MotivoDescuadre[];
  comentarios: ComentariosDescuadre;
  onComentariosChange: (comentarios: ComentariosDescuadre) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState<ComentariosDescuadre>(comentarios);
  const lineas = motivos.map((m) => ({
    tipo: m.tipo,
    etiqueta: ETIQUETA_CONDICION[m.tipo],
    listo: (comentarios[m.tipo]?.trim().length ?? 0) > 0,
    ...textoMotivoDescuadre(m),
  }));
  const listos = lineas.filter((l) => l.listo).length;
  const todosListos = listos === lineas.length;
  const algunoEnBorrador = motivos.some((m) => (borrador[m.tipo]?.trim().length ?? 0) > 0);

  const abrir = () => {
    setBorrador(comentarios);
    setAbierto(true);
  };

  const cerrar = () => {
    setBorrador(comentarios);
    setAbierto(false);
  };

  const guardar = () => {
    const limpios: ComentariosDescuadre = { ...comentarios };
    for (const m of motivos) {
      const texto = borrador[m.tipo]?.trim() ?? "";
      if (texto) limpios[m.tipo] = texto;
      else delete limpios[m.tipo];
    }
    onComentariosChange(limpios);
    setAbierto(false);
  };

  return (
    <section
      aria-labelledby="borrador-descuadrado"
      className="overflow-hidden rounded-lg border border-warn-100 border-l-4 border-l-warn-500 bg-white shadow-sm"
    >
      {motivos.map((m) => (
        <input
          key={m.tipo}
          type="hidden"
          form="cargar-balance-oficial"
          name={campoComentario(m.tipo)}
          value={comentarios[m.tipo] ?? ""}
        />
      ))}
      <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-warn-500 text-navy-800 shadow-sm">
          <Icon name="warn" size={18} stroke={2} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="borrador-descuadrado" className="text-[11px] font-semibold uppercase tracking-wider text-warn-700">
            Borrador descuadrado
          </h2>
          <p className="mt-1 text-[12px] text-ink-600">
            {lineas.length === 1
              ? "No cumple esta condición; escribe su comentario para cargarlo:"
              : `No cumple ${lineas.length} condiciones; cada una necesita su comentario para cargarlo:`}
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {lineas.map((l) => (
              <li key={l.tipo} className="flex flex-wrap items-center gap-1.5" title={l.titulo}>
                <span className="rounded border border-warn-200 bg-white px-2 py-0.5 text-[10.5px] font-medium text-warn-700">
                  × {l.texto}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                    l.listo ? "bg-ok-100 text-ok-700" : "bg-err-100 text-err-700"
                  }`}
                >
                  {l.listo ? "Comentario listo" : "Falta comentario"}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={abrir}
          className={`inline-flex w-full shrink-0 items-center justify-between gap-2 rounded-md border px-3 py-2 text-[11px] font-semibold shadow-sm transition sm:ml-auto sm:w-auto ${
            todosListos
              ? "border-ok-200 bg-white text-ok-700 hover:bg-ok-50"
              : "border-warn-200 bg-white text-warn-700 hover:bg-warn-50"
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <Icon name={todosListos ? "check" : "msg"} size={14} />
            {lineas.length === 1 ? "Comentario de aprobación" : "Comentarios de aprobación"}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wide ${
              todosListos ? "bg-ok-100 text-ok-700" : "bg-err-100 text-err-700"
            }`}
          >
            {todosListos ? "Listo" : lineas.length === 1 ? "Obligatorio" : `${listos} de ${lineas.length}`}
          </span>
          <Icon name="chev-r" size={12} />
        </button>
      </div>
      <Modal
        open={abierto}
        onClose={cerrar}
        title={lineas.length === 1 ? "Comentario de aprobación" : "Comentarios de aprobación"}
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={cerrar}
              className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-600 transition hover:bg-ink-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={!algunoEnBorrador}
              className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {lineas.length === 1 ? "Guardar comentario" : "Guardar comentarios"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-lg border border-warn-100 bg-white px-3 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-warn-500 text-navy-800">
              <Icon name="warn" size={17} stroke={2} />
            </span>
            <p className="min-w-0 text-[12px] leading-relaxed text-ink-600">
              El borrador no cuadra. Corrígelo si la diferencia viene de la lectura, o deja constancia de
              la revisión de cada condición antes de cargarlo. Los comentarios quedan en la
              «Justificación del descuadre» del balance cargado.
            </p>
          </div>

          {lineas.map((l, i) => {
            const id = `comentario-descuadre-${l.tipo}`;
            const valor = borrador[l.tipo] ?? "";
            return (
              <label key={l.tipo} htmlFor={id} className="flex flex-col gap-1.5">
                <span className="flex flex-wrap items-center gap-2 text-[11.5px] font-semibold text-ink-700">
                  {l.etiqueta}
                  <span className="rounded-full bg-err-100 px-2 py-0.5 text-[9px] uppercase tracking-wide text-err-700">
                    Obligatorio
                  </span>
                </span>
                <span className="text-[11px] leading-relaxed text-ink-500">{l.titulo}</span>
                <textarea
                  id={id}
                  autoFocus={i === 0}
                  required
                  maxLength={MAX_COMENTARIO_PROMOCION}
                  rows={lineas.length === 1 ? 6 : 3}
                  value={valor}
                  onChange={(event) => setBorrador((prev) => ({ ...prev, [l.tipo]: event.target.value }))}
                  aria-describedby={`${id}-contador`}
                  placeholder="Ej.: Diferencia revisada con el cliente; el ERP no exporta la cuenta de cierre del período."
                  className="w-full resize-none rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-700 outline-none transition placeholder:text-ink-400 focus:border-warn-500 focus:ring-2 focus:ring-warn-100"
                />
                <span id={`${id}-contador`} className="self-end text-[10px] tabular-nums text-ink-400">
                  {valor.length}/{MAX_COMENTARIO_PROMOCION}
                </span>
              </label>
            );
          })}
        </div>
      </Modal>
    </section>
  );
}
