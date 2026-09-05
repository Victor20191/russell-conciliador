"use client";

import type { EstadoDeGuardado } from "@/lib/estado-guardado";
import { Icon } from "./icons";

const textos: Record<EstadoDeGuardado, string> = {
  inactivo: "Los cambios se guardan automáticamente.",
  pendiente: "Cambios sin guardar",
  guardando: "Guardando cambios…",
  guardado: "Cambios guardados correctamente.",
  error: "No se pudieron guardar los cambios. Inténtalo de nuevo.",
};

export function EstadoGuardado({ estado, mensaje, onReintentar }: {
  estado: EstadoDeGuardado;
  mensaje?: string | null;
  onReintentar?: () => void;
}) {
  const color = estado === "error" ? "text-err-700" : estado === "guardado"
    ? "text-ok-700" : estado === "pendiente" ? "text-warn-700" : "text-ink-500";
  return (
    <span className={`inline-flex min-h-7 flex-wrap items-center gap-1.5 text-xs ${color}`}>
      <span aria-hidden="true" className="inline-flex shrink-0">
        {estado === "guardando" ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />
        ) : <Icon name={estado === "guardado" ? "check" : estado === "error" || estado === "pendiente" ? "warn" : "info"} size={14} />}
      </span>
      <span role={estado === "error" ? "alert" : "status"} aria-live={estado === "error" ? "assertive" : "polite"} aria-atomic="true">
        {mensaje || textos[estado]}
      </span>
      {estado === "error" && onReintentar && (
        <button type="button" onClick={onReintentar} className="rounded px-1 py-1 font-semibold underline underline-offset-2 hover:bg-err-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-err-700">
          Reintentar
        </button>
      )}
    </span>
  );
}
