import { Icon } from "@/components/icons";
import { AdvertenciaArchivoFuenteDetalle } from "@/components/advertencia-archivo-fuente";
import { ReubicacionesAprobadasPanel } from "@/components/reubicaciones-aprobadas";
import type { RevisionReubicacionBalance } from "@/lib/balance/revisiones-reubicacion-balance";

/**
 * Constancia durable de las revisiones hechas antes de promover el borrador:
 * comentario por diferencia del archivo y/o reubicaciones entre clases aprobadas.
 * Las reubicaciones se muestran con la MISMA ficha que tuvieron en el borrador
 * (componente compartido), no como texto resumido ni como una nueva alerta.
 * Ambas quedan arriba y fuera de las pestañas para consultarlas sin buscarlas.
 */
export function ComentarioAprobacion({
  comentario,
  advertenciaArchivoFuente = false,
  diferenciaArchivoFuente = null,
  reubicaciones = [],
  version,
  autor,
  rol,
  fecha,
}: {
  comentario: string | null;
  advertenciaArchivoFuente?: boolean;
  diferenciaArchivoFuente?: number | null;
  reubicaciones?: RevisionReubicacionBalance[];
  version: string;
  autor: string;
  rol: string;
  fecha: string;
}) {
  const muestraAdvertenciaArchivoFuente =
    advertenciaArchivoFuente && diferenciaArchivoFuente != null;

  return (
    <>
      {muestraAdvertenciaArchivoFuente && (
        <AdvertenciaArchivoFuenteDetalle
          diferencia={diferenciaArchivoFuente}
          resumida
          tituloId="advertencia-archivo-fuente-oficial"
          className="mb-4"
          detalle={comentario ? (
            <div className="border-t border-warn-100 bg-white/55 px-4 py-3.5 sm:pl-16">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <h3 className="text-[10.5px] font-semibold uppercase tracking-wider text-warn-700">
                  Justificación de aprobación
                </h3>
                <span className="rounded-full border border-warn-100 bg-white px-2 py-0.5 text-[10px] font-semibold text-warn-700">
                  {version}
                </span>
              </div>
              <blockquote className="max-w-4xl whitespace-pre-wrap break-words text-[13px] font-medium leading-relaxed text-ink-800">
                «{comentario}»
              </blockquote>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
                {autor} · {rol} · {fecha} — justificación registrada antes de cargar esta
                versión del balance.
              </p>
            </div>
          ) : undefined}
        />
      )}
      {comentario && !muestraAdvertenciaArchivoFuente && (
        <section
          aria-labelledby="comentario-aprobacion"
          className="mb-4 overflow-hidden rounded-lg border border-warn-100 border-l-4 border-l-warn-500 bg-[#fffaf0] shadow-sm"
        >
          <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-warn-500 text-white shadow-sm">
              <Icon name="warn" size={18} stroke={2} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <h2
                  id="comentario-aprobacion"
                  className="text-[11px] font-semibold uppercase tracking-wider text-warn-700"
                >
                  Nota aclaratoria adicional
                </h2>
                <span className="rounded-full border border-warn-100 bg-white px-2 py-0.5 text-[10px] font-semibold text-warn-700">
                  {version}
                </span>
              </div>
              <blockquote className="max-w-4xl whitespace-pre-wrap break-words text-[13px] font-medium leading-relaxed text-ink-800">
                «{comentario}»
              </blockquote>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
                {autor} · {rol} · {fecha} — nota registrada antes de cargar esta
                versión del balance.
              </p>
            </div>
          </div>
        </section>
      )}
      {reubicaciones.length > 0 && (
        <div className="mb-4">
          <ReubicacionesAprobadasPanel
            revisiones={reubicaciones}
            etiqueta={`Guardadas en ${version}`}
            abiertoPorDefecto
          />
        </div>
      )}
    </>
  );
}
