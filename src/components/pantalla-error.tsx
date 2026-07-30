"use client";

import { Icon } from "@/components/icons";
import { esFalloTransporteCarga } from "@/lib/balance/recuperacion-red";

/**
 * UI compartida de los error boundaries (`error.tsx` / `global-error.tsx`).
 * Muestra un mensaje claro, el detalle del error cuando está disponible
 * (en desarrollo) y el `digest` para correlacionar con los logs del servidor.
 */
export function PantallaError({
  error,
  retry,
  className = "",
}: {
  error: Error & { digest?: string };
  retry: () => void;
  className?: string;
}) {
  const falloRed = esFalloTransporteCarga(error);

  return (
    <div
      className={`flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center ${className}`}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-err-100 text-err-700">
        <Icon name="warn" size={26} />
      </div>

      <div>
        <h1 className="font-serif text-2xl text-ink-900">Algo salió mal</h1>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-ink-600">
          {falloRed
            ? "Se perdió la respuesta de red. La operación puede haber terminado en el servidor; usa Reintentar para comprobar su estado sin repetirla innecesariamente."
            : error?.digest
              ? "No pudimos completar la operación. El detalle quedó registrado en el servidor. Reintenta y, si continúa, comparte el código de referencia con el administrador."
              : "No recibimos una respuesta completa. Puedes reintentar la operación; si el problema continúa, informa al administrador."}
        </p>
      </div>

      {error?.message && (
        <p className="max-w-md rounded-md bg-ink-100 px-3 py-2 font-mono text-[12px] text-ink-700">
          {error.message}
        </p>
      )}

      {error?.digest && (
        <p className="text-[11px] text-ink-400">
          Código de referencia:{" "}
          <span className="font-mono">{error.digest}</span>
        </p>
      )}

      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex items-center rounded-md bg-blue-500 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-navy-600"
        >
          Reintentar
        </button>
        <a
          href="/dashboard"
          className="inline-flex items-center rounded-md border border-ink-150 bg-white px-4 py-2 text-[13px] font-medium text-ink-700 transition-colors hover:bg-ink-50"
        >
          Ir al inicio
        </a>
      </div>
    </div>
  );
}
