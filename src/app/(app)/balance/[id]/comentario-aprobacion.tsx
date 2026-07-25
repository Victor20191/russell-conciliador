import { Icon } from "@/components/icons";

/**
 * Comentario de APROBACIÓN del cargue: el texto obligatorio que escribió el revisor
 * al promover un borrador con «advertencia del archivo fuente» (los totales cruzan,
 * pero el archivo no cumple la ecuación contable).
 *
 * Va ARRIBA y FUERA de las pestañas —no solo en la bitácora de versiones— porque es
 * la justificación de por qué este balance se aceptó pese a la diferencia: quien lo
 * abre a revisar tiene que encontrarlo sin buscarlo. Reusa el lenguaje visual de la
 * advertencia del borrador para que se reconozca como la misma conversación.
 */
export function ComentarioAprobacion({
  comentario,
  version,
  autor,
  rol,
  fecha,
}: {
  comentario: string;
  version: string;
  autor: string;
  rol: string;
  fecha: string;
}) {
  return (
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
              Comentario de aprobación
            </h2>
            <span className="rounded-full border border-warn-100 bg-white px-2 py-0.5 text-[10px] font-semibold text-warn-700">
              {version}
            </span>
          </div>
          <blockquote className="max-w-4xl whitespace-pre-wrap break-words text-[13px] font-medium leading-relaxed text-ink-800">
            «{comentario}»
          </blockquote>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
            {autor} · {rol} · {fecha} — justifica por qué se cargó este balance pese a
            la diferencia que ya venía en el archivo fuente.
          </p>
        </div>
      </div>
    </section>
  );
}
