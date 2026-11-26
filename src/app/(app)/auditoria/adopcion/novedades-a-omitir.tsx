"use client";

import { Icon } from "@/components/icons";
import { fmtNum } from "@/lib/format";
import {
  SECCIONES_NOVEDAD,
  seccionDeCambio,
  type SeccionNovedad,
} from "@/lib/auditoria/reporte-ejecutivo/omitir-novedades";
import { chevronDivulgacion } from "@/lib/ui/chevron-divulgacion";

export type CambioAOmitir = {
  id: number;
  tipo: string;
  titulo: string;
  descripcion: string;
  modulo: string | null;
  version: string;
};

/**
 * Los cambios de las versiones desplegadas en el período de la página, en tres
 * secciones que arrancan cerradas. Cada cambio se puede marcar «Omitir»: lo
 * marcado no entra al reporte que se genere ni al correo que se envíe desde la
 * página (prueba o lista; ver `omitir-novedades.ts`).
 */
export function NovedadesAOmitir({
  cambios,
  omitidos,
  onAlternarOmitido,
  onIncluirTodos,
  abiertas,
  onAlternarSeccion,
  deshabilitado,
}: {
  cambios: CambioAOmitir[];
  omitidos: ReadonlySet<number>;
  onAlternarOmitido: (id: number) => void;
  onIncluirTodos: () => void;
  abiertas: ReadonlySet<SeccionNovedad>;
  onAlternarSeccion: (seccion: SeccionNovedad) => void;
  deshabilitado?: boolean;
}) {
  const totalOmitidos = cambios.filter((c) => omitidos.has(c.id)).length;

  return (
    <div className="border-t border-ink-100">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[11.5px] lg:px-5">
        <span className="text-ink-600">
          Marca «Omitir» en lo que no quieras mostrar a gerencia: no saldrá en el reporte que generes ni en el
          correo que envíes.
        </span>
        {totalOmitidos > 0 && (
          <span className="flex items-center gap-2">
            <span className="font-semibold text-warn-700">
              {fmtNum(totalOmitidos)} {totalOmitidos === 1 ? "omitido" : "omitidos"}
            </span>
            <button
              type="button"
              onClick={onIncluirTodos}
              disabled={deshabilitado}
              className="rounded-md border border-ink-150 px-2 py-0.5 text-[11px] font-medium text-ink-600 transition hover:bg-ink-50 disabled:opacity-60"
            >
              Incluir todos
            </button>
          </span>
        )}
      </div>
      {SECCIONES_NOVEDAD.map(({ clave, titulo }) => {
        const deLaSeccion = cambios.filter((c) => seccionDeCambio(c.tipo) === clave);
        const omitidosSeccion = deLaSeccion.filter((c) => omitidos.has(c.id)).length;
        const abierta = abiertas.has(clave);
        const idLista = `novedades-omitir-${clave}`;
        return (
          <div key={clave} className="border-t border-ink-100">
            <button
              type="button"
              onClick={() => onAlternarSeccion(clave)}
              aria-expanded={abierta}
              aria-controls={idLista}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-[12.5px] transition hover:bg-ink-50 lg:px-5"
            >
              <Icon name={chevronDivulgacion(abierta)} size={13} className="shrink-0 text-ink-500" />
              <span className="font-semibold text-navy-800">{titulo}</span>
              <span className="rounded-full bg-ink-100 px-1.5 py-px text-[10.5px] font-semibold text-ink-600">
                {fmtNum(deLaSeccion.length)}
              </span>
              {omitidosSeccion > 0 && (
                <span className="text-[11px] font-medium text-warn-700">
                  {fmtNum(omitidosSeccion)} {omitidosSeccion === 1 ? "omitido" : "omitidos"}
                </span>
              )}
            </button>
            {abierta &&
              (deLaSeccion.length === 0 ? (
                <p id={idLista} className="pb-2.5 pl-[37px] pr-4 text-[12px] text-ink-500 lg:pl-[41px] lg:pr-5">
                  No hay cambios de este tipo en el período.
                </p>
              ) : (
                <ul id={idLista} className="max-h-72 divide-y divide-ink-100 overflow-y-auto border-t border-ink-100">
                  {deLaSeccion.map((c) => {
                    const omitido = omitidos.has(c.id);
                    return (
                      <li
                        key={c.id}
                        className={`flex items-start gap-3 py-2 pl-[37px] pr-4 text-[12.5px] lg:pl-[41px] lg:pr-5 ${omitido ? "bg-ink-50" : ""}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className={omitido ? "text-ink-400 line-through" : "font-medium text-ink-800"}>
                            {c.titulo}
                          </p>
                          <p className="text-[11px] text-ink-500">
                            v{c.version} · {c.modulo ?? "Plataforma"}
                            {c.tipo.trim().toLowerCase() === "seguridad" ? " · Seguridad" : ""}
                          </p>
                          {c.descripcion && (
                            <p className={`mt-0.5 line-clamp-2 text-[11.5px] ${omitido ? "text-ink-400" : "text-ink-600"}`}>
                              {c.descripcion}
                            </p>
                          )}
                        </div>
                        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 pt-0.5 text-[11.5px] font-medium text-ink-700">
                          <input
                            type="checkbox"
                            className="accent-navy-700"
                            checked={omitido}
                            disabled={deshabilitado}
                            onChange={() => onAlternarOmitido(c.id)}
                          />
                          Omitir
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ))}
          </div>
        );
      })}
    </div>
  );
}
