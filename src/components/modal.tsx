"use client";

import { Icon } from "@/components/icons";

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  // Por convención del proyecto, el modal SOLO se cierra con el botón X.
  // No se cierra por tecla Escape ni por clic en el backdrop, para evitar
  // cierres accidentales que descarten datos del formulario.
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-navy-900/40 p-4 backdrop-blur-sm sm:items-center sm:p-6">
      {/* Columna flex con altura acotada: el cuerpo hace scroll y el footer
          (con el botón Guardar) queda SIEMPRE visible, incluso con formularios
          largos o en pantallas/ventanas de poca altura. */}
      <div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-lg border border-ink-150 bg-white shadow-lg">
        <div className="flex shrink-0 items-center justify-between border-b border-ink-100 px-4 py-3">
          <h2 className="text-[13.5px] font-semibold text-ink-800">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded p-1 text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-ink-100 bg-white px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
