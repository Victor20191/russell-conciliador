import { Icon } from "@/components/icons";
import { AdvertenciaArchivoFuenteDetalle } from "@/components/advertencia-archivo-fuente";
import { ReubicacionesAprobadasPanel } from "@/components/reubicaciones-aprobadas";
import type { RevisionReubicacionBalance } from "@/lib/balance/revisiones-reubicacion-balance";
import type { DescuadreAlCargar } from "@/lib/balance/cuadre-borrador";
import { textoMotivoDescuadre } from "@/lib/balance/cuadre-borrador-texto";
import { ETIQUETA_CONDICION } from "@/lib/balance/comentarios-descuadre";
import { fmt } from "@/lib/format";

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
  descuadre = null,
  reubicaciones = [],
  version,
  autor,
  rol,
  fecha,
}: {
  comentario: string | null;
  advertenciaArchivoFuente?: boolean;
  diferenciaArchivoFuente?: number | null;
  /** Constancia del borrador cargado «Descuadrado» o con la diferencia del archivo fuente. */
  descuadre?: DescuadreAlCargar | null;
  reubicaciones?: RevisionReubicacionBalance[];
  version: string;
  autor: string;
  rol: string;
  fecha: string;
}) {
  const muestraAdvertenciaArchivoFuente =
    advertenciaArchivoFuente && diferenciaArchivoFuente != null;
  // Desde el 20/Oct/2026 (constancia v2) cada condición trae su comentario y la diferencia del
  // archivo fuente es la ecuación: su justificación es el comentario de la ecuación. La v1 (un solo
  // comentario, en `comentario`) y los balances sin constancia se ven como antes.
  const v2 = descuadre?.v === 2 ? descuadre : null;
  const justificacionArchivoFuente = v2?.motivos.find((m) => m.tipo === "ecuacion")?.comentario ?? comentario;
  // Condiciones del recuadro «Justificación del descuadre»: con la advertencia del archivo fuente,
  // la ecuación ya está en ella (y una constancia v1 no trae más).
  const motivosV2 = v2 ? v2.motivos.filter((m) => !muestraAdvertenciaArchivoFuente || m.tipo !== "ecuacion") : [];
  const motivosRecuadro = v2 ? motivosV2 : descuadre && !muestraAdvertenciaArchivoFuente ? descuadre.motivos : [];
  const muestraDescuadre = motivosRecuadro.length > 0;
  const textoUmbral = descuadre == null
    ? null
    : descuadre.v === 1
      ? `Umbrales al cargar: cuadre contable ${fmt(descuadre.umbrales.cuadre_contable)} · diferencias y descuadres ${fmt(descuadre.umbrales.descuadre)}.`
      : `Umbral al cargar: diferencias y descuadres del balance ${fmt(descuadre.umbrales.descuadre)}.`;

  return (
    <>
      {muestraAdvertenciaArchivoFuente && (
        <AdvertenciaArchivoFuenteDetalle
          diferencia={diferenciaArchivoFuente}
          resumida
          tituloId="advertencia-archivo-fuente-oficial"
          className="mb-4"
          detalle={justificacionArchivoFuente ? (
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
                «{justificacionArchivoFuente}»
              </blockquote>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
                {autor} · {rol} · {fecha} — justificación registrada antes de cargar esta
                versión del balance.
              </p>
            </div>
          ) : undefined}
        />
      )}
      {muestraDescuadre && (
        <section
          aria-labelledby="justificacion-descuadre"
          className="mb-4 overflow-hidden rounded-lg border border-warn-100 border-l-4 border-l-warn-500 bg-[#fffaf0] shadow-sm"
        >
          <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-warn-500 text-white shadow-sm">
              <Icon name="warn" size={18} stroke={2} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <h2
                  id="justificacion-descuadre"
                  className="text-[11px] font-semibold uppercase tracking-wider text-warn-700"
                >
                  Justificación del descuadre
                </h2>
                <span className="rounded-full border border-warn-100 bg-white px-2 py-0.5 text-[10px] font-semibold text-warn-700">
                  {version}
                </span>
              </div>
              <p className="text-[12px] text-ink-600">
                Se cargó descuadrado. {motivosRecuadro.length === 1 ? "No cumplía esta condición:" : `No cumplía ${motivosRecuadro.length} condiciones:`}
              </p>
              {v2 ? (
                <ul className="mt-2 flex flex-col gap-2.5">
                  {motivosV2.map((m) => (
                    <li key={m.tipo} className="rounded-md border border-warn-100 bg-white/70 px-3 py-2">
                      <div className="text-[12px] font-semibold text-ink-700">
                        ✕ {ETIQUETA_CONDICION[m.tipo]}
                        <span className="ml-1.5 font-normal text-ink-500">{textoMotivoDescuadre(m).titulo}</span>
                      </div>
                      <blockquote className="mt-1 max-w-4xl whitespace-pre-wrap break-words text-[13px] font-medium leading-relaxed text-ink-800">
                        «{m.comentario}»
                      </blockquote>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="mt-1.5 flex flex-col gap-0.5 text-[12px] text-ink-700">
                  {motivosRecuadro.map((m) => (
                    <li key={m.tipo}>✕ {textoMotivoDescuadre(m).titulo}</li>
                  ))}
                </ul>
              )}
              <p className="mt-1.5 text-[10.5px] text-ink-500">{textoUmbral}</p>
              {v2 ? null : comentario ? (
                <blockquote className="mt-2.5 max-w-4xl whitespace-pre-wrap break-words text-[13px] font-medium leading-relaxed text-ink-800">
                  «{comentario}»
                </blockquote>
              ) : (
                <p className="mt-2.5 text-[12px] italic text-ink-500">Sin comentario registrado.</p>
              )}
              <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
                {autor} · {rol} · {fecha} — justificación registrada antes de cargar esta
                versión del balance.
              </p>
            </div>
          </div>
        </section>
      )}
      {comentario && !muestraAdvertenciaArchivoFuente && !muestraDescuadre && (
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
