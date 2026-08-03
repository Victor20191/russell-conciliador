import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { fmt } from "@/lib/format";

const INDICADORES_ARCHIVO_FUENTE = [
  "Partida doble cuadrada",
  "Totales cruzan con el archivo",
  "Sin alertas por cuenta",
] as const;

/**
 * Explicación contable compartida entre el borrador y el balance oficial.
 * `accion` y `detalle` permiten que cada superficie agregue su control o su
 * constancia sin duplicar el diagnóstico que debe leer el usuario.
 */
export function AdvertenciaArchivoFuenteDetalle({
  diferencia,
  accion,
  detalle,
  className = "",
  tituloId = "advertencia-archivo-fuente",
}: {
  diferencia: number;
  accion?: ReactNode;
  detalle?: ReactNode;
  className?: string;
  tituloId?: string;
}) {
  return (
    <section
      aria-labelledby={tituloId}
      className={`overflow-hidden rounded-lg border border-warn-100 border-l-4 border-l-warn-500 bg-[#fffaf0] shadow-sm ${className}`.trim()}
    >
      <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-warn-500 text-white shadow-sm">
          <Icon name="warn" size={18} stroke={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h2
              id={tituloId}
              className="text-[11px] font-semibold uppercase tracking-wider text-warn-700"
            >
              Advertencia del archivo fuente
            </h2>
            <span className="rounded-full border border-warn-100 bg-white px-2 py-0.5 text-[10px] font-semibold text-warn-700">
              No es un error del sistema
            </span>
          </div>
          <p className="text-[13px] font-semibold text-ink-800">
            Los totales coinciden, pero el archivo no cumple la ecuación contable.
          </p>
          <p className="mt-1 max-w-4xl text-[11.5px] leading-relaxed text-ink-600">
            Russell reprodujo correctamente los valores del archivo y no encontró
            alertas de descuadre por cuenta. Sin embargo, Activo no es igual a
            Pasivo + Patrimonio + Resultado: la diferencia es{" "}
            <span className="font-semibold tabular-nums text-warn-800">
              {fmt(diferencia)}
            </span>
            . Esta diferencia ya viene en el archivo de origen.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {INDICADORES_ARCHIVO_FUENTE.map((indicador) => (
              <span
                key={indicador}
                className="rounded border border-ok-100 bg-white px-2 py-0.5 text-[10.5px] font-medium text-ok-700"
              >
                ✓ {indicador}
              </span>
            ))}
          </div>
        </div>
        {accion}
      </div>
      {detalle}
    </section>
  );
}
