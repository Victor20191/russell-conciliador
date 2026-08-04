"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";

/**
 * Botón «Descartar cambios» con confirmación OBLIGATORIA: nunca descarta de
 * inmediato, siempre pregunta si se quiere deshacer SOLO el último cambio o
 * TODOS los cambios sin guardar.
 *
 * Se usa en todas las pantallas que tienen la pareja «Guardar cambios» /
 * «Descartar cambios» (matriz de permisos, publicación de módulos y el borrador
 * de balance). El historial que alimenta «último cambio» lo lleva el hook
 * `useHistorialCambios`.
 */
export function DescartarCambiosBoton({
  totalCambios,
  descripcionUltimo,
  puedeDeshacerUltimo,
  onDescartarUltimo,
  onDescartarTodo,
  disabled = false,
  className,
  etiqueta = "Descartar cambios",
}: {
  /** Cuántos cambios sin guardar hay en pantalla (para el texto del modal). */
  totalCambios: number;
  /** Texto corto del último cambio registrado (null si no se conoce). */
  descripcionUltimo?: string | null;
  /** Hay historial: se puede deshacer paso a paso. */
  puedeDeshacerUltimo: boolean;
  onDescartarUltimo: () => void;
  onDescartarTodo: () => void;
  disabled?: boolean;
  className?: string;
  etiqueta?: string;
}) {
  const [abierto, setAbierto] = useState(false);

  const elegir = (accion: () => void) => {
    accion();
    setAbierto(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        disabled={disabled}
        className={
          className ??
          "inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-2 text-[13px] font-medium text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {etiqueta}
      </button>

      {abierto && (
        <Modal
          open
          onClose={() => setAbierto(false)}
          title="¿Qué cambios quieres descartar?"
          size="lg"
          footer={
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="rounded-md border border-ink-200 bg-white px-3 py-2 text-[12.5px] font-medium text-ink-700 hover:bg-ink-50"
            >
              Cancelar
            </button>
          }
        >
          <p className="mb-3 text-[12.5px] leading-relaxed text-ink-600">
            Tienes{" "}
            <span className="font-semibold text-ink-800">
              {totalCambios} cambio(s) sin guardar
            </span>
            . Elige qué quieres deshacer — nada de esto toca lo que ya está guardado.
          </p>

          <div className="flex flex-col gap-2">
            <OpcionDescartar
              icono="chev-l"
              titulo="Solo el último cambio"
              descripcion={
                puedeDeshacerUltimo
                  ? descripcionUltimo
                    ? `Deshace únicamente: ${descripcionUltimo}. El resto de tus cambios se conserva.`
                    : "Deshace únicamente el cambio más reciente. El resto de tus cambios se conserva."
                  : "No hay un cambio reciente registrado en esta pantalla para deshacer paso a paso."
              }
              tono="ink"
              deshabilitado={!puedeDeshacerUltimo}
              onClick={() => elegir(onDescartarUltimo)}
            />
            <OpcionDescartar
              icono="trash"
              titulo={`Todos los cambios (${totalCambios})`}
              descripcion="Devuelve la pantalla exactamente como estaba en el último guardado."
              tono="err"
              onClick={() => elegir(onDescartarTodo)}
            />
          </div>
        </Modal>
      )}
    </>
  );
}

function OpcionDescartar({
  icono,
  titulo,
  descripcion,
  tono,
  deshabilitado = false,
  onClick,
}: {
  icono: "chev-l" | "trash";
  titulo: string;
  descripcion: string;
  tono: "ink" | "err";
  deshabilitado?: boolean;
  onClick: () => void;
}) {
  const estilos =
    tono === "err"
      ? "border-err-100 hover:border-err-200 hover:bg-err-100/40"
      : "border-ink-150 hover:border-ink-300 hover:bg-ink-50";
  const iconoEstilo = tono === "err" ? "bg-err-100 text-err-700" : "bg-ink-100 text-ink-600";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      className={`flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent ${estilos}`}
    >
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${iconoEstilo}`}
      >
        <Icon name={icono} size={14} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-ink-800">{titulo}</span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-500">{descripcion}</span>
      </span>
    </button>
  );
}
