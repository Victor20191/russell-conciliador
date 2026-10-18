"use client";

import { fmtContable } from "@/lib/format";
import { Chip } from "@/components/ui";
import type { HijoContableCruce } from "@/lib/modulos/cruce-contable";
import type { ClasificadorNoModular, CuentaNoModular, HijoModuloSinCuenta } from "@/lib/modulos/marcas-cruce";

/** La selección con todas las `claves` marcadas (`marcar`) o desmarcadas; el resto no cambia. */
export function conSeleccionMasiva(previa: ReadonlySet<string>, claves: readonly string[], marcar: boolean): Set<string> {
  const siguiente = new Set(previa);
  for (const clave of claves) {
    if (marcar) siguiente.add(clave);
    else siguiente.delete(clave);
  }
  return siguiente;
}

/**
 * Primera fila de una lista con casillas: marca o desmarca TODAS de una vez (hay renglones con
 * decenas de cuentas del cliente). Con solo algunas marcadas la casilla queda a medias y un clic
 * las marca todas. Va como primer `<li>` de la lista.
 */
export function FilaSeleccionarTodas({
  claves,
  seleccion,
  masculino = false,
  onSeleccionarTodas,
}: {
  claves: readonly string[];
  seleccion: ReadonlySet<string>;
  /** Cuentas → «Seleccionar todas»; saldos o conceptos → «Seleccionar todos». */
  masculino?: boolean;
  onSeleccionarTodas: (claves: readonly string[], marcar: boolean) => void;
}) {
  const marcadas = claves.filter((c) => seleccion.has(c)).length;
  const todas = marcadas === claves.length;
  const vocal = masculino ? "o" : "a";
  return (
    <li className="bg-ink-50">
      <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 transition hover:bg-ink-100">
        <input
          type="checkbox"
          checked={todas}
          ref={(casilla) => {
            if (casilla) casilla.indeterminate = marcadas > 0 && !todas;
          }}
          onChange={() => onSeleccionarTodas(claves, !todas)}
          className="size-3.5 shrink-0 accent-navy-700"
        />
        <span className="flex-1 text-[12px] font-semibold text-ink-700">Seleccionar tod{vocal}s</span>
        <span className="shrink-0 text-[11.5px] tabular-nums text-ink-500">
          {marcadas} de {claves.length} marcad{vocal}{marcadas === 1 ? "" : "s"}
        </span>
      </label>
    </li>
  );
}

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
  onSeleccionarTodas,
}: {
  hijos: readonly HijoContableCruce[];
  seleccion: ReadonlySet<string>;
  /** Ausente → solo lectura (sin checkboxes). */
  onAlternar?: (cuenta8: string) => void;
  /** Con dos o más cuentas en edición, agrega «Seleccionar todas» arriba. */
  onSeleccionarTodas?: (cuentas8: readonly string[], marcar: boolean) => void;
}) {
  if (hijos.length === 0) {
    return <p className="text-[11.5px] text-ink-400">Esta cuenta no tiene desglose por cuenta del cliente.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-ink-100 rounded-md border border-ink-150">
      {onAlternar && onSeleccionarTodas && hijos.length > 1 && (
        <FilaSeleccionarTodas claves={hijos.map((h) => h.cuenta8)} seleccion={seleccion} onSeleccionarTodas={onSeleccionarTodas} />
      )}
      {hijos.map((h) => {
        const marcada = seleccion.has(h.cuenta8);
        const contenido = (
          <>
            <span className="shrink-0 font-mono sm:w-[110px] text-[11.5px] text-ink-600">{h.cuenta8}</span>
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

/**
 * Los clasificadores del renglón del SALDO SIN CUENTA, con la opción de marcarlos NO MODULARES:
 * su total se descuenta del lado del módulo. Gemela de `ListaNoModulares` (que excluye cuentas del
 * cliente del lado contable).
 */
export function ListaSinCuentaNoModulares({
  hijos,
  seleccion,
  onAlternar,
  onSeleccionarTodas,
}: {
  hijos: readonly HijoModuloSinCuenta[];
  seleccion: ReadonlySet<string>;
  /** Ausente → solo lectura (sin checkboxes). */
  onAlternar?: (clasificador: string) => void;
  /** Con dos o más saldos en edición, agrega «Seleccionar todos» arriba. */
  onSeleccionarTodas?: (clasificadores: readonly string[], marcar: boolean) => void;
}) {
  if (hijos.length === 0) return <p className="text-[11.5px] text-ink-400">No hay saldo del módulo sin cuenta.</p>;
  return (
    <ul className="flex flex-col divide-y divide-ink-100 rounded-md border border-ink-150">
      {onAlternar && onSeleccionarTodas && hijos.length > 1 && (
        <FilaSeleccionarTodas claves={hijos.map((h) => h.clasificador)} seleccion={seleccion} masculino onSeleccionarTodas={onSeleccionarTodas} />
      )}
      {hijos.map((h) => {
        const marcado = seleccion.has(h.clasificador);
        const contenido = (
          <>
            <span className="min-w-0 flex-1 truncate text-[12px] text-ink-700" title={h.clasificador}>{h.clasificador}</span>
            <span className={`shrink-0 tabular-nums text-[12px] ${marcado ? "text-ink-400 line-through" : "text-ink-800"}`}>{fmtContable(h.total)}</span>
          </>
        );
        if (!onAlternar) {
          return (
            <li key={h.clasificador} className="flex items-center gap-2 px-2.5 py-1.5">
              {contenido}
              {marcado && <Chip label="No modular" tone="warn" />}
            </li>
          );
        }
        return (
          <li key={h.clasificador}>
            <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 transition hover:bg-ink-50">
              <input type="checkbox" checked={marcado} onChange={() => onAlternar(h.clasificador)} className="size-3.5 shrink-0 accent-navy-700" />
              {contenido}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Los conceptos del archivo que una marca ya excluyó del lado del módulo, tal como quedaron
 * registrados. En el renglón del saldo sin cuenta son «saldos sin cuenta»; en cualquier otro
 * renglón, conceptos que la contabilidad no registra en esa cuenta.
 */
export function ResumenClasificadoresNoModulares({
  clasificadores,
  sinCuenta = false,
}: {
  clasificadores: readonly ClasificadorNoModular[];
  sinCuenta?: boolean;
}) {
  if (clasificadores.length === 0) return null;
  const titulo = sinCuenta
    ? clasificadores.length === 1
      ? "Saldo sin cuenta no modular restado"
      : `${clasificadores.length} saldos sin cuenta no modulares restados`
    : clasificadores.length === 1
      ? "Concepto no contabilizado restado"
      : `${clasificadores.length} conceptos no contabilizados restados`;
  return (
    <div className="flex flex-col gap-1 rounded-md border border-warn-500/40 bg-warn-100/20 px-2.5 py-1.5">
      <span className="text-[11px] font-semibold text-warn-700">{titulo}</span>
      <ul className="flex flex-col gap-0.5">
        {clasificadores.map((c) => (
          <li key={c.clasificador} className="flex items-baseline gap-2 text-[11.5px] text-ink-700">
            <span className="min-w-0 flex-1 truncate" title={c.clasificador}>{c.clasificador}</span>
            <span className="shrink-0 tabular-nums">{fmtContable(c.totalAlMarcar)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
