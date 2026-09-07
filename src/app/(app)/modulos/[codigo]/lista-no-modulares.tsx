"use client";

import { fmtContable } from "@/lib/format";
import { Chip } from "@/components/ui";
import type { HijoContableCruce } from "@/lib/modulos/cruce-contable";
import type { CuentaNoModular } from "@/lib/modulos/marcas-cruce";

/**
 * Las cuentas del cliente que componen una fila del cruce, con la opción de marcarlas
 * como NO MODULARES (no hacen parte de la conciliación del módulo: su saldo se resta).
 *
 * Presentacional y sin estado propio: el modal le pasa la selección y recibe los cambios.
 * Se extrajo del cliente de la pestaña —2.100 líneas— para poder probar el texto y el
 * marcado con `renderToStaticMarkup`.
 */
export function ListaNoModulares({
  hijos,
  seleccion,
  onAlternar,
}: {
  hijos: readonly HijoContableCruce[];
  seleccion: ReadonlySet<string>;
  /** Ausente → solo lectura (sin checkboxes). */
  onAlternar?: (cuenta8: string) => void;
}) {
  if (hijos.length === 0) {
    return <p className="text-[11.5px] text-ink-400">Esta cuenta no tiene desglose por cuenta del cliente.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-ink-100 rounded-md border border-ink-150">
      {hijos.map((h) => {
        const marcada = seleccion.has(h.cuenta8);
        const contenido = (
          <>
            <span className="w-[110px] shrink-0 font-mono text-[11.5px] text-ink-600">{h.cuenta8}</span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-ink-700" title={h.nombre}>{h.nombre}</span>
            <span className={`shrink-0 tabular-nums text-[12px] ${marcada ? "text-ink-400 line-through" : "text-ink-800"}`}>
              {fmtContable(h.valor)}
            </span>
          </>
        );

        if (!onAlternar) {
          return (
            <li key={h.cuenta8} className="flex items-center gap-2 px-2.5 py-1.5">
              {contenido}
              {marcada && <Chip label="No modular" tone="warn" />}
            </li>
          );
        }

        return (
          <li key={h.cuenta8}>
            <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 transition hover:bg-ink-50">
              <input
                type="checkbox"
                checked={marcada}
                onChange={() => onAlternar(h.cuenta8)}
                className="size-3.5 shrink-0 accent-navy-700"
              />
              {contenido}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/** Las cuentas que una marca ya excluyó, tal como quedaron registradas. Solo lectura. */
export function ResumenNoModulares({ cuentas }: { cuentas: readonly CuentaNoModular[] }) {
  if (cuentas.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 rounded-md border border-warn-500/40 bg-warn-100/20 px-2.5 py-1.5">
      <span className="text-[11px] font-semibold text-warn-700">
        {cuentas.length === 1 ? "Cuenta no modular restada" : `${cuentas.length} cuentas no modulares restadas`}
      </span>
      <ul className="flex flex-col gap-0.5">
        {cuentas.map((c) => (
          <li key={c.cuenta8} className="flex items-baseline gap-2 text-[11.5px] text-ink-700">
            <span className="font-mono text-ink-600">{c.cuenta8}</span>
            <span className="min-w-0 flex-1 truncate" title={c.nombre}>{c.nombre}</span>
            <span className="shrink-0 tabular-nums">{fmtContable(c.valorAlMarcar)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
