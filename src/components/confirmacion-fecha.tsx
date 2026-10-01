"use client";

// Confirmación de una fecha asignada a un cargue (período o fecha de corte), en los seis
// módulos y en el balance: debajo del campo aparece «Seleccionaste … ¿Es correcto?» y quien
// carga responde antes de seguir. Una fecha futura no se confirma: se explica por qué no vale.
// La regla y los textos viven en `src/lib/fecha-cargue.ts`; quien usa el aviso guarda QUÉ valor
// se confirmó, así que cambiar la fecha vuelve a pedir la confirmación sin reiniciar nada.
import type { ReactNode } from "react";

export function ConfirmacionFecha({
  error,
  pregunta,
  confirmada,
  confirmadaTexto,
  onConfirmar,
}: {
  /** Fecha futura: se muestra en lugar de la pregunta. */
  error: string | null;
  /** «Seleccionaste diciembre de 2025 (del 1 al 31 de diciembre de 2025).» */
  pregunta: ReactNode;
  confirmada: boolean;
  /** «Período confirmado: diciembre de 2025.» */
  confirmadaTexto: ReactNode;
  onConfirmar: () => void;
}) {
  if (error) {
    return (
      <p role="alert" className="rounded-md border border-err-200 bg-err-50 px-2.5 py-1.5 text-[11.5px] font-medium leading-snug text-err-700">
        {error}
      </p>
    );
  }
  if (confirmada) {
    return <p className="text-[11px] font-medium leading-snug text-ok-700">✓ {confirmadaTexto}</p>;
  }
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-warn-500 bg-warn-100/30 px-2.5 py-2 text-[11.5px] leading-snug text-warn-700">
      <span>{pregunta} ¿Es correcto?</span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={onConfirmar}
          className="rounded-md bg-navy-700 px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-navy-600"
        >
          Sí, es correcto
        </button>
        <span className="text-[11px] text-ink-500">Si no, cambia la fecha en el campo.</span>
      </span>
    </div>
  );
}
